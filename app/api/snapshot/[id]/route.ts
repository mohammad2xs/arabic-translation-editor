import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getRoleFromRequest, canApprove } from '../../../../lib/dadmode/access';
import { BlobStore, JsonStore } from '@/lib/storage/index';

interface CreateSnapshotRequest {
  lock?: boolean;
  comment?: string;
}

interface SectionSnapshot {
  sectionId: string;
  timestamp: string;
  userRole: string;
  comment?: string;
  locked: boolean;
  data: {
    rows: Array<{
      id: string;
      original: string;
      enhanced: string;
      english: string;
      metadata: any;
    }>;
    metadata: {
      totalRows: number;
      completedRows: number;
      pendingRows: number;
      qualityScore: number;
    };
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sectionId = params.id;

    if (!sectionId || !/^S\d{3}$/.test(sectionId)) {
      return NextResponse.json(
        { error: 'Invalid section ID format. Must be like S001, S002, etc.' },
        { status: 400 }
      );
    }

    const userRole = getRoleFromRequest(request);

    if (!canApprove(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create snapshots' },
        { status: 403 }
      );
    }

    const body: CreateSnapshotRequest = await request.json();

    // Load current section data
    const sectionResponse = await fetch(
      new URL(`/api/sections/${sectionId}`, request.url).toString()
    );

    if (!sectionResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to load section data for snapshot' },
        { status: 404 }
      );
    }

    const sectionData = await sectionResponse.json();

    // Calculate quality metrics
    const totalRows = sectionData.rows.length;
    const completedRows = sectionData.rows.filter(
      (row: any) => row.english && row.english.trim().length > 0
    ).length;
    const pendingRows = totalRows - completedRows;

    // Simple quality score based on completion and LPR
    const qualityScore = totalRows > 0 ?
      (completedRows / totalRows) * 100 : 0;

    // Create snapshot object
    const snapshot: SectionSnapshot = {
      sectionId,
      timestamp: new Date().toISOString(),
      userRole,
      comment: body.comment,
      locked: body.lock || false,
      data: {
        rows: sectionData.rows.map((row: any) => ({
          id: row.id,
          original: row.original,
          enhanced: row.enhanced,
          english: row.english,
          metadata: row.metadata,
        })),
        metadata: {
          totalRows,
          completedRows,
          pendingRows,
          qualityScore,
        },
      },
    };

    // Generate snapshot filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
    const filename = `${sectionId}-${timestamp}-${timeStr}.json`;

    // Save snapshot to Blob storage
    const snapshotKey = `snapshot:${sectionId}:${timestamp}-${timeStr}`;
    const snapshotJson = JSON.stringify(snapshot, null, 2);

    try {
      // Save to Blob storage
      const blobUrl = await BlobStore.putText(snapshotKey, snapshotJson, 'application/json');
      console.log(`Snapshot saved to Blob storage: ${blobUrl}`);
    } catch (blobError) {
      console.warn('Failed to save snapshot to Blob storage, using filesystem:', blobError);
      // Fallback to filesystem
      const snapshotsDir = join(process.cwd(), 'snapshots');
      await fs.mkdir(snapshotsDir, { recursive: true });
      const snapshotFile = join(snapshotsDir, filename);
      await fs.writeFile(snapshotFile, snapshotJson);
    }

    // Update snapshot index in KV
    const indexKey = `snapshot:${sectionId}:index`;
    const currentIndex = await JsonStore.get<Array<{
      filename: string;
      timestamp: string;
      locked: boolean;
      comment?: string;
      metadata: any;
    }>>(indexKey) || [];

    // Add new snapshot metadata to index
    currentIndex.unshift({
      filename,
      timestamp: snapshot.timestamp,
      locked: snapshot.locked,
      comment: snapshot.comment,
      metadata: snapshot.data.metadata,
    });

    // Keep only last 50 snapshots in index
    const trimmedIndex = currentIndex.slice(0, 50);
    await JsonStore.set(indexKey, trimmedIndex);

    return NextResponse.json({
      success: true,
      sectionId,
      filename,
      timestamp: snapshot.timestamp,
      metadata: snapshot.data.metadata,
      locked: snapshot.locked,
    });
  } catch (error) {
    console.error('Snapshot creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create section snapshot' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sectionId = params.id;

    if (!sectionId || !/^S\d{3}$/.test(sectionId)) {
      return NextResponse.json(
        { error: 'Invalid section ID format' },
        { status: 400 }
      );
    }

    // Try to get snapshot index from KV first
    const indexKey = `snapshot:${sectionId}:index`;
    let snapshots = await JsonStore.get<Array<{
      filename: string;
      timestamp: string;
      locked: boolean;
      comment?: string;
      metadata: any;
    }>>(indexKey);

    if (snapshots && snapshots.length > 0) {
      // Return snapshots from KV index (already sorted, most recent first)
      return NextResponse.json({
        sectionId,
        snapshots: snapshots.slice(0, 10),
      });
    }

    // Fallback to filesystem if KV index doesn't exist
    console.log('KV index not found, falling back to filesystem');
    const snapshotsDir = join(process.cwd(), 'snapshots');

    try {
      const files = await fs.readdir(snapshotsDir);
      const sectionSnapshots = files
        .filter(file => file.startsWith(`${sectionId}-`) && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first

      const fileSnapshots = await Promise.all(
        sectionSnapshots.slice(0, 10).map(async file => {
          try {
            const data = await fs.readFile(join(snapshotsDir, file), 'utf-8');
            const snapshot: SectionSnapshot = JSON.parse(data);

            return {
              filename: file,
              timestamp: snapshot.timestamp,
              locked: snapshot.locked,
              comment: snapshot.comment,
              metadata: snapshot.data.metadata,
            };
          } catch {
            return null;
          }
        })
      );

      const validSnapshots = fileSnapshots.filter(s => s !== null);

      // Migrate filesystem snapshots to KV index for next time
      if (validSnapshots.length > 0) {
        await JsonStore.set(indexKey, validSnapshots);
      }

      return NextResponse.json({
        sectionId,
        snapshots: validSnapshots,
      });
    } catch {
      return NextResponse.json({
        sectionId,
        snapshots: [],
      });
    }
  } catch (error) {
    console.error('Snapshot retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve snapshots' },
      { status: 500 }
    );
  }
}