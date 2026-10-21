// 재시도 예약 실행용: 오늘(KST) 이미 수집·배포가 성공했으면 skip=true 를 출력해 작업을 건너뛴다.
import fs from 'node:fs';
import path from 'node:path';
import { REPORTS_DIR, readJson } from './lib/store.js';

const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);
const today = kstDate(new Date().toISOString());

const update = readJson(path.join(REPORTS_DIR, 'update-log.json'), [])[0];
const deploy = readJson(path.join(REPORTS_DIR, 'deploy-log.json'), [])[0];
const updatedToday = update?.finishedAt && kstDate(update.finishedAt) === today && Object.values(update.indicators || {}).every(Boolean);
const deployedToday = deploy?.ok && kstDate(deploy.at) === today;

const skip = Boolean(updatedToday && deployedToday);
console.log(`오늘(KST ${today}) 수집 성공: ${!!updatedToday}, 배포 성공: ${!!deployedToday} → ${skip ? '건너뜀' : '실행'}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\n`);
