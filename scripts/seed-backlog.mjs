// 백로그 시드: 라벨, 마일스톤, 이슈를 .github/backlog/seed.json 기준으로 생성한다.
// 이미 있는 항목은 건너뛰므로 여러 번 실행해도 안전하다.
// 사용법: GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/seed-backlog.mjs
import fs from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
if (!REPO || !TOKEN) throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN 환경변수가 필요합니다.');
const seed = JSON.parse(fs.readFileSync('.github/backlog/seed.json', 'utf8'));

async function api(method, url, body) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${url}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
const list = async (url) => {
  const all = [];
  for (let p = 1; ; p++) {
    const items = await api('GET', `${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${p}`);
    all.push(...items);
    if (items.length < 100) return all;
  }
};

// 라벨
const labels = new Set((await list('/labels')).map((l) => l.name));
for (const l of seed.labels) {
  if (labels.has(l.name)) { await api('PATCH', `/labels/${encodeURIComponent(l.name)}`, l); continue; }
  await api('POST', '/labels', l);
  console.log('라벨 생성:', l.name);
}

// 마일스톤
const existingMs = await list('/milestones?state=all');
const milestoneNo = [];
for (const m of seed.milestones) {
  let found = existingMs.find((x) => x.title === m.title);
  if (!found) {
    found = await api('POST', '/milestones', {
      title: m.title, description: `${m.description}\n\n시작: ${m.start_on}`, due_on: `${m.due_on}T14:59:59Z`,
    });
    console.log('마일스톤 생성:', m.title);
  }
  milestoneNo.push(found.number);
}

// 이슈
const titles = new Set((await list('/issues?state=all')).filter((i) => !i.pull_request).map((i) => i.title));
for (const i of seed.issues) {
  if (titles.has(i.title)) continue;
  await api('POST', '/issues', {
    title: i.title, body: i.body, labels: i.labels,
    ...(i.milestone != null ? { milestone: milestoneNo[i.milestone] } : {}),
  });
  console.log('이슈 생성:', i.title);
  await new Promise((r) => setTimeout(r, 1000)); // 2차 레이트 리밋 회피
}
console.log('완료');
