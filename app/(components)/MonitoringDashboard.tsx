'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { logger } from '../../lib/logging/console-ninja';

interface SystemMetrics {
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    limit: number;
  };
  errorRate: number;
  responseTime: number;
  activeConnections: number;
  lastUpdated: string;
}

interface HealthStatus {
  healthy: boolean;
  issues: string[];
  services: Record<string, {
    status: 'healthy' | 'degraded' | 'unavailable';
    message?: string;
    lastCheck: string;
  }>;
}

interface MonitoringDashboardProps {
  refreshInterval?: number; // in milliseconds
  showDetails?: boolean;
  className?: string;
}

const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({
  refreshInterval = 5000,
  showDetails = false,
  className = ''
}) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchMetrics = useCallback(async () => {
    try {
      logger.debug('Fetching system metrics', { component: 'monitoring-dashboard' });
      
      const response = await fetch('/api/health?detailed=true');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Extract metrics from health response
      const systemMetrics: SystemMetrics = {
        uptime: data.build?.pipeline?.buildDuration || 0,
        memoryUsage: {
          used: 0, // Will be updated from browser memory
          total: 0,
          limit: 0
        },
        errorRate: 0, // Would need to be calculated from logs
        responseTime: Date.now() - lastRefresh.getTime(),
        activeConnections: 1, // Simplified for now
        lastUpdated: new Date().toISOString()
      };

      // Get browser memory usage if available
      if (typeof performance !== 'undefined' && 'memory' in performance) {
        const memory = (performance as any).memory;
        systemMetrics.memoryUsage = {
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
        };
      }

      setMetrics(systemMetrics);
      setHealthStatus({
        healthy: data.ok,
        issues: data.warnings || [],
        services: data.services || {}
      });
      
      setError(null);
      setLastRefresh(new Date());
      
      logger.info('System metrics updated', {
        component: 'monitoring-dashboard',
        healthy: data.ok,
        memoryUsed: systemMetrics.memoryUsage.used
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      logger.error('Failed to fetch system metrics', {
        component: 'monitoring-dashboard',
        error: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  }, [lastRefresh]);

  useEffect(() => {
    fetchMetrics();
    
    const interval = setInterval(fetchMetrics, refreshInterval);
    
    return () => clearInterval(interval);
  }, [fetchMetrics, refreshInterval]);

  const handleRefresh = () => {
    setIsLoading(true);
    fetchMetrics();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'unavailable': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'unavailable': return '❌';
      default: return '❓';
    }
  };

  if (isLoading && !metrics) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading system metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white border rounded-lg shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">System Monitoring</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className="text-xs text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-gray-50 rounded">
            <div className="text-sm text-gray-600">Memory Usage</div>
            <div className="text-lg font-semibold">
              {metrics.memoryUsage.used}MB / {metrics.memoryUsage.limit}MB
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{
                  width: `${(metrics.memoryUsage.used / metrics.memoryUsage.limit) * 100}%`
                }}
              ></div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded">
            <div className="text-sm text-gray-600">Response Time</div>
            <div className="text-lg font-semibold">{metrics.responseTime}ms</div>
          </div>

          <div className="p-3 bg-gray-50 rounded">
            <div className="text-sm text-gray-600">System Status</div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-medium ${
              healthStatus?.healthy ? 'text-green-800 bg-green-100' : 'text-red-800 bg-red-100'
            }`}>
              {healthStatus?.healthy ? '✅ Healthy' : '❌ Issues Detected'}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded">
            <div className="text-sm text-gray-600">Active Connections</div>
            <div className="text-lg font-semibold">{metrics.activeConnections}</div>
          </div>
        </div>
      )}

      {showDetails && healthStatus && (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-800">Service Status</h4>
          <div className="space-y-2">
            {Object.entries(healthStatus.services).map(([serviceName, service]) => (
              <div key={serviceName} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center space-x-2">
                  <span>{getStatusIcon(service.status)}</span>
                  <span className="font-medium capitalize">
                    {serviceName.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(service.status)}`}>
                    {service.status}
                  </span>
                  {service.message && (
                    <span className="text-xs text-gray-500">{service.message}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {healthStatus.issues.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Issues</h4>
              <div className="space-y-1">
                {healthStatus.issues.map((issue, index) => (
                  <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                    {issue}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MonitoringDashboard;
export type { HealthStatus, MonitoringDashboardProps, SystemMetrics };

