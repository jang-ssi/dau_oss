// DORA 4대 지표 수집 스크립트 (의존성 없음, Node 20+)
//
// 사용법
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/dora.mjs
//   DORA_DEMO=1 node scripts/dora.mjs      # 샘플 데이터로 시안 생성
//
// 출력
//   dora-metrics.json            전체 수집 결과 (Actions 아티팩트로 업로드)
//   docs/dora/report.md          주간 보고서
//   docs/dora/dashboard.svg      대시보드 이미지 (README에 첨부)
//   docs/dora/history.json       주차별 누적 기록
//
// 지표 정의
//   Lead Time            PR의 첫 커밋 시각 -> main 병합 시각 (중앙값)
//   Deployment Frequency 기간 내 배포 횟수. Deployments API에 성공한 배포가 있으면 그 수,
//                        없으면 main 병합 1건 = 배포 1회로 간주
//   Change Failure Rate  배포 중 실패한 배포(또는 revert/hotfix/rollback PR) 비율
//   MTTR                 `incident` 또는 `bug` 라벨 이슈의 생성 -> 종료 시간 (평균)
import fs from 'node:fs';
import path from 'node:path';

const DEMO = process.env.DORA_DEMO === '1';
const REPO = process.env.GITHUB_REPOSITORY || 'jang-ssi/dau_oss';
const TOKEN = process.env.GITHUB_TOKEN;
const WEEKS = Number(process.env.DORA_WEEKS || 8);
const BRANCH = process.env.DORA_BRANCH || 'main';
const INCIDENT_LABELS = ['incident', 'bug'];
const FAILURE_RE = /\b(revert|hotfix|rollback)\b|되돌리|핫픽스|롤백/i;

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// ---------- GitHub API ----------
async function gh(url) {
  const res = await fetch(`https://api.github.com${url}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${url}`);
  return res.json();
}

async function paginate(url, maxPages = 5) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = url.includes('?') ? '&' : '?';
    const items = await gh(`${url}${sep}per_page=100&page=${page}`);
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

// ---------- 수집 ----------
async function collect(since) {
  const prs = (await paginate(`/repos/${REPO}/pulls?state=closed&base=${BRANCH}&sort=updated&direction=desc`))
    .filter((p) => p.merged_at && new Date(p.merged_at) >= since);

  for (const pr of prs) {
    const commits = await gh(`/repos/${REPO}/pulls/${pr.number}/commits?per_page=100`);
    const starts = commits.map((c) => new Date(c.commit.author.date).getTime());
    pr.firstCommitAt = new Date(Math.min(...starts, new Date(pr.created_at).getTime())).toISOString();
  }

  const deployments = [];
  for (const d of await paginate(`/repos/${REPO}/deployments`)) {
    if (new Date(d.created_at) < since) continue;
    const statuses = await gh(`/repos/${REPO}/deployments/${d.id}/statuses?per_page=1`);
    deployments.push({ id: d.id, at: d.created_at, state: statuses[0]?.state ?? 'unknown' });
  }

  const issues = (await paginate(`/repos/${REPO}/issues?state=closed&since=${since.toISOString()}`))
    .filter((i) => !i.pull_request && i.labels.some((l) => INCIDENT_LABELS.includes(l.name)));

  return {
    prs: prs.map((p) => ({
      number: p.number, title: p.title, labels: p.labels.map((l) => l.name),
      startedAt: p.firstCommitAt, mergedAt: p.merged_at,
    })),
    deployments,
    incidents: issues.map((i) => ({
      number: i.number, title: i.title, openedAt: i.created_at, resolvedAt: i.closed_at,
    })),
  };
}

