// std_mask.js — Nectar standard library: input masking
export const name = 'std_mask';

export const runtime = `
  const __nectar_mask = {
    phone(value) {
      const digits = value.replace(/\\D/g, '').slice(0, 10);
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return '(' + digits.slice(0,3) + ') ' + digits.slice(3);
      return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
    },
    currency(value) {
      const num = value.replace(/[^\\d.]/g, '');
      const parts = num.split('.');
      parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
      if (parts[1]) parts[1] = parts[1].slice(0, 2);
      return '$' + parts.join('.');
    },
    credit_card(value) {
      const digits = value.replace(/\\D/g, '').slice(0, 16);
      return digits.replace(/(\\d{4})(?=\\d)/g, '$1 ');
    },
    pattern(value, mask) {
      // mask uses # for digit, A for letter, * for any
      let result = '';
      let vi = 0;
      for (let mi = 0; mi < mask.length && vi < value.length; mi++) {
        const m = mask[mi];
        if (m === '#') {
          if (/\\d/.test(value[vi])) result += value[vi++];
          else vi++;
        } else if (m === 'A') {
          if (/[a-zA-Z]/.test(value[vi])) result += value[vi++];
          else vi++;
        } else if (m === '*') {
          result += value[vi++];
        } else {
          result += m;
          if (value[vi] === m) vi++;
        }
      }
      return result;
    },
  };
`;

export const wasmImports = {
  std_mask: {
    phone(ptr, len) {
      const val = NectarRuntime.__getString(ptr, len);
      return NectarRuntime.__allocString(__nectar_mask.phone(val));
    },
    currency(ptr, len) {
      const val = NectarRuntime.__getString(ptr, len);
      return NectarRuntime.__allocString(__nectar_mask.currency(val));
    },
    credit_card(ptr, len) {
      const val = NectarRuntime.__getString(ptr, len);
      return NectarRuntime.__allocString(__nectar_mask.credit_card(val));
    },
    pattern(valPtr, valLen, maskPtr, maskLen) {
      const val = NectarRuntime.__getString(valPtr, valLen);
      const mask = NectarRuntime.__getString(maskPtr, maskLen);
      return NectarRuntime.__allocString(__nectar_mask.pattern(val, mask));
    },
  },
};
