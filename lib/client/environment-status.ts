'use client';

import { useState, useEffect, useCallback } from 'react';

// Types for environment status
export interface EnvironmentStatus {
  status: 'healthy' | 'degraded' | 'critical';
  environment: {
    validated: boolean;
    hasWarnings: boolean;
    missingRequired?: string[];
    missingOptional?: string[];
    warnings?: string[];
  };
  services: Record<string, ServiceStatus>;
  deployment: {
    ready: boolean;
    checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      message?: string;
    }>;
  };
  lastUpdated: string;
}

export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unavailable';
  critical: boolean;
  message?: string;
  lastCheck?: string;
  responseTime?: number;
}

export type WarningLevel = 'error' | 'warning' | 'info' | 'success';

export interface ProcessedWarning {
  id: string;
  level: WarningLevel;
  title: string;
  message: string;
  details?: string;
  icon: string;
  color: string;
  actions: EnvironmentAction[];
  dismissible: boolean;
}

export interface EnvironmentAction {
  type: 'link' | 'copy' | 'button';
  label: string;
  url?: string;
  value?: string;
  icon?: string;
  onClick?: () => void;
}

interface UseEnvironmentHealthOptions {
  pollInterval?: number;
  detailed?: boolean;
  autoRefresh?: boolean;
}

interface UseEnvironmentHealthResult {
  status: EnvironmentStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastRefresh: Date | null;
}

/**
 * Hook for fetching and managing environment health data
 */
