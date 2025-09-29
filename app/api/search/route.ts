import { NextRequest, NextResponse } from 'next/server';
import { runSearch } from '@/lib/search/engine';
import { SearchFilters, SearchStatus } from '@/lib/search/types';

function parseStatus(value: string | null): SearchStatus | 'all' | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'all') return 'all';
  if (['pending', 'in-progress', 'approved'].includes(normalized)) {
    return normalized as SearchStatus;
  }
  return undefined;
}

function parseSectionIds(params: URLSearchParams): string[] | undefined {
  const explicit = params.getAll('section');
  const combined = params.get('sections');
  const values = new Set<string>();

  for (const section of explicit) {
    if (section.trim()) {
      values.add(section.trim());
    }
  }

  if (combined) {
    combined.split(',').map(part => part.trim()).filter(Boolean).forEach(value => values.add(value));
  }

  return values.size > 0 ? Array.from(values) : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    const limit = Number.parseInt(searchParams.get('limit') ?? '20', 10);
    const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
    const status = parseStatus(searchParams.get('status'));
    const minNotesParam = searchParams.get('minNotes') ?? (searchParams.get('hasNotes') === 'true' ? '1' : undefined);
    const parsedMinNotes = typeof minNotesParam === 'string' ? Number.parseInt(minNotesParam, 10) : undefined;
    const normalizedMinNotes = typeof parsedMinNotes === 'number' && !Number.isNaN(parsedMinNotes) ? Math.max(0, parsedMinNotes) : undefined;
    const scriptureOnly = searchParams.get('scriptureOnly') === 'true' || searchParams.get('type') === 'scripture';
    const forceRefresh = searchParams.get('refresh') === 'true';

    const filters: SearchFilters = {
      sectionIds: parseSectionIds(searchParams),
      status,
      minNotes: normalizedMinNotes,
      includeScriptureOnly: scriptureOnly,
    };

    const result = await runSearch(query, {
      limit,
      offset,
      filters,
      forceRefresh,
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[search] Failed to execute search:', error);
    return NextResponse.json({
      error: 'Failed to execute search',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
