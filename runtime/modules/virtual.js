// runtime/modules/virtual.js — Virtual list DOM syscall layer (logic in Rust/WASM)

const _cbs = new Map();

const wasmImports = {
  virtual: {
    createContainer(parentId, height) {
      const container = document.createElement('div');
      container.style.overflow = 'auto';
      container.style.position = 'relative';
      container.style.height = `${height}px`;
      document.getElementById(parentId).appendChild(container);
      return container;
    },

    appendItem(containerId, elId, top) {
      const el = document.createElement('div');
      el.id = elId;
      el.style.position = 'absolute';
      el.style.transform = `translateY(${top}px)`;
      el.style.width = '100%';
      document.getElementById(containerId).appendChild(el);
    },

    removeItem(elId) {
      const el = document.getElementById(elId);
      el.parentNode.removeChild(el);
    },

    setContainerHeight(containerId, height) {
      document.getElementById(containerId).style.height = `${height}px`;
    },

    onScroll(containerId, cbIdx) {
      document.getElementById(containerId).addEventListener('scroll', () => {
        _cbs.get(cbIdx)?.();
      });
    },

    getScrollTop(containerId) {
      return document.getElementById(containerId).scrollTop;
    },

    getClientHeight(containerId) {
      return document.getElementById(containerId).clientHeight;
    },
  },
};

module.exports = { name: 'virtual', runtime: { _cbs }, wasmImports };
