// dist/ 를 InfinityFree(무료) FTP로 업로드한다.
//   - 접속정보는 환경변수(GitHub Secrets)에서만 읽는다: FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_REMOTE_DIR
//   - 원격 manifest(.usapi-manifest.json)와 해시를 비교해 바뀐 파일만 전송 (전송량·파일 수 최소화)
//   - 순서: 새 자산·데이터 → index.html → manifest → 더 이상 안 쓰는 옛 자산 삭제
//     중간에 실패해도 index.html은 이전 버전 그대로이고 이전 자산도 남아 있어 기존 사이트가 유지된다.
//   - FTP_SECURE: auto(기본, TLS 시도 후 실패 시 일반 FTP) | true | false
//   node scripts/deploy-ftp.js --dry-run   접속 없이 전송 대상만 계산
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { Client } from 'basic-ftp';
import { REPORTS_DIR, ROOT, readJson, writeJson } from './lib/store.js';

const DIST = path.join(ROOT, 'dist');
const MANIFEST = '.usapi-manifest.json';
const dryRun = process.argv.includes('--dry-run');

const env = {
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  remoteDir: (process.env.FTP_REMOTE_DIR || '/htdocs').replace(/\/+$/, ''),
  secure: (process.env.FTP_SECURE || 'auto').toLowerCase(),
  siteUrl: process.env.SITE_URL || '',
};

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

function localManifest() {
  const files = {};
  for (const rel of listFiles(DIST)) {
    const buf = fs.readFileSync(path.join(DIST, rel));
    files[rel] = { md5: crypto.createHash('md5').update(buf).digest('hex'), size: buf.length };
  }
  return files;
}

// index.html은 맨 마지막 (새 자산이 모두 올라간 뒤에 교체)
const uploadOrder = (a, b) => (a === 'index.html') - (b === 'index.html') || a.localeCompare(b);

async function connect() {
  const modes = env.secure === 'true' ? [true] : env.secure === 'false' ? [false] : [true, false];
  let lastErr;
  for (const secure of modes) {
    const client = new Client(60000);
    try {
      await client.access({
        host: env.host,
        user: env.user,
        password: env.password,
        secure,
        secureOptions: { rejectUnauthorized: false }, // 공유호스팅 인증서가 호스트명과 다를 수 있음
      });
      console.log(`FTP 접속 성공 (${secure ? 'FTPS(TLS)' : '일반 FTP'})`);
      return client;
    } catch (err) {
      lastErr = err;
      client.close();
      console.log(`FTP 접속 실패 (${secure ? 'TLS' : '일반'}): ${err.message}`);
    }
  }
  throw lastErr;
}

async function readRemoteManifest(client) {
  const chunks = [];
  try {
    await client.downloadTo(new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } }), `${env.remoteDir}/${MANIFEST}`);
    return JSON.parse(Buffer.concat(chunks).toString('utf8')).files || {};
  } catch {
    return {}; // 첫 배포
  }
}

async function withRetry(label, fn, client) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(client.current);
    } catch (err) {
      if (attempt >= 3) throw new Error(`${label}: ${err.message}`);
      console.log(`  재시도 ${attempt}/2 — ${label}: ${err.message}`);
      client.current.close();
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      client.current = await connect();
    }
  }
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html 없음 — 먼저 npm run build');
  const local = localManifest();

  if (dryRun) {
    const total = Object.values(local).reduce((s, f) => s + f.size, 0);
    console.log(`[dry-run] dist 파일 ${Object.keys(local).length}개, ${(total / 1024 / 1024).toFixed(2)}MB. 최대 파일 ${Math.max(...Object.values(local).map((f) => f.size)) / 1024 | 0}KB`);
    return;
  }
  for (const k of ['host', 'user', 'password']) {
    if (!env[k]) throw new Error(`환경변수 FTP_${k.toUpperCase()} 가 없습니다 (GitHub Secrets 확인)`);
  }

  const t0 = Date.now();
  const client = { current: await connect() };
  const remote = await readRemoteManifest(client.current);
  const changed = Object.keys(local).filter((f) => remote[f]?.md5 !== local[f].md5).sort(uploadOrder);
  const stale = Object.keys(remote).filter((f) => !local[f]);
  console.log(`전송 대상 ${changed.length}개 / 전체 ${Object.keys(local).length}개, 삭제 대상 ${stale.length}개`);

  let bytes = 0;
  for (const rel of changed) {
    const remotePath = `${env.remoteDir}/${rel}`;
    await withRetry(rel, async (c) => {
      await c.ensureDir(path.posix.dirname(remotePath));
      await c.uploadFrom(path.join(DIST, rel), remotePath);
      // 업로드 확인: 원격 크기 비교
      const size = await c.size(remotePath);
      if (size !== local[rel].size) throw new Error(`크기 불일치 ${size} ≠ ${local[rel].size}`);
    }, client);
    bytes += local[rel].size;
  }

  // 모든 파일이 정상 업로드된 뒤에만 manifest 갱신
  const manifest = JSON.stringify({ deployedAt: new Date().toISOString(), files: local });
  await withRetry(MANIFEST, (c) => c.uploadFrom(Readable.from([manifest]), `${env.remoteDir}/${MANIFEST}`), client);

  // 새 index.html이 더 이상 참조하지 않는 옛 파일 정리 (실패해도 사이트에는 영향 없음)
  for (const rel of stale) {
    try {
      await client.current.remove(`${env.remoteDir}/${rel}`);
    } catch (err) {
      console.log(`  삭제 생략 ${rel}: ${err.message}`);
    }
  }
  client.current.close();

  const result = { at: new Date().toISOString(), ok: true, uploaded: changed.length, removed: stale.length, bytes, ms: Date.now() - t0 };
  console.log(`배포 완료: ${changed.length}개 파일, ${(bytes / 1024).toFixed(0)}KB, ${(result.ms / 1000).toFixed(1)}초`);

  // 선택: 배포된 사이트에서 JSON 로드 확인 (InfinityFree 보안 확인 페이지가 나오면 '확인 불가'로 기록)
  if (env.siteUrl) {
    try {
      const res = await fetch(`${env.siteUrl.replace(/\/$/, '')}/data/summary.json`, { signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      result.siteCheck = text.trim().startsWith('{') ? `JSON 응답 확인 (HTTP ${res.status})` : `확인 불가: HTML 응답(호스팅 보안 페이지 가능) HTTP ${res.status}`;
    } catch (err) {
      result.siteCheck = `확인 실패: ${err.message}`;
    }
    console.log(`사이트 확인: ${result.siteCheck}`);
  }
  logDeploy(result);
}

function logDeploy(entry) {
  const file = path.join(REPORTS_DIR, 'deploy-log.json');
  writeJson(file, [entry, ...readJson(file, [])].slice(0, 60), true);
}

main().catch((err) => {
  console.error(`배포 실패: ${err.message} — 원격의 이전 정상 버전은 그대로 유지됩니다.`);
  logDeploy({ at: new Date().toISOString(), ok: false, error: err.message });
  process.exit(1);
});
