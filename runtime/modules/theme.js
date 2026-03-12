// runtime/modules/theme.js — opt-in theming runtime

const ThemeRuntime = {
  _themes: {},
  _current: null,

  init(readString, namePtr, nameLen, configPtr, configLen) {
    const name = readString(namePtr, nameLen);
    const config = JSON.parse(readString(configPtr, configLen));
    ThemeRuntime._themes = config;

    // Check saved preference, then OS preference
    const saved = localStorage.getItem('nectar-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'dark' : 'light');
    ThemeRuntime._apply(initial);

    // Listen for OS preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('nectar-theme')) {
        ThemeRuntime._apply(e.matches ? 'dark' : 'light');
      }
    });
  },

  toggle() {
    const next = ThemeRuntime._current === 'light' ? 'dark' : 'light';
    ThemeRuntime.set(next);
  },

  set(themePtr, themeLen) {
    const theme = typeof themePtr === 'string' ? themePtr : readString(themePtr, themeLen);
    localStorage.setItem('nectar-theme', theme);
    ThemeRuntime._apply(theme);
  },

  getCurrent() { return ThemeRuntime._current; },

  _apply(mode) {
    ThemeRuntime._current = mode;
    let vars = ThemeRuntime._themes[mode] || {};

    // Auto-generate dark theme from light if darkAuto is enabled
    if (mode === 'dark' && !ThemeRuntime._themes.dark && ThemeRuntime._themes.darkAuto && ThemeRuntime._themes.light) {
      vars = ThemeRuntime._generateDark(ThemeRuntime._themes.light);
    }

    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(`--theme-${key}`, value);
    }
    root.setAttribute('data-theme', mode);
  },

  // Auto-generate dark theme from light by flipping luminance
  _generateDark(light) {
    const dark = {};
    for (const [key, value] of Object.entries(light)) {
      if (typeof value === 'string' && value.startsWith('#') && value.length === 7) {
        const r = parseInt(value.slice(1,3), 16);
        const g = parseInt(value.slice(3,5), 16);
        const b = parseInt(value.slice(5,7), 16);
        // Invert luminance, preserve hue
        const dr = 255 - r, dg = 255 - g, db = 255 - b;
        dark[key] = `#${dr.toString(16).padStart(2,'0')}${dg.toString(16).padStart(2,'0')}${db.toString(16).padStart(2,'0')}`;
      } else {
        dark[key] = value;
      }
    }
    return dark;
  },
};

module.exports = {
  name: 'theme',
  runtime: ThemeRuntime,
  wasmImports: {
    theme: {
      init: ThemeRuntime.init,
      toggle: ThemeRuntime.toggle,
      set: ThemeRuntime.set,
      getCurrent: ThemeRuntime.getCurrent,
    }
  }
};
