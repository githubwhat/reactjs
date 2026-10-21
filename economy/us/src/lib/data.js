// 정적 JSON 로더. 데이터 파일은 2단계(Node 수집기)가 public/data/ 아래에 생성한다.
//
//   data/summary.json            첫 화면 요약 (작은 파일)
//     { updatedAt, counts: { A: 3, ... }, riskTally: { normal, caution, danger, unknown }, highlights: [Row] }
//   data/categories/{A..J}.json  대분류를 열 때만 로드
//     { category, updatedAt, indicators: [Row] }
//   data/series/{id}.json        지표 상세를 열 때만 로드
//     Row + { source: { name, url }, updatedAt, yoy, history: [[YYYY-MM-DD, number|null], ...] }
//
//   Row = { id, ko, en, unit, freq, latest, date, change: { value, kind } | null,
//           risk: normal|caution|danger|unknown, reason, stale }
//   change.kind: 'pp'(퍼센트포인트) | 'pct'(변화율 %) | 'abs'(단위 그대로)

const cache = new Map();

export function loadJson(path) {
  if (!cache.has(path)) {
    const url = `${import.meta.env.BASE_URL}data/${path}`;
    const p = fetch(url, { cache: 'no-cache' })
      .then((res) => {
        // 404이거나 호스팅의 HTML 오류 페이지가 오면 "아직 데이터 없음"으로 처리
        const type = res.headers.get('content-type') || '';
        if (res.status === 404 || !type.includes('json')) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        cache.delete(path);
        throw err;
      });
    cache.set(path, p);
  }
  return cache.get(path);
}
