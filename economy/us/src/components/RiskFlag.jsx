import { riskMeta } from '../lib/format.js';

// 색만으로 의미를 전달하지 않도록 아이콘 + 글자를 함께 표시
export default function RiskFlag({ risk }) {
  const m = riskMeta(risk);
  return (
    <span className={`flag flag-${risk || 'unknown'}`}>
      <span aria-hidden="true">{m.icon}</span> {m.label}
    </span>
  );
}
