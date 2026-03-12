// runtime/modules/core.js — Pure syscall layer for DOM, memory, timers, navigation, console
// ALL logic (reactive graph, scheduling, routing, worker pools, agents) lives in Rust/WASM.
//
// DOM strategy:
//   - Initial render: WASM builds HTML string in linear memory, single mount() call sets innerHTML
//   - Updates: WASM writes batched opcodes into linear memory, single flush() call per frame
//   - This collapses ~50 individual WASM→JS boundary crossings into 1-2 per frame

// ── Opcode constants for the command buffer ─────────────────────────────────
const OP_SET_TEXT       = 1;
const OP_SET_ATTR       = 2;
const OP_REMOVE_ATTR    = 3;
const OP_APPEND_CHILD   = 4;
const OP_REMOVE_CHILD   = 5;
const OP_INSERT_BEFORE  = 6;
const OP_SET_STYLE      = 7;
const OP_CLASS_ADD      = 8;
const OP_CLASS_REMOVE   = 9;
const OP_CLASS_TOGGLE   = 10;
const OP_SET_INNER_HTML = 11;
const OP_ADD_EVENT      = 12;
const OP_REMOVE_EVENT   = 13;

// ── Element registry — thin object pool for DOM references ──────────────────
const NectarRuntime = {
  __elements: [null], // index 0 = null sentinel
  __objects: [null],
  __callbacks: [],
  __memory: null,
  __instance: null,
  __decoder: new TextDecoder(),
  __encoder: new TextEncoder(),

  __registerElement(el) {
    if (!el) return 0;
    this.__elements.push(el);
    return this.__elements.length - 1;
  },

  __getElement(id) {
    return this.__elements[id];
  },

  __registerObject(obj) {
    if (!obj) return 0;
    this.__objects.push(obj);
    return this.__objects.length - 1;
  },

  __getObject(id) {
    return this.__objects[id];
  },

  __registerNodeList(nl) {
    const ids = [];
    for (let i = 0; i < nl.length; i++) ids.push(this.__registerElement(nl[i]));
    return ids;
  },

  __getString(ptr, len) {
    return this.__decoder.decode(new Uint8Array(this.__memory.buffer, ptr, len));
  },

  __allocString(str) {
    const bytes = this.__encoder.encode(str);
    const ptr = this.__instance.exports.alloc(bytes.length);
    new Uint8Array(this.__memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  },

  __init(instance) {
    this.__instance = instance;
    this.__memory = instance.exports.memory;
  },
};

// ── Helpers for flush() ─────────────────────────────────────────────────────

// Read a u32 from the command buffer at the given byte offset, advance offset by 4
function readU32(buf, off) {
  return buf[off >>> 2]; // buf is Uint32Array — off is byte offset, convert to u32 index
}

// Read a string from WASM memory given (ptr, len) packed as two consecutive u32s in the buffer
function readStr(mem, buf, idx) {
  const ptr = buf[idx];
  const len = buf[idx + 1];
  return NectarRuntime.__decoder.decode(new Uint8Array(mem, ptr, len));
}

export const name = 'core';
export const runtime = ``;
export const wasmImports = {
  dom: {
    // ── Initial mount: WASM builds full HTML string, single call sets innerHTML ──
    mount(containerElId, htmlPtr, htmlLen) {
      const container = NectarRuntime.__getElement(containerElId);
      const html = NectarRuntime.__getString(htmlPtr, htmlLen);
      container.innerHTML = html;
    },

    // ── Hydration: after mount, walk data-nid attributes and register element handles ──
    // Returns the count of hydrated elements. WASM can then reference them by their nid.
    hydrateRefs(containerElId) {
      const container = NectarRuntime.__getElement(containerElId);
      const nodes = container.querySelectorAll('[data-nid]');
      let count = 0;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const nid = parseInt(node.getAttribute('data-nid'), 10);
        // Ensure the __elements pool is large enough and place the element at its nid slot
        while (NectarRuntime.__elements.length <= nid) {
          NectarRuntime.__elements.push(null);
        }
        NectarRuntime.__elements[nid] = node;
        count++;
      }
      return count;
    },

    // ── Command buffer flush: read batched opcodes from WASM linear memory ──────
    // bufPtr = byte offset into WASM memory where the command buffer starts
    // bufLen = number of bytes written (must be multiple of 4)
    flush(bufPtr, bufLen) {
      const mem = NectarRuntime.__memory.buffer;
      const buf = new Uint32Array(mem, bufPtr, bufLen >>> 2);
      const elements = NectarRuntime.__elements;
      const decoder = NectarRuntime.__decoder;
      const instance = NectarRuntime.__instance;
      let i = 0;
      const end = buf.length;

      while (i < end) {
        const op = buf[i++];
        switch (op) {

          // SET_TEXT elId, textPtr, textLen
          case OP_SET_TEXT: {
            const elId = buf[i++];
            const ptr = buf[i++];
            const len = buf[i++];
            elements[elId].textContent = decoder.decode(new Uint8Array(mem, ptr, len));
            break;
          }

          // SET_ATTR elId, keyPtr, keyLen, valPtr, valLen
          case OP_SET_ATTR: {
            const elId = buf[i++];
            const kp = buf[i++];
            const kl = buf[i++];
            const vp = buf[i++];
            const vl = buf[i++];
            elements[elId].setAttribute(
              decoder.decode(new Uint8Array(mem, kp, kl)),
              decoder.decode(new Uint8Array(mem, vp, vl))
            );
            break;
          }

          // REMOVE_ATTR elId, keyPtr, keyLen
          case OP_REMOVE_ATTR: {
            const elId = buf[i++];
            const kp = buf[i++];
            const kl = buf[i++];
            elements[elId].removeAttribute(decoder.decode(new Uint8Array(mem, kp, kl)));
            break;
          }

          // APPEND_CHILD parentId, childId
          case OP_APPEND_CHILD: {
            const parentId = buf[i++];
            const childId = buf[i++];
            elements[parentId].appendChild(elements[childId]);
            break;
          }

          // REMOVE_CHILD parentId, childId
          case OP_REMOVE_CHILD: {
            const parentId = buf[i++];
            const childId = buf[i++];
            elements[parentId].removeChild(elements[childId]);
            break;
          }

          // INSERT_BEFORE parentId, newChildId, refChildId
          case OP_INSERT_BEFORE: {
            const parentId = buf[i++];
            const newId = buf[i++];
            const refId = buf[i++];
            elements[parentId].insertBefore(elements[newId], elements[refId]);
            break;
          }

          // SET_STYLE elId, propPtr, propLen, valPtr, valLen
          case OP_SET_STYLE: {
            const elId = buf[i++];
            const pp = buf[i++];
            const pl = buf[i++];
            const vp = buf[i++];
            const vl = buf[i++];
            elements[elId].style.setProperty(
              decoder.decode(new Uint8Array(mem, pp, pl)),
              decoder.decode(new Uint8Array(mem, vp, vl))
            );
            break;
          }

          // CLASS_ADD elId, clsPtr, clsLen
          case OP_CLASS_ADD: {
            const elId = buf[i++];
            const cp = buf[i++];
            const cl = buf[i++];
            elements[elId].classList.add(decoder.decode(new Uint8Array(mem, cp, cl)));
            break;
          }

          // CLASS_REMOVE elId, clsPtr, clsLen
          case OP_CLASS_REMOVE: {
            const elId = buf[i++];
            const cp = buf[i++];
            const cl = buf[i++];
            elements[elId].classList.remove(decoder.decode(new Uint8Array(mem, cp, cl)));
            break;
          }

          // CLASS_TOGGLE elId, clsPtr, clsLen
          case OP_CLASS_TOGGLE: {
            const elId = buf[i++];
            const cp = buf[i++];
            const cl = buf[i++];
            elements[elId].classList.toggle(decoder.decode(new Uint8Array(mem, cp, cl)));
            break;
          }

          // SET_INNER_HTML elId, htmlPtr, htmlLen
          case OP_SET_INNER_HTML: {
            const elId = buf[i++];
            const hp = buf[i++];
            const hl = buf[i++];
            elements[elId].innerHTML = decoder.decode(new Uint8Array(mem, hp, hl));
            break;
          }

          // ADD_EVENT elId, evtPtr, evtLen, cbIdx
          case OP_ADD_EVENT: {
            const elId = buf[i++];
            const ep = buf[i++];
            const el = buf[i++];
            const cbIdx = buf[i++];
            const evtName = decoder.decode(new Uint8Array(mem, ep, el));
            const handler = () => instance.exports.__callback(cbIdx);
            NectarRuntime.__callbacks[cbIdx] = handler;
            elements[elId].addEventListener(evtName, handler);
            break;
          }

          // REMOVE_EVENT elId, evtPtr, evtLen, cbIdx
          case OP_REMOVE_EVENT: {
            const elId = buf[i++];
            const ep = buf[i++];
            const el = buf[i++];
            const cbIdx = buf[i++];
            const evtName = decoder.decode(new Uint8Array(mem, ep, el));
            elements[elId].removeEventListener(evtName, NectarRuntime.__callbacks[cbIdx]);
            break;
          }

          default:
            console.error('[nectar] unknown flush opcode:', op, 'at index', i - 1);
            return; // bail on unknown opcode to avoid reading garbage
        }
      }
    },

    // ── Individual DOM lookups (kept as syscalls — infrequent, need return values) ──
    getElementById(idPtr, idLen) {
      return NectarRuntime.__registerElement(document.getElementById(NectarRuntime.__getString(idPtr, idLen)));
    },

    querySelector(selPtr, selLen) {
      return NectarRuntime.__registerElement(document.querySelector(NectarRuntime.__getString(selPtr, selLen)));
    },

    getBody() {
      return NectarRuntime.__registerElement(document.body);
    },

    getHead() {
      return NectarRuntime.__registerElement(document.head);
    },

    getRoot() {
      return NectarRuntime.__registerElement(document.getElementById('app') || document.body);
    },

    // ── Event listeners as individual syscalls (need callback registration) ──
    addEventListener(elId, evtPtr, evtLen, cbIdx) {
      const handler = () => NectarRuntime.__instance.exports.__callback(cbIdx);
      NectarRuntime.__callbacks[cbIdx] = handler;
      NectarRuntime.__getElement(elId).addEventListener(
        NectarRuntime.__getString(evtPtr, evtLen),
        handler
      );
    },

    removeEventListener(elId, evtPtr, evtLen, cbIdx) {
      NectarRuntime.__getElement(elId).removeEventListener(
        NectarRuntime.__getString(evtPtr, evtLen),
        NectarRuntime.__callbacks[cbIdx]
      );
    },

    // ── Lazy component mounting ──
    lazyMount(containerElId, urlPtr, urlLen, cbIdx) {
      const container = NectarRuntime.__getElement(containerElId);
      const url = NectarRuntime.__getString(urlPtr, urlLen);
      import(url).then((mod) => {
        if (mod && mod.default) {
          mod.default(container);
        }
        NectarRuntime.__instance.exports.__callback(cbIdx);
      });
    },
  },

  mem: {
    getString(ptr, len) { return NectarRuntime.__getString(ptr, len); },
    allocString(strPtr, strLen) { return NectarRuntime.__allocString(NectarRuntime.__getString(strPtr, strLen)); },
    readI32(ptr) { return new DataView(NectarRuntime.__memory.buffer).getInt32(ptr, true); },
    writeI32(ptr, val) { new DataView(NectarRuntime.__memory.buffer).setInt32(ptr, val, true); },
    readF64(ptr) { return new DataView(NectarRuntime.__memory.buffer).getFloat64(ptr, true); },
    writeF64(ptr, val) { new DataView(NectarRuntime.__memory.buffer).setFloat64(ptr, val, true); },
  },

  timer: {
    setTimeout(cbIdx, ms) { return setTimeout(() => NectarRuntime.__instance.exports.__callback(cbIdx), ms); },
    clearTimeout(id) { clearTimeout(id); },
    setInterval(cbIdx, ms) { return setInterval(() => NectarRuntime.__instance.exports.__callback(cbIdx), ms); },
    clearInterval(id) { clearInterval(id); },
    requestAnimationFrame(cbIdx) { return requestAnimationFrame(() => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    cancelAnimationFrame(id) { cancelAnimationFrame(id); },
    now() { return performance.now(); },
  },

  nav: {
    pushState(urlPtr, urlLen) { history.pushState(null, '', NectarRuntime.__getString(urlPtr, urlLen)); },
    replaceState(urlPtr, urlLen) { history.replaceState(null, '', NectarRuntime.__getString(urlPtr, urlLen)); },
    getHref() { return NectarRuntime.__allocString(location.href); },
    getPathname() { return NectarRuntime.__allocString(location.pathname); },
    getSearch() { return NectarRuntime.__allocString(location.search); },
    getHash() { return NectarRuntime.__allocString(location.hash); },
    onPopState(cbIdx) { window.addEventListener('popstate', () => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    setHref(urlPtr, urlLen) { location.href = NectarRuntime.__getString(urlPtr, urlLen); },
  },

  console: {
    log(ptr, len) { console.log(NectarRuntime.__getString(ptr, len)); },
    warn(ptr, len) { console.warn(NectarRuntime.__getString(ptr, len)); },
    error(ptr, len) { console.error(NectarRuntime.__getString(ptr, len)); },
    debug(ptr, len) { console.debug(NectarRuntime.__getString(ptr, len)); },
  },

  net: {
    fetch(urlPtr, urlLen, optsPtr, optsLen) {
      const url = NectarRuntime.__getString(urlPtr, urlLen);
      const opts = optsLen > 0 ? JSON.parse(NectarRuntime.__getString(optsPtr, optsLen)) : {};
      const id = NectarRuntime.__registerObject(fetch(url, opts));
      return id;
    },
  },

  observe: {
    matchMedia(queryPtr, queryLen) { return matchMedia(NectarRuntime.__getString(queryPtr, queryLen)).matches ? 1 : 0; },
    intersectionObserver(cbIdx, optsPtr, optsLen) {
      const opts = optsLen > 0 ? JSON.parse(NectarRuntime.__getString(optsPtr, optsLen)) : {};
      const obs = new IntersectionObserver((entries) => NectarRuntime.__instance.exports.__callback(cbIdx), opts);
      return NectarRuntime.__registerObject(obs);
    },
    observe(obsId, elId) { NectarRuntime.__getObject(obsId).observe(NectarRuntime.__getElement(elId)); },
    unobserve(obsId, elId) { NectarRuntime.__getObject(obsId).unobserve(NectarRuntime.__getElement(elId)); },
    disconnect(obsId) { NectarRuntime.__getObject(obsId).disconnect(); },
  },

  share: {
    canShare() { return navigator.share ? 1 : 0; },
    nativeShare(titlePtr, titleLen, textPtr, textLen, urlPtr, urlLen) {
      if (!navigator.share) return 0;
      navigator.share({
        title: NectarRuntime.__getString(titlePtr, titleLen),
        text: NectarRuntime.__getString(textPtr, textLen),
        url: NectarRuntime.__getString(urlPtr, urlLen),
      }).catch(() => {});
      return 1;
    },
  },
};

if (typeof module !== "undefined") module.exports = { name, runtime, wasmImports, NectarRuntime };
