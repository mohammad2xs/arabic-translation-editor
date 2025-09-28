'use client';

import React, { useState } from 'react';
import { useClaudeTranslation } from '@/lib/hooks/use-claude-translation';

export function ClaudeTranslator() {
  const [arabicText, setArabicText] = useState('');
  const { translate, isTranslating, error, result } = useClaudeTranslation();

  const handleTranslate = async () => {
    if (!arabicText.trim()) return;

    try {
      await translate(arabicText, {
        temperature: 0.2,
        includeMetadata: true
      });
    } catch (err) {
      console.error('Translation error:', err);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">
          Arabic Text (ar_enhanced)
        </label>
        <textarea
          dir="rtl"
          value={arabicText}
          onChange={(e) => setArabicText(e.target.value)}
          className="w-full h-32 p-3 border rounded-lg font-arabic text-lg"
          placeholder="أدخل النص العربي هنا..."
          disabled={isTranslating}
        />
      </div>

      <button
        onClick={handleTranslate}
        disabled={isTranslating || !arabicText.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isTranslating ? 'Translating...' : 'Translate with Claude'}
      </button>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <label className="block text-sm font-semibold text-green-800 mb-2">
              English Translation (Abdel-Haleem Style):
            </label>
            <p className="text-gray-800 whitespace-pre-wrap">{result.english}</p>
          </div>

          {result.metadata && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-semibold mb-3">Translation Metrics:</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Length Preservation Ratio (LPR):</span>
                  <span className={`ml-2 ${result.metadata.qualityChecks.lprPass ? 'text-green-600' : 'text-red-600'}`}>
                    {result.metadata.lpr}
                  </span>
                </div>

                <div>
                  <span className="font-medium">Length Expansion:</span>
                  <span className="ml-2">{result.metadata.lengthExpansion}%</span>
                </div>

                <div>
                  <span className="font-medium">Arabic Words:</span>
                  <span className="ml-2">{result.metadata.wordCount.arabic}</span>
                </div>

                <div>
                  <span className="font-medium">English Words:</span>
                  <span className="ml-2">{result.metadata.wordCount.english}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t">
                <h4 className="font-medium mb-2">Quality Checks:</h4>
                <div className="flex gap-3 text-sm">
                  <span className={`px-2 py-1 rounded ${result.metadata.qualityChecks.lprPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    LPR ≥ 0.95
                  </span>
                  <span className={`px-2 py-1 rounded ${result.metadata.qualityChecks.expansionInRange ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    Expansion 5-20%
                  </span>
                  <span className={`px-2 py-1 rounded ${result.metadata.qualityChecks.hasFootnotes ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    Has Footnotes
                  </span>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                Model: {result.metadata.model} | Temperature: {result.metadata.temperature}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}