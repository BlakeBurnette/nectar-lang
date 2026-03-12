// runtime/modules/a11y.js — Accessibility syscall layer (logic in Rust/WASM)

const _cbs = new Map();

const wasmImports = {
  a11y: {
    setAttribute(elId, name, value) {
      document.getElementById(elId).setAttribute(name, value);
    },

    setRole(elId, role) {
      document.getElementById(elId).setAttribute('role', role);
    },

    setTabIndex(elId, index) {
      document.getElementById(elId).tabIndex = index;
    },

    addKeydownHandler(elId, cbIdx) {
      document.getElementById(elId).addEventListener('keydown', e => {
        _cbs.get(cbIdx)?.(e.key, e.shiftKey, e.ctrlKey);
      });
    },

    createSkipLink(targetId) {
      const a = document.createElement('a');
      a.href = `#${targetId}`;
      a.className = 'nectar-skip-nav';
      a.textContent = 'Skip to main content';
      document.body.prepend(a);
    },

    setAriaLive(elId, mode) {
      document.getElementById(elId).setAttribute('aria-live', mode);
    },

    announce(text) {
      let region = document.getElementById('nectar-a11y-live');
      if (!region) {
        region = document.createElement('div');
        region.id = 'nectar-a11y-live';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(region);
      }
      region.textContent = text;
    },

    focus(elId) {
      document.getElementById(elId).focus();
    },

    trapFocus(containerId) {
      const container = document.getElementById(containerId);
      const focusable = container.querySelectorAll('button,a,[tabindex],input,textarea,select');
      container.addEventListener('keydown', e => {
        _cbs.get('__trapFocus')?.(containerId, e.key, e.shiftKey);
      });
    },
  },
};

module.exports = { name: 'a11y', runtime: { _cbs }, wasmImports };
