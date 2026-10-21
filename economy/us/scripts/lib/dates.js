const pad = (n) => String(n).padStart(2, '0');

export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const monthStart = (y, m) => ymd(y, m, 1);
export const quarterStart = (y, q) => ymd(y, (q - 1) * 3 + 1, 1);

// 월말/분기말 날짜를 FRED 관례대로 기간 시작일로 바꾼다.
export function periodStart(iso, freq) {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  if (freq === 'monthly') return monthStart(y, m);
  if (freq === 'quarterly') return quarterStart(y, Math.ceil(m / 3));
  return iso.slice(0, 10);
}

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
export const monthNum = (abbr) => MON[abbr];
