// std_search.js — Nectar standard library: client-side fuzzy search
export const name = 'std_search';

export const runtime = `
  class NectarSearchIndex {
    constructor(items, keys) {
      this.items = items;
      this.keys = keys;
      this.size = items.length;
    }

    search(query) {
      const q = query.toLowerCase();
      const scored = [];

      for (const item of this.items) {
        let bestScore = 0;
        for (const key of this.keys) {
          const val = String(item[key] || '').toLowerCase();
          const score = NectarSearchIndex._fuzzyScore(q, val);
          if (score > bestScore) bestScore = score;
        }
        if (bestScore > 0) scored.push({ item, score: bestScore });
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.map(s => s.item);
    }

    static _fuzzyScore(query, target) {
      if (target.includes(query)) return 1.0;
      let qi = 0;
      let matched = 0;
      let lastMatchIdx = -1;
      let consecutiveBonus = 0;

      for (let ti = 0; ti < target.length && qi < query.length; ti++) {
        if (target[ti] === query[qi]) {
          matched++;
          if (lastMatchIdx === ti - 1) consecutiveBonus += 0.1;
          lastMatchIdx = ti;
          qi++;
        }
      }

      if (qi < query.length) return 0;
      return (matched / target.length) + consecutiveBonus;
    }
  }
`;

export const wasmImports = {
  std_search: {
    create_index(itemsPtr, keysPtr) {
      const items = NectarRuntime.__getObject(itemsPtr);
      const keys = NectarRuntime.__getObject(keysPtr);
      return NectarRuntime.__registerObject(new NectarSearchIndex(items, keys));
    },
    query(indexPtr, queryPtr, queryLen) {
      const index = NectarRuntime.__getObject(indexPtr);
      const query = NectarRuntime.__getString(queryPtr, queryLen);
      return NectarRuntime.__registerObject(index.search(query));
    },
  },
};
