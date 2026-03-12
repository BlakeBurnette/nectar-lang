// std_format.js — Nectar standard library: formatting functions
export const name = 'std_format';

export const runtime = `
  const __nectar_format = {
    number(value, locale = 'en-US') {
      return new Intl.NumberFormat(locale).format(value);
    },
    currency(value, currency = 'USD', locale = 'en-US') {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
    },
    percent(value) {
      return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
    },
    bytes(bytes) {
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      let i = 0;
      let val = Number(bytes);
      while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
      return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    },
    compact(value) {
      return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
    },
    ordinal(n) {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },
    relative_time(timestampMs) {
      const diff = Date.now() - timestampMs;
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      const seconds = Math.floor(diff / 1000);
      if (Math.abs(seconds) < 60) return rtf.format(-seconds, 'second');
      const minutes = Math.floor(seconds / 60);
      if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
      const hours = Math.floor(minutes / 60);
      if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
      const days = Math.floor(hours / 24);
      return rtf.format(-days, 'day');
    },
  };
`;

export const wasmImports = {
  std_format: {
    number(value, localePtr, localeLen) {
      const locale = NectarRuntime.__getString(localePtr, localeLen);
      return NectarRuntime.__allocString(__nectar_format.number(value, locale));
    },
    currency(value, currPtr, currLen, localePtr, localeLen) {
      const curr = NectarRuntime.__getString(currPtr, currLen);
      const locale = NectarRuntime.__getString(localePtr, localeLen);
      return NectarRuntime.__allocString(__nectar_format.currency(value, curr, locale));
    },
    percent(value) {
      return NectarRuntime.__allocString(__nectar_format.percent(value));
    },
    bytes(value) {
      return NectarRuntime.__allocString(__nectar_format.bytes(value));
    },
    compact(value) {
      return NectarRuntime.__allocString(__nectar_format.compact(value));
    },
    ordinal(value) {
      return NectarRuntime.__allocString(__nectar_format.ordinal(value));
    },
    relative_time(timestampMs) {
      return NectarRuntime.__allocString(__nectar_format.relative_time(timestampMs));
    },
  },
};
