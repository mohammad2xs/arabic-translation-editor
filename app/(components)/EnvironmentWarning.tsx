'use client';

import React, { useState, useEffect } from 'react';
import { useEnvironmentHealth, processEnvironmentWarnings, type EnvironmentStatus, type ServiceStatus, type WarningLevel, type ProcessedWarning, type EnvironmentAction } from '../../lib/client/environment-status';

interface EnvironmentWarningProps {
  /** Whether to show as a compact indicator (e.g., in header) or full banner */
  compact?: boolean;
  /** Whether to show only critical warnings */
  criticalOnly?: boolean;
  /** Custom CSS classes */
  className?: string;
  /** Callback when warning is dismissed */
  onDismiss?: (warningId: string) => void;
}

const EnvironmentWarning: React.FC<EnvironmentWarningProps> = ({
  compact = false,
  criticalOnly = false,
  className = '',
  onDismiss
}) => {
  const { status, isLoading, error, refresh } = useEnvironmentHealth();
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState(false);

  // Load dismissed warnings from session storage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('dismissed-env-warnings');
      if (stored) {
        setDismissedWarnings(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.warn('Failed to load dismissed warnings:', error);
    }
  }, []);

  // Save dismissed warnings to session storage
  const dismissWarning = (warningId: string) => {
    const newDismissed = new Set(dismissedWarnings);
    newDismissed.add(warningId);
    setDismissedWarnings(newDismissed);

    try {
      sessionStorage.setItem('dismissed-env-warnings', JSON.stringify(Array.from(newDismissed)));
    } catch (error) {
      console.warn('Failed to save dismissed warnings:', error);
    }

    onDismiss?.(warningId);
  };

  if (isLoading || error || !status) {
    return null;
  }

  const allWarnings = processEnvironmentWarnings(status, criticalOnly);
  const visibleWarnings = allWarnings.filter(w => !dismissedWarnings.has(w.id));

  // Don't show banner if only success state is visible
  const nonSuccessWarnings = visibleWarnings.filter(w => w.level !== 'success');
  if (nonSuccessWarnings.length === 0) {
    return null;
  }

  // Use non-success warnings for display, or all visible if no non-success warnings
  const warningsToShow = nonSuccessWarnings.length > 0 ? nonSuccessWarnings : visibleWarnings;

  if (warningsToShow.length === 0) {
    return null;
  }

  const primaryWarning = warningsToShow[0];
  const hasMultipleWarnings = warningsToShow.length > 1;

  if (compact) {
    return (
      <CompactWarningIndicator
        warning={primaryWarning}
        hasMultiple={hasMultipleWarnings}
        className={className}
        onClick={() => setExpandedDetails(!expandedDetails)}
      />
    );
  }

  return (
    <div className={`env-warning ${primaryWarning.level === 'error' ? 'env-warning-error' :
      primaryWarning.level === 'warning' ? 'env-warning-warning' :
      primaryWarning.level === 'success' ? 'env-warning-success' : 'env-warning-info'} ${className}`}>
      <div className="env-warning-content">
        <div className="env-warning-message">
          <p>
            <span className="env-warning-icon" role="img" aria-label={`${primaryWarning.level} icon`}>
              {primaryWarning.icon}
            </span>
            {primaryWarning.message}
          </p>
          {primaryWarning.details && (
            <div className="env-warning-details">{primaryWarning.details}</div>
          )}
          {hasMultipleWarnings && (
            <div className="env-warning-details">
              +{warningsToShow.length - 1} additional warning{warningsToShow.length > 2 ? 's' : ''}
            </div>
          )}
        </div>

        {(primaryWarning.details || hasMultipleWarnings) && (
          <button
            className="env-warning-expand-toggle"
            onClick={() => setExpandedDetails(!expandedDetails)}
            aria-label={expandedDetails ? "Hide details" : "Show details"}
          >
            {expandedDetails ? "Hide Details" : "Show Details"}
            <span className={`transform transition-transform ${expandedDetails ? 'rotate-180' : ''}`}>
              ↓
            </span>
          </button>
        )}
      </div>

      <div className="env-warning-actions">
        {primaryWarning.actions.map((action, index) => (
          <ActionButton key={index} action={action} />
        ))}
        {primaryWarning.dismissible && (
          <button
            className="env-warning-dismiss"
            onClick={() => dismissWarning(primaryWarning.id)}
            aria-label="Dismiss warning"
            title="Dismiss this warning"
          >
            ✕
          </button>
        )}
      </div>

      {expandedDetails && (
        <ExpandedWarningDetails
          warnings={warningsToShow}
          services={status.services}
          onRefresh={refresh}
        />
      )}
    </div>
  );
};

