import { NextRequest, NextResponse } from 'next/server';
import { getRoleFromRequest, canSave, validateRoleAccess } from '../../../../lib/dadmode/access';
import { applyTextChange, generateUndoToken, parseTextRange } from '../../../../lib/assistant/tools';

interface ApplyRequestBody {
  row_id: string;
  suggestion_id: string;
  applyTo: 'en' | 'arEnhanced' | 'selection';
  range?: string; // JSON string with {start, end, text} for selection
  suggestion?: {
    content: string;
    diff: Array<{
      type: 'add' | 'remove' | 'keep';
      content: string;
    }>;
  };
}

interface ApplyResponse {
  success: boolean;
  revId: string;
  savedAt: string;
  undoToken: string;
  appliedText: string;
}

async function callRowSaveAPI(
  rowId: string,
  newEnglishText: string,
  request: NextRequest,
  origin: string = 'assistant'
): Promise<{
  success: boolean;
  revId?: string;
  savedAt?: string;
  error?: string;
}> {
  try {
    // Extract headers to forward authentication
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');

    // Forward authentication headers
    const userRole = request.headers.get('x-user-role');
    const cookieHeader = request.headers.get('cookie');

    if (userRole) {
      headers.set('x-user-role', userRole);
    }
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }

    // Make request to row save API
    const saveResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/rows/${rowId}/save`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        en: newEnglishText,
        action: 'save',
        reason: `Applied assistant suggestion (${origin})`,
        origin,
      }),
    });

    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      return {
        success: false,
        error: `Save API error: ${saveResponse.status} - ${errorText}`,
      };
    }

    const result = await saveResponse.json();
    return {
      success: true,
      revId: result.revision || result.revId,
      savedAt: result.savedAt || result.timestamp || new Date().toISOString(),
    };

  } catch (error) {
    console.error('Row save API call failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calling save API',
    };
  }
}

function applySuggestionToText(
  originalText: string,
  suggestion: ApplyRequestBody['suggestion'],
  applyTo: 'en' | 'arEnhanced' | 'selection',
  range?: string
): string {
  if (!suggestion || !suggestion.diff || suggestion.diff.length === 0) {
    // Fallback: use suggestion content directly
    return suggestion?.content || originalText;
  }

  // Reconstruct text from diff (keeping 'add' and 'keep', removing 'remove')
  const newText = suggestion.diff
    .filter(segment => segment.type !== 'remove')
    .map(segment => segment.content)
    .join('');

  if (applyTo === 'en' || applyTo === 'arEnhanced') {
    // Full replacement for English or Arabic enhanced text
    return newText;
  }

  if (applyTo === 'selection' && range) {
    try {
      const rangeData = parseTextRange(range);
      if (rangeData) {
        // Replace selected text with suggestion
        return originalText.slice(0, rangeData.start) +
               newText +
               originalText.slice(rangeData.end);
      }
    } catch (error) {
      console.warn('Failed to parse range data:', error);
    }
  }

  // Fallback to full replacement
  return newText;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `apply_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    // Parse request body
    let body: ApplyRequestBody;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.row_id || !body.suggestion_id || !body.applyTo) {
      return NextResponse.json(
        { error: 'Missing required fields: row_id, suggestion_id, applyTo' },
        { status: 400 }
      );
    }

    // Validate applyTo field
    if (!['en', 'arEnhanced', 'selection'].includes(body.applyTo)) {
      return NextResponse.json(
        { error: 'Invalid applyTo value. Must be "en", "arEnhanced", or "selection"' },
        { status: 400 }
      );
    }

    // Get user role and check permissions
    const userRole = getRoleFromRequest(request);
    if (!canSave(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Reviewer access required to apply suggestions.' },
        { status: 403 }
      );
    }

    // Load current row data to get original text
    // In a real implementation, this would fetch from your data store
    // For now, we'll require the suggestion to include the necessary text
    if (!body.suggestion || !body.suggestion.content) {
      return NextResponse.json(
        { error: 'Suggestion content is required for application' },
        { status: 400 }
      );
    }

    // For now, we'll use the suggestion content directly as the original text
    // In a real implementation, you'd fetch this from your row storage
    const originalText = body.suggestion.content;

    // Apply the suggestion to create new text
    const appliedText = applySuggestionToText(
      originalText,
      body.suggestion,
      body.applyTo,
      body.range
    );

    // Generate undo token before saving
    const undoToken = generateUndoToken(
      body.row_id,
      originalText,
      new Date()
    );

    // Save changes through existing row save API
    const saveResult = await callRowSaveAPI(
      body.row_id,
      appliedText,
      request,
      'assistant'
    );

    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error || 'Failed to save changes' },
        { status: 500 }
      );
    }

    // Log the application
    try {
      const { writeFileSync, mkdirSync, existsSync } = require('fs');
      const { join } = require('path');

      const logDir = join(process.cwd(), 'outputs/tmp/assistant');
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logFile = join(logDir, 'apply.ndjson');
      const logEntry = JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        userRole,
        rowId: body.row_id,
        suggestionId: body.suggestion_id,
        applyTo: body.applyTo,
        hasRange: !!body.range,
        originalLength: originalText.length,
        appliedLength: appliedText.length,
        revId: saveResult.revId,
        undoToken,
      }) + '\n';

      writeFileSync(logFile, logEntry, { flag: 'a' });
    } catch (logError) {
      console.error('Failed to log apply action:', logError);
      // Don't fail the request for logging errors
    }

    const response: ApplyResponse = {
      success: true,
      revId: saveResult.revId || 'unknown',
      savedAt: saveResult.savedAt || new Date().toISOString(),
      undoToken,
      appliedText,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Assistant apply error:', error);

    // Log error
    try {
      const { writeFileSync, mkdirSync, existsSync } = require('fs');
      const { join } = require('path');

      const logDir = join(process.cwd(), 'outputs/tmp/assistant');
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logFile = join(logDir, 'apply.ndjson');
      const logEntry = JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        rowId: body?.row_id,
        suggestionId: body?.suggestion_id,
      }) + '\n';

      writeFileSync(logFile, logEntry, { flag: 'a' });
    } catch (logError) {
      console.error('Failed to log apply error:', logError);
    }

    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

// Undo endpoint
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const undoToken = searchParams.get('undo_token');
    const rowId = searchParams.get('row_id');

    if (!undoToken || !rowId) {
      return NextResponse.json(
        { error: 'Missing undo_token or row_id parameters' },
        { status: 400 }
      );
    }

    // Check permissions
    const userRole = getRoleFromRequest(request);
    if (!canSave(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to undo changes' },
        { status: 403 }
      );
    }

    // Parse undo token
    const { parseUndoToken } = require('../../../../lib/assistant/tools');
    const undoData = parseUndoToken(undoToken);

    if (!undoData || undoData.rowId !== rowId) {
      return NextResponse.json(
        { error: 'Invalid or expired undo token' },
        { status: 400 }
      );
    }

    // Check if token is not too old (24 hours)
    const tokenAge = Date.now() - undoData.timestamp.getTime();
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Undo token has expired (24 hour limit)' },
        { status: 400 }
      );
    }

    // Restore original text
    const saveResult = await callRowSaveAPI(
      rowId,
      undoData.originalText,
      request,
      'assistant_undo'
    );

    if (!saveResult.success) {
      return NextResponse.json(
        { error: saveResult.error || 'Failed to undo changes' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      revId: saveResult.revId,
      savedAt: saveResult.savedAt,
      restoredText: undoData.originalText,
    });

  } catch (error) {
    console.error('Assistant undo error:', error);
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}