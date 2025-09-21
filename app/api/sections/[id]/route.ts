import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const SECTIONS_DIR = path.join(process.cwd(), 'data', 'sections');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Validate section ID format (S001, S002, etc.)
    if (!id || !/^S\d{3}$/.test(id)) {
      return NextResponse.json(
        { error: 'Invalid section ID format. Expected format: S001, S002, etc.' },
        { status: 400 }
      );
    }

    // Construct file path
    const sectionPath = path.join(SECTIONS_DIR, `${id}.json`);

    // Check if file exists
    try {
      await fs.access(sectionPath);
    } catch {
      return NextResponse.json(
        { error: `Section ${id} not found` },
        { status: 404 }
      );
    }

    // Read and parse section data
    const sectionData = await fs.readFile(sectionPath, 'utf8');
    const section = JSON.parse(sectionData);

    // Validate section structure
    if (!section.id || !section.title || !Array.isArray(section.rows)) {
      return NextResponse.json(
        { error: 'Invalid section data structure' },
        { status: 500 }
      );
    }

    // Validate row shape
    if (section.rows.some((r: any) => !(r.id && r.original))) {
      return NextResponse.json(
        { error: 'Invalid rows' },
        { status: 500 }
      );
    }

    // Add request metadata
    const response = {
      ...section,
      metadata: {
        ...section.metadata,
        requestedAt: new Date().toISOString(),
        api: {
          version: '1.0',
          endpoint: `/api/sections/${id}`
        }
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error(`Error serving section ${params.id}:`, error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Optional: Support HEAD requests for section existence checks
export async function HEAD(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id || !/^S\d{3}$/.test(id)) {
      return new NextResponse(null, { status: 400 });
    }

    const sectionPath = path.join(SECTIONS_DIR, `${id}.json`);

    try {
      await fs.access(sectionPath);
      return new NextResponse(null, { status: 200 });
    } catch {
      return new NextResponse(null, { status: 404 });
    }

  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}