// 데모용 샘플 데이터 (결정적: 같은 입력이면 항상 같은 결과)
function demoData(now) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const prs = [], incidents = [];
  const perWeek = [3, 4, 3, 5, 4, 6, 5, 7];
  for (let w = 0; w < WEEKS; w++) {
    const weekStart = now - (WEEKS - w) * WEEK;
    const n = perWeek[w % perWeek.length];
    for (let i = 0; i < n; i++) {
      const mergedAt = weekStart + rnd() * WEEK;
      const lead = (6 + rnd() * 60 / (1 + w * 0.25)) * HOUR;
      const failed = rnd() < 0.15 - w * 0.01;
      prs.push({
        number: prs.length + 1, title: failed ? 'revert: 로그인 오류 되돌리기' : `feat: 기능 ${prs.length + 1}`,
        labels: [], startedAt: new Date(mergedAt - lead).toISOString(), mergedAt: new Date(mergedAt).toISOString(),
      });
      if (failed) {
        const openedAt = mergedAt + HOUR;
        incidents.push({
          number: incidents.length + 1, title: '배포 후 오류', openedAt: new Date(openedAt).toISOString(),
          resolvedAt: new Date(openedAt + (2 + rnd() * 20 / (1 + w * 0.3)) * HOUR).toISOString(),
        });
      }
    }
  }
  return { prs, deployments: [], incidents };
}

// ---------- 계산 ----------
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

function computeWindow(data, from, to) {
  const inWin = (iso) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
  const prs = data.prs.filter((p) => inWin(p.mergedAt));
  const realDeploys = data.deployments.filter((d) => inWin(d.at));
  const usingDeployments = data.deployments.length > 0;

  const leadHours = prs.map((p) => (new Date(p.mergedAt) - new Date(p.startedAt)) / HOUR);
  const deployCount = usingDeployments ? realDeploys.filter((d) => d.state === 'success').length : prs.length;
  const failedCount = usingDeployments
    ? realDeploys.filter((d) => ['failure', 'error'].includes(d.state)).length
    : prs.filter((p) => FAILURE_RE.test(p.title) || p.labels.some((l) => FAILURE_RE.test(l))).length;
  const totalDeploys = usingDeployments ? realDeploys.length : prs.length;
  const mttrHours = data.incidents
    .filter((i) => inWin(i.resolvedAt))
    .map((i) => (new Date(i.resolvedAt) - new Date(i.openedAt)) / HOUR);

  return {
    from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    leadTimeHours: round(median(leadHours)),
    deploymentFrequency: deployCount,
    changeFailureRate: totalDeploys ? round((failedCount / totalDeploys) * 100) : null,
    mttrHours: round(mean(mttrHours)),
    samples: { prs: prs.length, deployments: totalDeploys, incidents: mttrHours.length },
  };
}

// DORA 성능 등급 (State of DevOps 기준을 단순화)
function grade(metric, v) {
  if (v == null) return { label: '데이터 없음', color: '#9ca3af' };
  const tiers = {
    leadTimeHours: [[24, 'Elite'], [24 * 7, 'High'], [24 * 30, 'Medium']],
    mttrHours: [[1, 'Elite'], [24, 'High'], [24 * 7, 'Medium']],
    changeFailureRate: [[5, 'Elite'], [10, 'High'], [15, 'Medium']],
  };
  const colors = { Elite: '#16a34a', High: '#2563eb', Medium: '#d97706', Low: '#dc2626' };
  let label = 'Low';
  if (metric === 'deploymentFrequency') {
    label = v >= 7 ? 'Elite' : v >= 1 ? 'High' : v >= 0.25 ? 'Medium' : 'Low'; // 주당 횟수
  } else {
    label = (tiers[metric].find(([max]) => v <= max) ?? [0, 'Low'])[1];
  }
  return { label, color: colors[label] };
}

// ---------- 출력 ----------
const fmtHours = (h) => {
  if (h == null) return '-';
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < 48) return `${round(h)}시간`;
  return `${round(h / 24)}일`;
};
const fmt = {
  leadTimeHours: fmtHours,
  mttrHours: fmtHours,
  deploymentFrequency: (v) => `${v}회/주`,
  changeFailureRate: (v) => (v == null ? '-' : `${v}%`),
};

