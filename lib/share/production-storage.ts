// @ts-nocheck
import { createHmac } from 'crypto';
import type { UserRole } from '../dadmode/access';

interface TokenData {
  uuid: string;
  role: UserRole;
  scope?: string;
  expiresAt: string;
  createdAt: string;
}

interface AllowlistEntry {
  role: UserRole;
  scope?: string;
  expiry: string;
  createdAt: string;
}

const SHARE_KEY = process.env.SHARE_KEY || 'insecure-dev-key';

// Production storage interface
interface TokenStorage {
  set(key: string, value: AllowlistEntry, expiresAt?: Date): Promise<void>;
  get(key: string): Promise<AllowlistEntry | null>;
  delete(key: string): Promise<boolean>;
  list(): Promise<Array<{ key: string; value: AllowlistEntry }>>;
  cleanup(): Promise<number>;
}

// Vercel KV storage implementation
class VercelKVStorage implements TokenStorage {
  private kv: any;
  private indexKey = 'tokens_index';

  constructor() {
    // Import Vercel KV dynamically using ESM syntax
    try {
      this.kv = require('@vercel/kv').kv;
    } catch {
      throw new Error('Vercel KV not available');
    }
  }

  async set(key: string, value: AllowlistEntry, expiresAt?: Date): Promise<void> {
    const tokenKey = `token:${key}`;

    if (expiresAt) {
      const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      if (ttlSeconds > 0) {
        await this.kv.set(tokenKey, JSON.stringify(value), { ex: ttlSeconds });
        // Add to index set with same TTL
        await this.kv.sadd(this.indexKey, key);
      }
    } else {
      await this.kv.set(tokenKey, JSON.stringify(value));
      // Add to index set
      await this.kv.sadd(this.indexKey, key);
    }
  }

