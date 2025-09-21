import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getRoleFromRequest, canSave } from '../../../../../lib/dadmode/access';

interface SaveRowRequest {
  arEnhanced?: string;
  en?: string;
  action?: 'save' | 'approve' | 'flag' | 'approve_scripture' | 'flag_scripture';
  reason?: string;
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

    // Load existing history
    let history: RowHistory;
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
    };

    // Add to history (keep last 20 versions)
    history.versions.push(newVersion);
    if (history.versions.length > 20) {
      history.versions = history.versions.slice(-20);
    }

    // Save updated history
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));

    return NextResponse.json({
      success: true,
      revision: newVersion.revision,
      savedAt: newVersion.timestamp,
      rowId,
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

    try {
      const data = await fs.readFile(historyFile, 'utf-8');
      const history: RowHistory = JSON.parse(data);

      return NextResponse.json({
        rowId,
        versions: history.versions,
        latestRevision: history.versions.length,
      });
    } catch {
      // No history found
      return NextResponse.json({
        rowId,
        versions: [],
        latestRevision: 0,
      });
    }
  } catch (error) {
    console.error('Row history retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve row history' },
      { status: 500 }
    );
  }
}