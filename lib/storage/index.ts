import { promises as fs } from 'fs';
import { join } from 'path';
import { detectDeployment, getValidatedEnv, getDefaultStorageDriver, validateStorageConfig, StorageDriver } from '../env';
import * as BlobSDK from '@vercel/blob';
import { kv } from '@vercel/kv';

// Storage interface for unified file operations
export interface Storage {
  get(key: string): Promise<Buffer | null>;
  put(key: string, content: Buffer, options?: StorageOptions): Promise<string>;
  url(key: string): Promise<string | null>;
  exists(key: string): Promise<boolean>;
  ping(): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  stat(key: string): Promise<{ size: number; lastModified: Date } | null>;
}

export interface StorageOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

// Vercel Blob Storage implementation
class VercelBlobStorage implements Storage {
  private blob: typeof BlobSDK;

  constructor() {
    try {
      this.blob = BlobSDK;
    } catch {
      throw new Error('Vercel Blob not available');
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const url = await this.url(key);
      if (!url) return null;

      const response = await fetch(url);
      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.warn(`[Vercel Blob] Failed to get ${key}:`, error);
      return null;
    }
  }

  async put(key: string, content: Buffer, options?: StorageOptions): Promise<string> {
    try {
      const putOptions: any = {
        pathname: key,
        body: content,
        access: 'public'
      };

      if (options?.contentType) {
        putOptions.contentType = options.contentType;
      }

      if (options?.cacheControl) {
        putOptions.cacheControlMaxAge = this.parseCacheControl(options.cacheControl);
      }

      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
      const result = await this.blob.put(putOptions.pathname, putOptions.body, { ...putOptions, token });
      console.log(`[Vercel Blob] Stored ${key} -> ${result.url}`);
      return result.url;
    } catch (error) {
      console.error(`[Vercel Blob] Failed to put ${key}:`, error);
      throw new Error(`Failed to store file: ${key}`);
    }
  }

  async url(key: string): Promise<string | null> {
    try {
      // For Vercel Blob, we need to list blobs to get URLs
      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
      const { blobs } = await this.blob.list({ prefix: key, token });
      const blob = blobs.find((b: any) => b.pathname === key);
      return blob ? blob.url : null;
    } catch (error) {
      console.warn(`[Vercel Blob] Failed to get URL for ${key}:`, error);
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const url = await this.url(key);
      return url !== null;
    } catch {
      return false;
    }
  }

  async ping(): Promise<boolean> {
    try {
      // Test by attempting to list blobs
      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
      await this.blob.list({ limit: 1, token });
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const url = await this.url(key);
      if (!url) return false;

      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
      await this.blob.del(url, { token });
      console.log(`[Vercel Blob] Deleted ${key}`);
      return true;
    } catch (error) {
      console.warn(`[Vercel Blob] Failed to delete ${key}:`, error);
      return false;
    }
  }

