// runtime/modules/seo.js — Pure syscall layer for SEO DOM manipulation
// ALL logic (sitemap generation, robots.txt, route registry) lives in Rust/WASM.

export const name = 'seo';
export const runtime = ``;
export const wasmImports = {
  seo: {
    setTitle(ptr, len) { document.title = NectarRuntime.__getString(ptr, len); },
    setMeta(namePtr, nameLen, contentPtr, contentLen) { let el = document.querySelector('meta[name="' + NectarRuntime.__getString(namePtr, nameLen) + '"]'); if (!el) { el = document.createElement('meta'); el.name = NectarRuntime.__getString(namePtr, nameLen); document.head.appendChild(el); } el.content = NectarRuntime.__getString(contentPtr, contentLen); },
    setOgMeta(propPtr, propLen, contentPtr, contentLen) { let el = document.querySelector('meta[property="' + NectarRuntime.__getString(propPtr, propLen) + '"]'); if (!el) { el = document.createElement('meta'); el.setAttribute('property', NectarRuntime.__getString(propPtr, propLen)); document.head.appendChild(el); } el.content = NectarRuntime.__getString(contentPtr, contentLen); },
    setCanonical(urlPtr, urlLen) { let el = document.querySelector('link[rel="canonical"]'); if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); } el.href = NectarRuntime.__getString(urlPtr, urlLen); },
    addJsonLd(jsonPtr, jsonLen) { const el = document.createElement('script'); el.type = 'application/ld+json'; el.textContent = NectarRuntime.__getString(jsonPtr, jsonLen); document.head.appendChild(el); },
    getOuterHtml() { return NectarRuntime.__allocString(document.documentElement.outerHTML); },
  },
};

if (typeof module !== "undefined") module.exports = { name, runtime, wasmImports };
