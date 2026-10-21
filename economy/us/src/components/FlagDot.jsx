import { riskMeta } from '../lib/format.js';

// 목록용 깃발 원. 색 외에 스크린리더·툴팁 문구로도 상태를 전달한다.
export default function FlagDot({ risk }) {
  const m = riskMeta(risk);
  return <span className={`dot dot-${risk || 'unknown'}`} role="img" aria-label={m.label} title={m.label} />;
}
