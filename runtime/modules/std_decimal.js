// std_decimal.js — Nectar standard library: arbitrary precision decimals
export const name = 'std_decimal';

export const runtime = `
  // BigDecimal using string-based arithmetic for arbitrary precision
  class NectarBigDecimal {
    constructor(value, precision = 20) {
      this.value = typeof value === 'string' ? value : String(value);
      this.precision = precision;
    }

    add(other) {
      // Use scaled integer arithmetic for precision
      const [a, b, scale] = NectarBigDecimal._align(this.value, other.value);
      const result = (BigInt(a) + BigInt(b));
      return new NectarBigDecimal(NectarBigDecimal._unscale(result, scale));
    }

    sub(other) {
      const [a, b, scale] = NectarBigDecimal._align(this.value, other.value);
      const result = (BigInt(a) - BigInt(b));
      return new NectarBigDecimal(NectarBigDecimal._unscale(result, scale));
    }

    mul(other) {
      const [a, b, scaleA] = NectarBigDecimal._align(this.value, "0");
      const [c, d, scaleB] = NectarBigDecimal._align(other.value, "0");
      const result = BigInt(a) * BigInt(c);
      return new NectarBigDecimal(NectarBigDecimal._unscale(result, scaleA + scaleB));
    }

    div(other, precision = 20) {
      const scale = 10n ** BigInt(precision);
      const [a, b, s] = NectarBigDecimal._align(this.value, other.value);
      const result = (BigInt(a) * scale) / BigInt(b);
      return new NectarBigDecimal(NectarBigDecimal._unscale(result, precision));
    }

    eq(other) { return this.value === other.value; }
    gt(other) { return parseFloat(this.value) > parseFloat(other.value); }
    lt(other) { return parseFloat(this.value) < parseFloat(other.value); }

    toString() { return this.value; }
    toFixed(digits) { return parseFloat(this.value).toFixed(digits); }

    static _align(a, b) {
      const da = (a.split('.')[1] || '').length;
      const db = (b.split('.')[1] || '').length;
      const scale = Math.max(da, db);
      const sa = a.replace('.', '').padEnd(a.replace('.', '').length + (scale - da), '0');
      const sb = b.replace('.', '').padEnd(b.replace('.', '').length + (scale - db), '0');
      return [sa, sb, scale];
    }

    static _unscale(bigint, scale) {
      let str = bigint.toString();
      const neg = str.startsWith('-');
      if (neg) str = str.slice(1);
      str = str.padStart(scale + 1, '0');
      const intPart = str.slice(0, str.length - scale) || '0';
      const fracPart = str.slice(str.length - scale);
      const result = fracPart ? intPart + '.' + fracPart.replace(/0+$/, '') : intPart;
      return (neg ? '-' : '') + (result.endsWith('.') ? result.slice(0, -1) : result);
    }
  }
`;

export const wasmImports = {
  std_decimal: {
    new(strPtr, strLen) {
      const str = NectarRuntime.__getString(strPtr, strLen);
      return NectarRuntime.__registerObject(new NectarBigDecimal(str));
    },
    from_i64(val) {
      return NectarRuntime.__registerObject(new NectarBigDecimal(val.toString()));
    },
    from_f64(val) {
      return NectarRuntime.__registerObject(new NectarBigDecimal(val.toString()));
    },
    add(aPtr, bPtr) {
      const a = NectarRuntime.__getObject(aPtr);
      const b = NectarRuntime.__getObject(bPtr);
      return NectarRuntime.__registerObject(a.add(b));
    },
    sub(aPtr, bPtr) {
      const a = NectarRuntime.__getObject(aPtr);
      const b = NectarRuntime.__getObject(bPtr);
      return NectarRuntime.__registerObject(a.sub(b));
    },
    mul(aPtr, bPtr) {
      const a = NectarRuntime.__getObject(aPtr);
      const b = NectarRuntime.__getObject(bPtr);
      return NectarRuntime.__registerObject(a.mul(b));
    },
    div(aPtr, bPtr) {
      const a = NectarRuntime.__getObject(aPtr);
      const b = NectarRuntime.__getObject(bPtr);
      return NectarRuntime.__registerObject(a.div(b));
    },
    to_string(ptr) {
      return NectarRuntime.__allocString(NectarRuntime.__getObject(ptr).toString());
    },
  },
};
