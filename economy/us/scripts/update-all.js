// 매일 실행: 원천별 수집 → 이력 병합(개정 반영·중복 제거) → 파생지표 → 위험 판정·JSON 생성 → 실행 로그
//   node scripts/update-all.js            저장된 이력이 없는 원천만 전체 구축, 나머지는 최근 구간만
//   node scripts/update-all.js --full     전체 이력 재수집
//   node scripts/update-all.js --only=bls,fed
import path from 'node:path';
import { REPORTS_DIR, loadConfig, loadSeries, mergeHistory, readJson, seriesFile, writeJson } from './lib/store.js';
import { fetchTreasury } from './fetch-treasury.js';
import { fetchNyfed } from './fetch-nyfed.js';
import { fetchBls } from './fetch-bls.js';
import { fetchDol } from './fetch-dol.js';
import { fetchFed } from './fetch-fed.js';
import { fetchCensus } from './fetch-census.js';
import { fetchFiscal } from './fetch-fiscal.js';
import { fetchEia } from './fetch-eia.js';
import { fetchNber } from './fetch-nber.js';
import { derive } from './derive.js';
import { generate } from './generate-json.js';

const FETCHERS = {
  treasury: (inds, o) => fetchTreasury('treasury', inds, o),
  'treasury-real': (inds, o) => fetchTreasury('treasury-real', inds, o),
  nyfed: fetchNyfed,
  bls: fetchBls,
  dol: fetchDol,
  fed: fetchFed,
  census: fetchCensus,
  fiscal: fetchFiscal,
  eia: fetchEia,
  nber: fetchNber,
};

const args = process.argv.slice(2);
const forceFull = args.includes('--full');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');

function save(ind, fresh, now) {
  const old = loadSeries(ind.id) || {};
  const { history, changed } = mergeHistory(old.history, fresh);
  writeJson(seriesFile(ind.id), { ...old, id: ind.id, history, updatedAt: now, fetchFailed: false });
  return changed;
}

function markFailed(ind) {
  const old = loadSeries(ind.id);
  if (old) writeJson(seriesFile(ind.id), { ...old, fetchFailed: true }); // 이전 정상 이력은 그대로 보존
}

async function main() {
  const { indicators: cfg } = loadConfig();
  const active = cfg.indicators.filter((i) => !i.excluded);
  const now = new Date().toISOString();
  const startedAt = Date.now();
  const log = { startedAt: now, sources: {}, indicators: {} };
  const runStatus = {};

  const groups = new Map();
  for (const ind of active.filter((i) => i.src !== 'derived')) {
    if (only && !only.includes(ind.src)) continue;
    if (!groups.has(ind.src)) groups.set(ind.src, []);
    groups.get(ind.src).push(ind);
  }

  for (const [src, inds] of groups) {
    const full = forceFull || inds.some((i) => !loadSeries(i.id)?.history?.length);
    const t0 = Date.now();
    let result = {};
    try {
      result = await FETCHERS[src](inds, { full });
    } catch (err) {
      result = { _errors: [err.message] };
    }
    let ok = 0;
    let changed = 0;
    for (const ind of inds) {
      const obs = result[ind.id];
      if (obs?.length) {
        changed += save(ind, obs, now);
        runStatus[ind.id] = true;
        ok++;
      } else {
        markFailed(ind);
        runStatus[ind.id] = false;
      }
    }
    log.sources[src] = { ok, failed: inds.length - ok, changedObs: changed, full, ms: Date.now() - t0, errors: result._errors || [] };
    const mark = ok === inds.length ? 'OK ' : ok ? 'PART' : 'FAIL';
    console.log(`[${mark}] ${src.padEnd(14)} ${ok}/${inds.length}개, 신규·개정 ${changed}건${full ? ' (전체 구축)' : ''}${result._errors ? ' — ' + result._errors.join(' | ') : ''}`);
  }

  // 파생지표: 구성 시계열이 모두 있을 때만 계산 (설정 순서대로 — 파생의 파생 허용)
  if (!only) {
    let ok = 0;
    const derived = active.filter((i) => i.src === 'derived');
    for (const ind of derived) {
      const a = loadSeries(ind.ref.a)?.history;
      const b = loadSeries(ind.ref.b)?.history;
      const fresh = a?.length && b?.length ? derive(ind.ref, a, b) : [];
      if (fresh.length && runStatus[ind.ref.a] !== false && runStatus[ind.ref.b] !== false) {
        save(ind, fresh, now);
        runStatus[ind.id] = true;
        ok++;
      } else {
        markFailed(ind);
        runStatus[ind.id] = false;
      }
    }
    log.sources.derived = { ok, failed: derived.length - ok };
    console.log(`[${ok === derived.length ? 'OK ' : 'PART'}] ${'derived'.padEnd(14)} ${ok}/${derived.length}개`);
  }

  const gen = generate({ runStatus });
  log.indicators = runStatus;
  log.finishedAt = new Date().toISOString();
  log.ms = Date.now() - startedAt;
  log.implemented = gen.implemented;
  log.tally = gen.tally;

  // 실행 로그는 최근 60회만 보관
  const logFile = path.join(REPORTS_DIR, 'update-log.json');
  const history = readJson(logFile, []);
  writeJson(logFile, [log, ...history].slice(0, 60), true);

  const failed = Object.values(runStatus).filter((v) => !v).length;
  console.log(`완료: 공개 지표 ${gen.implemented}/${gen.candidates}, 이번 실행 실패 ${failed}개, ${(log.ms / 1000).toFixed(1)}초`);
  if (Object.values(runStatus).length && Object.values(runStatus).every((v) => !v)) {
    console.error('모든 원천 수집에 실패했습니다 (네트워크 문제 가능). 이전 데이터는 보존되었습니다.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
