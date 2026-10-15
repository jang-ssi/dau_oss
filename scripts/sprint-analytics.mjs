// 스프린트 분석: Cycle Time, Velocity, Burndown (의존성 없음, Node 20+)
//
// 사용법
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/sprint-analytics.mjs
//   SPRINT_DEMO=1 node scripts/sprint-analytics.mjs     # 샘플 데이터로 시안 생성
//
// 정의
//   스토리 포인트  `sp: N` 라벨 (없으면 1)
//   Cycle Time     담당자가 처음 지정된 시각 -> 이슈 종료 시각 (지정 기록이 없으면 생성 시각 기준)
//   Velocity       마일스톤(스프린트)에서 종료된 이슈의 스토리 포인트 합
//   Burndown       스프린트 기간의 일별 남은 포인트 vs 이상적 소진선
//
// 출력: docs/sprint/report.md, docs/sprint/burndown.svg, docs/sprint/velocity.svg, sprint-metrics.json
import fs from 'node:fs';

const DEMO = process.env.SPRINT_DEMO === '1';
const REPO = process.env.GITHUB_REPOSITORY || 'jang-ssi/dau_oss';
const TOKEN = process.env.GITHUB_TOKEN;
const DAY = 86400e3;

async function gh(url) {
  const res = await fetch(`https://api.github.com${url}`, {
    headers: { Accept: 'application/vnd.github+json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${url}`);
  return res.json();
}
async function paginate(url) {
  const all = [];
  for (let p = 1; p <= 10; p++) {
    const items = await gh(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${p}`);
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

const points = (labels) => {
  const l = labels.find((x) => /^sp:\s*\d+$/.test(x));
  return l ? Number(l.split(':')[1]) : 1;
};
const dayStart = (t) => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// ---------- 수집 ----------
async function collect() {
  const milestones = await paginate(`/repos/${REPO}/milestones?state=all&sort=due_on&direction=asc`);
  const issues = (await paginate(`/repos/${REPO}/issues?state=all`)).filter((i) => !i.pull_request && i.milestone);
  const out = [];
  for (const m of milestones) {
    const startMatch = /시작:\s*(\d{4}-\d{2}-\d{2})/.exec(m.description ?? '');
    const mis = issues.filter((i) => i.milestone.number === m.number);
    const items = [];
    for (const i of mis) {
      let startedAt = i.created_at;
      if (i.state === 'closed') {
        const events = await gh(`/repos/${REPO}/issues/${i.number}/events?per_page=100`);
        const assigned = events.find((e) => e.event === 'assigned');
        if (assigned) startedAt = assigned.created_at;
      }
      items.push({
        number: i.number, title: i.title, points: points(i.labels.map((l) => l.name)),
        createdAt: i.created_at, startedAt, closedAt: i.closed_at,
      });
    }
    out.push({
      title: m.title,
      start: startMatch ? `${startMatch[1]}T00:00:00Z` : m.created_at,
      due: m.due_on ?? m.created_at,
      issues: items,
    });
  }
  return out;
}

function demoData() {
  const start = dayStart(Date.now() - 10 * DAY);
  const mk = (n, pts, startDay, closeDay) => ({
    number: n, title: `샘플 이슈 ${n}`, points: pts, createdAt: new Date(start - DAY).toISOString(),
    startedAt: new Date(start + startDay * DAY).toISOString(),
    closedAt: closeDay == null ? null : new Date(start + closeDay * DAY).toISOString(),
  });
  const s0 = start - 14 * DAY;
  return [
    {
      title: 'Sprint 0 (샘플)', start: new Date(s0).toISOString(), due: new Date(s0 + 13 * DAY).toISOString(),
      issues: [2, 3, 5, 3, 5].map((p, k) => ({
        number: 100 + k, title: `샘플 이슈 ${100 + k}`, points: p, createdAt: new Date(s0 - DAY).toISOString(),
        startedAt: new Date(s0 + k * 2 * DAY).toISOString(), closedAt: new Date(s0 + (k * 2 + 3) * DAY).toISOString(),
      })),
    },
    {
      title: 'Sprint 1 (샘플)', start: new Date(start).toISOString(), due: new Date(start + 13 * DAY).toISOString(),
      issues: [mk(1, 2, 0, 1), mk(2, 5, 0, 3), mk(3, 3, 1, 4), mk(4, 5, 2, 6), mk(5, 8, 3, 9), mk(6, 3, 5, null), mk(7, 5, 7, null), mk(8, 3, 9, null)],
    },
  ];
}

// ---------- 계산 ----------
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

function analyze(sprints) {
  return sprints.map((s) => {
    const total = s.issues.reduce((a, i) => a + i.points, 0);
    const done = s.issues.filter((i) => i.closedAt);
    const velocity = done.reduce((a, i) => a + i.points, 0);
    const cycleDays = done.map((i) => (new Date(i.closedAt) - new Date(i.startedAt)) / DAY);
    const from = dayStart(s.start), to = dayStart(s.due);
    const days = Math.max(1, Math.round((to - from) / DAY));
    const today = dayStart(Date.now());
    const burndown = [];
    for (let d = 0; d <= days; d++) {
      const t = from + d * DAY;
      const remaining = total - s.issues.filter((i) => i.closedAt && dayStart(i.closedAt) <= t).reduce((a, i) => a + i.points, 0);
      burndown.push({
        date: iso(t), ideal: r1(total - (total * d) / days),
        actual: t <= today ? remaining : null,
      });
    }
    return {
      title: s.title, start: iso(from), due: iso(to), totalPoints: total, donePoints: velocity,
      issues: s.issues.length, closedIssues: done.length,
      velocity, cycleTimeDaysMedian: r1(median(cycleDays)), burndown,
    };
  });
}

// ---------- 그래프 ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = "font-family=\"'Segoe UI','Malgun Gothic',Arial,sans-serif\"";

function burndownSvg(sp, demo) {
  const W = 760, H = 380, px = 56, py = 70, pw = 670, ph = 240;
  const max = Math.max(1, sp.totalPoints);
  const n = sp.burndown.length - 1 || 1;
  const X = (i) => px + (pw * i) / n, Y = (v) => py + ph - (v / max) * ph;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="24" y="34" font-size="20" font-weight="700" fill="#111827">Burndown · ${esc(sp.title)}</text>
<text x="24" y="54" font-size="12" fill="#6b7280">${sp.start} ~ ${sp.due} · 총 ${sp.totalPoints}pt${demo ? ' · 샘플 데이터(시안)' : ''}</text>
`;
  for (let t = 0; t <= 4; t++) {
    const v = (max * t) / 4;
    g += `<line x1="${px}" y1="${Y(v)}" x2="${px + pw}" y2="${Y(v)}" stroke="#f3f4f6"/><text x="${px - 8}" y="${Y(v) + 4}" font-size="11" fill="#9ca3af" text-anchor="end">${r1(v)}</text>\n`;
  }
  sp.burndown.forEach((b, i) => {
    if (i % Math.ceil(sp.burndown.length / 8) === 0) g += `<text x="${X(i)}" y="${py + ph + 18}" font-size="11" fill="#9ca3af" text-anchor="middle">${b.date.slice(5)}</text>\n`;
  });
  g += `<polyline points="${sp.burndown.map((b, i) => `${X(i)},${Y(b.ideal)}`).join(' ')}" fill="none" stroke="#9ca3af" stroke-width="2" stroke-dasharray="6 4"/>\n`;
  const act = sp.burndown.map((b, i) => (b.actual == null ? null : [X(i), Y(b.actual)])).filter(Boolean);
  if (act.length) {
    g += `<polyline points="${act.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linejoin="round"/>\n`;
    act.forEach(([x, y]) => { g += `<circle cx="${x}" cy="${y}" r="3.5" fill="#2563eb"/>\n`; });
  }
  g += `<line x1="${px}" y1="${H - 36}" x2="${px + 24}" y2="${H - 36}" stroke="#9ca3af" stroke-width="2" stroke-dasharray="6 4"/><text x="${px + 30}" y="${H - 32}" font-size="12" fill="#6b7280">이상적 소진</text>
<line x1="${px + 120}" y1="${H - 36}" x2="${px + 144}" y2="${H - 36}" stroke="#2563eb" stroke-width="3"/><text x="${px + 150}" y="${H - 32}" font-size="12" fill="#6b7280">실제 남은 포인트</text>
</svg>\n`;
  return g;
}

function velocitySvg(sprints, demo) {
  const W = 760, H = 340, px = 56, py = 70, pw = 670, ph = 200;
  const max = Math.max(1, ...sprints.map((s) => Math.max(s.velocity, s.totalPoints))) * 1.15;
  const slot = pw / Math.max(1, sprints.length);
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="24" y="34" font-size="20" font-weight="700" fill="#111827">Velocity · 스프린트별 완료 포인트</text>
<text x="24" y="54" font-size="12" fill="#6b7280">회색: 계획 포인트 · 파랑: 완료 포인트${demo ? ' · 샘플 데이터(시안)' : ''}</text>
`;
  sprints.forEach((s, i) => {
    const x = px + i * slot + slot * 0.2, bw = slot * 0.28;
    const hp = (s.totalPoints / max) * ph, hv = (s.velocity / max) * ph;
    g += `<rect x="${x}" y="${py + ph - hp}" width="${bw}" height="${hp}" rx="3" fill="#d1d5db"/>
<rect x="${x + bw + 4}" y="${py + ph - hv}" width="${bw}" height="${hv}" rx="3" fill="#2563eb"/>
<text x="${x + bw + 4 + bw / 2}" y="${py + ph - hv - 6}" font-size="11" fill="#2563eb" text-anchor="middle">${s.velocity}</text>
<text x="${x + bw}" y="${py + ph + 18}" font-size="11" fill="#6b7280" text-anchor="middle">${esc(s.title.length > 18 ? s.title.slice(0, 17) + '…' : s.title)}</text>\n`;
  });
  return g + `<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="#e5e7eb"/>\n</svg>\n`;
}

function report(sprints, current, demo) {
  const rows = sprints.map((s) => `| ${s.title} | ${s.start} ~ ${s.due} | ${s.closedIssues}/${s.issues} | ${s.donePoints}/${s.totalPoints} | ${s.velocity} | ${s.cycleTimeDaysMedian == null ? '-' : s.cycleTimeDaysMedian + '일'} |`);
  const vels = sprints.filter((s) => s.velocity > 0).map((s) => s.velocity);
  const avg = vels.length ? r1(vels.reduce((a, b) => a + b, 0) / vels.length) : null;
  return `# 스프린트 분석 리포트

- 저장소: ${REPO}
- 생성: ${new Date().toISOString()}${demo ? '\n- ⚠️ 샘플 데이터로 만든 시안입니다.' : ''}

| 스프린트 | 기간 | 완료 이슈 | 완료/계획 포인트 | Velocity | Cycle Time(중앙값) |
|----------|------|-----------|------------------|----------|--------------------|
${rows.join('\n')}

- 평균 Velocity: ${avg ?? '-'}pt/스프린트 (다음 스프린트 계획의 기준으로 사용)

## Burndown (${current.title})
![burndown](./burndown.svg)

## Velocity
![velocity](./velocity.svg)
`;
}

// ---------- main ----------
const raw = DEMO ? demoData() : await collect();
const sprints = analyze(raw);
if (!sprints.length) { console.log('마일스톤이 없어 분석할 데이터가 없습니다.'); process.exit(0); }
const now = Date.now();
const current = sprints.find((s) => new Date(s.due).getTime() + DAY > now && s.closedIssues < s.issues) ?? sprints.at(-1);

fs.mkdirSync('docs/sprint', { recursive: true });
fs.writeFileSync('docs/sprint/burndown.svg', burndownSvg(current, DEMO));
fs.writeFileSync('docs/sprint/velocity.svg', velocitySvg(sprints, DEMO));
fs.writeFileSync('docs/sprint/report.md', report(sprints, current, DEMO));
fs.writeFileSync('sprint-metrics.json', JSON.stringify({ repository: REPO, demo: DEMO, generatedAt: new Date().toISOString(), sprints }, null, 2));
console.log(sprints.map((s) => `${s.title}: velocity ${s.velocity}/${s.totalPoints}, cycle ${s.cycleTimeDaysMedian}일`).join('\n'));
