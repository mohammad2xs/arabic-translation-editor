// @ts-nocheck
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';

interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Approximate size in bytes
}

interface CacheStats {
  hits: number;
  misses: number;
  totalRequests: number;
  hitRate: number;
  cacheSize: number;
  entryCount: number;
}

interface CacheRequest {
  row: {
    id: string;
    ar_original: string;
    en_translation: string;
  };
  task: string;
  query?: string;
  selection?: string;
  hashes: {
    rowHash: string;
    contextHash: string;
  };
}

export class AssistantCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private maxEntries: number;
  private cacheDir: string;
  private cacheFilePath: string;
  private stats: CacheStats;

  constructor(options: {
    maxSize?: number; // Max cache size in bytes (default: 50MB)
    maxEntries?: number; // Max number of entries (default: 1000)
    cacheDir?: string; // Cache directory (default: outputs/tmp/assistant)
  } = {}) {
    this.maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB
    this.maxEntries = options.maxEntries || 1000;
    this.cacheDir = options.cacheDir || join(process.cwd(), 'outputs/tmp/assistant');
    this.cacheFilePath = join(this.cacheDir, 'cache.json');

    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0,
      cacheSize: 0,
      entryCount: 0,
    };

    this.ensureCacheDirectory();
    this.loadCacheFromDisk();
  }

  private ensureCacheDirectory(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCacheFromDisk(): void {
    try {
      if (existsSync(this.cacheFilePath)) {
        const data = readFileSync(this.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(data);

        this.cache.clear();
        this.stats = parsed.stats || this.stats;

        if (parsed.entries && Array.isArray(parsed.entries)) {
          for (const entry of parsed.entries) {
            this.cache.set(entry.key, entry);
          }
        }

        this.updateStats();
        this.cleanup(); // Clean up stale entries on load
      }
    } catch (error) {
      console.warn('Failed to load assistant cache from disk:', error);
      // Continue with empty cache
    }
  }

  private saveCacheToDisk(): void {
    try {
      const data = {
        savedAt: new Date().toISOString(),
        stats: this.stats,
        entries: Array.from(this.cache.values()),
      };

      writeFileSync(this.cacheFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save assistant cache to disk:', error);
    }
  }

  private generateCacheKey(request: CacheRequest): string {
    const keyData = {
      rowId: request.row.id,
      task: request.task,
      query: request.query || '',
      selection: request.selection || '',
      rowHash: request.hashes.rowHash,
      contextHash: request.hashes.contextHash,
    };

    const keyString = JSON.stringify(keyData);
    return createHash('sha1').update(keyString).digest('hex');
  }

  private estimateSize(data: any): number {
    return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
  }

  private updateStats(): void {
    this.stats.entryCount = this.cache.size;
    this.stats.cacheSize = Array.from(this.cache.values()).reduce(
      (total, entry) => total + entry.size,
      0
    );
    this.stats.hitRate = this.stats.totalRequests > 0
      ? this.stats.hits / this.stats.totalRequests
      : 0;
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Remove expired entries
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }

    // If still over limits, remove least recently used entries
    while (this.cache.size > this.maxEntries ||
           this.stats.cacheSize > this.maxSize) {

      let lruKey: string | null = null;
      let lruTime = Infinity;

      for (const [key, entry] of this.cache) {
        if (entry.lastAccessed < lruTime) {
          lruTime = entry.lastAccessed;
          lruKey = key;
        }
      }

      if (lruKey) {
        this.cache.delete(lruKey);
        this.updateStats();
      } else {
        break; // Safety break
      }
    }

    this.updateStats();
  }

  public get(request: CacheRequest): any | null {
    const key = this.generateCacheKey(request);
    this.stats.totalRequests++;

    const entry = this.cache.get(key);
    if (entry) {
      // Update access statistics
      entry.lastAccessed = Date.now();
      entry.accessCount++;

      this.stats.hits++;
      this.updateStats();

      return entry.data;
    }

    this.stats.misses++;
    this.updateStats();
    return null;
  }

  public set(request: CacheRequest, data: any): void {
    const key = this.generateCacheKey(request);
    const size = this.estimateSize(data);
    const now = Date.now();

    const entry: CacheEntry = {
      key,
      data,
      timestamp: now,
      lastAccessed: now,
      accessCount: 1,
      size,
    };

    this.cache.set(key, entry);
    this.updateStats();

    // Cleanup if necessary
    this.cleanup();

    // Periodically save to disk (every 10 cache writes)
    if (this.stats.totalRequests % 10 === 0) {
      this.saveCacheToDisk();
    }
  }

  public has(request: CacheRequest): boolean {
    const key = this.generateCacheKey(request);
    return this.cache.has(key);
  }

  public delete(request: CacheRequest): boolean {
    const key = this.generateCacheKey(request);
    const result = this.cache.delete(key);
    this.updateStats();
    return result;
  }

  public clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0,
      cacheSize: 0,
      entryCount: 0,
    };
  }

  public getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  public getCacheInfo(): {
    size: number;
    entries: number;
    maxSize: number;
    maxEntries: number;
    usage: number;
  } {
    this.updateStats();
    return {
      size: this.stats.cacheSize,
      entries: this.stats.entryCount,
      maxSize: this.maxSize,
      maxEntries: this.maxEntries,
      usage: this.stats.cacheSize / this.maxSize,
    };
  }

  public prune(): number {
    const initialSize = this.cache.size;
    this.cleanup();
    const pruned = initialSize - this.cache.size;

    if (pruned > 0) {
      this.saveCacheToDisk();
    }

    return pruned;
  }

  public shutdown(): void {
    this.saveCacheToDisk();
  }

  // Debug methods for development
  public debugListKeys(): string[] {
    return Array.from(this.cache.keys()).slice(0, 10); // First 10 keys
  }

  public debugGetEntry(request: CacheRequest): CacheEntry | null {
    const key = this.generateCacheKey(request);
    return this.cache.get(key) || null;
  }
}

// Global cache instance
let globalCache: AssistantCache | null = null;

export function getAssistantCache(): AssistantCache {
  if (!globalCache) {
    globalCache = new AssistantCache();
  }
  return globalCache;
}

// Utility function to generate cache request from API input
export function createCacheRequest(
  rowId: string,
  rowData: {
    ar_original: string;
    en_translation: string;
  },
  task: string,
  query?: string,
  selection?: string,
  contextHash?: string
): CacheRequest {
  const rowHash = createHash('sha1')
    .update(`${rowData.ar_original}|${rowData.en_translation}`)
    .digest('hex')
    .slice(0, 16);

  const ctxHash = contextHash || createHash('sha1')
    .update(`${task}|${query || ''}|${selection || ''}`)
    .digest('hex')
    .slice(0, 16);

  return {
    row: {
      id: rowId,
      ar_original: rowData.ar_original,
      en_translation: rowData.en_translation,
    },
    task,
    query,
    selection,
    hashes: {
      rowHash,
      contextHash: ctxHash,
    },
  };
}

export default AssistantCache;