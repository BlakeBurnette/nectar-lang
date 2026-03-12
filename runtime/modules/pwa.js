// runtime/modules/pwa.js — PWA + Hardware syscall layer (logic in Rust/WASM)

const _cbs = new Map();
const _events = new Map();
let _nextEvent = 1;

const wasmImports = {
  pwa: {
    registerManifest(href) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = href;
      document.head.appendChild(link);
    },

    cachePrecache(cacheName, urlsJson) {
      return caches.open(cacheName).then(cache => cache.addAll(JSON.parse(urlsJson)));
    },

    registerServiceWorker(path) {
      if (!('serviceWorker' in navigator)) return Promise.resolve(null);
      return navigator.serviceWorker.register(path);
    },

    registerPush(registrationId, optionsJson) {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve(null);
      return navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.subscribe(JSON.parse(optionsJson))
      );
    },

    haptic(pattern) {
      if (navigator.vibrate) navigator.vibrate(pattern);
    },

    biometricAuth(optionsJson) {
      if (!navigator.credentials) return Promise.resolve(null);
      return navigator.credentials.get(JSON.parse(optionsJson));
    },

    cameraCapture(constraintsJson) {
      if (!navigator.mediaDevices) return Promise.resolve(null);
      return navigator.mediaDevices.getUserMedia(JSON.parse(constraintsJson));
    },

    geolocationCurrent(cbIdx) {
      navigator.geolocation.getCurrentPosition(
        pos => _cbs.get(cbIdx)?.(1, pos.coords.latitude, pos.coords.longitude),
        err => _cbs.get(cbIdx)?.(0, 0, 0)
      );
    },

    addPointerDown(elId, cbIdx) {
      document.getElementById(elId).addEventListener('pointerdown', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(cbIdx)?.(eid, e.clientX, e.clientY);
      });
    },

    addPointerMove(elId, cbIdx) {
      document.getElementById(elId).addEventListener('pointermove', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(cbIdx)?.(eid, e.clientX, e.clientY);
      });
    },

    addPointerUp(elId, cbIdx) {
      document.getElementById(elId).addEventListener('pointerup', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(cbIdx)?.(eid, e.clientX, e.clientY);
      });
    },
  },
};

module.exports = { name: 'pwa', runtime: { _cbs, _events }, wasmImports };
