import { NextResponse } from 'next/server';
import { loadTriviewForExport } from '../../../lib/export/triview-adapter.mjs';

export const revalidate = 60;

function pickTitle(section: any): string {
  if (section?.title && typeof section.title === 'string' && section.title.trim()) {
    return section.title.trim();
  }

  const rows = Array.isArray(section?.rows) ? section.rows : [];
  for (const row of rows) {
    const candidate = [row?.enhanced, row?.original]
      .find((value) => typeof value === 'string' && value.trim());
    if (candidate) {
      return candidate.trim().slice(0, 80);
    }
  }

  return typeof section?.id === 'string' ? section.id : 'Unknown section';
}

export async function GET() {
  try {
    const { sections } = loadTriviewForExport();

    const payload = sections.map((section: any) => ({
      id: section.id,
      title: pickTitle(section),
      count: Array.isArray(section.rows) ? section.rows.length : 0,
    }));

    return NextResponse.json({ sections: payload });
  } catch (error) {
    console.error('Failed to load sections for dad index', error);
    return NextResponse.json({ sections: [] }, { status: 500 });
  }
}

