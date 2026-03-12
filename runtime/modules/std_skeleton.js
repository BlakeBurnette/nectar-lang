// std_skeleton.js — Nectar standard library: skeleton loading states
export const name = 'std_skeleton';

export const runtime = `
  const __nectar_skeleton = {
    _injected: false,

    _injectStyles() {
      if (this._injected) return;
      this._injected = true;
      const style = document.createElement('style');
      style.textContent = \`
        .nectar-skeleton {
          background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
          background-size: 200% 100%;
          animation: nectar-shimmer 1.5s infinite ease-in-out;
          border-radius: 4px;
        }
        @keyframes nectar-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nectar-skeleton { animation: none; opacity: 0.7; }
        }
        [data-theme="dark"] .nectar-skeleton {
          background: linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%);
          background-size: 200% 100%;
        }
      \`;
      document.head.appendChild(style);
    },

    text(lines = 3, width = '100%') {
      this._injectStyles();
      const container = document.createElement('div');
      container.setAttribute('aria-hidden', 'true');
      container.setAttribute('role', 'presentation');
      for (let i = 0; i < lines; i++) {
        const line = document.createElement('div');
        line.className = 'nectar-skeleton';
        const w = i === lines - 1 ? '60%' : width;
        Object.assign(line.style, { height: '16px', marginBottom: '8px', width: w });
        container.appendChild(line);
      }
      return container;
    },

    circle(size = 48) {
      this._injectStyles();
      const el = document.createElement('div');
      el.className = 'nectar-skeleton';
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, {
        width: size + 'px', height: size + 'px', borderRadius: '50%',
      });
      return el;
    },

    rect(width = '100%', height = '200px') {
      this._injectStyles();
      const el = document.createElement('div');
      el.className = 'nectar-skeleton';
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, { width, height });
      return el;
    },

    card() {
      this._injectStyles();
      const card = document.createElement('div');
      card.setAttribute('aria-hidden', 'true');
      Object.assign(card.style, { padding: '16px' });
      card.appendChild(this.rect('100%', '180px'));
      const spacer = document.createElement('div');
      spacer.style.height = '12px';
      card.appendChild(spacer);
      card.appendChild(this.text(3));
      return card;
    },
  };
`;

export const wasmImports = {
  std_skeleton: {
    text(lines, widthPtr, widthLen) {
      const width = widthPtr ? NectarRuntime.__getString(widthPtr, widthLen) : '100%';
      return NectarRuntime.__registerElement(__nectar_skeleton.text(lines, width));
    },
    circle(size) {
      return NectarRuntime.__registerElement(__nectar_skeleton.circle(size));
    },
    rect(wPtr, wLen, hPtr, hLen) {
      const w = NectarRuntime.__getString(wPtr, wLen);
      const h = NectarRuntime.__getString(hPtr, hLen);
      return NectarRuntime.__registerElement(__nectar_skeleton.rect(w, h));
    },
    card() {
      return NectarRuntime.__registerElement(__nectar_skeleton.card());
    },
  },
};
