import { useState, useCallback } from 'react';

interface TranslationOptions {
  temperature?: number;
  seed?: number;
  includeMetadata?: boolean;
}

interface TranslationResult {
  english: string;
  source: string;
  metadata?: {
    lpr: number;
    lengthExpansion: number;
    characterCount: {
      arabic: number;
      english: number;
    };
    wordCount: {
      arabic: number;
      english: number;
    };
    qualityChecks: {
      lprPass: boolean;
      expansionInRange: boolean;
      hasFootnotes: boolean;
      preservesLength: boolean;
    };
    model: string;
    temperature: number;
    processedAt: string;
  };
}

export function useClaudeTranslation() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);

  const translate = useCallback(async (
    arabicText: string,
    options: TranslationOptions = {}
  ) => {
    setIsTranslating(true);
    setError(null);

    try {
      const response = await fetch('/api/translate/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ar_enhanced: arabicText,
          temperature: options.temperature ?? 0.2,
          seed: options.seed ?? 42,
          includeMetadata: options.includeMetadata ?? true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Translation failed');
      }

      const data = await response.json();
      setResult(data);
      return data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Translation failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return {
    translate,
    isTranslating,
    error,
    result,
    reset
  };
}