import { afterEach, describe, expect, it, vi } from 'vitest';
import dataCache, { CacheTypes } from './dataCache';

describe('dataCache', () => {
  afterEach(() => {
    dataCache.clear();
    vi.restoreAllMocks();
  });

  it('does not emit console logs during basic cache operations', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    dataCache.set(CacheTypes.TEST, 'test-1', { title: 'Quiet cache entry' });
    expect(dataCache.get(CacheTypes.TEST, 'test-1')).toEqual({ title: 'Quiet cache entry' });
    dataCache.update(CacheTypes.TEST, 'test-1', { title: 'Updated quiet cache entry' });
    dataCache.delete(CacheTypes.TEST, 'test-1');

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
