import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { calculateLPR } from '../../../../lib/complexity';

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

    // Check if Dad-Mode metadata is requested
    const url = new URL(request.url);
    const includeDadMode = url.searchParams.get('dadMode') === 'true' ||
                          url.searchParams.get('mode') === 'dad';

    let enhancedSection = section;

    if (includeDadMode) {
      // Enhance with Dad-Mode metadata
      const enhancedRows = await Promise.all(
        section.rows.map(async (row: any) => {
          const dadMetadata = await getDadModeRowMetadata(row);
          return {
            ...row,
            dadModeMetadata: dadMetadata,
          };
        })
      );

      // Calculate section-level Dad-Mode metadata
      const dadSectionMetadata = calculateDadModeSectionMetadata(enhancedRows);

      enhancedSection = {
        ...section,
        rows: enhancedRows,
        dadModeMetadata: dadSectionMetadata,
      };
    }

    // Add request metadata
    const response = {
      ...enhancedSection,
      metadata: {
        ...enhancedSection.metadata,
        requestedAt: new Date().toISOString(),
        api: {
          version: '1.0',
          endpoint: `/api/sections/${id}`,
          dadModeEnhanced: includeDadMode
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

// Helper functions for Dad-Mode metadata
interface DadModeMetadata {
  approved: boolean;
  needsExpand: boolean;
  hasScripture: boolean;
  historyLength: number;
  noteCount: number;
  qualityStatus: 'good' | 'needs-work' | 'scripture' | 'pending';
  lastModified?: string;
  scriptureApproved?: boolean;
  flaggedReason?: string;
}

async function getDadModeRowMetadata(row: any): Promise<DadModeMetadata> {
  const rowId = row.id;

  // Check history length and scripture approval/flag status
  let historyLength = 0;
  let scriptureApproved = false;
  let flaggedReason: string | undefined;
  let lastModified: string | undefined;

  try {
    const historyPath = path.join(process.cwd(), 'outputs', 'tmp', 'history', `${rowId}.json`);
    const historyData = await fs.readFile(historyPath, 'utf-8');
    const history = JSON.parse(historyData);
    historyLength = history.versions?.length || 0;

    // Check for scripture-related actions in history
    if (history.versions && history.versions.length > 0) {
      // Get the last version with timestamp
      lastModified = history.versions[history.versions.length - 1].timestamp;

      // Find the most recent scripture action
      for (let i = history.versions.length - 1; i >= 0; i--) {
        const version = history.versions[i];
        if (version.action === 'approve_scripture') {
          scriptureApproved = true;
          flaggedReason = undefined; // Clear any previous flag
          break;
        } else if (version.action === 'flag_scripture') {
          scriptureApproved = false;
          flaggedReason = version.reason;
          break;
        }
      }
    }
  } catch {
    // No history file exists
  }

  // Check note count
  let noteCount = 0;
  try {
    const notesPath = path.join(process.cwd(), 'outputs', 'tmp', 'notes', `${rowId}.json`);
    const notesData = await fs.readFile(notesPath, 'utf-8');
    const notes = JSON.parse(notesData);
    noteCount = notes.length || 0;
  } catch {
    // No notes file exists
  }

  // Calculate quality status
  const qualityStatus = getQualityStatus(row);

  // Check if needs expansion
  const lpr = row.english ? calculateLPR(row.original, row.english) : 0;
  const needsExpand = lpr < 0.95 || row.metadata?.needsExpand || false;

  // Check for scripture references
  const hasScripture = (row.scriptureRefs?.length || 0) > 0;

  // Check if approved (simplified logic)
  const approved = (scriptureApproved && hasScripture) ||
                   (row.metadata?.qualityGates?.scripture === true &&
                   lpr >= 0.95 &&
                   (row.metadata?.confidence || 0) >= 0.8);

  return {
    approved,
    needsExpand,
    hasScripture,
    historyLength,
    noteCount,
    qualityStatus,
    lastModified,
    scriptureApproved,
    flaggedReason,
  };
}

function getQualityStatus(row: any): 'good' | 'needs-work' | 'scripture' | 'pending' {
  const lpr = row.english ? calculateLPR(row.original, row.english) : 0;
  const confidence = row.metadata?.confidence || 0;
  const hasScripture = (row.scriptureRefs?.length || 0) > 0;
  const isProcessed = !!row.metadata?.processedAt;

  // Scripture notes take priority
  if (hasScripture && row.metadata?.qualityGates?.scripture) {
    return 'scripture';
  }

  // Not processed yet
  if (!isProcessed || !row.english) {
    return 'pending';
  }

  // Good quality (high LPR and confidence)
  if (lpr >= 0.8 && confidence >= 0.8) {
    return 'good';
  }

  // Needs improvement
  return 'needs-work';
}

function calculateDadModeSectionMetadata(rows: any[]) {
  const totalRows = rows.length;
  const completedRows = rows.filter(row =>
    row.english && row.english.trim().length > 0
  ).length;

  const approvedRows = rows.filter(row =>
    row.dadModeMetadata?.approved
  ).length;

  const pendingRows = rows.filter(row =>
    row.dadModeMetadata?.qualityStatus === 'pending'
  ).length;

  const rowsWithNotes = rows.filter(row =>
    (row.dadModeMetadata?.noteCount || 0) > 0
  ).length;

  const rowsWithScripture = rows.filter(row =>
    row.dadModeMetadata?.hasScripture
  ).length;

  // Calculate overall quality score
  const qualityScores = rows.map(row => {
    switch (row.dadModeMetadata?.qualityStatus) {
      case 'good': return 1.0;
      case 'scripture': return 1.0;
      case 'needs-work': return 0.6;
      case 'pending': return 0.0;
      default: return 0.0;
    }
  });

  const overallQualityScore = totalRows > 0
    ? (qualityScores.reduce((sum, score) => sum + score, 0) / totalRows) * 100
    : 0;

  return {
    totalRows,
    completedRows,
    approvedRows,
    pendingRows,
    overallQualityScore: Math.round(overallQualityScore),
    rowsWithNotes,
    rowsWithScripture,
  };
}