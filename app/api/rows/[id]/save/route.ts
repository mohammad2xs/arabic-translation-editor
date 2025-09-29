// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { writeFileSync, appendFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { getRoleFromRequest, canSave } from '../../../../../lib/dadmode/access';
import { JsonStore } from '@/lib/storage/index';

async function bumpRev(): Promise<number> {
  try {
    // Try to use KV storage first
    const currentState = await JsonStore.get<{ revision: number }>('sync:state') || { revision: 0 };

    // Increment revision
    const rev = (currentState.revision || 0) + 1;
    currentState.revision = rev;

    // Save back to KV
    await JsonStore.set('sync:state', currentState);

    // Fallback: also update filesystem for backward compatibility
    const stateFile = join(process.cwd(), 'outputs','tmp','sync','state.json');
    try {
      mkdirSync(dirname(stateFile), { recursive: true });
      writeFileSync(stateFile, JSON.stringify({ revision: rev }, null, 2));
    } catch (fsError) {
      console.warn('Failed to write state to filesystem (KV succeeded):', fsError);
    }

    return rev;
  } catch (error) {
    console.warn('KV storage failed, falling back to filesystem:', error);

    // Fallback to filesystem if KV fails
    const stateFile = join(process.cwd(), 'outputs','tmp','sync','state.json');
    mkdirSync(dirname(stateFile), { recursive: true });
    let rev = 0;
    if (existsSync(stateFile)) rev = JSON.parse(readFileSync(stateFile,'utf-8')).revision || 0;
    rev += 1;
    writeFileSync(stateFile, JSON.stringify({ revision: rev }, null, 2));
    return rev;
  }
}

async function appendDelta(section: string, rowId: string, changes: Record<string, any>, origin: string) {
  try {
    const rev = await bumpRev();
    const entry = { rev, section, row_id: rowId, changes, origin, timestamp: new Date().toISOString() };

    // Use KV for stream storage
    const currentStream = await JsonStore.get<any[]>('sync:stream') || [];
    currentStream.push(entry);

    // Trim to last 1000 entries
    const trimmedStream = currentStream.slice(-1000);

    // Save back to KV
    await JsonStore.set('sync:stream', trimmedStream);

    // Fallback: also write to filesystem for backward compatibility
    const streamFile = join(process.cwd(), 'outputs','tmp','sync','stream.ndjson');
    try {
      mkdirSync(dirname(streamFile), { recursive: true });
      appendFileSync(streamFile, JSON.stringify(entry) + '\n');
      // Keep filesystem file trimmed too
      const data = readFileSync(streamFile, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.trim());
      if (lines.length > 1000) {
        const keepLines = lines.slice(-1000);
        writeFileSync(streamFile, keepLines.join('\n') + '\n');
      }
    } catch (fsError) {
      console.warn('Failed to write stream to filesystem (KV succeeded):', fsError);
    }
  } catch (error) {
    console.error('Error appending delta (KV failed, trying filesystem):', error);

    // Fallback to filesystem if KV fails
    const streamFile = join(process.cwd(), 'outputs','tmp','sync','stream.ndjson');
    mkdirSync(dirname(streamFile), { recursive: true });
    const rev = await bumpRev();
    const entry = { rev, section, row_id: rowId, changes, origin, timestamp: new Date().toISOString() };
    appendFileSync(streamFile, JSON.stringify(entry) + '\n');
  }
}

// Helper function to calculate Length Preservation Ratio
function calculateLPR(enhanced?: string, en?: string): number {
  if (!enhanced || !en) return 1.0;

  const enhancedLength = enhanced.trim().length;
  const enLength = en.trim().length;

  if (enhancedLength === 0) return enLength === 0 ? 1.0 : 0.0;
  return Math.min(enLength / enhancedLength, 1.0);
}

// Helper function to get notes count for a row
async function getNotesCount(rowId: string): Promise<number> {
  try {
    const notesFile = join(process.cwd(), 'notes.json');
    const notesData = await fs.readFile(notesFile, 'utf-8');
    const notes = JSON.parse(notesData);
    return Array.isArray(notes[rowId]) ? notes[rowId].length : 0;
  } catch {
    return 0;
  }
}

interface SaveRowRequest {
  arEnhanced?: string;
  en?: string;
  action?: 'save' | 'approve' | 'flag' | 'approve_scripture' | 'flag_scripture';
  reason?: string;
  origin?: 'manual' | 'assistant' | 'assistant_undo';
}

interface RowHistory {
  rowId: string;
  versions: Array<{
    revision: number;
    timestamp: string;
    arEnhanced?: string;
    en?: string;
    action?: string;
    userRole: string;
    userAgent?: string;
    hash?: string;
    reason?: string;
    origin?: 'manual' | 'assistant' | 'assistant_undo';
  }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rowId = params.id;

    if (!rowId) {
      return NextResponse.json(
        { error: 'Row ID is required' },
        { status: 400 }
      );
    }

    // Get user role from middleware headers or cookies
    const userRole = getRoleFromRequest(request);

