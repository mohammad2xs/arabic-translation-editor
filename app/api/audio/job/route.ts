/**
 * Audio Job Management API
 *
 * This API handles audiobook generation jobs and provides real-time updates via Server-Sent Events (SSE).
 *
 * API Contract:
 * - POST /api/audio/job: Create new audiobook job
 * - GET /api/audio/job: List all jobs (JSON response)
 * - GET /api/audio/job?stream=true: Real-time job updates via SSE
 * - DELETE /api/audio/job: Cancel existing job
 *
 * Real-time Updates:
 * - Uses Server-Sent Events (SSE) for real-time job progress updates
 * - Connect to GET /api/audio/job?stream=true to receive updates
 * - Events are sent as JSON in the format: data: {"type": "job_update", "job": {...}}
 * - Connection sends initial active jobs and continues to send updates
 *
 * Note: This API uses SSE, not NDJSON streaming. Client implementations should use
 * EventSource API for real-time updates rather than fetch() with streaming response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type { Lane } from '../../../../lib/audio/voices';

interface AudioJob {
  id: string;
  scope: 'section' | 'chapter' | 'book';
  lane: Lane;
  scopeId: string;
  scopeName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalSegments: number;
  processedSegments: number;
  audioUrl?: string;
  m4bUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  actualDuration?: number;
  metadata?: {
    totalCharacters: number;
    estimatedCost: number;
    voiceId: string;
    voiceName: string;
  };
}

interface JobCreateRequest {
  scope: 'section' | 'chapter' | 'book';
  lane: Lane;
  scopeId: string;
  scopeName: string;
}

interface JobDeleteRequest {
  jobId: string;
}

// In-memory job storage (in production, use a proper database)
const jobs = new Map<string, AudioJob>();
const jobQueues = new Map<string, string[]>(); // lane -> job IDs
const activeJobs = new Set<string>();

// SSE connections for real-time updates
const sseConnections = new Set<ReadableStreamDefaultController>();

// POST: Create new audiobook job
export async function POST(request: NextRequest) {
  try {
    const body: JobCreateRequest = await request.json();

    // Validate request
    if (!body.scope || !['section', 'chapter', 'book'].includes(body.scope)) {
      return NextResponse.json(
        { error: 'Invalid scope. Must be section, chapter, or book.' },
        { status: 400 }
      );
    }

    if (!body.lane || !['en', 'ar_enhanced', 'ar_original'].includes(body.lane)) {
      return NextResponse.json(
        { error: 'Invalid lane. Must be en, ar_enhanced, or ar_original.' },
        { status: 400 }
      );
    }

    if (!body.scopeId || !body.scopeName) {
      return NextResponse.json(
        { error: 'scopeId and scopeName are required.' },
        { status: 400 }
      );
    }

    // Generate job ID
    const jobId = createHash('md5')
      .update(`${body.scope}-${body.lane}-${body.scopeId}-${Date.now()}`)
      .digest('hex');

    // Get text data for the scope
    const textData = await getTextDataForScope(body.scope, body.scopeId, body.lane);

    if (!textData || textData.length === 0) {
      return NextResponse.json(
        { error: 'No text data found for the specified scope.' },
        { status: 404 }
      );
    }

    // Create job
    const job: AudioJob = {
      id: jobId,
      scope: body.scope,
      lane: body.lane,
      scopeId: body.scopeId,
      scopeName: body.scopeName,
      status: 'pending',
      progress: 0,
      totalSegments: textData.length,
      processedSegments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        totalCharacters: textData.reduce((sum, text) => sum + text.length, 0),
        estimatedCost: (textData.reduce((sum, text) => sum + text.length, 0) / 1000) * 0.30,
        voiceId: '', // Will be filled during processing
        voiceName: ''
      }
    };

    // Store job
    jobs.set(jobId, job);

    // Add to queue
    const queue = jobQueues.get(body.lane) || [];
    queue.push(jobId);
    jobQueues.set(body.lane, queue);

    // Start processing if no active job for this lane
    if (!isLaneProcessing(body.lane)) {
      processNextJob(body.lane);
    }

    // Broadcast job creation
    broadcastJobUpdate(job);

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        scope: job.scope,
        lane: job.lane,
        scopeName: job.scopeName,
        status: job.status,
        estimatedSegments: job.totalSegments
      }
    });

  } catch (error) {
    console.error('Job creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create audiobook job.' },
      { status: 500 }
    );
  }
}

// GET: Retrieve jobs or stream updates
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stream = searchParams.get('stream');

  if (stream === 'true') {
    // Server-Sent Events for real-time updates
    let ctrl: ReadableStreamDefaultController | undefined;
    const stream = new ReadableStream({
      start(controller) {
        ctrl = controller;
        sseConnections.add(controller);

        // Send initial connection message
        controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        // Send current active jobs
        for (const job of jobs.values()) {
          if (job.status === 'processing' || job.status === 'pending') {
            controller.enqueue(`data: ${JSON.stringify({ type: 'job_update', job })}\n\n`);
          }
        }
      },
      cancel() {
        if (ctrl) {
          sseConnections.delete(ctrl);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } else {
    // Return job list
    const jobList = Array.from(jobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      jobs: jobList
    });
  }
}

// DELETE: Cancel job
export async function DELETE(request: NextRequest) {
  try {
    const body: JobDeleteRequest = await request.json();

    if (!body.jobId) {
      return NextResponse.json(
        { error: 'jobId is required.' },
        { status: 400 }
      );
    }

    const job = jobs.get(body.jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found.' },
        { status: 404 }
      );
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json(
        { error: 'Cannot cancel completed or failed job.' },
        { status: 400 }
      );
    }

    // Update job status
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();

    // Remove from queue if pending
    if (job.status === 'pending') {
      const queue = jobQueues.get(job.lane) || [];
      const index = queue.indexOf(job.id);
      if (index > -1) {
        queue.splice(index, 1);
        jobQueues.set(job.lane, queue);
      }
    }

    // Remove from active jobs
    activeJobs.delete(job.id);

    // Broadcast update
    broadcastJobUpdate(job);

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully.'
    });

  } catch (error) {
    console.error('Job cancellation error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel job.' },
      { status: 500 }
    );
  }
}

// Helper functions

function getLaneText(row: any, lane: Lane): string | null {
  switch (lane) {
    case 'en':
      return row.english || null;
    case 'ar_enhanced':
      return row.enhanced || row.arabic_enhanced || null;
    case 'ar_original':
      return row.original || row.arabic_original || null;
    default:
      return null;
  }
}

async function getTextDataForScope(scope: string, scopeId: string, lane: Lane): Promise<string[]> {
  try {
    const projectRoot = process.cwd();

    if (scope === 'book') {
      // Load entire book from triview.json
      const triviewPath = join(projectRoot, 'outputs', 'triview.json');
      if (await fs.access(triviewPath).then(() => true).catch(() => false)) {
        const triviewData = JSON.parse(await fs.readFile(triviewPath, 'utf8'));
        const texts: string[] = [];

        for (const section of triviewData.sections) {
          for (const row of section.rows) {
            const text = getLaneText(row, lane);
            if (text && text.trim()) {
              texts.push(text.trim());
            }
          }
        }

        return texts.filter(text => text && text.trim().length > 0);
      }
    } else if (scope === 'section') {
      // Load specific section
      const sectionPath = join(projectRoot, 'data', 'sections', `${scopeId}.json`);
      if (await fs.access(sectionPath).then(() => true).catch(() => false)) {
        const sectionData = JSON.parse(await fs.readFile(sectionPath, 'utf8'));
        const texts: string[] = [];

        for (const row of sectionData.rows) {
          const text = getLaneText(row, lane);
          if (text && text.trim()) {
            texts.push(text.trim());
          }
        }

        return texts.filter(text => text && text.trim().length > 0);
      }
    } else if (scope === 'chapter') {
      // Load specific chapter (implement based on your chapter structure)
      // This is a placeholder - you'll need to implement chapter loading
      throw new Error('Chapter-based loading not yet implemented');
    }

    return [];
  } catch (error) {
    console.error('Error loading text data:', error);
    return [];
  }
}

function isLaneProcessing(lane: Lane): boolean {
  for (const job of jobs.values()) {
    if (job.lane === lane && job.status === 'processing') {
      return true;
    }
  }
  return false;
}

async function processNextJob(lane: Lane) {
  const queue = jobQueues.get(lane) || [];
  if (queue.length === 0) return;

  const jobId = queue.shift()!;
  jobQueues.set(lane, queue);

  const job = jobs.get(jobId);
  if (!job || job.status !== 'pending') {
    // Job was cancelled or doesn't exist, process next
    processNextJob(lane);
    return;
  }

  try {
    // Mark job as processing
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    activeJobs.add(jobId);
    broadcastJobUpdate(job);

    // Get text data
    const textData = await getTextDataForScope(job.scope, job.scopeId, job.lane);
    job.totalSegments = textData.length;

    // Process each text segment
    const audioSegments: string[] = [];

    for (let i = 0; i < textData.length; i++) {
      if (job.status === 'cancelled') {
        throw new Error('Job was cancelled');
      }

      const text = textData[i];
      const segmentId = `${job.id}_segment_${i}`;

      try {
        // Call TTS API for this segment
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            lane: job.lane,
            rowId: segmentId
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.audioUrl) {
            audioSegments.push(data.audioUrl);
          }
        }

        // Update progress
        job.processedSegments = i + 1;
        job.progress = Math.round((job.processedSegments / job.totalSegments) * 100);
        job.updatedAt = new Date().toISOString();
        broadcastJobUpdate(job);

        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (segmentError) {
        console.error(`Error processing segment ${i}:`, segmentError);
        // Continue with next segment
      }
    }

    if (audioSegments.length === 0) {
      throw new Error('No audio segments were generated successfully');
    }

    // Create manifest for M4B generation
    const outputDir = join(process.cwd(), 'outputs', 'audio', job.scope, job.lane);
    await fs.mkdir(outputDir, { recursive: true });

    const manifest = {
      jobId: job.id,
      scope: job.scope,
      lane: job.lane,
      segments: audioSegments,
      metadata: job.metadata
    };

    const manifestPath = join(outputDir, `${job.id}_manifest.json`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Generate M4B audiobook
    try {
      console.log(`Starting M4B generation for job ${job.id}...`);

      // Dynamic import of M4B builder
      const { M4BBuilder } = await import('../../../build/m4b.mjs');
      const builder = new M4BBuilder();

      const m4bResult = await builder.createAudiobook(manifestPath);

      if (m4bResult.success) {
        job.m4bUrl = m4bResult.url;
        console.log(`M4B created successfully: ${m4bResult.url}`);
      }
    } catch (m4bError) {
      console.error('M4B generation failed:', m4bError);
      // Continue without M4B - manifest is still available
    }

    // Mark job as completed
    job.status = 'completed';
    job.progress = 100;
    job.audioUrl = `/api/files/audio/${job.scope}/${job.lane}/${job.id}_manifest.json`;
    job.updatedAt = new Date().toISOString();
    activeJobs.delete(jobId);
    broadcastJobUpdate(job);

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);

    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';
    job.updatedAt = new Date().toISOString();
    activeJobs.delete(jobId);
    broadcastJobUpdate(job);
  }

  // Process next job in queue
  setTimeout(() => processNextJob(lane), 1000);
}

function broadcastJobUpdate(job: AudioJob) {
  const message = JSON.stringify({ type: 'job_update', job });

  // Create a copy of connections to iterate over (avoiding modification during iteration)
  const connections = Array.from(sseConnections);

  for (const controller of connections) {
    try {
      controller.enqueue(`data: ${message}\n\n`);
    } catch (error) {
      // Connection was closed, remove it
      sseConnections.delete(controller);
    }
  }
}