export function useEnvironmentHealth(options: UseEnvironmentHealthOptions = {}): UseEnvironmentHealthResult {
  const {
    pollInterval = 30000, // 30 seconds default
    detailed = true,
    autoRefresh = true
  } = options;

  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealthData = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (detailed) params.append('detailed', 'true');

      const response = await fetch(`/api/health?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Map server status values to client status values
      const mapStatus = (s: 'ready' | 'degraded' | 'unhealthy'): 'healthy' | 'degraded' | 'critical' => (
        s === 'ready' ? 'healthy' : s === 'unhealthy' ? 'critical' : 'degraded'
      );
      const normalized = { ...data, status: mapStatus(data.status) };

      setStatus(normalized);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch environment health:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [detailed]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchHealthData();
  }, [fetchHealthData]);

  // Initial fetch
  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh || pollInterval <= 0) return;

    const interval = setInterval(fetchHealthData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchHealthData, autoRefresh, pollInterval]);

  // Page visibility API for smart refreshing
  useEffect(() => {
    if (!autoRefresh) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && lastRefresh) {
        const timeSinceLastRefresh = Date.now() - lastRefresh.getTime();
        // Refresh if it's been more than 5 minutes since last update
        if (timeSinceLastRefresh > 5 * 60 * 1000) {
          fetchHealthData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [autoRefresh, lastRefresh, fetchHealthData]);

  return {
    status,
    isLoading,
    error,
    refresh,
    lastRefresh
  };
}

/**
 * Hook for managing environment warnings with filtering and prioritization
 */
export function useEnvironmentWarnings(status: EnvironmentStatus | null, options: {
  criticalOnly?: boolean;
  includeDismissed?: boolean;
} = {}) {
  const { criticalOnly = false, includeDismissed = false } = options;
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

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

  const dismissWarning = useCallback((warningId: string) => {
    const newDismissed = new Set(dismissedWarnings);
    newDismissed.add(warningId);
    setDismissedWarnings(newDismissed);

    try {
      sessionStorage.setItem('dismissed-env-warnings', JSON.stringify(Array.from(newDismissed)));
    } catch (error) {
      console.warn('Failed to save dismissed warnings:', error);
    }
  }, [dismissedWarnings]);

  const clearDismissed = useCallback(() => {
    setDismissedWarnings(new Set());
    try {
      sessionStorage.removeItem('dismissed-env-warnings');
    } catch (error) {
      console.warn('Failed to clear dismissed warnings:', error);
    }
  }, []);

  const warnings = status ? processEnvironmentWarnings(status, criticalOnly) : [];
  const visibleWarnings = includeDismissed
    ? warnings
    : warnings.filter(w => !dismissedWarnings.has(w.id));

  return {
    warnings: visibleWarnings,
    dismissedWarnings,
    dismissWarning,
    clearDismissed,
    hasWarnings: visibleWarnings.length > 0,
    criticalWarnings: visibleWarnings.filter(w => w.level === 'error'),
    hasCriticalWarnings: visibleWarnings.some(w => w.level === 'error')
  };
}

/**
 * Process environment status into user-friendly warnings
 */
export function processEnvironmentWarnings(
  status: EnvironmentStatus,
  criticalOnly: boolean = false
): ProcessedWarning[] {
  const warnings: ProcessedWarning[] = [];

  // Critical environment variable warnings
  if (status.environment?.missingRequired?.length > 0) {
    warnings.push({
      id: 'missing-required-env',
      level: 'error',
      title: 'Critical Configuration Missing',
      message: `${status.environment.missingRequired.length} required environment variable(s) not configured`,
      details: `Missing variables: ${status.environment.missingRequired.join(', ')}`,
      icon: '⚠️',
      color: 'red',
      actions: [
        {
          type: 'link',
          label: 'Setup Guide',
          url: '/docs/deployment',
          icon: '📚'
        },
        {
          type: 'link',
          label: 'Environment Template',
          url: '/.env.example',
          icon: '📄'
        }
      ],
      dismissible: false
    });
  }

  // Critical service failures
  const criticalServices = Object.entries(status.services || {})
    .filter(([, service]) => service.critical && (service.status === 'degraded' || service.status === 'unavailable'));

  if (criticalServices.length > 0) {
    warnings.push({
      id: 'critical-services-down',
      level: 'error',
      title: 'Critical Services Unavailable',
      message: `${criticalServices.length} essential service(s) are not responding`,
      details: criticalServices.map(([name, service]) => `${name}: ${service.message || 'Unavailable'}`).join(', '),
      icon: '🚨',
      color: 'red',
      actions: [
        {
          type: 'link',
          label: 'Service Configuration',
          url: '/docs/services',
          icon: '⚙️'
        }
      ],
      dismissible: false
    });
  }

  if (criticalOnly) {
    return warnings;
  }

  // Optional service warnings
  const optionalServices = Object.entries(status.services || {})
    .filter(([, service]) => !service.critical && (service.status === 'degraded' || service.status === 'unavailable'));

  if (optionalServices.length > 0) {
    const ttsService = optionalServices.find(([name]) => name.toLowerCase().includes('tts') || name.toLowerCase().includes('elevenlabs'));

    if (ttsService) {
      warnings.push({
        id: 'tts-service-unavailable',
        level: 'warning',
        title: 'Audio Generation Unavailable',
        message: 'Text-to-speech features are in preview-only mode',
        details: 'Configure ElevenLabs API key to enable audio generation',
        icon: '🔊',
        color: 'amber',
        actions: [
          {
            type: 'link',
            label: 'Enable TTS',
            url: '/docs/tts-setup',
            icon: '🔧'
          }
        ],
        dismissible: true
      });
    }

    const otherServices = optionalServices.filter(([name]) => !name.toLowerCase().includes('tts') && !name.toLowerCase().includes('elevenlabs'));
    if (otherServices.length > 0) {
      warnings.push({
        id: 'optional-services-degraded',
        level: 'warning',
        title: 'Optional Features Limited',
        message: `${otherServices.length} optional service(s) unavailable`,
        details: `Limited functionality for: ${otherServices.map(([name]) => name).join(', ')}`,
        icon: '⚠️',
        color: 'amber',
        actions: [
          {
            type: 'link',
            label: 'Optional Features',
            url: '/docs/optional-services',
            icon: '✨'
          }
        ],
        dismissible: true
      });
    }
  }

  // Optional environment variables (info level)
  if (status.environment?.missingOptional?.length > 0) {
    warnings.push({
      id: 'missing-optional-env',
      level: 'info',
      title: 'Additional Features Available',
      message: `${status.environment.missingOptional.length} optional feature(s) can be enabled`,
      details: `Available features: ${status.environment.missingOptional.join(', ')}`,
      icon: 'ℹ️',
      color: 'blue',
      actions: [
        {
          type: 'link',
          label: 'Optional Features',
          url: '/docs/optional-features',
          icon: '✨'
        }
      ],
      dismissible: true
    });
  }

  // Deployment readiness warnings
  if (!status.deployment?.ready) {
    const failedChecks = status.deployment?.checks?.filter(check => check.status === 'fail') || [];
    if (failedChecks.length > 0) {
      warnings.push({
        id: 'deployment-not-ready',
        level: 'warning',
        title: 'Deployment Not Ready',
        message: `${failedChecks.length} deployment check(s) failing`,
        details: failedChecks.map(check => `${check.name}: ${check.message}`).join(', '),
        icon: '🚀',
        color: 'amber',
        actions: [
          {
            type: 'link',
            label: 'Deployment Guide',
            url: '/docs/deployment',
            icon: '📚'
          }
        ],
        dismissible: true
      });
    }
  }

  return warnings;
}

/**
 * Get service status summary for UI indicators
 */
export function getServiceStatusSummary(status: EnvironmentStatus | null): {
  overall: 'healthy' | 'degraded' | 'critical';
  critical: number;
  degraded: number;
  healthy: number;
  total: number;
} {
  if (!status?.services) {
    return { overall: 'critical', critical: 0, degraded: 0, healthy: 0, total: 0 };
  }

  const services = Object.values(status.services);
  const critical = services.filter(s => s.status === 'unavailable' && s.critical).length;
  const degraded = services.filter(s => s.status === 'degraded' || (s.status === 'unavailable' && !s.critical)).length;
  const healthy = services.filter(s => s.status === 'healthy').length;

  const overall = critical > 0 ? 'critical' : degraded > 0 ? 'degraded' : 'healthy';

  return {
    overall,
    critical,
    degraded,
    healthy,
    total: services.length
  };
}

/**
 * Get priority warnings for compact display
 */
export function getPriorityWarnings(warnings: ProcessedWarning[], maxCount: number = 1): ProcessedWarning[] {
  // Sort by priority: error > warning > info > success
  const priorityOrder = { error: 0, warning: 1, info: 2, success: 3 };

  return warnings
    .sort((a, b) => priorityOrder[a.level] - priorityOrder[b.level])
    .slice(0, maxCount);
}

/**
 * Format warning message for different UI contexts
 */
export function formatWarningMessage(warning: ProcessedWarning, context: 'banner' | 'compact' | 'detail'): string {
  switch (context) {
    case 'banner':
      return warning.message;
    case 'compact':
      return warning.title;
    case 'detail':
      return warning.details || warning.message;
    default:
      return warning.message;
  }
}

/**
 * Get warning icon for display
 */
export function getWarningIcon(level: WarningLevel): string {
  const iconMap = {
    error: '⚠️',
    warning: '⚠️',
    info: 'ℹ️',
    success: '✅'
  };
  return iconMap[level];
}

/**
 * Get warning color class for terminal theme integration
 */
export function getWarningColor(level: WarningLevel): string {
  const colorMap = {
    error: 'var(--red, #dc2626)',
    warning: 'var(--amber, #f59e0b)',
    info: 'var(--blue, #2563eb)',
    success: 'var(--green, #10b981)'
  };
  return colorMap[level];
}

/**
 * Determine if a warning should be shown based on context and user preferences
 */
export function shouldShowWarning(
  warning: ProcessedWarning,
  context: 'header' | 'banner' | 'page',
  userPreferences?: {
    hideOptional?: boolean;
    hideDismissed?: boolean;
  }
): boolean {
  // Always show critical errors
  if (warning.level === 'error') {
    return true;
  }

  // Context-specific rules
  if (context === 'header') {
    // Only show warnings and errors in header
    return warning.level === 'warning' || warning.level === 'error';
  }

  if (userPreferences?.hideOptional && warning.level === 'info') {
    return false;
  }

  return true;
}

/**
 * Environment detection utilities
 */
export function getEnvironmentInfo(): {
  isDevelopment: boolean;
  isProduction: boolean;
  isPreview: boolean;
  deploymentUrl?: string;
} {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  const isPreview = process.env.VERCEL_ENV === 'preview';

  return {
    isDevelopment,
    isProduction,
    isPreview,
    deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined
  };
}