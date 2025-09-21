import { NextRequest, NextResponse } from 'next/server';\nimport fs from 'fs/promises';\nimport path from 'path';

interface ExpandRequest {
  reason?: string;
  targetLPR?: number;
  metadata?: Record<string, any>;
}

interface ExpandResponse {
  success: boolean;
  rowId: string;
  needsExpand: boolean;
  reason?: string;
  targetLPR?: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

const EXPAND_FILE_PATH = 'outputs/expand.json';

interface ExpandData {
  [rowId: string]: {
    needsExpand: boolean;
    reason: string;
    targetLPR: number;
    timestamp: string;
    metadata?: Record<string, any>;
  };
}

async function loadExpandData(): Promise<ExpandData> {
  try {
    const data = await fs.readFile(EXPAND_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveExpandData(data: ExpandData): Promise<void> {
  await fs.mkdir(path.dirname(EXPAND_FILE_PATH), { recursive: true });
  const tempFile = `${EXPAND_FILE_PATH}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  await fs.rename(tempFile, EXPAND_FILE_PATH);
}

function validateRowId(id: string): boolean {
  const rowIdPattern = /^S\d{3}-\d{3}$/;
  return rowIdPattern.test(id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const rowId = params.id;

    if (!validateRowId(rowId)) {
      return NextResponse.json(
        {
          error: 'Invalid row ID format',
          expected: 'Format should be S###-### (e.g., S001-002)'
        },
        { status: 400 }
      );
    }

    let requestData: ExpandRequest = {};

    try {
      const body = await request.text();
      if (body.trim()) {
        requestData = JSON.parse(body);
      }
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const {
      reason = 'insufficient_length_preservation',
      targetLPR = 1.05,
      metadata = {}
    } = requestData;

    if (typeof targetLPR !== 'number' || targetLPR < 0.95 || targetLPR > 2.0) {
      return NextResponse.json(
        {
          error: 'Invalid target LPR',
          details: 'Target LPR must be between 0.95 and 2.0'
        },
        { status: 400 }
      );
    }

    const expandData = await loadExpandData();
    const expandEntry = {
      needsExpand: true,
      reason,
      targetLPR,
      timestamp: new Date().toISOString(),
      metadata
    };

    expandData[rowId] = expandEntry;
    await saveExpandData(expandData);

    const response: ExpandResponse = {
      success: true,
      rowId,
      needsExpand: true,
      reason,
      targetLPR,
      timestamp: expandEntry.timestamp,
      metadata
    };

    console.log(`Row ${rowId} marked for expansion: LPR target ${targetLPR}, reason: ${reason}`);

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Row expansion API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const rowId = params.id;

    if (!validateRowId(rowId)) {
      return NextResponse.json(
        {
          error: 'Invalid row ID format',
          expected: 'Format should be S###-### (e.g., S001-002)'
        },
        { status: 400 }
      );
    }

    const expandData = await loadExpandData();
    const expandEntry = expandData[rowId];

    if (!expandEntry) {
      return NextResponse.json({
        success: true,
        rowId,
        needsExpand: false,
        timestamp: new Date().toISOString()
      });
    }

    const response: ExpandResponse = {
      success: true,
      rowId,
      needsExpand: expandEntry.needsExpand,
      reason: expandEntry.reason,
      targetLPR: expandEntry.targetLPR,
      timestamp: expandEntry.timestamp,
      metadata: expandEntry.metadata
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Row expansion status API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const rowId = params.id;

    if (!validateRowId(rowId)) {
      return NextResponse.json(
        {
          error: 'Invalid row ID format',
          expected: 'Format should be S###-### (e.g., S001-002)'
        },
        { status: 400 }
      );
    }

    const expandData = await loadExpandData();
    const existed = expandData[rowId] !== undefined;
    delete expandData[rowId];
    await saveExpandData(expandData);

    console.log(`Row ${rowId} expansion flag ${existed ? 'removed' : 'was not set'}`);

    return NextResponse.json({
      success: true,
      rowId,
      needsExpand: false,
      removed: existed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Row expansion removal API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const rowId = params.id;

    if (!validateRowId(rowId)) {
      return NextResponse.json(
        {
          error: 'Invalid row ID format',
          expected: 'Format should be S###-### (e.g., S001-002)'
        },
        { status: 400 }
      );
    }

    const expandData = await loadExpandData();
    const existingEntry = expandData[rowId];
    if (!existingEntry) {
      return NextResponse.json(
        {
          error: 'Row not marked for expansion',
          details: 'Use POST to mark row for expansion first'
        },
        { status: 404 }
      );
    }

    let requestData: Partial<ExpandRequest> = {};

    try {
      const body = await request.text();
      if (body.trim()) {
        requestData = JSON.parse(body);
      }
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const updatedEntry = {
      ...existingEntry,
      ...requestData,
      timestamp: new Date().toISOString()
    };

    if (updatedEntry.targetLPR !== undefined) {
      if (typeof updatedEntry.targetLPR !== 'number' || updatedEntry.targetLPR < 0.95 || updatedEntry.targetLPR > 2.0) {
        return NextResponse.json(
          {
            error: 'Invalid target LPR',
            details: 'Target LPR must be between 0.95 and 2.0'
          },
          { status: 400 }
        );
      }
    }

    expandData[rowId] = updatedEntry;
    await saveExpandData(expandData);

    const response: ExpandResponse = {
      success: true,
      rowId,
      needsExpand: updatedEntry.needsExpand,
      reason: updatedEntry.reason,
      targetLPR: updatedEntry.targetLPR,
      timestamp: updatedEntry.timestamp,
      metadata: updatedEntry.metadata
    };

    console.log(`Row ${rowId} expansion settings updated`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('Row expansion update API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}