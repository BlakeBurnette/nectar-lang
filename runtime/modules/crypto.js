// runtime/modules/crypto.js — cryptography builtins runtime

const CryptoRuntime = {
  async sha256(readString, inputPtr, inputLen) {
    const data = new TextEncoder().encode(readString(inputPtr, inputLen));
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  },
  async sha512(readString, inputPtr, inputLen) {
    const data = new TextEncoder().encode(readString(inputPtr, inputLen));
    const hash = await crypto.subtle.digest('SHA-512', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  },
  async hmac(readString, keyPtr, keyLen, dataPtr, dataLen) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(readString(keyPtr, keyLen)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(readString(dataPtr, dataLen)));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  },
  async encrypt(readString, plainPtr, plainLen, keyPtr, keyLen) {
    const keyData = new TextEncoder().encode(readString(keyPtr, keyLen)).slice(0, 32);
    const key = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(readString(plainPtr, plainLen)));
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  },
  async decrypt(readString, cipherPtr, cipherLen, keyPtr, keyLen) {
    const keyData = new TextEncoder().encode(readString(keyPtr, keyLen)).slice(0, 32);
    const key = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['decrypt']);
    const combined = Uint8Array.from(atob(readString(cipherPtr, cipherLen)), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  },
  async sign(readString, msgPtr, msgLen, keyPtr, keyLen) {
    const keyData = await crypto.subtle.importKey('raw', new TextEncoder().encode(readString(keyPtr, keyLen)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', keyData, new TextEncoder().encode(readString(msgPtr, msgLen)));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  },
  async verify(readString, msgPtr, msgLen, sigPtr, sigLen, keyPtr, keyLen) {
    const keyData = await crypto.subtle.importKey('raw', new TextEncoder().encode(readString(keyPtr, keyLen)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = new Uint8Array(readString(sigPtr, sigLen).match(/.{2}/g).map(b => parseInt(b, 16)));
    return await crypto.subtle.verify('HMAC', keyData, sigBytes, new TextEncoder().encode(readString(msgPtr, msgLen))) ? 1 : 0;
  },
  async deriveKey(readString, passPtr, passLen, saltPtr, saltLen) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(readString(passPtr, passLen)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(readString(saltPtr, saltLen)), iterations: 100000, hash: 'SHA-256' }, key, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
  },
  randomUUID() { return crypto.randomUUID(); },
  randomBytes(n) { return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2,'0')).join(''); },
};

module.exports = {
  name: 'crypto',
  runtime: CryptoRuntime,
  wasmImports: { crypto: {
    sha256: CryptoRuntime.sha256, sha512: CryptoRuntime.sha512,
    hmac: CryptoRuntime.hmac, encrypt: CryptoRuntime.encrypt, decrypt: CryptoRuntime.decrypt,
    sign: CryptoRuntime.sign, verify: CryptoRuntime.verify, deriveKey: CryptoRuntime.deriveKey,
    randomUUID: CryptoRuntime.randomUUID, randomBytes: CryptoRuntime.randomBytes,
  }}
};
