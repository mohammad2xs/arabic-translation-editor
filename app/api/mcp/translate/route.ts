import { NextRequest, NextResponse } from 'next/server';
import { getTranslationService } from '../../../../lib/mcp/translation-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { arabicText, context, complexity, scriptureRefs } = body;

    if (!arabicText) {
      return NextResponse.json(
        { error: 'Arabic text is required' },
        { status: 400 }
      );
    }

    const translationService = getTranslationService();
    const result = await translationService.translate({
      arabicText,
      context,
      complexity,
      scriptureRefs
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Translation API error:', error);
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const translationService = getTranslationService();
    const tools = await translationService.getAvailableTools();
    const resources = await translationService.getAvailableResources();

    return NextResponse.json({
      tools,
      resources,
      status: 'connected'
    });
  } catch (error) {
    console.error('MCP status error:', error);
    return NextResponse.json(
      { error: 'Failed to get MCP status' },
      { status: 500 }
    );
  }
}
