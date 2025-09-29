'use client';

import React, { useEffect, useRef, useState } from 'react';
import { logger } from '../../lib/logging/console-ninja';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage?: {
    used: number;
    total: number;
    limit: number;
  };
  componentName: string;
  timestamp: number;
}

interface PerformanceMonitorProps {
  componentName: string;
  children: React.ReactNode;
  logRenderTime?: boolean;
  logMemoryUsage?: boolean;
  threshold?: number; // Log if render time exceeds this threshold (ms)
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  componentName,
  children,
  logRenderTime = true,
  logMemoryUsage = true,
  threshold = 100
}) => {
  const renderStartTime = useRef<number>(0);

  useEffect(() => {
    renderStartTime.current = performance.now();
    
    return () => {
      const renderTime = performance.now() - renderStartTime.current;
      
      const memoryUsage = logMemoryUsage && 'memory' in performance 
        ? (performance as any).memory 
        : undefined;

      const currentMetrics: PerformanceMetrics = {
        renderTime,
        componentName,
        timestamp: Date.now()
      };

      if (memoryUsage) {
        currentMetrics.memoryUsage = {
          used: memoryUsage.usedJSHeapSize,
          total: memoryUsage.totalJSHeapSize,
          limit: memoryUsage.jsHeapSizeLimit
        };
      }

      // Log performance metrics
      if (logRenderTime) {
        if (renderTime > threshold) {
          logger.warn(`Slow render detected: ${componentName}`, {
            component: 'performance-monitor',
            renderTime,
            threshold,
            componentName
          });
        } else {
          logger.debug(`Component rendered: ${componentName}`, {
            component: 'performance-monitor',
            renderTime,
            componentName
          });
        }
      }

      if (logMemoryUsage && memoryUsage) {
        const memoryUsedMB = Math.round(memoryUsage.usedJSHeapSize / 1024 / 1024);
        const memoryTotalMB = Math.round(memoryUsage.totalJSHeapSize / 1024 / 1024);
        const memoryLimitMB = Math.round(memoryUsage.jsHeapSizeLimit / 1024 / 1024);
        
        logger.debug(`Memory usage for ${componentName}`, {
          component: 'performance-monitor',
          memoryUsedMB,
          memoryTotalMB,
          memoryLimitMB,
          componentName
        });
      }
    };
  }, [componentName, logRenderTime, logMemoryUsage, threshold]);

  // Log component mount/unmount
  useEffect(() => {
    logger.debug(`Component mounted: ${componentName}`, {
      component: 'performance-monitor',
      componentName
    });

    return () => {
      logger.debug(`Component unmounted: ${componentName}`, {
        component: 'performance-monitor',
        componentName
      });
    };
  }, [componentName]);

  return <>{children}</>;
};

// Hook for measuring custom operations
export const usePerformanceTimer = (operationName: string) => {
  const startTime = useRef<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const start = () => {
    startTime.current = performance.now();
    logger.debug(`Operation started: ${operationName}`, {
      component: 'performance-timer',
      operationName
    });
  };

  const end = () => {
    const duration = performance.now() - startTime.current;
    setDuration(duration);
    
    logger.performance(`Operation completed: ${operationName}`, duration, {
      component: 'performance-timer',
      operationName
    });
    
    return duration;
  };

  return { start, end, duration };
};

// Hook for monitoring memory usage
export const useMemoryMonitor = (componentName: string, interval = 5000) => {
  const [memoryUsage, setMemoryUsage] = useState<{
    used: number;
    total: number;
    limit: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('memory' in performance)) {
      return;
    }

    const updateMemoryUsage = () => {
      const memory = (performance as any).memory;
      const usage = {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
      };
      
      setMemoryUsage(usage);
      
      logger.debug(`Memory usage updated for ${componentName}`, {
        component: 'memory-monitor',
        componentName,
        ...usage
      });
    };

    updateMemoryUsage();
    const intervalId = setInterval(updateMemoryUsage, interval);

    return () => clearInterval(intervalId);
  }, [componentName, interval]);

  return memoryUsage;
};

export default PerformanceMonitor;
export type { PerformanceMetrics, PerformanceMonitorProps };