  async get(key: string): Promise<AllowlistEntry | null> {
    try {
      const data = await this.kv.get(`token:${key}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.kv.del(`token:${key}`);
      // Remove from index
      await this.kv.srem(this.indexKey, key);
      return result > 0;
    } catch {
      return false;
    }
  }

  async list(): Promise<Array<{ key: string; value: AllowlistEntry }>> {
    try {
      // Get all token keys from index
      const keys = await this.kv.smembers(this.indexKey);
      const results = [];

      for (const key of keys) {
        const value = await this.get(key);
        if (value) {
          results.push({ key, value });
        } else {
          // Clean up stale index entry
          await this.kv.srem(this.indexKey, key);
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  async cleanup(): Promise<number> {
    try {
      const tokens = await this.list();
      let cleaned = 0;

      for (const { key, value } of tokens) {
        if (new Date() > new Date(value.expiry)) {
          await this.delete(key);
          cleaned++;
        }
      }

      return cleaned;
    } catch {
      return 0;
    }
  }
}

// Memory storage fallback for development
class MemoryStorage implements TokenStorage {
  private store = new Map<string, { value: AllowlistEntry; expiresAt?: Date }>();

  async set(key: string, value: AllowlistEntry, expiresAt?: Date): Promise<void> {
    this.store.set(`token:${key}`, { value, expiresAt });
  }

  async get(key: string): Promise<AllowlistEntry | null> {
    const entry = this.store.get(`token:${key}`);

    if (!entry) return null;

    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.store.delete(`token:${key}`);
      return null;
    }

    return entry.value;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(`token:${key}`);
  }

  async list(): Promise<Array<{ key: string; value: AllowlistEntry }>> {
    const results = [];

    for (const [key, entry] of this.store) {
      if (!entry.expiresAt || new Date() <= entry.expiresAt) {
        results.push({
          key: key.replace('token:', ''),
          value: entry.value
        });
      }
    }

    return results;
  }

  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = new Date();

    for (const [key, entry] of this.store) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Initialize storage based on environment
function createStorage(): TokenStorage {
  // In production, prefer Vercel KV if available
  if (process.env.NODE_ENV === 'production') {
    try {
      // Check if we're on Vercel or have KV environment variables
      if (process.env.VERCEL || process.env.KV_REST_API_URL || process.env.KV_URL) {
        const kvStorage = new VercelKVStorage();
        console.log('[Production Storage] Using Vercel KV storage');
        return kvStorage;
      }
    } catch (error) {
      console.warn('[Production Storage] Failed to initialize Vercel KV, falling back to memory:', error);
    }
  }

  console.log('[Production Storage] Using memory storage');
  return new MemoryStorage();
}

const storage = createStorage();

// Simple UUID generator for Edge Runtime compatibility
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function createToken(
  role: UserRole,
  expiresAt: Date,
  section?: string
): Promise<string> {
  const uuid = generateUUID();
  const tokenData: TokenData = {
    uuid,
    role,
    scope: section,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  };

  // Create HMAC signature
  const payload = `${uuid}:${role}:${tokenData.scope || ''}:${tokenData.expiresAt}`;
  const signature = createHmac('sha256', SHARE_KEY).update(payload).digest('hex');

  // Combine uuid and signature for the token
  const token = `${uuid}.${signature}`;

  // Store token data in production storage
  const allowlistEntry: AllowlistEntry = {
    role,
    scope: section,
    expiry: tokenData.expiresAt,
    createdAt: tokenData.createdAt,
  };

  try {
    await storage.set(uuid, allowlistEntry, expiresAt);
    console.log(`[Production Storage] Token created: ${uuid}`);
  } catch (error) {
    console.error('[Production Storage] Failed to store token:', error);
    throw new Error('Failed to create token');
  }

  return token;
}

export async function validateToken(token: string): Promise<{
  valid: boolean;
  role?: UserRole;
  scope?: string;
  expired?: boolean;
}> {
  try {
    const [uuid, signature] = token.split('.');

    if (!uuid || !signature) {
      return { valid: false };
    }

    // Get token data from storage
    const allowlistEntry = await storage.get(uuid);

    if (!allowlistEntry) {
      return { valid: false };
    }

    // Check expiry
    const isExpired = new Date() > new Date(allowlistEntry.expiry);
    if (isExpired) {
      // Clean up expired token
      await storage.delete(uuid);
      return { valid: false, expired: true };
    }

    // Verify HMAC signature
    const payload = `${uuid}:${allowlistEntry.role}:${allowlistEntry.scope || ''}:${allowlistEntry.expiry}`;
    const expectedSignature = createHmac('sha256', SHARE_KEY).update(payload).digest('hex');

    if (signature !== expectedSignature) {
      return { valid: false };
    }

    return {
      valid: true,
      role: allowlistEntry.role,
      scope: allowlistEntry.scope,
      expired: false,
    };
  } catch (error) {
    console.error('[Production Storage] Token validation error:', error);
    return { valid: false };
  }
}

export async function isTokenExpired(token: string): Promise<boolean> {
  try {
    const [uuid] = token.split('.');
    if (!uuid) return true;

    const allowlistEntry = await storage.get(uuid);
    if (!allowlistEntry) return true;

    return new Date() > new Date(allowlistEntry.expiry);
  } catch {
    return true;
  }
}

export function generateShareUrl(
  baseUrl: string,
  token: string,
  section?: string,
  mode = 'dad'
): string {
  const url = new URL('/tri', baseUrl);

  if (section) {
    url.searchParams.set('section', section);
  }

  url.searchParams.set('token', token);
  url.searchParams.set('mode', mode);
  url.searchParams.set('assistant', '1');

  return url.toString();
}

export function parseTokenFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('token');
  } catch {
    return null;
  }
}

export async function revokeToken(token: string): Promise<boolean> {
  try {
    const [uuid] = token.split('.');
    if (!uuid) return false;

    const success = await storage.delete(uuid);
    console.log(`[Production Storage] Token revoked: ${uuid}, success: ${success}`);
    return success;
  } catch (error) {
    console.error('[Production Storage] Error revoking token:', error);
    return false;
  }
}

export async function getActiveTokens(): Promise<Array<{
  uuid: string;
  role: UserRole;
  scope?: string;
  expiresAt: string;
  createdAt: string;
}>> {
  try {
    const tokens = await storage.list();
    return tokens.map(({ key, value }) => ({
      uuid: key,
      role: value.role,
      scope: value.scope,
      expiresAt: value.expiry,
      createdAt: value.createdAt,
    }));
  } catch (error) {
    console.error('[Production Storage] Error getting active tokens:', error);
    return [];
  }
}

export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const cleaned = await storage.cleanup();
    console.log(`[Production Storage] Cleaned up ${cleaned} expired tokens`);
    return cleaned;
  } catch (error) {
    console.error('[Production Storage] Error during cleanup:', error);
    return 0;
  }
}

// Export storage instance for advanced usage
export { storage };