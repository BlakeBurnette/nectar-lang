// runtime/modules/responsive.js — Responsive breakpoint runtime

const ResponsiveRuntime = {
  _breakpoints: { mobile: 640, tablet: 1024, desktop: 1200 },
  _current: 'desktop',
  _listeners: [],

  registerBreakpoints(configPtr, configLen) {
    const config = JSON.parse(readString(configPtr, configLen));
    ResponsiveRuntime._breakpoints = config;
    ResponsiveRuntime._update();
    window.addEventListener('resize', () => ResponsiveRuntime._update());
  },

  getBreakpoint() { return ResponsiveRuntime._current; },

  _update() {
    const w = window.innerWidth;
    const bps = Object.entries(ResponsiveRuntime._breakpoints).sort((a, b) => a[1] - b[1]);
    let current = bps[bps.length - 1][0];
    for (const [name, px] of bps) {
      if (w < px) { current = name; break; }
    }
    if (current !== ResponsiveRuntime._current) {
      ResponsiveRuntime._current = current;
      ResponsiveRuntime._listeners.forEach(fn => fn(current));
    }
  },

  onChange(fn) { ResponsiveRuntime._listeners.push(fn); },
};

module.exports = {
  name: 'responsive',
  runtime: ResponsiveRuntime,
  wasmImports: {
    responsive: {
      registerBreakpoints: ResponsiveRuntime.registerBreakpoints,
      getBreakpoint: ResponsiveRuntime.getBreakpoint,
    }
  }
};
