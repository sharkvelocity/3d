
import { generateAssetManifest } from './AssetManifest';

const CACHE_NAME = 'phasmaphoney-assets-v1';

export const CacheManager = {
    checkCacheStatus: async (): Promise<{ cachedCount: number, totalCount: number }> => {
        if (!('caches' in window)) return { cachedCount: 0, totalCount: 0 };
        
        const manifest = generateAssetManifest();
        const cache = await caches.open(CACHE_NAME);
        let cachedCount = 0;

        // Check a sample or all? Checking all might be slow on low-end.
        // Let's check all since we need accuracy for the prompt.
        const checks = manifest.map(async (url) => {
            const match = await cache.match(url);
            if (match) cachedCount++;
        });
        
        await Promise.all(checks);
        return { cachedCount, totalCount: manifest.length };
    },

    requestPersistentStorage: async (): Promise<boolean> => {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`[CacheManager] Persistent storage granted: ${isPersisted}`);
            return isPersisted;
        }
        return false;
    },

    downloadAssets: async (onProgress: (percent: number) => void) => {
        if (!('caches' in window)) {
            onProgress(100);
            return;
        }

        // Request persistence so the browser doesn't delete the game files
        await CacheManager.requestPersistentStorage();

        const manifest = generateAssetManifest();
        const cache = await caches.open(CACHE_NAME);
        const total = manifest.length;
        let completed = 0;

        // Helper to fetch and cache a single URL
        const fetchAndCache = async (url: string) => {
            try {
                // Check if already cached
                const match = await cache.match(url);
                if (match) {
                    completed++;
                    onProgress((completed / total) * 100);
                    return;
                }

                const response = await fetch(url);
                if (response.ok) {
                    await cache.put(url, response);
                }
            } catch (e) {
                console.warn(`[CacheManager] Failed to cache ${url}`, e);
            } finally {
                completed++;
                onProgress((completed / total) * 100);
            }
        };

        // Limit concurrency to prevent network stalling (e.g., 5 concurrent requests)
        const concurrency = 5;
        for (let i = 0; i < total; i += concurrency) {
            const batch = manifest.slice(i, i + concurrency);
            await Promise.all(batch.map(url => fetchAndCache(url)));
        }
    }
};
