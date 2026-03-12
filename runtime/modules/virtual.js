// runtime/modules/virtual.js — Virtualized list runtime for large datasets

const VirtualRuntime = {
  _lists: new Map(),
  _nextId: 1,

  createList(readString, containerPtr, containerLen, totalItems, itemHeight, buffer) {
    const selector = readString(containerPtr, containerLen);
    const id = VirtualRuntime._nextId++;
    const container = document.querySelector(selector);
    if (!container) return id;

    const config = {
      totalItems,
      itemHeight,
      buffer: buffer || 5,
      container,
      renderedItems: new Map(),
    };
    const totalHeight = totalItems * itemHeight;

    // Create scroll container
    container.style.overflow = 'auto';
    container.style.position = 'relative';

    const spacer = document.createElement('div');
    spacer.style.height = `${totalHeight}px`;
    spacer.style.position = 'relative';
    container.appendChild(spacer);

    config.spacer = spacer;
    config.viewport = container;
    VirtualRuntime._lists.set(id, config);

    container.addEventListener('scroll', () => VirtualRuntime._render(id));
    VirtualRuntime._render(id);

    return id;
  },

  _render(id) {
    const config = VirtualRuntime._lists.get(id);
    if (!config) return;

    const scrollTop = config.viewport.scrollTop;
    const viewHeight = config.viewport.clientHeight;
    const startIdx = Math.max(0, Math.floor(scrollTop / config.itemHeight) - config.buffer);
    const endIdx = Math.min(
      config.totalItems - 1,
      Math.ceil((scrollTop + viewHeight) / config.itemHeight) + config.buffer
    );

    // Remove items outside range
    for (const [idx, el] of config.renderedItems) {
      if (idx < startIdx || idx > endIdx) {
        el.remove();
        config.renderedItems.delete(idx);
      }
    }

    // Add items inside range
    for (let i = startIdx; i <= endIdx; i++) {
      if (!config.renderedItems.has(i)) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.top = `${i * config.itemHeight}px`;
        el.style.height = `${config.itemHeight}px`;
        el.style.width = '100%';
        el.setAttribute('data-virtual-index', i);

        // Callback to WASM for rendering content
        if (typeof instance !== 'undefined' && instance.exports.__virtual_render_item) {
          instance.exports.__virtual_render_item(id, i);
        } else {
          el.textContent = `Item ${i}`;
        }

        config.spacer.appendChild(el);
        config.renderedItems.set(i, el);
      }
    }
  },

  updateViewport(_id, _scrollTop, _viewHeight) {
    VirtualRuntime._render(_id);
  },

  scrollTo(id, index) {
    const config = VirtualRuntime._lists.get(id);
    if (config) config.viewport.scrollTop = index * config.itemHeight;
  },
};

const virtualModule = {
  name: 'virtual',
  runtime: VirtualRuntime,
  wasmImports: {
    virtual: {
      createList: VirtualRuntime.createList,
      updateViewport: VirtualRuntime.updateViewport,
      scrollTo: VirtualRuntime.scrollTo,
    }
  }
};

if (typeof module !== "undefined") module.exports = virtualModule;
