// Production magic link system - delegates to production storage
// This file maintains backward compatibility while using the new production storage system

export * from './production-storage';

// The original magic.ts functionality has been moved to production-storage.ts
// which provides the same API but with production-ready token storage
// instead of file-based storage that doesn't work in serverless environments