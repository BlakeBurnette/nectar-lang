// std_pagination.js — Nectar standard library: pagination
export const name = 'std_pagination';

export const runtime = `
  const __nectar_pagination = {
    paginate(items, page, perPage) {
      const total = items.length;
      const totalPages = Math.ceil(total / perPage);
      const start = (page - 1) * perPage;
      const data = items.slice(start, start + perPage);
      return {
        data,
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
        has_prev: page > 1,
        has_next: page < totalPages,
      };
    },

    page_numbers(currentPage, totalPages, maxVisible = 7) {
      if (totalPages <= maxVisible) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
      }
      const half = Math.floor(maxVisible / 2);
      let start = Math.max(1, currentPage - half);
      let end = Math.min(totalPages, start + maxVisible - 1);
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      const pages = [];
      for (let i = start; i <= end; i++) pages.push(i);
      if (start > 1) { pages[0] = 1; if (start > 2) pages[1] = -1; } // -1 = ellipsis
      if (end < totalPages) {
        pages[pages.length - 1] = totalPages;
        if (end < totalPages - 1) pages[pages.length - 2] = -1;
      }
      return pages;
    },

    infinite_scroll(container, callback, options = {}) {
      const threshold = options.threshold || 200;
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) callback();
      }, { rootMargin: threshold + 'px' });

      const sentinel = document.createElement('div');
      sentinel.style.height = '1px';
      container.appendChild(sentinel);
      observer.observe(sentinel);

      return { disconnect: () => observer.disconnect() };
    },
  };
`;

export const wasmImports = {
  std_pagination: {
    paginate(itemsPtr, page, perPage) {
      const items = NectarRuntime.__getObject(itemsPtr);
      return NectarRuntime.__registerObject(__nectar_pagination.paginate(items, page, perPage));
    },
    page_numbers(current, total, maxVisible) {
      return NectarRuntime.__registerObject(__nectar_pagination.page_numbers(current, total, maxVisible));
    },
    infinite_scroll(containerPtr, callbackPtr) {
      const container = NectarRuntime.__getElement(containerPtr);
      const callback = NectarRuntime.__getCallback(callbackPtr);
      return NectarRuntime.__registerObject(__nectar_pagination.infinite_scroll(container, callback));
    },
  },
};
