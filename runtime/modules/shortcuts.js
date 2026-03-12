// runtime/modules/shortcuts.js — Keyboard syscall layer (logic in Rust/WASM)

const _cbs = new Map();
const _handlers = new Map();
const _events = new Map();
let _nextEvent = 1;

const wasmImports = {
  shortcuts: {
    addKeydownListener(cbIdx) {
      const handler = e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(cbIdx)?.(eid, e.key, e.ctrlKey, e.shiftKey, e.altKey, e.metaKey);
      };
      document.addEventListener('keydown', handler);
      _handlers.set(cbIdx, handler);
    },

    removeKeydownListener(cbIdx) {
      document.removeEventListener('keydown', _handlers.get(cbIdx));
      _handlers.delete(cbIdx);
    },

    getKeyEvent(eventId) {
      const e = _events.get(eventId);
      return { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
    },

    preventDefault(eventId) {
      _events.get(eventId).preventDefault();
    },
  },
};

module.exports = { name: 'shortcuts', runtime: { _cbs, _handlers, _events }, wasmImports };
