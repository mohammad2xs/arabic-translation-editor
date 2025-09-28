import { NextRequest, NextResponse } from 'next/server';
import { BlobStore } from '@/lib/storage/index';
import { kv } from '@vercel/kv';

interface AudioManifest {
  id: string;
  scope: 'section' | 'chapter' | 'book';
  lane: 'en' | 'ar_enhanced' | 'ar_original';
  scopeId: string;
  scopeName: string;
  segments: Array<{
    index: number;
    text: string;
    duration?: number;
    audioFile?: string;
  }>;
  metadata: {
    createdAt: string;
    completedAt: string;
    totalSegments: number;
    totalDuration?: number;
    totalCharacters: number;
    estimatedCost?: number;
    actualCost?: number;
    voiceId?: string;
    voiceName?: string;
  };
  m4bReady?: boolean;
  version: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const manifestId = params.id;

    if (!manifestId) {
      return NextResponse.json(
        { error: 'Manifest ID is required' },
        { status: 400 }
      );
    }

    // Try to get manifest from KV cache first
    const cacheKey = `audio:manifest:cache:${manifestId}`;

    try {
      const cachedManifest = await kv.get<AudioManifest>(cacheKey);
      if (cachedManifest) {
        console.log(`Serving audio manifest ${manifestId} from KV cache`);
        return NextResponse.json(cachedManifest, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          },
        });
      }
    } catch (kvError) {
      console.warn('KV cache not available:', kvError);
    }

    // Try to get manifest from Blob storage
    const manifestKey = `audio:manifest:${manifestId}`;

    try {
      // Get the token for Blob storage
      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

      if (!token) {
        throw new Error('Blob storage not configured');
      }

      // Import Vercel Blob SDK
      const { list } = await import('@vercel/blob');

      // List blobs with the manifest key
      const { blobs } = await list({ prefix: manifestKey, token });
      const blob = blobs.find((b: any) => b.pathname === manifestKey);

      if (blob && blob.url) {
        // Fetch the manifest from the blob URL
        const response = await fetch(blob.url);

        if (response.ok) {
          const manifest: AudioManifest = await response.json();

          // Cache in KV for faster access
          try {
            await kv.set(cacheKey, manifest, { ex: 3600 }); // Cache for 1 hour
          } catch (kvError) {
            console.warn('Failed to cache manifest in KV:', kvError);
          }

          return NextResponse.json(manifest, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
    } catch (blobError) {
      console.error('Failed to retrieve manifest from Blob storage:', blobError);
    }

    // Fallback to filesystem (for backward compatibility)
    try {
      const { promises: fs } = await import('fs');
      const { join } = await import('path');

      // Try different possible paths
      const possiblePaths = [
        join(process.cwd(), 'outputs', 'audio', 'section', 'en', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'section', 'ar_enhanced', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'section', 'ar_original', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'chapter', 'en', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'chapter', 'ar_enhanced', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'chapter', 'ar_original', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'book', 'en', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'book', 'ar_enhanced', `${manifestId}_manifest.json`),
        join(process.cwd(), 'outputs', 'audio', 'book', 'ar_original', `${manifestId}_manifest.json`),
      ];

      for (const path of possiblePaths) {
        try {
          const data = await fs.readFile(path, 'utf-8');
          const manifest: AudioManifest = JSON.parse(data);

          console.log(`Serving audio manifest ${manifestId} from filesystem`);

          // Optionally migrate to Blob storage
          try {
            await BlobStore.putText(manifestKey, JSON.stringify(manifest, null, 2), 'application/json');
            console.log(`Migrated manifest ${manifestId} to Blob storage`);
          } catch (migrateError) {
            console.warn('Failed to migrate manifest to Blob storage:', migrateError);
          }

          return NextResponse.json(manifest, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        } catch {
          // Try next path
          continue;
        }
      }
    } catch (fsError) {
      console.error('Failed to read manifest from filesystem:', fsError);
    }

    // Manifest not found
    return NextResponse.json(
      { error: 'Audio manifest not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error retrieving audio manifest:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve audio manifest' },
      { status: 500 }
    );
  }
}