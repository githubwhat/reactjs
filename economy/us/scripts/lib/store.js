// 지표별 JSON(public/data/series/{id}.json)이 곧 이력 저장소다. DB 없이 이전 파일에 신규·개정값을 병합한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, 'public/data');
export const SERIES_DIR = path.join(DATA_DIR, 'series');
export const REPORTS_DIR = path.join(ROOT, 'reports');

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// 쓰기 도중 실패해도 기존 파일이 깨지지 않도록 임시 파일에 쓴 뒤 교체
export function writeJson(file, data, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0));
  fs.renameSync(tmp, file);
}

export const seriesFile = (id) => path.join(SERIES_DIR, `${id}.json`);
export const loadSeries = (id) => readJson(seriesFile(id));

export function loadConfig() {
  return {
    indicators: readJson(path.join(ROOT, 'config/indicators.json')),
    rules: readJson(path.join(ROOT, 'config/risk-rules.json')),
    sources: readJson(path.join(ROOT, 'config/sources.json')),
  };
}

// 같은 날짜는 새 값으로 덮어써 개정치를 반영하고, 날짜 중복 없이 정렬한다.
export function mergeHistory(oldHist = [], fresh = []) {
  const map = new Map(oldHist.map(([d, v]) => [d, v]));
  let changed = 0;
  for (const [d, v] of fresh) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (map.get(d) !== v) changed++;
    map.set(d, v);
  }
  const history = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { history, changed };
}

export const round = (v, digits = 4) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