  async stat(key: string): Promise<{ size: number; lastModified: Date } | null> {
    try {
      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
      const { blobs } = await this.blob.list({ prefix: key, token });
      const blob = blobs.find((b: any) => b.pathname === key);
      if (blob) {
        return {
          size: blob.size,
          lastModified: new Date(blob.uploadedAt || blob.createdAt || Date.now())
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseCacheControl(cacheControl: string): number {
    const match = cacheControl.match(/max-age=(\d+)/);
    return match ? parseInt(match[1]) : 3600; // Default 1 hour
  }
}

// Filesystem Storage implementation for development
class FilesystemStorage implements Storage {
  private baseDir: string;

  constructor(baseDir = 'outputs') {
    this.baseDir = baseDir;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const filePath = this.getFilePath(key);
      return await fs.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async put(key: string, content: Buffer, options?: StorageOptions): Promise<string> {
    try {
      const filePath = this.getFilePath(key);

      // Ensure directory exists
      await fs.mkdir(join(filePath, '..'), { recursive: true });

      // Write file
      await fs.writeFile(filePath, content);

      console.log(`[Filesystem] Stored ${key} -> ${filePath}`);
      return this.generateUrl(key);
    } catch (error) {
      console.error(`[Filesystem] Failed to put ${key}:`, error);
      throw new Error(`Failed to store file: ${key}`);
    }
  }

  async url(key: string): Promise<string | null> {
    try {
      const exists = await this.exists(key);
      return exists ? this.generateUrl(key) : null;
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async ping(): Promise<boolean> {
    try {
      // Test by checking if base directory is accessible
      await fs.access(this.baseDir);
      return true;
    } catch {
      // Try to create base directory
      try {
        await fs.mkdir(this.baseDir, { recursive: true });
        return true;
      } catch {
        return false;
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      console.log(`[Filesystem] Deleted ${key}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false; // File doesn't exist
      }
      console.warn(`[Filesystem] Failed to delete ${key}:`, error);
      return false;
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return join(process.cwd(), this.baseDir, sanitizedKey);
  }

  async stat(key: string): Promise<{ size: number; lastModified: Date } | null> {
    try {
      const filePath = this.getFilePath(key);
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        lastModified: stats.mtime
      };
    } catch {
      return null;
    }
  }

  private generateUrl(key: string): string {
    // Generate URL for filesystem files served via /api/files route
    const sanitizedKey = key.replace(/^\/+/, '');
    return `/api/files/${sanitizedKey}`;
  }
}

// Auto-detect and create appropriate storage
export function createStorage(): Storage {
  const envDriver = process.env.STORAGE_DRIVER as StorageDriver | undefined;
  const driver = envDriver ?? getDefaultStorageDriver();
  const cfg = validateStorageConfig();

  if (driver === 'vercel-blob' && cfg.valid) {
    console.log('[Storage] Using Vercel Blob storage');
    return new VercelBlobStorage();
  }

  if (driver === 'fs' || (driver === 'vercel-blob' && !cfg.valid)) {
    if (driver === 'vercel-blob' && !cfg.valid) {
      console.warn('[Storage] Vercel Blob configuration invalid, falling back to filesystem');
    } else {
      console.log('[Storage] Using Filesystem storage');
    }
    return new FilesystemStorage();
  }

  if (driver === 's3') {
    throw new Error('S3 storage not yet implemented');
  }

  // Fallback to filesystem
  console.warn('[Storage] Unknown driver, falling back to filesystem');
  return new FilesystemStorage();
}

// Cache management utilities
export class CacheInfo {
  constructor(
    public exists: boolean,
    public lastModified?: Date,
    public size?: number,
    public metadata?: Record<string, string>
  ) {}

  isExpired(maxAge: number): boolean {
    if (!this.exists || !this.lastModified) return true;
    const age = Date.now() - this.lastModified.getTime();
    return age > maxAge;
  }

  static async fromStorage(storage: Storage, key: string): Promise<CacheInfo> {
    try {
      const exists = await storage.exists(key);
      if (!exists) {
        return new CacheInfo(false);
      }

      // Try to get file stats using the stat method
      try {
        const stats = await storage.stat(key);
        if (stats) {
          return new CacheInfo(true, stats.lastModified, stats.size);
        }
      } catch {
        // Fall back to basic existence check
      }

      return new CacheInfo(true);
    } catch {
      return new CacheInfo(false);
    }
  }
}

// Storage debugging and info
export interface StorageInfo {
  driver: string;
  configured: boolean;
  available: boolean;
  environment: {
    isVercel: boolean;
    isProduction: boolean;
    platform: string;
  };
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const deployment = detectDeployment();

  try {
    const env = getValidatedEnv();
    const storage = createStorage();
    const available = await storage.ping();

    let driver = 'filesystem';
    if (storage instanceof VercelBlobStorage) {
      driver = 'vercel-blob';
    }

    return {
      driver,
      configured: true,
      available,
      environment: deployment
    };
  } catch (error) {
    return {
      driver: 'unknown',
      configured: false,
      available: false,
      environment: deployment
    };
  }
}

// Create and export default storage instance
export const storage = createStorage();

// Export classes for testing
export { VercelBlobStorage, FilesystemStorage };

// Default export for convenience
export default { storage, getStorageInfo, CacheInfo, createStorage };

// KV Storage helper for JSON operations
export const JsonStore = {
  async get<T>(key: string): Promise<T | null> {
    try {
      // Check if KV is configured
      if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.warn('[JsonStore] KV not configured, returning null');
        return null;
      }

      const value = await kv.get<T>(key);
      return value;
    } catch (error) {
      console.warn(`[JsonStore] Failed to get ${key}:`, error);
      return null;
    }
  },

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    try {
      // Check if KV is configured
      if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.warn('[JsonStore] KV not configured, skipping set');
        return;
      }

      if (ttlSec) {
        await kv.set(key, value, { ex: ttlSec });
      } else {
        await kv.set(key, value);
      }
    } catch (error) {
      console.error(`[JsonStore] Failed to set ${key}:`, error);
      // Don't throw - fail gracefully
    }
  },

  async del(key: string): Promise<void> {
    try {
      // Check if KV is configured
      if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.warn('[JsonStore] KV not configured, skipping delete');
        return;
      }

      await kv.del(key);
    } catch (error) {
      console.warn(`[JsonStore] Failed to delete ${key}:`, error);
      // Don't throw - fail gracefully
    }
  },

  async keys(prefix: string): Promise<string[]> {
    try {
      // Check if KV is configured
      if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.warn('[JsonStore] KV not configured, returning empty array');
        return [];
      }

      const allKeys = await kv.keys(prefix + '*');
      return allKeys;
    } catch (error) {
      console.warn(`[JsonStore] Failed to list keys with prefix ${prefix}:`, error);
      return [];
    }
  }
};

// Blob Storage helper for simplified operations
export const BlobStore = {
  async putBuf(key: string, buf: Buffer, contentType?: string): Promise<string> {
    try {
      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

      if (!token) {
        console.warn('[BlobStore] Blob storage not configured, using filesystem fallback');
        // Fallback to filesystem
        const storage = createStorage();
        return await storage.put(key, buf, { contentType });
      }

      const options: any = {
        pathname: key,
        access: 'public',
        token
      };

      if (contentType) {
        options.contentType = contentType;
      }

      const result = await BlobSDK.put(options.pathname, buf, options);
      return result.url;
    } catch (error) {
      console.error(`[BlobStore] Failed to put ${key}:`, error);
      throw error;
    }
  },

  async putText(key: string, text: string, contentType = 'text/plain'): Promise<string> {
    const buf = Buffer.from(text, 'utf-8');
    return await this.putBuf(key, buf, contentType);
  },

  async delete(key: string): Promise<void> {
    try {
      const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

      if (!token) {
        console.warn('[BlobStore] Blob storage not configured');
        return;
      }

      // First get the URL for the blob
      const { blobs } = await BlobSDK.list({ prefix: key, token });
      const blob = blobs.find((b: any) => b.pathname === key);

      if (blob) {
        await BlobSDK.del(blob.url, { token });
      }
    } catch (error) {
      console.warn(`[BlobStore] Failed to delete ${key}:`, error);
      // Don't throw - fail gracefully
    }
  }
};

// TODO: Job queue durability will be handled in Phase 4