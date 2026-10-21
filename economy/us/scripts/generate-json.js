// 저장된 지표 이력으로 최신값·변화·위험 깃발을 다시 계산해 화면용 JSON을 만든다.
// 단독 실행(npm run generate:json)하면 API 호출 없이 규칙 변경만 반영할 수 있다.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_DIR, REPORTS_DIR, loadConfig, loadSeries, round, seriesFile, writeJson } from './lib/store.js';
import { daysBetween, today } from './lib/dates.js';
import { evaluateRisk, valueYearAgo } from './lib/risk.js';

// 발표 지연을 감안한 '관측값이 오래됨' 기준(일). 월·분기는 기간 시작일 기준이라 여유를 둔다.
const MAX_AGE = { daily: 14, weekly: 24, monthly: 125, quarterly: 240, annual: 500, irregular: 60 };

function changeKind(ind) {
  if (ind.change) return ind.change;
  return ind.unit === '%' || ind.unit === '%p' ? 'pp' : 'pct';
}

function diff(kind, cur, base) {
  if (base === null || base === undefined) return null;
  if (kind === 'pct') return base === 0 ? null : { value: round((cur / base - 1) * 100, 3), kind };
  return { value: round(cur - base, 4), kind };
}

// 목록용 작은 그래프: 최근 1년(관측이 8개 미만이면 최근 12개) 값을 최대 40점으로 솎아낸다.
const SPARK_POINTS = 40;

export function sparkline(hist) {
  if (hist.length < 2) return null;
  const lastDate = hist[hist.length - 1][0];
  const from = `${Number(lastDate.slice(0, 4)) - 1}${lastDate.slice(4)}`;
  let win = hist.filter(([d]) => d > from);
  if (win.length < 8) win = hist.slice(-12);
  if (win.length < 2) return null;
  const step = Math.max(1, Math.ceil(win.length / SPARK_POINTS));
  const pts = win.filter((_, i) => i % step === 0 || i === win.length - 1).map(([, v]) => v);
  return pts.length >= 2 ? pts : null;
}

export function summarize(ind, hist) {
  if (!hist.length) return null;
  const [date, latest] = hist[hist.length - 1];
  const prev = hist.length > 1 ? hist[hist.length - 2][1] : null;
  const kind = changeKind(ind);
  const yoyKind = kind === 'abs' && ind.unit !== '0/1' ? 'abs' : kind;
  const noYoy = ind.freq === 'annual' || ind.unit === '0/1';
  return {
    latest,
    date,
    change: diff(kind, latest, prev),
    yoy: noYoy ? null : diff(yoyKind, latest, valueYearAgo(hist, ind.freq)),
  };
}

export function generate({ runStatus = {} } = {}) {
  const { indicators: cfg, rules, sources } = loadConfig();
  const active = cfg.indicators.filter((i) => !i.excluded);
  const now = new Date().toISOString();

  // 1차: 이력·최신값 로드 (다른 지표 최신값을 참조하는 규칙용)
  const loaded = new Map();
  const refs = {};
  for (const ind of active) {
    const s = loadSeries(ind.id);
    if (!s?.history?.length) continue;
    loaded.set(ind.id, s);
    refs[ind.id] = s.history[s.history.length - 1][1];
  }

  const rowsByCat = {};
  const tally = { normal: 0, caution: 0, danger: 0, unknown: 0 };
  const rowById = {};

  for (const ind of active) {
    const s = loaded.get(ind.id);
    if (!s) continue; // 실데이터가 없는 지표는 화면에 노출하지 않음
    const sum = summarize(ind, s.history);
    const { risk, reason } = evaluateRisk(rules.rules[ind.id], s.history, ind.freq, refs);

    const age = daysBetween(sum.date, today());
    const fetchFailed = runStatus[ind.id] === false || s.fetchFailed === true;
    const tooOld = age > (MAX_AGE[ind.freq] ?? 60);
    const staleReason = fetchFailed
      ? '최근 수집에 실패하여 마지막 정상 데이터를 표시합니다.'
      : tooOld
        ? `최근 관측값이 ${age}일 전 자료입니다(원천 발표 지연 또는 중단 가능).`
        : null;

    const src = sources[ind.src === 'treasury-real' ? 'treasury' : ind.src] || null;
    const row = {
      id: ind.id,
      ko: ind.ko,
      en: ind.en,
      unit: ind.unit,
      freq: ind.freq,
      latest: sum.latest,
      date: sum.date,
      change: sum.change,
      risk,
      reason,
      stale: !!staleReason,
      cat: ind.cat,
      spark: sparkline(s.history),
    };
    rowById[ind.id] = row;
    (rowsByCat[ind.cat] ||= []).push(row);
    tally[risk]++;

    const { spark, ...detail } = row;
    writeJson(seriesFile(ind.id), {
      ...detail,
      fred: ind.fred,
      yoy: sum.yoy,
      staleReason,
      note: ind.note || null,
      source: src
        ? { name: src.name, url: src.url, notice: src.notice || null }
        : ind.src === 'derived'
          ? { name: '공식 원천 시계열로 계산 (계산식은 비고 참고)', url: null, notice: null }
          : null,
      updatedAt: s.updatedAt,
      fetchFailed: s.fetchFailed || false,
      history: s.history,
    });
  }

  for (const cat of cfg.categories) {
    writeJson(path.join(DATA_DIR, 'categories', `${cat.code}.json`), {
      category: cat.code,
      updatedAt: now,
      indicators: rowsByCat[cat.code] || [],
    });
  }

  // Home 목록: 실데이터가 있는 대표 지표만 (없으면 줄 자체를 뺌)
  const home = (cfg.home || []).filter((h) => rowById[h.id]).map((h) => ({ ...rowById[h.id], label: h.label }));
  writeJson(path.join(DATA_DIR, 'summary.json'), {
    updatedAt: now,
    categories: cfg.categories
      .filter((c) => rowsByCat[c.code]?.length)
      .map((c) => ({ code: c.code, ko: c.ko, en: c.en, count: rowsByCat[c.code].length })),
    riskTally: tally,
    home,
  });

  const excluded = cfg.indicators
    .filter((i) => i.excluded)
    .map((i) => ({ id: i.id, fred: i.fred, category: i.cat, name: i.ko, reason: i.excluded.reason, detail: i.excluded.detail }));
  const noData = active.filter((i) => !loaded.has(i.id)).map((i) => ({ id: i.id, fred: i.fred, category: i.cat, name: i.ko, reason: '연결 실패', detail: '원천은 확인했으나 아직 수집된 관측값이 없음' }));
  writeJson(
    path.join(REPORTS_DIR, 'excluded-indicators.json'),
    {
      generatedAt: now,
      candidates: cfg.indicators.length,
      implemented: loaded.size,
      excluded: excluded.length + noData.length,
      byReason: [...excluded, ...noData].reduce((acc, x) => ((acc[x.reason] = (acc[x.reason] || 0) + 1), acc), {}),
      indicators: [...excluded, ...noData],
    },
    true,
  );

  return { implemented: loaded.size, candidates: cfg.indicators.length, tally };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = generate();
  console.log(`JSON 생성 완료: 후보 ${r.candidates}개 중 ${r.implemented}개 공개`, r.tally);
}
