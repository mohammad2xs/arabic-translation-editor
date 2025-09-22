'use client';

import { useState } from 'react';
import { calculateLPR } from '../../lib/complexity';

interface QualityChipProps {
  row: {
    id: string;
    original: string;
    enhanced: string;
    english: string;
    scriptureRefs?: Array<{ type: string; reference: string }>;
    metadata?: {
      confidence?: number;
      qualityGates?: {
        lpr: boolean;
        coverage: boolean;
        drift: boolean;
        semantic: boolean;
        scripture: boolean;
      };
      processedAt?: string;
    };
  };
  large?: boolean;
}

type QualityStatus = 'good' | 'needs-work' | 'scripture' | 'pending';

interface QualityInfo {
  status: QualityStatus;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
}

export default function QualityChip({ row, large = false }: QualityChipProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const getQualityInfo = (): QualityInfo => {
    const lpr = row.english ? calculateLPR(row.original, row.english) : 0;
    const confidence = row.metadata?.confidence || 0;
    const hasScripture = (row.scriptureRefs?.length || 0) > 0;
    const isProcessed = !!row.metadata?.processedAt;

    // Scripture notes take priority
    if (hasScripture && row.metadata?.qualityGates?.scripture) {
      return {
        status: 'scripture',
        label: 'Scripture',
        description: 'This translation contains verified scripture references',
        icon: '📖',
        color: 'terminal-quality-good',
        bgColor: '',
      };
    }

    // Not processed yet
    if (!isProcessed || !row.english) {
      return {
        status: 'pending',
        label: 'Pending',
        description: 'This row has not been translated yet',
        icon: '⏳',
        color: 'terminal-quality-poor',
        bgColor: '',
      };
    }

    // Good quality (high LPR and confidence)
    if (lpr >= 0.8 && confidence >= 0.8) {
      return {
        status: 'good',
        label: 'Excellent',
        description: `High quality translation (LPR: ${lpr.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%)`,
        icon: '✅',
        color: 'terminal-quality-excellent',
        bgColor: '',
      };
    }

    // Needs improvement
    return {
      status: 'needs-work',
      label: 'Needs Work',
      description: `Translation could be improved (LPR: ${lpr.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%)`,
      icon: '⚠️',
      color: 'terminal-quality-needs-work',
      bgColor: '',
    };
  };

  const qualityInfo = getQualityInfo();

  const baseClasses = large
    ? 'terminal-quality-indicator px-4 py-3 text-lg'
    : 'terminal-quality-indicator px-3 py-2 text-sm';

  return (
    <div className="relative">
      <div
        className={`${baseClasses} ${qualityInfo.color} cursor-help transition-all duration-200 hover:shadow-md`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
      >
        <span className={large ? 'text-xl mr-3' : 'text-sm mr-2'}>
          {qualityInfo.icon}
        </span>
        <span>{qualityInfo.label}</span>
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
          <div className="terminal-panel p-3 shadow-lg max-w-xs text-sm whitespace-normal" style={{ background: 'var(--panel)', color: 'var(--ink)' }}>
            <div className="font-medium mb-1" style={{ fontFamily: 'var(--mono)' }}>{qualityInfo.label}</div>
            <div style={{ color: 'var(--muted)' }}>{qualityInfo.description}</div>

            {row.metadata && (
              <div className="mt-2 pt-2 text-xs space-y-1" style={{ borderTop: '1px solid rgba(147, 164, 177, 0.3)', fontFamily: 'var(--mono)' }}>
                {row.metadata.confidence && (
                  <div>Confidence: {(row.metadata.confidence * 100).toFixed(0)}%</div>
                )}
                {row.english && (
                  <div>LPR: {calculateLPR(row.original, row.english).toFixed(3)}</div>
                )}
                {row.scriptureRefs && row.scriptureRefs.length > 0 && (
                  <div>Scripture refs: {row.scriptureRefs.length}</div>
                )}
                {row.metadata.qualityGates && (
                  <div>
                    Quality gates: {Object.values(row.metadata.qualityGates).filter(Boolean).length}/5
                  </div>
                )}
              </div>
            )}

            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2">
              <div className="border-4 border-transparent" style={{ borderTopColor: 'var(--panel)' }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function QualityChipSimple({
  status,
  large = false
}: {
  status: 'good' | 'needs-work' | 'scripture' | 'pending';
  large?: boolean;
}) {
  const configs = {
    good: {
      label: 'Excellent',
      icon: '✅',
      color: 'terminal-quality-excellent',
    },
    'needs-work': {
      label: 'Needs Work',
      icon: '⚠️',
      color: 'terminal-quality-needs-work',
    },
    scripture: {
      label: 'Scripture',
      icon: '📖',
      color: 'terminal-quality-good',
    },
    pending: {
      label: 'Pending',
      icon: '⏳',
      color: 'terminal-quality-poor',
    },
  };

  const config = configs[status];
  const baseClasses = large
    ? 'terminal-quality-indicator px-4 py-3 text-lg'
    : 'terminal-quality-indicator px-3 py-2 text-sm';

  return (
    <div className={`${baseClasses} ${config.color}`}>
      <span className={large ? 'text-xl mr-3' : 'text-sm mr-2'}>
        {config.icon}
      </span>
      <span>{config.label}</span>
    </div>
  );
}