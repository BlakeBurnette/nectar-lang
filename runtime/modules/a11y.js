// runtime/modules/a11y.js — automatic accessibility runtime

const A11yRuntime = {
  enhance(readString, componentPtr, componentLen) {
    const name = readString(componentPtr, componentLen);
    const root = document.querySelector(`[data-nectar-component="${name}"]`);
    if (!root) return;

    // Auto-add keyboard handlers to interactive elements
    root.querySelectorAll('[on\\:click]:not(button):not(a)').forEach(el => {
      if (!el.getAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button');
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });

    // Auto-add ARIA to form fields
    root.querySelectorAll('input, textarea, select').forEach(el => {
      const label = el.closest('label') || root.querySelector(`label[for="${el.id}"]`);
      if (label && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
        const id = el.id || `nectar-input-${A11yRuntime._nextId++}`;
        el.id = id;
        label.setAttribute('for', id);
      }
    });

    // Auto-fix heading hierarchy
    let expectedLevel = 1;
    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (level > expectedLevel + 1) {
        h.setAttribute('aria-level', String(expectedLevel + 1));
      }
      expectedLevel = Math.min(level, expectedLevel + 1);
    });

    // Auto-add aria-live for dynamic content regions
    root.querySelectorAll('[data-nectar-reactive]').forEach(el => {
      if (!el.getAttribute('aria-live')) {
        el.setAttribute('aria-live', 'polite');
      }
    });

    // Detect dropdown patterns (div with click + conditional list)
    root.querySelectorAll('[on\\:click]').forEach(trigger => {
      const list = trigger.querySelector('ul, [role="listbox"]');
      if (list && !trigger.getAttribute('role')) {
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        list.setAttribute('role', 'listbox');
        list.querySelectorAll('li').forEach(li => {
          li.setAttribute('role', 'option');
          if (!li.getAttribute('tabindex')) li.setAttribute('tabindex', '0');
        });
      }
    });

    // Auto-add skip navigation
    const nav = root.querySelector('nav');
    const main = root.querySelector('main');
    if (nav && main && !root.querySelector('.nectar-skip-nav')) {
      const skip = document.createElement('a');
      skip.href = '#main-content';
      skip.className = 'nectar-skip-nav';
      skip.textContent = 'Skip to main content';
      skip.style.cssText = 'position:absolute;left:-9999px;top:0;z-index:9999;padding:8px 16px;background:#000;color:#fff;';
      skip.addEventListener('focus', () => { skip.style.left = '0'; });
      skip.addEventListener('blur', () => { skip.style.left = '-9999px'; });
      root.prepend(skip);
      if (!main.id) main.id = 'main-content';
    }
  },

  trapFocus(readString, containerPtr, containerLen) {
    const selector = readString(containerPtr, containerLen);
    const container = document.querySelector(selector);
    if (!container) return;
    const focusable = container.querySelectorAll('button,a,[tabindex],input,textarea,select');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === 'Escape') container.dispatchEvent(new Event('close'));
    });
    first.focus();
  },

  announce(readString, msgPtr, msgLen) {
    const msg = readString(msgPtr, msgLen);
    let region = document.getElementById('nectar-a11y-live');
    if (!region) {
      region = document.createElement('div');
      region.id = 'nectar-a11y-live';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      region.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
      document.body.appendChild(region);
    }
    region.textContent = msg;
  },

  checkContrast(readString, fgPtr, fgLen, bgPtr, bgLen) {
    const fg = readString(fgPtr, fgLen);
    const bg = readString(bgPtr, bgLen);
    // Calculate relative luminance and contrast ratio
    const lum = (hex) => {
      const r = parseInt(hex.slice(1,3),16)/255;
      const g = parseInt(hex.slice(3,5),16)/255;
      const b = parseInt(hex.slice(5,7),16)/255;
      const srgb = [r,g,b].map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
      return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
    };
    const l1 = Math.max(lum(fg), lum(bg));
    const l2 = Math.min(lum(fg), lum(bg));
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    return ratio >= 4.5 ? 1 : 0; // WCAG AA for normal text
  },

  _nextId: 1,
};

module.exports = {
  name: 'a11y',
  runtime: A11yRuntime,
  wasmImports: {
    a11y: {
      enhance: A11yRuntime.enhance,
      trapFocus: A11yRuntime.trapFocus,
      announce: A11yRuntime.announce,
      checkContrast: A11yRuntime.checkContrast,
    }
  }
};
