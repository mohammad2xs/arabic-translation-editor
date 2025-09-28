// Test Console Ninja Integration
import { logger } from './lib/logging/console-ninja.ts';

console.log('Testing Console Ninja Integration...');

// Test basic logging
logger.info('Console Ninja initialized successfully!', {
    timestamp: new Date().toISOString(),
    version: '1.0.0'
});

// Test domain-specific logging
logger.assistant('Claude API connected', { status: 'connected' });
logger.translation('Translation pipeline started', { language: 'ar-en' });
logger.quality('Quality check completed', { score: 0.95 });
logger.audio('Audio generation started', { duration: 30 });

// Test performance logging
logger.performance('Database query', 150, { query: 'SELECT * FROM users' });

// Test error tracking
try {
    throw new Error('Test error for tracking');
} catch (error) {
    logger.trackError(error, { context: 'test' });
}

console.log('Console Ninja test completed!');