const CompactWarningIndicator: React.FC<{
  warning: ProcessedWarning;
  hasMultiple: boolean;
  className: string;
  onClick: () => void;
}> = ({ warning, hasMultiple, className, onClick }) => {
  const statusColor = warning.level === 'error' ? 'bg-red-500' :
    warning.level === 'warning' ? 'bg-amber-500' :
    warning.level === 'success' ? 'bg-green-500' : 'bg-blue-500';

  return (
    <button
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium transition-colors hover:opacity-80 ${className}`}
      onClick={onClick}
      title={warning.message}
    >
      <div className={`w-2 h-2 rounded-full ${statusColor}`} />
      <span className="hidden sm:inline">Environment</span>
      {hasMultiple && <span className="text-xs opacity-75">({hasMultiple ? '+' : ''})</span>}
      <span className="text-xs">↓</span>
    </button>
  );
};


const ActionButton: React.FC<{ action: EnvironmentAction }> = ({ action }) => {
  const handleClick = () => {
    if (action.type === 'link' && action.url) {
      window.open(action.url, '_blank', 'noopener,noreferrer');
    } else if (action.type === 'copy' && action.value) {
      navigator.clipboard.writeText(action.value).catch(console.error);
    }
  };

  return (
    <button className="env-warning-button" onClick={handleClick}>
      {action.icon && <span>{action.icon}</span>}
      {action.label}
    </button>
  );
};

const ExpandedWarningDetails: React.FC<{
  warnings: ProcessedWarning[];
  services: Record<string, ServiceStatus>;
  onRefresh: () => void;
}> = ({ warnings, services, onRefresh }) => {
  return (
    <div className="env-warning-expanded-content">
      {warnings.length > 1 && (
        <div>
          <h4 className="font-semibold mb-2">All Environment Issues:</h4>
          <ul className="space-y-1 text-sm">
            {warnings.map((warning, index) => (
              <li key={warning.id} className="flex items-start gap-2">
                <span className="env-warning-icon" role="img" aria-label={`${warning.level} icon`}>
                  {warning.icon}
                </span>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="font-semibold mb-2">Service Status:</h4>
        <div className="env-warning-service-list">
          {Object.entries(services).map(([serviceName, service]) => (
            <div key={serviceName} className="env-warning-service-item">
              <div
                className={`env-warning-service-status ${
                  service.status === 'healthy' ? 'healthy' :
                  service.status === 'degraded' ? 'degraded' : 'unavailable'
                }`}
              />
              <span className="capitalize">{serviceName.replace('_', ' ')}</span>
              {service.message && (
                <span className="text-xs opacity-75">- {service.message}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/20">
        <button
          className="env-warning-button"
          onClick={onRefresh}
          title="Refresh environment status"
        >
          🔄 Refresh Status
        </button>
        <a
          href="/api/health?detailed=true"
          target="_blank"
          rel="noopener noreferrer"
          className="env-warning-button"
        >
          📊 View Health Details
        </a>
      </div>
    </div>
  );
};

export default EnvironmentWarning;
export type { EnvironmentWarningProps };