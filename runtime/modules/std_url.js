// std_url.js — Nectar standard library: URL manipulation
export const name = 'std_url';

export const runtime = `
  const __nectar_url = {
    parse(str) {
      const u = new URL(str);
      return {
        href: u.href, origin: u.origin, protocol: u.protocol,
        host: u.host, pathname: u.pathname, search: u.search, hash: u.hash,
      };
    },
    build(base) {
      return new URL(base);
    },
    query_get(urlStr, key) {
      const u = new URL(urlStr);
      return u.searchParams.get(key);
    },
    query_set(urlStr, key, value) {
      const u = new URL(urlStr);
      u.searchParams.set(key, value);
      return u.href;
    },
    query_delete(urlStr, key) {
      const u = new URL(urlStr);
      u.searchParams.delete(key);
      return u.href;
    },
    query_has(urlStr, key) {
      const u = new URL(urlStr);
      return u.searchParams.has(key);
    },
    query_entries(urlStr) {
      const u = new URL(urlStr);
      return Array.from(u.searchParams.entries());
    },
  };
`;

export const wasmImports = {
  std_url: {
    parse(strPtr, strLen) {
      const str = NectarRuntime.__getString(strPtr, strLen);
      return NectarRuntime.__registerObject(__nectar_url.parse(str));
    },
    build(basePtr, baseLen) {
      const base = NectarRuntime.__getString(basePtr, baseLen);
      return NectarRuntime.__registerObject(__nectar_url.build(base));
    },
    query_get(urlPtr, urlLen, keyPtr, keyLen) {
      const url = NectarRuntime.__getString(urlPtr, urlLen);
      const key = NectarRuntime.__getString(keyPtr, keyLen);
      const val = __nectar_url.query_get(url, key);
      return val !== null ? NectarRuntime.__allocString(val) : 0;
    },
    query_set(urlPtr, urlLen, keyPtr, keyLen, valPtr, valLen) {
      const url = NectarRuntime.__getString(urlPtr, urlLen);
      const key = NectarRuntime.__getString(keyPtr, keyLen);
      const val = NectarRuntime.__getString(valPtr, valLen);
      return NectarRuntime.__allocString(__nectar_url.query_set(url, key, val));
    },
  },
};
