/**
 * Data Cache Service
 *
 * Intelligent caching layer to prevent redundant Firebase queries
 * and dramatically improve page load performance across the application.
 *
 * Features:
 * - TTL-based cache expiration
 * - Automatic cache invalidation
 * - Memory-efficient storage
 * - Real-time data freshness tracking
 */

class DataCache {
  constructor() {
    this.cache = new Map();
    this.listeners = new Map();
    this.defaultTTL = 30000; // 30 seconds default TTL
  }

  /**
   * Generate cache key from parameters
   * @private
   */
  _generateKey(type, id, params = {}) {
    const paramStr = Object.keys(params).length > 0
      ? JSON.stringify(params)
      : '';
    return `${type}:${id}:${paramStr}`;
  }

  /**
   * Set cache entry with TTL
   * @param {string} type - Cache type (e.g., 'session', 'quiz', 'test')
   * @param {string} id - Resource ID
   * @param {*} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds
   * @param {Object} params - Additional parameters for cache key
   */
  set(type, id, data, ttl = this.defaultTTL, params = {}) {
    const key = this._generateKey(type, id, params);
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
      expiresAt: Date.now() + ttl,
    };

    this.cache.set(key, entry);

    // Auto-cleanup after TTL
    setTimeout(() => {
      this.delete(type, id, params);
    }, ttl);
  }

  /**
   * Get cache entry if valid
   * @param {string} type - Cache type
   * @param {string} id - Resource ID
   * @param {Object} params - Additional parameters for cache key
   * @returns {*} Cached data or null if expired/missing
   */
  get(type, id, params = {}) {
    const key = this._generateKey(type, id, params);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Delete cache entry
   * @param {string} type - Cache type
   * @param {string} id - Resource ID
   * @param {Object} params - Additional parameters for cache key
   */
  delete(type, id, params = {}) {
    const key = this._generateKey(type, id, params);
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries of a specific type
   * @param {string} type - Cache type to invalidate
   */
  invalidateType(type) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${type}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    let totalSize = 0;

    for (const [, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredEntries++;
      } else {
        validEntries++;
      }
      totalSize += JSON.stringify(entry.data).length;
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      totalSizeBytes: totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
    };
  }

  /**
   * Batch set multiple entries
   * @param {string} type - Cache type
   * @param {Array} items - Array of {id, data} objects
   * @param {number} ttl - Time to live
   */
  batchSet(type, items, ttl = this.defaultTTL) {
    items.forEach(({ id, data, params = {} }) => {
      this.set(type, id, data, ttl, params);
    });
  }

  /**
   * Batch get multiple entries
   * @param {string} type - Cache type
   * @param {Array} ids - Array of IDs
   * @returns {Map} Map of id -> data (only cached items)
   */
  batchGet(type, ids) {
    const results = new Map();
    ids.forEach((id) => {
      const data = this.get(type, id);
      if (data !== null) {
        results.set(id, data);
      }
    });
    return results;
  }

  /**
   * Check if cache has valid entry
   * @param {string} type - Cache type
   * @param {string} id - Resource ID
   * @param {Object} params - Additional parameters
   * @returns {boolean} True if valid cache exists
   */
  has(type, id, params = {}) {
    const key = this._generateKey(type, id, params);
    const entry = this.cache.get(key);

    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Update cache entry without changing TTL
   * @param {string} type - Cache type
   * @param {string} id - Resource ID
   * @param {*} data - New data
   * @param {Object} params - Additional parameters
   */
  update(type, id, data, params = {}) {
    const key = this._generateKey(type, id, params);
    const entry = this.cache.get(key);

    if (entry && Date.now() <= entry.expiresAt) {
      entry.data = data;
      entry.timestamp = Date.now();
      this.cache.set(key, entry);
    } else {
      this.set(type, id, data, this.defaultTTL, params);
    }
  }
}

const dataCache = new DataCache();

export default dataCache;

export const CacheTypes = {
  SESSION: 'session',
  QUIZ: 'quiz',
  TEST: 'test',
  CLASS: 'class',
  USER: 'user',
  PLAYER: 'player',
};

export const CacheTTL = {
  SHORT: 10000,
  MEDIUM: 30000,
  LONG: 60000,
  VERY_LONG: 300000,
};
