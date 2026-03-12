// std_util.js — Nectar standard library: utility functions
export const name = 'std_util';

export const runtime = `
  // Debounce: delays execution until after wait ms of inactivity
  function __nectar_debounce(fn, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Throttle: limits execution to at most once per wait ms
  function __nectar_throttle(fn, wait) {
    let last = 0;
    let timeout;
    return function(...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        clearTimeout(timeout);
        last = now;
        fn.apply(this, args);
      } else if (!timeout) {
        timeout = setTimeout(() => {
          last = Date.now();
          timeout = null;
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  // Deep clone using structuredClone
  function __nectar_deep_clone(obj) {
    return structuredClone(obj);
  }

  // Deep merge — recursively merges source into target
  function __nectar_deep_merge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
          result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = __nectar_deep_merge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
`;

export const wasmImports = {
  std_util: {
    debounce(fnPtr, waitMs) {
      const fn = NectarRuntime.__getCallback(fnPtr);
      return NectarRuntime.__registerCallback(__nectar_debounce(fn, waitMs));
    },
    throttle(fnPtr, waitMs) {
      const fn = NectarRuntime.__getCallback(fnPtr);
      return NectarRuntime.__registerCallback(__nectar_throttle(fn, waitMs));
    },
    deep_clone(ptr) {
      const obj = NectarRuntime.__getObject(ptr);
      return NectarRuntime.__registerObject(__nectar_deep_clone(obj));
    },
    deep_merge(targetPtr, sourcePtr) {
      const target = NectarRuntime.__getObject(targetPtr);
      const source = NectarRuntime.__getObject(sourcePtr);
      return NectarRuntime.__registerObject(__nectar_deep_merge(target, source));
    },
  },
};
