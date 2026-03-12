// runtime/modules/animate.js — Animation syscall layer (logic in Rust/WASM)

const _cbs = new Map();

const wasmImports = {
  animate: {
    requestAnimationFrame(cbIdx) {
      return window.requestAnimationFrame(ts => _cbs.get(cbIdx)?.(ts));
    },

    cancelAnimationFrame(id) {
      window.cancelAnimationFrame(id);
    },

    setStyleProperty(elId, prop, value) {
      document.getElementById(elId).style.setProperty(prop, value);
    },

    addCssKeyframes(name, cssText) {
      const style = document.createElement('style');
      style.textContent = `@keyframes ${name} { ${cssText} }`;
      document.head.appendChild(style);
    },

    startCssAnimation(elId, name, duration, easing, iterations) {
      document.getElementById(elId).style.animation =
        `${name} ${duration}ms ${easing} ${iterations === 0 ? 'infinite' : iterations}`;
    },

    prefersReducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },
  },
};

module.exports = { name: 'animate', runtime: { _cbs }, wasmImports };
