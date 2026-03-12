// runtime/modules/shortcuts.js — Keyboard shortcut runtime

const ShortcutRuntime = {
  _shortcuts: new Map(),
  _listening: false,

  register(readString, keysPtr, keysLen, callbackId, _componentLen) {
    const keys = readString(keysPtr, keysLen).toLowerCase();
    ShortcutRuntime._shortcuts.set(keys, callbackId);

    if (!ShortcutRuntime._listening) {
      document.addEventListener('keydown', ShortcutRuntime._handler);
      ShortcutRuntime._listening = true;
    }
  },

  unregister(readString, keysPtr, keysLen) {
    const keys = readString(keysPtr, keysLen).toLowerCase();
    ShortcutRuntime._shortcuts.delete(keys);
  },

  _handler(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    const key = e.key.toLowerCase();
    if (!['control', 'shift', 'alt', 'meta'].includes(key)) parts.push(key);
    const combo = parts.join('+');

    const callbackId = ShortcutRuntime._shortcuts.get(combo);
    if (callbackId !== undefined) {
      e.preventDefault();
      // Invoke the WASM callback
      if (typeof instance !== 'undefined' && instance.exports[`__shortcut_${callbackId}`]) {
        instance.exports[`__shortcut_${callbackId}`]();
      }
    }
  },
};

const shortcutsModule = {
  name: 'shortcuts',
  runtime: ShortcutRuntime,
  wasmImports: {
    shortcuts: {
      register: ShortcutRuntime.register,
      unregister: ShortcutRuntime.unregister,
    }
  }
};

if (typeof module !== "undefined") module.exports = shortcutsModule;
