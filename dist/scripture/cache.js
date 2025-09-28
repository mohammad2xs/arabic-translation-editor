import fs from 'fs/promises';
import path from 'path';
class LRUCache {
    constructor(capacity) {
        this.cache = new Map();
        this.capacity = capacity;
    }
    get(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        else if (this.cache.size >= this.capacity) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    has(key) {
        return this.cache.has(key);
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
}
const scriptureCache = new LRUCache(100);
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const LOCAL_CACHE_FILE = 'data/scripture/cache.json';
let localScriptureDB = {};
let isInitialized = false;
async function initializeCache() {
    if (isInitialized)
        return;
    try {
        const quranSmallPath = 'data/scripture/quran_small.json';
        try {
            const quranData = await fs.readFile(quranSmallPath, 'utf8');
            const quranDB = JSON.parse(quranData);
            localScriptureDB = { ...localScriptureDB, ...quranDB };
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Failed to load quran_small.json:', error);
            }
        }
        try {
            const cacheData = await fs.readFile(LOCAL_CACHE_FILE, 'utf8');
            const cache = JSON.parse(cacheData);
            if (cache.version === '1.0' && cache.entries) {
                for (const [key, entry] of Object.entries(cache.entries)) {
                    if (Date.now() - entry.timestamp < CACHE_DURATION) {
                        scriptureCache.set(key, entry);
                    }
                }
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Failed to load cache file:', error);
            }
        }
        isInitialized = true;
    }
    catch (error) {
        console.error('Failed to initialize scripture cache:', error);
        throw error;
    }
}
async function saveCache() {
    try {
        const cacheEntries = {};
        for (const [key, entry] of scriptureCache.cache.entries()) {
            if (Date.now() - entry.timestamp < CACHE_DURATION) {
                cacheEntries[key] = entry;
            }
        }
        const cacheData = {
            version: '1.0',
            lastUpdated: new Date().toISOString(),
            entries: cacheEntries
        };
        await fs.mkdir(path.dirname(LOCAL_CACHE_FILE), { recursive: true });
        await fs.writeFile(LOCAL_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    }
    catch (error) {
        console.warn('Failed to save cache:', error);
    }
}
function normalizeReference(reference) {
    return reference.toLowerCase().trim();
}
function parseQuranReference(ref) {
    const match = ref.match(/^(\d+):(\d+)$/);
    if (!match)
        return null;
    const surah = parseInt(match[1], 10);
    const ayah = parseInt(match[2], 10);
    if (surah < 1 || surah > 114 || ayah < 1)
        return null;
    return { surah, ayah };
}
function parseHadithReference(ref) {
    const match = ref.match(/^(bukhari|muslim|tirmidhi|abu-dawud|nasai|ibn-majah):(.+)$/i);
    if (!match)
        return null;
    return {
        collection: match[1].toLowerCase(),
        number: match[2]
    };
}
async function fetchFromExternalAPI(reference, baseUrl) {
    try {
        const apiBaseUrl = baseUrl || (typeof window !== 'undefined' ? '' : process.env.BASE_URL || 'http://localhost:3000');
        const url = `${apiBaseUrl}/api/scripture/resolve?ref=${encodeURIComponent(reference)}`;
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`API request failed: ${response.status}`);
        }
        const data = await response.json();
        return data;
    }
    catch (error) {
        console.warn(`Failed to fetch scripture from API: ${reference}`, error);
        return null;
    }
}
export async function resolveLocalFirst(reference, baseUrl) {
    await initializeCache();
    const normalizedRef = normalizeReference(reference);
    const cached = scriptureCache.get(normalizedRef);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        return cached.data;
    }
    let result = localScriptureDB[normalizedRef];
    if (result) {
        const cacheEntry = {
            data: result,
            timestamp: Date.now(),
            accessCount: 1,
            lastAccessed: Date.now()
        };
        scriptureCache.set(normalizedRef, cacheEntry);
        await saveCache();
        return result;
    }
    result = await fetchFromExternalAPI(reference, baseUrl);
    if (result) {
        const cacheEntry = {
            data: result,
            timestamp: Date.now(),
            accessCount: 1,
            lastAccessed: Date.now()
        };
        scriptureCache.set(normalizedRef, cacheEntry);
        await saveCache();
        return result;
    }
    return null;
}
export async function preloadCommonReferences(references, baseUrl) {
    await initializeCache();
    const promises = references.map(async (ref) => {
        const normalizedRef = normalizeReference(ref);
        if (scriptureCache.has(normalizedRef) || localScriptureDB[normalizedRef]) {
            return;
        }
        try {
            const result = await fetchFromExternalAPI(ref, baseUrl);
            if (result) {
                const cacheEntry = {
                    data: result,
                    timestamp: Date.now(),
                    accessCount: 0,
                    lastAccessed: Date.now()
                };
                scriptureCache.set(normalizedRef, cacheEntry);
            }
        }
        catch (error) {
            console.warn(`Failed to preload reference: ${ref}`, error);
        }
    });
    await Promise.all(promises);
    await saveCache();
}
export async function validateReference(reference) {
    const quranRef = parseQuranReference(reference);
    if (quranRef) {
        return quranRef.surah >= 1 && quranRef.surah <= 114 && quranRef.ayah >= 1;
    }
    const hadithRef = parseHadithReference(reference);
    if (hadithRef) {
        const validCollections = ['bukhari', 'muslim', 'tirmidhi', 'abu-dawud', 'nasai', 'ibn-majah'];
        return validCollections.includes(hadithRef.collection);
    }
    return false;
}
export async function batchResolve(references, baseUrl) {
    await initializeCache();
    const results = {};
    const missingRefs = [];
    for (const ref of references) {
        const normalizedRef = normalizeReference(ref);
        const cached = scriptureCache.get(normalizedRef);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            cached.accessCount++;
            cached.lastAccessed = Date.now();
            results[ref] = cached.data;
            continue;
        }
        const local = localScriptureDB[normalizedRef];
        if (local) {
            const cacheEntry = {
                data: local,
                timestamp: Date.now(),
                accessCount: 1,
                lastAccessed: Date.now()
            };
            scriptureCache.set(normalizedRef, cacheEntry);
            results[ref] = local;
            continue;
        }
        missingRefs.push(ref);
        results[ref] = null;
    }
    const fetchPromises = missingRefs.map(async (ref) => {
        try {
            const result = await fetchFromExternalAPI(ref, baseUrl);
            if (result) {
                const normalizedRef = normalizeReference(ref);
                const cacheEntry = {
                    data: result,
                    timestamp: Date.now(),
                    accessCount: 1,
                    lastAccessed: Date.now()
                };
                scriptureCache.set(normalizedRef, cacheEntry);
                results[ref] = result;
            }
        }
        catch (error) {
            console.warn(`Failed to fetch reference: ${ref}`, error);
        }
    });
    await Promise.all(fetchPromises);
    await saveCache();
    return results;
}
export async function getCacheStats() {
    await initializeCache();
    const entries = [];
    let totalAccess = 0;
    for (const [key, entry] of scriptureCache.cache.entries()) {
        entries.push({
            reference: key,
            accessCount: entry.accessCount,
            lastAccessed: new Date(entry.lastAccessed).toISOString(),
            age: Date.now() - entry.timestamp
        });
        totalAccess += entry.accessCount;
    }
    entries.sort((a, b) => b.accessCount - a.accessCount);
    return {
        size: scriptureCache.size(),
        capacity: 100,
        hitRate: totalAccess > 0 ? entries.filter(e => e.accessCount > 0).length / entries.length : 0,
        entries
    };
}
export async function clearCache() {
    scriptureCache.clear();
    try {
        await fs.unlink(LOCAL_CACHE_FILE);
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('Failed to delete cache file:', error);
        }
    }
}
export async function warmCache(baseUrl) {
    const commonReferences = [
        '1:1', '2:30', '2:255', '5:2', '17:70', '21:35', '67:15', '91:7', '91:8', '91:9', '91:10', '57:25',
        'bukhari:1', 'bukhari:6', 'muslim:1', 'muslim:16'
    ];
    await preloadCommonReferences(commonReferences, baseUrl);
}
