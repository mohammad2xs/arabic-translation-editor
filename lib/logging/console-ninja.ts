/**
 * Console Ninja Integration for Arabic Translation Editor
 * Enhanced logging and debugging capabilities
 */

interface LogContext {
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

interface LogLevel {
  DEBUG: 'debug';
  INFO: 'info';
  WARN: 'warn';
  ERROR: 'error';
}

const LOG_LEVELS: LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

class ConsoleNinjaLogger {
  private context: LogContext = {};
  private isEnabled: boolean = true;

  constructor(initialContext: LogContext = {}) {
    this.context = { ...initialContext, timestamp: new Date().toISOString() };
  }

  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  private createLogMessage(level: keyof LogLevel, message: string, data?: any): void {
    if (!this.isEnabled) return;

    const logData = {
      level: LOG_LEVELS[level],
      message,
      context: this.context,
      data,
      timestamp: new Date().toISOString(),
    };

    // Console Ninja will automatically pick up these structured logs
    switch (level) {
      case 'DEBUG':
        console.debug(`🐛 [DEBUG] ${message}`, logData);
        break;
      case 'INFO':
        console.info(`ℹ️ [INFO] ${message}`, logData);
        break;
      case 'WARN':
        console.warn(`⚠️ [WARN] ${message}`, logData);
        break;
      case 'ERROR':
        console.error(`❌ [ERROR] ${message}`, logData);
        break;
    }
  }

  debug(message: string, data?: any): void {
    this.createLogMessage('DEBUG', message, data);
  }

  info(message: string, data?: any): void {
    this.createLogMessage('INFO', message, data);
  }

  warn(message: string, data?: any): void {
    this.createLogMessage('WARN', message, data);
  }

  error(message: string, data?: any): void {
    this.createLogMessage('ERROR', message, data);
  }

  // Custom loggers for specific domains
  assistant(message: string, data?: any): void {
    this.setContext({ component: 'assistant' });
    this.info(`🤖 Assistant: ${message}`, data);
  }

  translation(message: string, data?: any): void {
    this.setContext({ component: 'translation' });
    this.info(`📝 Translation: ${message}`, data);
  }

  quality(message: string, data?: any): void {
    this.setContext({ component: 'quality' });
    this.info(`⭐ Quality: ${message}`, data);
  }

  audio(message: string, data?: any): void {
    this.setContext({ component: 'audio' });
    this.info(`🔊 Audio: ${message}`, data);
  }

  performance(operation: string, duration: number, data?: any): void {
    this.setContext({ component: 'performance' });
    this.info(`⚡ Performance: ${operation} took ${duration}ms`, data);
  }

  userAction(action: string, data?: any): void {
    this.setContext({ component: 'user-action', action });
    this.info(`👤 User Action: ${action}`, data);
  }

  apiCall(endpoint: string, method: string, status: number, duration?: number, data?: any): void {
    this.setContext({ component: 'api', action: `${method} ${endpoint}` });
    const message = `🌐 API Call: ${method} ${endpoint} - ${status}${duration ? ` (${duration}ms)` : ''}`;
    
    if (status >= 400) {
      this.error(message, data);
    } else {
      this.info(message, data);
    }
  }

  // Error tracking with stack traces
  trackError(error: Error, context?: Record<string, any>): void {
    this.setContext({ component: 'error-tracking' });
    this.error(`🚨 Error Tracked: ${error.message}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context: { ...this.context, ...context },
    });
  }

  // Performance monitoring
  timeStart(label: string): void {
    console.time(`⏱️ ${label}`);
  }

  timeEnd(label: string): void {
    console.timeEnd(`⏱️ ${label}`);
  }

  // Memory usage tracking
  memoryUsage(): void {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      this.info('💾 Memory Usage', {
        used: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)} MB`,
        total: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)} MB`,
        limit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)} MB`,
      });
    }
  }

  // Disable logging (useful for production)
  disable(): void {
    this.isEnabled = false;
  }

  // Enable logging
  enable(): void {
    this.isEnabled = true;
  }
}

// Create singleton instance
export const logger = new ConsoleNinjaLogger({
  component: 'arabic-translation-editor',
  sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
});

// Export types for use in other modules
export type { LogContext, LogLevel };
export { ConsoleNinjaLogger };
