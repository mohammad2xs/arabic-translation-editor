import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { stat } from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const { path } = params;

    if (!path || path.length === 0) {
      return NextResponse.json(
        { error: 'Audio file path is required' },
        { status: 400 }
      );
    }

    // Construct safe file path
    const audioDir = join(process.cwd(), process.env.AUDIO_STORAGE_PATH || 'outputs/audio');
    const requestedPath = path.join('/');
    const filePath = join(audioDir, requestedPath);

    // Security check: ensure path is within audio directory
    const resolvedAudioDir = await fs.realpath(audioDir);
    let resolvedFilePath: string;

    try {
      resolvedFilePath = await fs.realpath(filePath);
    } catch {
      // File doesn't exist
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      );
    }

    if (!resolvedFilePath.startsWith(resolvedAudioDir)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if file exists and get stats
    let fileStats;
    try {
      fileStats = await stat(resolvedFilePath);
    } catch {
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      );
    }

    if (!fileStats.isFile()) {
      return NextResponse.json(
        { error: 'Not a file' },
        { status: 400 }
      );
    }

    // Read the audio file
    const audioBuffer = await fs.readFile(resolvedFilePath);

    // Determine content type based on file extension
    const extension = requestedPath.split('.').pop()?.toLowerCase();
    let contentType = 'audio/mpeg'; // Default to MP3

    switch (extension) {
      case 'mp3':
        contentType = 'audio/mpeg';
        break;
      case 'wav':
        contentType = 'audio/wav';
        break;
      case 'ogg':
        contentType = 'audio/ogg';
        break;
      case 'm4a':
        contentType = 'audio/mp4';
        break;
      default:
        contentType = 'audio/mpeg';
    }

    // Set appropriate headers
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Length', audioBuffer.length.toString());
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    headers.set('Last-Modified', fileStats.mtime.toUTCString());

    // Handle range requests (for audio seeking)
    const range = request.headers.get('range');
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : audioBuffer.length - 1;
      const chunksize = (end - start) + 1;

      headers.set('Content-Range', `bytes ${start}-${end}/${audioBuffer.length}`);
      headers.set('Content-Length', chunksize.toString());

      return new NextResponse(new Uint8Array(audioBuffer.slice(start, end + 1)), {
        status: 206,
        headers,
      });
    }

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('Audio serving error:', error);
    return NextResponse.json(
      { error: 'Failed to serve audio file' },
      { status: 500 }
    );
  }
}