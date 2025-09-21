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
        label: 'Scripture note added',
        description: 'This translation contains verified scripture references',
        icon: '📖',
        color: 'text-blue-800',
        bgColor: 'bg-blue-100',
      };
    }

    // Not processed yet
    if (!isProcessed || !row.english) {
      return {
        status: 'pending',
        label: 'Needs translation',
        description: 'This row has not been translated yet',
        icon: '⏳',
        color: 'text-gray-800',
        bgColor: 'bg-gray-100',
      };
    }

    // Good quality (high LPR and confidence)
    if (lpr >= 0.8 && confidence >= 0.8) {
      return {
        status: 'good',
        label: 'Looks good',
        description: `High quality translation (LPR: ${lpr.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%)`,
        icon: '✅',
        color: 'text-green-800',
        bgColor: 'bg-green-100',
      };
    }

    // Needs improvement
    return {
      status: 'needs-work',
      label: 'Needs a touch more English',
      description: `Translation could be improved (LPR: ${lpr.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%)`,
      icon: '⚠️',
      color: 'text-amber-800',
      bgColor: 'bg-amber-100',
    };
  };

  const qualityInfo = getQualityInfo();

  const baseClasses = large
    ? 'inline-flex items-center px-4 py-3 rounded-lg text-lg font-medium'
    : 'inline-flex items-center px-3 py-2 rounded-md text-sm font-medium';

  return (
    <div className="relative">
      <div
        className={`${baseClasses} ${qualityInfo.color} ${qualityInfo.bgColor} cursor-help transition-all duration-200 hover:shadow-md`}
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
          <div className="bg-gray-900 text-white p-3 rounded-lg shadow-lg max-w-xs text-sm whitespace-normal">
            <div className="font-medium mb-1">{qualityInfo.label}</div>
            <div className="text-gray-300">{qualityInfo.description}</div>

            {row.metadata && (
              <div className="mt-2 pt-2 border-t border-gray-700 text-xs space-y-1">
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
              <div className="border-4 border-transparent border-t-gray-900"></div>
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
      label: 'Looks good',
      icon: '✅',
      color: 'text-green-800',
      bgColor: 'bg-green-100',
    },
    'needs-work': {
      label: 'Needs a touch more English',
      icon: '⚠️',
      color: 'text-amber-800',
      bgColor: 'bg-amber-100',
    },
    scripture: {
      label: 'Scripture note added',
      icon: '📖',
      color: 'text-blue-800',
      bgColor: 'bg-blue-100',
    },
    pending: {
      label: 'Needs translation',
      icon: '⏳',
      color: 'text-gray-800',
      bgColor: 'bg-gray-100',
    },
  };

  const config = configs[status];
  const baseClasses = large
    ? 'inline-flex items-center px-4 py-3 rounded-lg text-lg font-medium'
    : 'inline-flex items-center px-3 py-2 rounded-md text-sm font-medium';

  return (
    <div className={`${baseClasses} ${config.color} ${config.bgColor}`}>
      <span className={large ? 'text-xl mr-3' : 'text-sm mr-2'}>
        {config.icon}
      </span>
      <span>{config.label}</span>
    </div>
  );
}