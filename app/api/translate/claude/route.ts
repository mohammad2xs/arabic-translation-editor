import { NextRequest, NextResponse } from 'next/server';
import { SHARED_SYSTEM_PROMPT } from '@/lib/assistant/prompt';
import { arToEn_chatgpt } from '@/lib/llm/provider';

const CONTRACT_PROMPT = `${SHARED_SYSTEM_PROMPT}

## TRANSLATION CONTRACT
You are translating Islamic philosophical text following M.A.S. Abdel Haleem's translation style:
- Clear, accessible modern English
- Contemplative, scholarly register
- Modern American English with philosophical vocabulary
- Avoid ornate or archaic language patterns

## STRICT REQUIREMENTS
1. NO SUMMARIZATION - preserve every idea, qualifier, and nuance
2. Include footnote anchors [^n] for scripture references and complex terms
3. Maintain Length Preservation Ratio (LPR) ≥ 0.95
4. Target +5-20% expansion for clarity
5. Preserve all rhetorical questions, contrasts, and conditional statements

Translate the following Arabic text into English following these principles exactly.`;

export async function POST(request: NextRequest) {
  if (process.env.RUNTIME_LLM === '0') {
    return NextResponse.json(
      { error: 'Runtime LLM disabled in this deployment (Max-only workflow).' },
      { status: 501 }
    );
  }

  try {
    const body = await request.json();
    const {
      arabic,
      ar_enhanced,
      temperature = 0.2,
      includeMetadata = true
    } = body;

    const sourceText = ar_enhanced || arabic;
    if (!sourceText) {
      return NextResponse.json(
        { error: 'Arabic text (arabic or ar_enhanced) is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: 'OPENAI_API_KEY not configured',
          guidance: 'Set OPENAI_API_KEY in your environment variables'
        },
        { status: 500 }
      );
    }

    const en = await arToEn_chatgpt({
      arabic: sourceText,
      system: CONTRACT_PROMPT,
      temperature,
      maxTokens: 1200
    });

    const arabicLength = sourceText.length;
    const englishLength = en.length;
    const lpr = englishLength / arabicLength;
    const wordCountAr = sourceText.split(/\s+/).length;
    const wordCountEn = en.split(/\s+/).length;

    const response: any = {
      english: en,
      source: sourceText
    };

    if (includeMetadata) {
      response.metadata = {
        lpr: parseFloat(lpr.toFixed(3)),
        lengthExpansion: parseFloat(((lpr - 1) * 100).toFixed(1)),
        characterCount: {
          arabic: arabicLength,
          english: englishLength
        },
        wordCount: {
          arabic: wordCountAr,
          english: wordCountEn
        },
        qualityChecks: {
          lprPass: lpr >= 0.95,
          expansionInRange: lpr >= 1.05 && lpr <= 1.20,
          hasFootnotes: en.includes('[^'),
          preservesLength: lpr >= 0.95
        },
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature,
        processedAt: new Date().toISOString()
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('OpenAI translation error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Translation failed',
        details: errorMessage,
        guidance: errorMessage.includes('API')
          ? 'Check your OPENAI_API_KEY configuration'
          : 'Check the error details and try again'
      },
      { status: 500 }
    );
  }
}
