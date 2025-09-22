/**
 * Audio Job Management API
 *
 * This API handles audiobook generation jobs and provides real-time updates via NDJSON streaming.
 *
 * API Contract:
 * - POST /api/audio/job: Create new audiobook job
 * - GET /api/audio/job: List all jobs (JSON response)
 * - GET /api/audio/job?stream=true: Real-time job updates via NDJSON streaming
 * - DELETE /api/audio/job: Cancel existing job
 *
 * Real-time Updates:
 * - Uses NDJSON streaming for real-time job progress updates
 * - Connect to GET /api/audio/job?stream=true to receive updates
 * - Events are sent as JSON objects separated by newlines: {"type": "connected"}\n{"type": "job_update", "job": {...}}\n
 * - Connection sends initial connected message and active jobs, then continues to send updates
 *
 * Note: This API uses NDJSON streaming with Content-Type: application/x-ndjson. Client implementations should use
 * fetch() with streaming response reader rather than EventSource API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type { Lane, AudioJob } from '../../../../lib/audio/types';


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

// NDJSON streaming connections for real-time updates
const ndjsonConnections = new Set<ReadableStreamDefaultController>();

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

    // Check for existing jobs with same scope/lane/scopeId
    const existingJobKey = `${body.scope}-${body.lane}-${body.scopeId}`;
    const existingJob = Array.from(jobs.values()).find(job =>
      job.scope === body.scope &&
      job.lane === body.lane &&
      job.scopeId === body.scopeId &&
      (job.status === 'pending' || job.status === 'processing')
    );

    if (existingJob) {
      return NextResponse.json(
        { error: `A ${body.scope} job for ${body.lane} lane is already ${existingJob.status}. Job ID: ${existingJob.id}` },
        { status: 409 }
      );
    }

    // Generate job ID with deduplication key
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

    // Add to queue with priority (section < chapter < book)
    const queue = jobQueues.get(body.lane) || [];
    const priority = { section: 0, chapter: 1, book: 2 }[body.scope];

    // Insert job based on priority (lower number = higher priority)
    const insertIndex = queue.findIndex(queuedJobId => {
      const queuedJob = jobs.get(queuedJobId);
      if (!queuedJob) return true; // Insert before invalid jobs
      const queuedPriority = { section: 0, chapter: 1, book: 2 }[queuedJob.scope];
      return queuedPriority > priority;
    });

    if (insertIndex === -1) {
      queue.push(jobId);
    } else {
      queue.splice(insertIndex, 0, jobId);
    }

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
    // NDJSON streaming for real-time updates
    let ctrl: ReadableStreamDefaultController | undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        ctrl = controller;
        ndjsonConnections.add(controller);

        // Send initial connection message
        const connectedMessage = JSON.stringify({ type: 'connected' }) + '\n';
        controller.enqueue(encoder.encode(connectedMessage));

        // Send current active jobs
        for (const job of jobs.values()) {
          if (job.status === 'processing' || job.status === 'pending') {
            const jobMessage = JSON.stringify({ type: 'job_update', job }) + '\n';
            controller.enqueue(encoder.encode(jobMessage));
          }
        }
      },
      cancel() {
        if (ctrl) {
          ndjsonConnections.delete(ctrl);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
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

    // Remove from queue if pending (do this before updating status)
    if (job.status === 'pending') {
      const queue = jobQueues.get(job.lane) || [];
      const index = queue.indexOf(job.id);
      if (index > -1) {
        queue.splice(index, 1);
        jobQueues.set(job.lane, queue);
      }
    }

    // Update job status
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();

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
    // Check if job was cancelled before we start processing
    if (job.status === 'cancelled') {
      // Exit gracefully and don't mark as failed
      activeJobs.delete(jobId);
      processNextJob(lane);
      return;
    }
    // Mark job as processing
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    activeJobs.add(jobId);
    broadcastJobUpdate(job);

    // Get text data
    const textData = await getTextDataForScope(job.scope, job.scopeId, job.lane);
    job.totalSegments = textData.length;

    // Process each text segment with retry logic
    const audioSegments: string[] = [];
    const failedSegments: number[] = [];
    const maxRetries = 3;

    for (let i = 0; i < textData.length; i++) {
      if (job.status === 'cancelled') {
        // Job was cancelled during processing, exit gracefully
        activeJobs.delete(jobId);
        processNextJob(lane);
        return;
      }

      const text = textData[i];
      const segmentId = `${job.id}_segment_${i}`;
      let retryCount = 0;
      let segmentSuccess = false;

      while (retryCount < maxRetries && !segmentSuccess) {
        try {
          // Call TTS API for this segment
          const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
          if (!baseUrl) {
            throw new Error('APP_URL environment variable is not set for internal API calls');
          }
          const response = await fetch(`${baseUrl}/api/tts`, {
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
              segmentSuccess = true;
            } else {
              throw new Error(`TTS API returned unsuccessful response: ${data.error || 'Unknown error'}`);
            }
          } else {
            const errorText = await response.text();
            throw new Error(`TTS API error: ${response.status} ${errorText}`);
          }

        } catch (segmentError) {
          retryCount++;
          console.error(`Error processing segment ${i} (attempt ${retryCount}/${maxRetries}):`, segmentError);

          if (retryCount < maxRetries) {
            // Exponential backoff for retries
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // Mark as failed after all retries
            failedSegments.push(i);
            console.error(`Segment ${i} failed after ${maxRetries} attempts`);
          }
        }
      }

      // Update progress
      job.processedSegments = i + 1;
      job.progress = Math.round((job.processedSegments / job.totalSegments) * 100);
      job.updatedAt = new Date().toISOString();
      broadcastJobUpdate(job);

      // Small delay to prevent overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Check completion status
    if (audioSegments.length === 0) {
      throw new Error('No audio segments were generated successfully');
    }

    // Warn about failed segments but continue if we have some successful ones
    if (failedSegments.length > 0) {
      const warningMessage = `${failedSegments.length} segments failed to generate: ${failedSegments.join(', ')}`;
      console.warn(warningMessage);
      job.error = warningMessage;
    }

    // Create enhanced manifest for M4B generation
    const outputDir = join(process.cwd(), 'outputs', 'audio', job.scope, job.lane);
    await fs.mkdir(outputDir, { recursive: true });

    // Calculate total duration and file sizes
    let totalDuration = 0;
    let totalFileSize = 0;
    const segmentDetails = [];

    for (let i = 0; i < audioSegments.length; i++) {
      const segmentUrl = audioSegments[i];
      try {
        // Extract file path from URL
        const fileName = segmentUrl.split('/').pop();
        const segmentPath = join(process.cwd(), 'outputs', 'audio', 'segments', fileName || '');

        // Get file stats if available
        try {
          const stats = await fs.stat(segmentPath);
          totalFileSize += stats.size;
        } catch {
          // File may not exist yet
        }

        segmentDetails.push({
          index: i,
          url: segmentUrl,
          text: textData[i] || '',
          duration: 0, // Could be calculated from audio metadata in future
          fileSize: 0 // Could be read from file stats
        });
      } catch (error) {
        console.warn(`Could not process segment ${i}:`, error);
      }
    }

    const manifest = {
      jobId: job.id,
      scope: job.scope,
      scopeId: job.scopeId,
      scopeName: job.scopeName,
      lane: job.lane,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: new Date().toISOString(),
      segments: segmentDetails,
      summary: {
        totalSegments: audioSegments.length,
        totalDuration: totalDuration,
        totalFileSize: totalFileSize,
        averageSegmentDuration: audioSegments.length > 0 ? totalDuration / audioSegments.length : 0
      },
      metadata: {
        ...job.metadata,
        voiceId: job.metadata?.voiceId || '',
        voiceName: job.metadata?.voiceName || '',
        actualCost: (audioSegments.length * 0.30) // Rough estimate
      },
      m4bReady: false, // Will be set to true when M4B is generated
      version: '1.0'
    };

    const manifestPath = join(outputDir, `${job.id}_manifest.json`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // TODO: M4B audiobook generation can be added later as a separate build step

    // Mark job as completed
    job.status = 'completed';
    job.progress = 100;
    job.audioUrl = `/api/files/audio/${job.scope}/${job.lane}/${job.id}_manifest.json`;
    job.updatedAt = new Date().toISOString();
    activeJobs.delete(jobId);
    broadcastJobUpdate(job);

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);

    // Check if job was cancelled during processing
    if (job.status === 'cancelled') {
      // Don't mark as failed, already handled
      activeJobs.delete(jobId);
      broadcastJobUpdate(job);
    } else {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.updatedAt = new Date().toISOString();
      activeJobs.delete(jobId);
      broadcastJobUpdate(job);
    }
  }

  // Process next job in queue
  setTimeout(() => processNextJob(lane), 1000);
}

// Job cleanup - remove completed jobs older than 24 hours
function cleanupOldJobs() {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();

  for (const [jobId, job] of jobs.entries()) {
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      const jobAge = now - new Date(job.updatedAt).getTime();
      if (jobAge > maxAge) {
        jobs.delete(jobId);
        console.log(`Cleaned up old job: ${jobId}`);
      }
    }
  }
}

// Run cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000);

function broadcastJobUpdate(job: AudioJob) {
  const message = JSON.stringify({ type: 'job_update', job }) + '\n';
  const encoder = new TextEncoder();

  // Create a copy of connections to iterate over (avoiding modification during iteration)
  const connections = Array.from(ndjsonConnections);

  for (const controller of connections) {
    try {
      controller.enqueue(encoder.encode(message));
    } catch (error) {
      // Connection was closed, remove it
      ndjsonConnections.delete(controller);
    }
  }
}