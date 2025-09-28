import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { lookup } from 'mime-types';

// GET: Serve files from outputs directory
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Join the path segments
    const filePath = params.path.join('/');

    // Security check: ensure path doesn't escape outputs directory
    if (filePath.includes('..') || filePath.includes('\0') || filePath.startsWith('/')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Construct full file path within outputs directory
    const projectRoot = process.cwd();
    const fullPath = join(projectRoot, 'outputs', filePath);

    // Check if file exists and is readable
    try {
      await fs.access(fullPath, fs.constants.R_OK);
    } catch (error) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Get file stats
    const stats = await fs.stat(fullPath);

    // Only serve regular files, not directories
    if (!stats.isFile()) {
      return NextResponse.json(
        { error: 'Path is not a file' },
        { status: 400 }
      );
    }

    // Read file
    const fileBuffer = await fs.readFile(fullPath);

    // Determine content type
    const mimeType = lookup(fullPath) || 'application/octet-stream';

    // Set appropriate headers
    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Length', stats.size.toString());
    headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    headers.set('Last-Modified', stats.mtime.toUTCString());

    // Handle range requests for audio/video files
    const range = request.headers.get('range');
    if (range && (mimeType.startsWith('audio/') || mimeType.startsWith('video/'))) {
      return handleRangeRequest(fileBuffer, range, mimeType, stats.size);
    }

    return new Response(fileBuffer, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('File serving error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle HTTP range requests for media files
function handleRangeRequest(
  fileBuffer: Buffer,
  range: string,
  mimeType: string,
  fileSize: number
): Response {
  // Parse range header
  const ranges = range.replace(/bytes=/, '').split('-');
  const start = parseInt(ranges[0], 10);
  const end = ranges[1] ? parseInt(ranges[1], 10) : fileSize - 1;

  // Validate range
  if (start >= fileSize || end >= fileSize || start > end) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${fileSize}`,
      },
    });
  }

  const chunkSize = end - start + 1;
  const chunk = fileBuffer.subarray(start, end + 1);

  const headers = new Headers();
  headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', chunkSize.toString());
  headers.set('Content-Type', mimeType);
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(chunk, {
    status: 206, // Partial Content
    headers,
  });
}