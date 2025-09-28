import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sectionId = params.id;

    // Read triview.json to get the rows for this section
    const triviewData = JSON.parse(
      await fs.readFile(process.cwd() + '/outputs/triview.json', 'utf8')
    );

    // Filter rows by section ID
    const sectionRows = triviewData.rows.filter(
      (row: any) => row.metadata.sectionId === sectionId
    );

    if (sectionRows.length === 0) {
      return NextResponse.json(
        { error: 'Section not found or no rows available' },
        { status: 404 }
      );
    }

    // Transform rows to match the expected format
    const rows = sectionRows.map((row: any) => ({
      id: row.id,
      original: row.original,
      enhanced: row.enhanced,
      english: row.english,
      complexity: row.complexity,
      scriptureRefs: row.scriptureRefs || [],
      metadata: row.metadata
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('Error fetching section preview:', error);

    // Return empty rows if file doesn't exist or other error
    return NextResponse.json({ rows: [] });
  }
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}