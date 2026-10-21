export const FREQ_KO = {
  daily: '일간',
  weekly: '주간',
  monthly: '월간',
  quarterly: '분기',
  annual: '연간',
  irregular: '비정기',
};

export const RISK = {
  normal: { icon: '🟢', label: '정상' },
  caution: { icon: '🟡', label: '주의' },
  danger: { icon: '🔴', label: '위험' },
  unknown: { icon: '⚪', label: '판단불가' },
};

export function riskMeta(risk) {
  return RISK[risk] || RISK.unknown;
}

function digitsFor(value, unit) {
  if (unit === '%' || unit === '%p') return 2;
  const abs = Math.abs(value);
  if (unit && unit.includes('/')) return abs < 10 ? 4 : 2; // 환율·가격
  if (Number.isInteger(value)) return 0; // 건수·인원 등
  if (abs >= 10000) return 0;
  if (abs >= 100) return 1;
  if (abs >= 1) return 2;
  return 4;
}

export function formatNumber(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const d = digitsFor(value, unit);
  return value.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// 단위 표기: %, %p는 숫자에 붙이고 나머지는 띄워서 작게 표시
export function unitSuffix(unit) {
  if (!unit) return '';
  return unit === '%' || unit === '%p' ? unit : ` ${unit}`;
}

export function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';
  return formatNumber(value, unit) + unitSuffix(unit);
}

// 목록용 짧은 표기: 금액은 $1.2T / $340B 형태
export function formatShort(value, unit) {
  if (value === null || value === undefined) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const money = (billions) =>
    billions >= 1000 ? `${sign}$${(billions / 1000).toFixed(1)}T` : `${sign}$${billions.toFixed(billions >= 100 ? 0 : 1)}B`;
  if (unit === '십억 달러') return money(abs);
  if (unit?.startsWith('백만 달러')) return money(abs / 1000);
  return formatValue(value, unit);
}

// 지표마다 변화 계산 방식이 다르므로 kind를 함께 받는다.
export function formatChange(change, unit) {
  if (!change || change.value === null || change.value === undefined) return '—';
  const { value, kind } = change;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const abs = Math.abs(value);
  if (kind === 'pp') return `${sign}${abs.toFixed(2)}%p`;
  if (kind === 'pct') return `${sign}${abs.toFixed(2)}%`;
  return `${sign}${formatNumber(abs, unit)}${unitSuffix(unit)}`;
}

export function changeDirection(change) {
  if (!change || !change.value) return 'flat';
  return change.value > 0 ? 'up' : 'down';
}

export function formatDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) + ' (KST)';
}