function buildSvg(weeks, latest, demo) {
  const W = 960, H = 640;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cards = [
    ['leadTimeHours', 'Lead Time', '변경 리드타임 (중앙값)'],
    ['deploymentFrequency', 'Deployment Frequency', '배포 빈도'],
    ['changeFailureRate', 'Change Failure Rate', '변경 실패율'],
    ['mttrHours', 'MTTR', '평균 복구 시간'],
  ];
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI','Malgun Gothic',Arial,sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="24" y="38" font-size="22" font-weight="700" fill="#111827">DORA Metrics Dashboard</text>
<text x="24" y="60" font-size="13" fill="#6b7280">${esc(REPO)} · 최근 ${WEEKS}주 · ${new Date(latest.to).toISOString().slice(0, 10)} 기준${demo ? ' · 샘플 데이터(시안)' : ''}</text>
`;
  cards.forEach(([key, title, sub], i) => {
    const x = 24 + i * 232, y = 80, gr = grade(key, latest[key]);
    g += `<rect x="${x}" y="${y}" width="216" height="104" rx="10" fill="#f9fafb" stroke="#e5e7eb"/>
<text x="${x + 14}" y="${y + 24}" font-size="13" font-weight="600" fill="#374151">${title}</text>
<text x="${x + 14}" y="${y + 44}" font-size="11" fill="#9ca3af">${sub}</text>
<text x="${x + 14}" y="${y + 80}" font-size="26" font-weight="700" fill="#111827">${esc(latest[key] == null ? '-' : fmt[key](latest[key]))}</text>
<rect x="${x + 128}" y="${y + 66}" width="74" height="22" rx="11" fill="${gr.color}"/>
<text x="${x + 165}" y="${y + 81}" font-size="11" font-weight="600" fill="#fff" text-anchor="middle">${gr.label}</text>
`;
  });

  const charts = [
    ['leadTimeHours', 'Lead Time (시간)', '#2563eb'],
    ['deploymentFrequency', '배포 횟수 (주)', '#16a34a'],
    ['changeFailureRate', '변경 실패율 (%)', '#dc2626'],
    ['mttrHours', 'MTTR (시간)', '#d97706'],
  ];
  charts.forEach(([key, title, color], i) => {
    const cx = 24 + (i % 2) * 468, cy = 208 + Math.floor(i / 2) * 212, cw = 444, ch = 196;
    const px = cx + 40, py = cy + 40, pw = cw - 56, ph = ch - 74;
    const vals = weeks.map((w) => w[key]);
    const max = Math.max(1, ...vals.filter((v) => v != null)) * 1.15;
    g += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="10" fill="#fff" stroke="#e5e7eb"/>
<text x="${cx + 14}" y="${cy + 24}" font-size="13" font-weight="600" fill="#374151">${title}</text>
`;
    for (let t = 0; t <= 4; t++) {
      const yy = py + ph - (ph * t) / 4;
      g += `<line x1="${px}" y1="${yy}" x2="${px + pw}" y2="${yy}" stroke="#f3f4f6"/>
<text x="${px - 6}" y="${yy + 4}" font-size="10" fill="#9ca3af" text-anchor="end">${round((max * t) / 4)}</text>
`;
    }
    const step = pw / Math.max(1, weeks.length - 1);
    const pts = weeks.map((w, k) => [px + k * step, w[key] == null ? null : py + ph - (w[key] / max) * ph]);
    if (key === 'deploymentFrequency') {
      const bw = Math.min(28, step * 0.6);
      pts.forEach(([x, y]) => { if (y != null) g += `<rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${py + ph - y}" rx="3" fill="${color}" opacity="0.85"/>\n`; });
    } else {
      const line = pts.filter(([, y]) => y != null).map(([x, y]) => `${x},${y}`).join(' ');
      if (line) g += `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>\n`;
      pts.forEach(([x, y]) => { if (y != null) g += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>\n`; });
    }
    weeks.forEach((w, k) => {
      const label = w.from.slice(5, 10);
      g += `<text x="${px + k * step}" y="${py + ph + 16}" font-size="10" fill="#9ca3af" text-anchor="middle">${label}</text>\n`;
    });
  });
  g += `<text x="24" y="${H - 12}" font-size="11" fill="#9ca3af">Lead Time: 첫 커밋→병합 · Frequency: main 병합/배포 수 · CFR: 실패 배포 비율 · MTTR: incident/bug 이슈 해결 시간</text>\n</svg>\n`;
  return g;
}

function buildReport(latest, weeks, demo) {
  const rows = [
    ['Lead Time (중앙값)', 'leadTimeHours'],
    ['Deployment Frequency', 'deploymentFrequency'],
    ['Change Failure Rate', 'changeFailureRate'],
    ['MTTR (평균)', 'mttrHours'],
  ].map(([name, key]) => {
    const prev = weeks.at(-2)?.[key];
    const cur = latest[key];
    const diff = cur != null && prev != null ? (cur - prev > 0 ? '▲' : cur - prev < 0 ? '▼' : '=') : '-';
    return `| ${name} | ${cur == null ? '-' : fmt[key](cur)} | ${prev == null ? '-' : fmt[key](prev)} ${diff} | ${grade(key, cur).label} |`;
  });
  return `# DORA 주간 보고서

- 저장소: ${REPO}
- 기간: ${latest.from.slice(0, 10)} ~ ${latest.to.slice(0, 10)}
- 생성: ${new Date().toISOString()}${demo ? '\n- ⚠️ 샘플 데이터로 만든 시안입니다.' : ''}

| 지표 | 이번 주 | 지난주 | 등급 |
|------|---------|--------|------|
${rows.join('\n')}

표본: PR ${latest.samples.prs}건 · 배포 ${latest.samples.deployments}회 · 복구 이슈 ${latest.samples.incidents}건

![DORA Dashboard](./dashboard.svg)
`;
}

// ---------- main ----------
const now = Date.now();
const since = new Date(now - WEEKS * WEEK);
const data = DEMO ? demoData(now) : await collect(since);

const weeks = [];
for (let w = WEEKS - 1; w >= 0; w--) weeks.push(computeWindow(data, now - (w + 1) * WEEK, now - w * WEEK));
const latest = weeks.at(-1);

const out = { repository: REPO, generatedAt: new Date(now).toISOString(), demo: DEMO, latest, weeks, raw: data };
fs.writeFileSync('dora-metrics.json', JSON.stringify(out, null, 2));
fs.mkdirSync('docs/dora', { recursive: true });
fs.writeFileSync('docs/dora/dashboard.svg', buildSvg(weeks, latest, DEMO));
fs.writeFileSync('docs/dora/report.md', buildReport(latest, weeks, DEMO));

const histPath = path.join('docs/dora', 'history.json');
const history = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
if (!DEMO) {
  const entry = { week: latest.from.slice(0, 10), ...latest };
  const idx = history.findIndex((h) => h.week === entry.week);
  if (idx >= 0) history[idx] = entry; else history.push(entry);
  fs.writeFileSync(histPath, JSON.stringify(history, null, 2));
}
console.log(JSON.stringify(latest, null, 2));

// README의 <!-- DORA:START --> ~ <!-- DORA:END --> 구간을 최신 요약으로 교체
if (fs.existsSync('README.md')) {
  const readme = fs.readFileSync('README.md', 'utf8');
  const block = `<!-- DORA:START -->
${buildReport(latest, weeks, DEMO).replace('# DORA 주간 보고서', '### 📊 DORA 주간 요약').replace('(./dashboard.svg)', '(docs/dora/dashboard.svg)')}
[전체 보고서](docs/dora/report.md) · 매주 월요일 GitHub Actions가 자동 갱신합니다.
<!-- DORA:END -->`;
  const re = /<!-- DORA:START -->[\s\S]*?<!-- DORA:END -->/;
  if (re.test(readme)) fs.writeFileSync('README.md', readme.replace(re, () => block));
}
