const _cache = new Map();

export function getPageCache(key) { return _cache.get(key) ?? null; }
export function setPageCache(key, data, signal) { _cache.set(key, { data, signal }); }
export function isPageCacheValid(key, signal) { const e = _cache.get(key); return e != null && e.signal === signal; }
