// std_collections.js — Nectar standard library: collection utilities
export const name = 'std_collections';

export const runtime = `
  const __nectar_collections = {
    group_by(arr, key) {
      const result = {};
      for (const item of arr) {
        const k = typeof key === 'function' ? key(item) : item[key];
        (result[k] = result[k] || []).push(item);
      }
      return result;
    },
    sort_by(arr, key) {
      return [...arr].sort((a, b) => {
        const va = typeof key === 'function' ? key(a) : a[key];
        const vb = typeof key === 'function' ? key(b) : b[key];
        return va < vb ? -1 : va > vb ? 1 : 0;
      });
    },
    uniq_by(arr, key) {
      const seen = new Set();
      return arr.filter(item => {
        const k = typeof key === 'function' ? key(item) : item[key];
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    },
    chunk(arr, size) {
      const result = [];
      for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    },
    flatten(arr) {
      return arr.flat(1);
    },
    zip(a, b) {
      const len = Math.min(a.length, b.length);
      const result = [];
      for (let i = 0; i < len; i++) result.push([a[i], b[i]]);
      return result;
    },
    partition(arr, predicate) {
      const pass = [], fail = [];
      for (const item of arr) {
        (predicate(item) ? pass : fail).push(item);
      }
      return [pass, fail];
    },
  };
`;

export const wasmImports = {
  std_collections: {
    group_by(arrPtr, keyPtr, keyLen) {
      const arr = NectarRuntime.__getObject(arrPtr);
      const key = NectarRuntime.__getString(keyPtr, keyLen);
      return NectarRuntime.__registerObject(__nectar_collections.group_by(arr, key));
    },
    sort_by(arrPtr, keyPtr, keyLen) {
      const arr = NectarRuntime.__getObject(arrPtr);
      const key = NectarRuntime.__getString(keyPtr, keyLen);
      return NectarRuntime.__registerObject(__nectar_collections.sort_by(arr, key));
    },
    uniq_by(arrPtr, keyPtr, keyLen) {
      const arr = NectarRuntime.__getObject(arrPtr);
      const key = NectarRuntime.__getString(keyPtr, keyLen);
      return NectarRuntime.__registerObject(__nectar_collections.uniq_by(arr, key));
    },
    chunk(arrPtr, size) {
      const arr = NectarRuntime.__getObject(arrPtr);
      return NectarRuntime.__registerObject(__nectar_collections.chunk(arr, size));
    },
    flatten(arrPtr) {
      const arr = NectarRuntime.__getObject(arrPtr);
      return NectarRuntime.__registerObject(__nectar_collections.flatten(arr));
    },
    zip(aPtr, bPtr) {
      const a = NectarRuntime.__getObject(aPtr);
      const b = NectarRuntime.__getObject(bPtr);
      return NectarRuntime.__registerObject(__nectar_collections.zip(a, b));
    },
    partition(arrPtr, fnPtr) {
      const arr = NectarRuntime.__getObject(arrPtr);
      const fn = NectarRuntime.__getCallback(fnPtr);
      return NectarRuntime.__registerObject(__nectar_collections.partition(arr, fn));
    },
  },
};