    // Check permissions
    if (!canSave(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to save changes' },
        { status: 403 }
      );
    }

    const body: SaveRowRequest = await request.json();

    // Validate that at least one field is provided
    if (!body.arEnhanced && !body.en && !body.action) {
      return NextResponse.json(
        { error: 'At least one field (arEnhanced, en, or action) must be provided' },
        { status: 400 }
      );
    }

    // Compute content hash for idempotent writes
    const content = `${body.arEnhanced ?? ''}|${body.en ?? ''}`;
    const hash = createHash('sha256').update(content).digest('hex');

    // Ensure history directory exists
    const historyDir = join(process.cwd(), 'outputs', 'tmp', 'history');
    await fs.mkdir(historyDir, { recursive: true });

    const historyFile = join(historyDir, `${rowId}.json`);
    const historyKey = `row:${rowId}:history`;

    // Load existing history - try KV first, then filesystem
    let history: RowHistory;
    try {
      // Try KV first
      const kvHistory = await JsonStore.get<RowHistory>(historyKey);
      if (kvHistory) {
        history = kvHistory;
      } else {
        // Try filesystem
        try {
          const existingData = await fs.readFile(historyFile, 'utf-8');
          history = JSON.parse(existingData);
        } catch {
          // No history exists
          history = {
            rowId,
            versions: [],
          };
        }
      }
    } catch {
      // KV failed, try filesystem
      try {
        const existingData = await fs.readFile(historyFile, 'utf-8');
        history = JSON.parse(existingData);
      } catch {
        // File doesn't exist, create new history
        history = {
          rowId,
          versions: [],
        };
      }
    }

    // Check for idempotent writes - compare with last version hash
    if (history.versions.length > 0 && body.action === 'save') {
      const lastVersion = history.versions[history.versions.length - 1];
      if (lastVersion.hash === hash) {
        // Content is identical, return early
        return NextResponse.json({
          success: true,
          revision: lastVersion.revision,
          savedAt: lastVersion.timestamp,
          rowId,
          message: 'Content unchanged - no new version created',
        });
      }
    }

    // Create new version
    const newVersion = {
      revision: (history.versions.length || 0) + 1,
      timestamp: new Date().toISOString(),
      arEnhanced: body.arEnhanced,
      en: body.en,
      action: body.action || 'save',
      userRole,
      userAgent: request.headers.get('user-agent') || undefined,
      hash,
      reason: body.reason,
      origin: body.origin || 'manual',
    };

    // Add to history (keep last 20 versions)
    history.versions.push(newVersion);
    if (history.versions.length > 20) {
      history.versions = history.versions.slice(-20);
    }

    // Save updated history to both KV and filesystem
    try {
      // Save to KV
      await JsonStore.set(historyKey, history);
    } catch (kvError) {
      console.warn('Failed to save history to KV:', kvError);
    }

    // Always save to filesystem as fallback
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));

    // Append delta for sync system
    const changes: Record<string, any> = {};
    if (body.en !== undefined) changes.en = body.en;
    if (body.arEnhanced !== undefined) changes.arEnhanced = body.arEnhanced;

    // Infer section from rowId pattern (e.g., S001-123) or use default
    const inferredSection = rowId.split('-')[0] || 'S001';
    await appendDelta(inferredSection, rowId, changes, body.origin || 'manual');

    // Add minimal status payload for IssueQueue integration
    const statusPayload = {
      approved: body.action === 'approve',
      hasScripture: body.action === 'approve_scripture' || body.action === 'flag_scripture',
      lpr: calculateLPR(body.arEnhanced, body.en),
      notesCount: await getNotesCount(rowId),
    };

    return NextResponse.json({
      success: true,
      revision: newVersion.revision,
      savedAt: newVersion.timestamp,
      rowId,
      status: statusPayload,
    });
  } catch (error) {
    console.error('Row save error:', error);
    return NextResponse.json(
      { error: 'Failed to save row changes' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rowId = params.id;

    if (!rowId) {
      return NextResponse.json(
        { error: 'Row ID is required' },
        { status: 400 }
      );
    }

    const historyFile = join(process.cwd(), 'outputs', 'tmp', 'history', `${rowId}.json`);
    const historyKey = `row:${rowId}:history`;

    // Try KV first, then filesystem
    let history: RowHistory | null = null;

    try {
      // Try KV first
      history = await JsonStore.get<RowHistory>(historyKey);
    } catch (kvError) {
      console.warn('Failed to get history from KV:', kvError);
    }

    if (!history) {
      // Try filesystem
      try {
        const data = await fs.readFile(historyFile, 'utf-8');
        history = JSON.parse(data);
      } catch {
        // No history found
        return NextResponse.json({
          rowId,
          versions: [],
          latestRevision: 0,
        });
      }
    }

    return NextResponse.json({
      rowId,
      versions: history.versions,
      latestRevision: history.versions.length,
    });
  } catch (error) {
    console.error('Row history retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve row history' },
      { status: 500 }
    );
  }
}