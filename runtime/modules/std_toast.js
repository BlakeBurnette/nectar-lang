// std_toast.js — Nectar standard library: toast notifications
export const name = 'std_toast';

export const runtime = `
  const __nectar_toast = {
    _container: null,
    _queue: [],

    _ensureContainer() {
      if (this._container) return;
      this._container = document.createElement('div');
      this._container.id = 'nectar-toast-container';
      this._container.setAttribute('role', 'status');
      this._container.setAttribute('aria-live', 'polite');
      this._container.setAttribute('aria-atomic', 'true');
      Object.assign(this._container.style, {
        position: 'fixed', top: '16px', right: '16px', zIndex: '9999',
        display: 'flex', flexDirection: 'column', gap: '8px',
        pointerEvents: 'none', maxWidth: '400px',
      });
      document.body.appendChild(this._container);
    },

    show(message, type = 'info', duration = 4000) {
      this._ensureContainer();
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      const colors = {
        success: { bg: '#10b981', icon: '\u2713' },
        error: { bg: '#ef4444', icon: '\u2717' },
        warning: { bg: '#f59e0b', icon: '\u26A0' },
        info: { bg: '#3b82f6', icon: '\u2139' },
      };
      const c = colors[type] || colors.info;
      Object.assign(el.style, {
        background: c.bg, color: '#fff', padding: '12px 20px',
        borderRadius: '8px', fontSize: '14px', fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', pointerEvents: 'auto',
        display: 'flex', alignItems: 'center', gap: '8px',
        animation: 'nectar-toast-in 0.3s ease',
        opacity: '1', transition: 'opacity 0.3s, transform 0.3s',
      });
      el.innerHTML = '<span style="font-size:16px">' + c.icon + '</span><span>' + message + '</span>';
      this._container.appendChild(el);

      if (duration > 0) {
        setTimeout(() => {
          el.style.opacity = '0';
          el.style.transform = 'translateX(100%)';
          setTimeout(() => el.remove(), 300);
        }, duration);
      }

      // Add animation keyframes if not already present
      if (!document.getElementById('nectar-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'nectar-toast-styles';
        style.textContent = '@keyframes nectar-toast-in{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(style);
      }

      return el;
    },

    success(message, duration) { return this.show(message, 'success', duration); },
    error(message, duration) { return this.show(message, 'error', duration); },
    warning(message, duration) { return this.show(message, 'warning', duration); },
    info(message, duration) { return this.show(message, 'info', duration); },

    dismiss_all() {
      if (this._container) this._container.innerHTML = '';
    },
  };
`;

export const wasmImports = {
  std_toast: {
    success(msgPtr, msgLen, duration) {
      __nectar_toast.success(NectarRuntime.__getString(msgPtr, msgLen), duration);
    },
    error(msgPtr, msgLen, duration) {
      __nectar_toast.error(NectarRuntime.__getString(msgPtr, msgLen), duration);
    },
    warning(msgPtr, msgLen, duration) {
      __nectar_toast.warning(NectarRuntime.__getString(msgPtr, msgLen), duration);
    },
    info(msgPtr, msgLen, duration) {
      __nectar_toast.info(NectarRuntime.__getString(msgPtr, msgLen), duration);
    },
    dismiss_all() {
      __nectar_toast.dismiss_all();
    },
  },
};
