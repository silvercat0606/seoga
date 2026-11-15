import { isCloud, loadLocal, createLocalStore, createCloudStore } from './store.js';

/* ───────── 상수 ───────── */
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const PALETTE = ['#2F5D50', '#8A6A1F', '#2E4A6B', '#7A2E2E', '#5B3A5E', '#4A5D2F', '#6B4A2E'];
const RARE_CHANCE = 0.08;
const TIMER_MS = 5 * 60 * 1000;
const MONTH_THEME = ['새해', '늦겨울', '봄맞이', '벚꽃', '초록', '초여름', '장마', '한여름', '초가을', '단풍', '겨울', '눈 내리는'];
const SIZE_W = { S: 22, M: 30, L: 40 };      // 책 두께(넓은 화면)
const SIZE_MINI = { S: 4, M: 6, L: 8 };      // 책 두께(폰 요일 띠)

const CAT_NAME = { bm: '책갈피', ex: '장서표', band: '띠지', end: '북엔드', prop: '서가 소품' };
const ITEMS = [
  ...[['첫눈', '#2E4A6B'], ['새벽', '#5B3A5E'], ['은행잎', '#8A6A1F'], ['동백', '#7A2E2E'], ['밤바다', '#1F3A4F'], ['보름달', '#6B5A2E'],
    ['이끼', '#4A5D2F'], ['귤', '#A0522D'], ['라벤더', '#6A5A8A'], ['장마', '#4F5B66'], ['모래', '#8C7B5E'], ['별자리', '#2B2B4F']]
    .map(([n, c], i) => ({ id: 'bm' + i, cat: 'bm', name: n, color: c })),
  ...[['고양이', '#5E5E5E'], ['부엉이', '#6B4A2E'], ['열쇠', '#8A6A1F'], ['등대', '#2E4A6B'], ['찻잔', '#7A2E2E'], ['나침반', '#4A5D2F'],
    ['깃펜', '#2B2B4F'], ['우산', '#4F5B66'], ['사과', '#9A3B2E'], ['왕관', '#B8892B', true]]
    .map(([n, c, r], i) => ({ id: 'ex' + i, cat: 'ex', name: n, color: c, rare: !!r })),
  ...[['신간', '#2F5D50'], ['추천', '#7A2E2E'], ['초판', '#2E4A6B'], ['베스트', '#8A6A1F'], ['한정판', '#B8892B', true], ['서평', '#5B3A5E'],
    ['수상작', '#4A5D2F'], ['재판', '#5E5E5E']]
    .map(([n, c, r], i) => ({ id: 'band' + i, cat: 'band', name: n, color: c, rare: !!r })),
  { id: 'end0', cat: 'end', name: '돌', color: '#6E6E6E' },
  { id: 'end1', cat: 'end', name: '나무', color: '#6B4A2E' },
  { id: 'end2', cat: 'end', name: '황동', color: '#B8892B', rare: true },
  { id: 'end3', cat: 'end', name: '전집', color: '#3A2A20', special: true },
  ...[['화분', '#4A5D2F'], ['촛대', '#8A6A1F'], ['모래시계', '#6B5A2E'], ['지구본', '#2E4A6B', true], ['돋보기', '#5E5E5E'], ['작은 새', '#7A2E2E']]
    .map(([n, c, r], i) => ({ id: 'prop' + i, cat: 'prop', name: n, color: c, rare: !!r }))
];
const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/* ───────── 날짜 ───────── */
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const dayIdx = (d) => (d.getDay() + 6) % 7; // 월=0 … 일=6
const mondayOf = (d) => addDays(d, -dayIdx(d));
const todayKey = () => key(new Date());
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a (일)
const md = (k) => { const d = parse(k); return `${d.getMonth() + 1}.${d.getDate()}`; };
const weekday = (k) => DAYS[dayIdx(parse(k))];

/** 마감일을 '이번 주/다음 주/n주 뒤 ~요일'로 (월~일 기준 주) */
export function relLabel(dueK, todayK) {
  const w = Math.round((mondayOf(parse(dueK)) - mondayOf(parse(todayK))) / (7 * 86400000));
  const dn = weekday(dueK) + '요일';
  if (w === 0) return '이번 주 ' + dn;
  if (w === 1) return '다음 주 ' + dn;
  if (w > 1) return `${w}주 뒤 ${dn}`;
  if (w === -1) return '지난 주 ' + dn;
  return `${-w}주 전 ${dn}`;
}

/* ───────── 유틸 ───────── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ───────── 상태 ───────── */
let S = null;
let store = null;
let user = null;
const ui = {
  tab: 'desk', weekOff: 0, sel: null, nowSkip: 0, more: false, showDone: false,
  modal: null, timer: null, authReady: !isCloud, error: null, today: todayKey(),
  banner: localStorage.getItem('seoga-banner-off') !== '1'
};
let deferred = false;

function norm(s) {
  s = s && typeof s === 'object' ? s : {};
  return { v: 1, tasks: Array.isArray(s.tasks) ? s.tasks : [], items: s.items || {}, dailyDate: s.dailyDate || null };
}
function commit() { store.save(S); render(); }
const find = (id) => S.tasks.find((t) => t.id === id);

/* ───────── 선택자 ───────── */
const undone = () => S.tasks.filter((t) => !t.doneAt);
const imp = (t) => (t.important ? 1 : 0);
const sortTasks = (a) => a.sort((x, y) => imp(y) - imp(x) || x.due.localeCompare(y.due) || (x.created || 0) - (y.created || 0));

/** 그 날 칸에 들어갈 일: 남은 일(오늘 칸은 기한 지난 일 포함), 끝낸 일(끝낸 날 기준) */
function dayTasks(k) {
  const T = todayKey();
  const u = undone().filter((t) => (k === T ? t.due <= T : k > T && t.due === k));
  const d = S.tasks.filter((t) => t.doneAt && t.doneDate === k).sort((a, b) => a.doneAt - b.doneAt);
  return { u: sortTasks(u), d };
}
function upcoming() {
  const end = key(addDays(mondayOf(new Date()), 6));
  return undone().filter((t) => t.due > end).sort((a, b) => a.due.localeCompare(b.due) || imp(b) - imp(a));
}
function movedLabel(t) {
  const n = diffDays(t.due, todayKey());
  if (n <= 0) return '';
  return n === 1 ? '어제에서 옮겨옴' : `${n}일 전에서 옮겨옴`;
}
function nowTask() {
  const T = todayKey();
  let list = sortTasks(undone().filter((t) => t.due <= T));
  if (!list.length) list = undone().sort((a, b) => a.due.localeCompare(b.due) || imp(b) - imp(a));
  if (!list.length) return null;
  return list[ui.nowSkip % list.length];
}
const owned = (cat) => ITEMS.filter((i) => i.cat === cat && S.items[i.id]).length;
const total = (cat) => ITEMS.filter((i) => i.cat === cat).length;

/* ───────── 보상 ───────── */
function drawItem() {
  const T = todayKey();
  let item, daily = false;
  if (S.dailyDate !== T) {            // 하루의 첫 착수 = 오늘의 책갈피
    const bms = ITEMS.filter((i) => i.cat === 'bm');
    item = bms[hash(T) % bms.length];
    S.dailyDate = T; daily = true;
  } else {
    const pool = ITEMS.filter((i) => !i.special);
    const w = pool.map((i) => (i.rare ? 1 : 6));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    item = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) { item = pool[i]; break; } }
  }
  const isNew = !S.items[item.id];
  S.items[item.id] = (S.items[item.id] || 0) + 1;
  return { id: item.id, isNew, daily };
}
function makeBook(t) {
  const h = hash(t.id);
  return { color: PALETTE[h % PALETTE.length], h: 0.7 + (h % 31) / 100, rare: Math.random() < RARE_CHANCE };
}

/* ───────── 동작 ───────── */
function start(id) {
  const t = find(id); if (!t || t.doneAt) return;
  let draw = null;
  if (!t.startedAt) { t.startedAt = Date.now(); draw = drawItem(); }
  ui.modal = null;
  ui.timer = { taskId: id, endAt: Date.now() + TIMER_MS, total: TIMER_MS, draw, over: false };
  commit(); startTick();
}
function complete(id) {
  const t = find(id); if (!t) return;
  t.doneAt = Date.now(); t.doneDate = todayKey();
  if (!t.book) t.book = makeBook(t);
  let msg = t.book.rare ? '희귀본이 나왔어요! 금박 책이 꽂혔어요' : '책이 한 권 꽂혔어요';
  if (t.seriesId) {
    const all = S.tasks.filter((x) => x.seriesId === t.seriesId);
    if (all.every((x) => x.doneAt) && !all.some((x) => x.seriesBonus)) {
      all.forEach((x) => { x.seriesBonus = true; });
      S.items.end3 = (S.items.end3 || 0) + 1;
      msg = `전집 완성! 「${t.seriesTitle}」 전집 북엔드를 받았어요`;
    }
  }
  ui.timer = null; ui.modal = null; stopTick();
  commit(); toast(msg);
}
function reopen(id) { const t = find(id); if (!t) return; t.doneAt = null; t.doneDate = null; ui.modal = null; commit(); }
function remove(id) {
  const t = find(id); if (!t) return;
  if (!confirm(`「${t.title}」을(를) 삭제할까요?`)) return;
  S.tasks = S.tasks.filter((x) => x.id !== id); ui.modal = null; commit();
}

/* ───────── 타이머 ───────── */
let tick = null;
function startTick() {
  stopTick();
  tick = setInterval(() => {
    const tm = ui.timer; if (!tm) return stopTick();
    const left = Math.max(0, tm.endAt - Date.now());
    const el = document.getElementById('tm-time');
    if (el) el.textContent = fmt(left);
    const ring = document.getElementById('tm-ring');
    if (ring) ring.setAttribute('stroke-dashoffset', String(ringOffset(left, tm.total)));
    if (left === 0 && !tm.over) { tm.over = true; render(); }
  }, 500);
}
function stopTick() { if (tick) clearInterval(tick); tick = null; }
const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const RING_C = 2 * Math.PI * 74;
const ringOffset = (left, totalMs) => (RING_C * (1 - left / totalMs)).toFixed(1);

/* ───────── 토스트 ───────── */
let toastT = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2800);
}

/* ───────── 조각 ───────── */
const ICON = {
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
  left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  desk: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h18M5 9v10M19 9v10M7 9V6h10v3"/></svg>',
  shelf: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h16v18H4zM4 12h16M8 6v6M11 7v5M14 15v6M17 16v5"/></svg>',
  dex: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
  box: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5"/></svg>'
};
const TABS = [['desk', '책상'], ['shelf', '서가'], ['dex', '도감'], ['box', '원고함']];

function seriesText(t) { return t.seriesId ? `${esc(t.seriesTitle)} · 전집 ${t.vol}/${t.vols}권` : ''; }
function meta(t, { moved = true, size = true } = {}) {
  const p = [];
  if (t.important) p.push('<b class="red">중요</b>');
  if (t.seriesId) p.push(seriesText(t));
  if (moved && !t.doneAt) { const m = movedLabel(t); if (m) p.push(`<span class="pill">${m}</span>`); }
  if (size) p.push(t.size || 'M');
  return p.join(' · ');
}
function paper(t, cls = '') {
  return `<span class="paper ${cls} sz-${t.size || 'M'}${t.important ? ' imp' : ''}" aria-hidden="true"></span>`;
}
function book(t, mode) {
  const b = t.book || { color: PALETTE[0], h: 0.85, rare: false };
  const sz = t.size || 'M';
  if (mode === 'mini') {
    return `<span class="mini${b.rare ? ' rare' : ''}" style="--c:${b.color};width:${SIZE_MINI[sz]}px;height:${Math.round(30 * b.h)}px"></span>`;
  }
  const title = esc(t.title) + (b.rare ? ' · 희귀본' : '');
  return `<button class="book${b.rare ? ' rare' : ''}${t.important ? ' imp' : ''}" style="--c:${b.color};width:${SIZE_W[sz]}px;height:${Math.round(165 * b.h)}px" data-act="edit" data-id="${t.id}" aria-label="${esc(t.title)}, ${t.doneDate ? md(t.doneDate) : ''}에 끝냄${b.rare ? ', 희귀본' : ''}"><span>${title}</span></button>`;
}
function acc(id, lg) {
  const it = ITEM[id];
  return `<span class="acc acc-${it.cat}${lg ? ' lg' : ''}${it.rare || it.special ? ' gold' : ''}" style="--c:${it.color}" aria-hidden="true"></span>`;
}

function weekInfo() {
  const mon = addDays(mondayOf(new Date()), ui.weekOff * 7);
  const keys = DAYS.map((_, i) => key(addDays(mon, i)));
  const o = ui.weekOff;
  const title = o === 0 ? '이번 주' : o === 1 ? '다음 주' : o === -1 ? '지난 주' : o > 1 ? `${o}주 뒤` : `${-o}주 전`;
  const range = `${mon.getFullYear()}년 ${mon.getMonth() + 1}월 · ${md(keys[0])} – ${md(keys[6])}`;
  return { keys, title, range };
}
function weekNav(label) {
  return `<div class="weeknav">
    <button class="icon-btn" data-act="wk" data-d="-1" aria-label="이전 주">${ICON.left}</button>
    <button class="text-btn" data-act="wk0"${ui.weekOff === 0 ? ' disabled' : ''}>${label}</button>
    <button class="icon-btn" data-act="wk" data-d="1" aria-label="다음 주">${ICON.right}</button>
  </div>`;
}

function nowCard() {
  const t = nowTask();
  if (!t) {
    return `<section class="now" aria-label="지금 5분"><p class="now-label">지금 5분만</p>
      <p class="now-empty">남은 할 일이 없어요.</p>
      <button class="btn-primary big" data-act="new">할 일 추가</button></section>`;
  }
  const T = todayKey();
  const when = t.due < T ? movedLabel(t) : t.due === T ? '오늘 마감' : `${relLabel(t.due, T)} 마감`;
  const info = [t.seriesId ? seriesText(t) : '', when, '두께 ' + (t.size || 'M')].filter(Boolean).join(' · ');
  return `<section class="now" aria-label="지금 5분">
    <div class="now-top"><span class="now-label">지금 5분만</span>${t.important ? '<span class="tag-red">중요</span>' : ''}</div>
    <div class="now-body">${paper(t, 'lg')}<div><p class="now-title">${esc(t.title)}</p><p class="now-meta">${info}</p></div></div>
    <button class="btn-primary big" data-act="start" data-id="${t.id}">${ICON.play} 시작하기${t.startedAt ? '' : ' · 부속품 뽑기 1회'}</button>
    <div class="now-foot"><span>끝까지 못 해도 착수 보상은 받아요</span>${undone().length > 1 ? '<button class="text-btn" data-act="skip">다른 일</button>' : ''}</div>
  </section>`;
}

function row(t) {
  return `<div class="row">
    <button class="row-main" data-act="edit" data-id="${t.id}">${paper(t)}<span class="row-text"><span class="row-title">${esc(t.title)}</span><span class="row-meta">${meta(t)}</span></span></button>
    <button class="btn-line" data-act="start" data-id="${t.id}">시작</button>
  </div>`;
}
function doneRow(t) {
  return `<button class="row-done" data-act="edit" data-id="${t.id}">${book(t, 'mini')}<span class="row-title">${esc(t.title)}</span><span class="row-meta">${t.book?.rare ? '희귀본 · ' : ''}끝냄</span></button>`;
}

function upcomingSection() {
  const list = upcoming(); const T = todayKey();
  const items = list.map((t) => `<button class="up" data-act="edit" data-id="${t.id}">
      <span class="up-when"><b>${relLabel(t.due, T)}</b><span>${md(t.due)}</span></span>
      <span class="up-what"><span>${esc(t.title)}</span><span class="row-meta">${meta(t, { moved: false, size: false })}</span></span>
    </button>`).join('');
  return `<section class="card upcoming" aria-label="다가오는 할 일">
    <div class="sec-head"><h2>다가오는 할 일</h2><span class="muted">이번 주 이후</span></div>
    ${items || '<p class="empty">이번 주 이후 할 일이 없어요.</p>'}
  </section>`;
}

/* ───────── 화면: 책상 ───────── */
function phoneDesk() {
  const T = todayKey(); const W = weekInfo();
  const sel = W.keys.includes(ui.sel) ? ui.sel : (W.keys.includes(T) ? T : W.keys[0]);
  const cells = W.keys.map((k, i) => {
    const { u, d } = dayTasks(k);
    const isT = k === T;
    const books = d.map((t) => book(t, 'mini')).join('');
    const papers = u.slice(0, 4).map((t) => `<span class="mini-paper${t.important ? ' imp' : ''}"></span>`).join('');
    const label = `${DAYS[i]}요일 ${md(k)}${isT ? ', 오늘' : ''}: 끝낸 일 ${d.length}개, 남은 일 ${u.length}개`;
    return `<button class="cell${isT ? ' today' : ''}${k === sel ? ' sel' : ''}" data-act="day" data-k="${k}" aria-label="${label}" aria-pressed="${k === sel}">
      <span class="cell-day">${DAYS[i]}${isT ? ' · 오늘' : ''}</span><span class="cell-date">${parse(k).getDate()}</span>
      <span class="cell-shelf">${books}${papers ? `<span class="mini-papers">${papers}</span>` : ''}</span>
    </button>`;
  }).join('');

  const { u, d } = dayTasks(sel);
  const dt = parse(sel);
  const heading = sel === T ? '오늘의 할 일' : `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${weekday(sel)}) 할 일`;
  const shown = ui.more ? u : u.slice(0, 3);
  const emptyMsg = sel < T ? '이 날 남은 일은 오늘 칸으로 옮겨졌어요.' : '남은 할 일이 없어요.';
  return `
  <header class="ph-head">
    <div><div class="ph-range">${weekNav(W.title)}<span class="muted">${W.range}</span></div><h1>오늘의 책상</h1></div>
    <button class="fab" data-act="new" data-due="${sel >= T ? sel : T}" aria-label="할 일 추가">${ICON.plus}</button>
  </header>
  <section class="strip-wrap" aria-label="${W.title} 책장">
    <div class="strip">${cells}</div>
    <p class="hint">세운 책 = 끝낸 일 · 눕힌 종이 = 남은 일</p>
  </section>
  ${nowCard()}
  <section class="day" aria-label="${heading}">
    <div class="sec-head"><h2>${heading}</h2><span class="muted">${u.length}개 남음 · ${d.length}권 꽂힘</span></div>
    <div class="rows">${shown.map(row).join('') || `<p class="empty">${emptyMsg}</p>`}</div>
    ${u.length > 3 ? `<button class="text-btn more" data-act="more">${ui.more ? '접기' : `${u.length - 3}개 더 보기`}</button>` : ''}
    ${d.length ? `<button class="text-btn more" data-act="done-toggle">${ui.showDone ? '끝낸 일 접기' : `끝낸 일 ${d.length}개 보기`}</button>${ui.showDone ? `<div class="rows">${d.map(doneRow).join('')}</div>` : ''}` : ''}
  </section>
  ${upcomingSection()}`;
}

function wideDesk() {
  const T = todayKey(); const W = weekInfo();
  const cols = W.keys.map((k, i) => {
    const { u, d } = dayTasks(k);
    const isT = k === T;
    const papers = u.map((t) => `<button class="pcard sz-${t.size || 'M'}${t.important ? ' imp' : ''}" data-act="edit" data-id="${t.id}">
        <span class="pcard-title">${esc(t.title)}</span>${t.seriesId || movedLabel(t) ? `<span class="pcard-meta">${[t.seriesId ? `전집 ${t.vol}/${t.vols}권` : '', movedLabel(t)].filter(Boolean).join(' · ')}</span>` : ''}
      </button>`).join('');
    return `<section class="col${isT ? ' today' : ''}" aria-label="${DAYS[i]}요일 ${md(k)}${isT ? ', 오늘' : ''}">
      <div class="col-head"><span>${DAYS[i]}${isT ? ' · 오늘' : ''}</span><b>${parse(k).getDate()}</b></div>
      <div class="col-shelf">${d.map((t) => book(t)).join('')}</div>
      <div class="col-papers">${papers}${k >= T ? `<button class="col-add" data-act="new" data-due="${k}" aria-label="${DAYS[i]}요일에 할 일 추가">+ 추가</button>` : ''}</div>
    </section>`;
  }).join('');

  const now = new Date();
  const monthBooks = S.tasks.filter((t) => t.doneAt && t.doneDate && t.doneDate.slice(0, 7) === key(now).slice(0, 7)).sort((a, b) => a.doneAt - b.doneAt);
  const itemCount = Object.values(S.items).reduce((a, b) => a + b, 0);
  return `<div class="wide">
    <main class="wide-main">
      <div class="sec-head big"><h1>${W.title} 책장</h1><span class="muted">${W.range}</span>${weekNav('이번 주로')}</div>
      <div class="week-scroll"><div class="week">${cols}</div></div>
      <div class="legend">
        <span><span class="lg-books"><i style="width:6px;height:12px"></i><i style="width:9px;height:16px"></i><i style="width:12px;height:20px"></i></span>두께 S · M · L = 일의 크기</span>
        <span><i class="lg-ribbon"></i>빨간 가름끈 = 중요</span>
        <span><i class="lg-rare"></i>금박 테두리 = 희귀본</span>
        <span><i class="lg-paper"></i>종이 묶음 = 남은 일</span>
      </div>
    </main>
    <aside class="wide-side">
      ${nowCard()}
      ${upcomingSection()}
      <section class="card" aria-label="이번 달 서가">
        <div class="sec-head"><h2>${now.getMonth() + 1}월 서가 · ${MONTH_THEME[now.getMonth()]} 서가</h2><button class="text-btn" data-act="tab" data-tab="shelf">전체 보기</button></div>
        <div class="month-mini">${monthBooks.map((t) => book(t, 'mini')).join('') || '<span class="muted small">아직 꽂힌 책이 없어요</span>'}</div>
        <p class="muted small">${monthBooks.length}권 · 희귀본 ${monthBooks.filter((t) => t.book?.rare).length}권 · 부속품 ${itemCount}개</p>
      </section>
    </aside>
  </div>`;
}

/* ───────── 화면: 서가 ───────── */
function shelfView() {
  const done = S.tasks.filter((t) => t.doneAt && t.doneDate).sort((a, b) => a.doneAt - b.doneAt);
  const byMonth = {};
  done.forEach((t) => { (byMonth[t.doneDate.slice(0, 7)] ||= []).push(t); });
  const months = Object.keys(byMonth).sort().reverse();
  const body = months.map((m) => {
    const [y, mo] = m.split('-').map(Number); const list = byMonth[m];
    return `<section class="month" aria-label="${y}년 ${mo}월 서가">
      <div class="sec-head"><h2>${y}년 ${mo}월 · ${MONTH_THEME[mo - 1]} 서가</h2><span class="muted">${list.length}권 · 희귀본 ${list.filter((t) => t.book?.rare).length}권</span></div>
      <div class="bigshelf">${list.map((t) => `<span class="slot">${book(t)}</span>`).join('')}</div>
    </section>`;
  }).join('');
  return `<div class="page"><header class="ph-head only-phone"><h1>서가</h1></header>
    <h1 class="only-wide page-title">서가</h1>
    ${body || '<p class="empty big-empty">할 일을 끝내면 여기에 책이 한 권씩 꽂혀요.</p>'}</div>`;
}

/* ───────── 화면: 도감 ───────── */
function dexView() {
  const got = ITEMS.filter((i) => S.items[i.id]).length;
  const cats = Object.keys(CAT_NAME).map((c) => {
    const cells = ITEMS.filter((i) => i.cat === c).map((i) => {
      const n = S.items[i.id] || 0;
      return n
        ? `<div class="dex-cell">${acc(i.id)}<span class="dex-name">${esc(i.name)}${i.rare ? ' ★' : ''}</span><span class="muted small">×${n}</span></div>`
        : `<div class="dex-cell off"><span class="acc-off" aria-hidden="true">?</span><span class="dex-name">${i.special ? '전집 완성 보상' : '???'}</span></div>`;
    }).join('');
    return `<section class="dex-cat"><div class="sec-head"><h2>${CAT_NAME[c]}</h2><span class="muted">${owned(c)} / ${total(c)}</span></div><div class="dex-grid">${cells}</div></section>`;
  }).join('');
  return `<div class="page"><header class="ph-head only-phone"><h1>도감</h1><span class="muted">${got} / ${ITEMS.length}</span></header>
    <div class="only-wide sec-head big"><h1>도감</h1><span class="muted">${got} / ${ITEMS.length}</span></div>
    <p class="muted small">할 일을 시작하면 부속품을 하나 뽑아요. 하루의 첫 착수에는 '오늘의 책갈피'가 나와요. ★는 희귀 부속품이에요.</p>
    ${cats}</div>`;
}

/* ───────── 화면: 원고함 ───────── */
function boxView() {
  const T = todayKey();
  const groups = new Map();
  sortTasks(undone()).sort((a, b) => a.due.localeCompare(b.due)).forEach((t) => {
    let g;
    if (t.due < T) g = '지난 할 일 (오늘 칸으로 옮겨짐)';
    else {
      const w = Math.round((mondayOf(parse(t.due)) - mondayOf(parse(T))) / (7 * 86400000));
      g = w === 0 ? '이번 주' : w === 1 ? '다음 주' : `${w}주 뒤`;
    }
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  });
  const body = [...groups].map(([g, list]) => `<section class="box-group"><h2 class="box-h">${g}</h2>
    <div class="rows">${list.map((t) => `<div class="row">
      <button class="row-main" data-act="edit" data-id="${t.id}">${paper(t)}<span class="row-text"><span class="row-title">${esc(t.title)}</span><span class="row-meta">${t.due < T ? '' : `${weekday(t.due)}요일 ${md(t.due)} · `}${meta(t)}</span></span></button>
      <button class="btn-line" data-act="start" data-id="${t.id}">시작</button></div>`).join('')}</div></section>`).join('');
  const done = S.tasks.filter((t) => t.doneAt).sort((a, b) => b.doneAt - a.doneAt);
  const account = isCloud
    ? `<p class="muted small">${esc(user?.email || '')} 로그인됨 · <button class="text-btn inline" data-act="logout">로그아웃</button></p>`
    : `<p class="muted small">지금은 이 기기에만 저장돼요. 폰과 노트북에서 같이 보려면 README의 Firebase 연결을 따라 해 주세요.</p>`;
  return `<div class="page"><header class="ph-head only-phone"><h1>원고함</h1><button class="fab" data-act="new" aria-label="할 일 추가">${ICON.plus}</button></header>
    <h1 class="only-wide page-title">원고함</h1>
    ${body || '<p class="empty">남은 할 일이 없어요.</p>'}
    ${done.length ? `<section class="box-group"><button class="text-btn" data-act="done-toggle">${ui.showDone ? '끝낸 일 접기' : `끝낸 일 ${done.length}개 보기`}</button>
      ${ui.showDone ? `<div class="rows">${done.slice(0, 100).map(doneRow).join('')}</div>` : ''}</section>` : ''}
    <div class="account">${account}</div></div>`;
}

/* ───────── 모달: 할 일 추가·수정 ───────── */
function modalView() {
  const m = ui.modal; const T = todayKey();
  const isNew = m.type === 'new';
  const t = isNew ? { title: '', due: m.due || T, important: false, size: 'M' } : find(m.id);
  if (!t) return '';
  const sizes = ['S', 'M', 'L'].map((s) => `<label class="seg-opt"><input type="radio" name="size" value="${s}"${(t.size || 'M') === s ? ' checked' : ''}><span>${s}</span></label>`).join('');
  let actions;
  if (isNew) actions = `<button type="button" class="btn-ghost" data-act="close">취소</button><button type="submit" class="btn-primary">추가</button>`;
  else if (t.doneAt) actions = `<button type="button" class="btn-ghost" data-act="reopen" data-id="${t.id}">되돌리기</button><button type="button" class="btn-ghost danger" data-act="delete" data-id="${t.id}">삭제</button><button type="submit" class="btn-primary">저장</button>`;
  else actions = `<button type="button" class="btn-ghost danger" data-act="delete" data-id="${t.id}">삭제</button><button type="button" class="btn-ghost" data-act="complete" data-id="${t.id}">완료 처리</button><button type="submit" class="btn-primary">저장</button>`;
  return `<div class="overlay" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <form id="tf" data-id="${isNew ? '' : t.id}" novalidate>
      <div class="sheet-head"><h2 id="m-title">${isNew ? '할 일 추가' : t.doneAt ? '끝낸 일' : '할 일'}</h2><button type="button" class="text-btn" data-act="close">닫기</button></div>
      ${!isNew && t.seriesId ? `<p class="muted small">${seriesText(t)}</p>` : ''}
      ${!isNew && t.doneAt ? `<p class="muted small">${md(t.doneDate)}에 끝냄${t.book?.rare ? ' · 희귀본' : ''}</p>` : ''}
      ${!isNew && !t.doneAt ? `<button type="button" class="btn-primary big" data-act="start" data-id="${t.id}">${ICON.play} 지금 5분 시작${t.startedAt ? '' : ' · 부속품 뽑기 1회'}</button>` : ''}
      <label class="fld"><span id="l-title">${isNew ? '할 일' : '이름'}</span><input name="title" required maxlength="80" value="${esc(t.title)}" autocomplete="off"></label>
      <label class="fld"><span>마감일</span><input type="date" name="due" required value="${t.due}"></label>
      <div class="fld"><span id="l-size">두께 (일의 크기)</span><div class="seg" role="radiogroup" aria-labelledby="l-size">${sizes}</div></div>
      <label class="chk"><input type="checkbox" name="important"${t.important ? ' checked' : ''}><span>중요한 일 <span class="muted">(빨간 가름끈)</span></span></label>
      ${isNew ? `<label class="chk"><input type="checkbox" name="series"><span>전집으로 나누기 <span class="muted">(큰 일을 여러 권으로)</span></span></label>
      <div id="serbox" hidden>
        <label class="fld"><span>권 수</span><input type="number" name="vols" min="2" max="10" value="3"></label>
        <p class="muted small">권마다 이름과 마감일을 정할 수 있어요. 위의 마감일은 마지막 권의 마감일이에요.</p>
        <div id="volrows"></div>
      </div>` : ''}
      <p class="form-err" id="ferr" role="alert"></p>
      <div class="actions">${actions}</div>
    </form></div></div>`;
}
function volRows(form) {
  const box = form.querySelector('#volrows'); if (!box) return;
  const n = Math.min(10, Math.max(2, parseInt(form.vols.value, 10) || 2));
  const T = todayKey(); const due = form.due.value || T;
  const span = Math.max(0, diffDays(T, due));
  const prev = {};
  box.querySelectorAll('.volrow').forEach((r) => { prev[r.dataset.k] = { t: r.querySelector('[data-f=t]').value, d: r.querySelector('[data-f=d]').value, dirty: r.dataset.dirty === '1' }; });
  let html = '';
  for (let k = 1; k <= n; k++) {
    const def = key(addDays(parse(T), Math.round((span * k) / n)));
    const p = prev[k];
    const d = p && p.dirty ? p.d : (k === n ? due : def);
    html += `<div class="volrow" data-k="${k}" data-dirty="${p && p.dirty ? 1 : 0}"><span class="vol-k">${k}권</span>
      <input data-f="t" aria-label="${k}권 이름" placeholder="이름 (선택)" maxlength="60" value="${esc(p ? p.t : '')}">
      <input data-f="d" type="date" aria-label="${k}권 마감일" value="${d}"></div>`;
  }
  box.innerHTML = html;
}
function submitForm(form) {
  const err = form.querySelector('#ferr');
  const title = form.title.value.trim(); const due = form.due.value;
  const size = form.querySelector('input[name=size]:checked')?.value || 'M';
  const important = form.important.checked;
  if (!title) { err.textContent = '이름을 입력해 주세요.'; form.title.focus(); return; }
  if (!due) { err.textContent = '마감일을 입력해 주세요.'; form.due.focus(); return; }
  const id = form.dataset.id;
  if (id) {
    const t = find(id); Object.assign(t, { title, due, size, important });
  } else if (form.series && form.series.checked) {
    const rows = [...form.querySelectorAll('.volrow')];
    if (rows.some((r) => !r.querySelector('[data-f=d]').value)) { err.textContent = '권마다 마감일을 입력해 주세요.'; return; }
    const sid = uid(); const n = rows.length; const now = Date.now();
    rows.forEach((r, i) => {
      const name = r.querySelector('[data-f=t]').value.trim() || `${title} ${i + 1}권`;
      S.tasks.push({ id: uid(), title: name, due: r.querySelector('[data-f=d]').value, size, important, created: now + i,
        seriesId: sid, seriesTitle: title, vol: i + 1, vols: n });
    });
  } else {
    S.tasks.push({ id: uid(), title, due, size, important, created: Date.now() });
  }
  ui.modal = null; commit();
  toast(id ? '저장했어요' : '원고가 책상에 놓였어요');
}

/* ───────── 착수 화면 ───────── */
function timerView() {
  const tm = ui.timer; const t = find(tm.taskId);
  if (!t) { ui.timer = null; return ''; }
  const left = Math.max(0, tm.endAt - Date.now());
  let reward;
  if (tm.draw) {
    const it = ITEM[tm.draw.id];
    const badges = [tm.draw.daily ? '<span class="badge dark">오늘의 책갈피</span>' : '', tm.draw.isNew ? '<span class="badge">도감 새 항목</span>' : '', it.rare ? '<span class="badge gold">희귀</span>' : ''].join('');
    reward = `<section class="reward" aria-label="착수 보상">${acc(it.id, true)}<div><div class="badges">${badges}</div>
      <p class="reward-name">${CAT_NAME[it.cat]} · ${esc(it.name)}</p><p class="muted small">${CAT_NAME[it.cat]} 도감 ${owned(it.cat)} / ${total(it.cat)}</p></div></section>`;
  } else {
    reward = `<section class="reward plain"><p>이미 착수 보상을 받은 일이에요.<br>끝내면 책이 완성돼요.</p></section>`;
  }
  const msg = left === 0 ? '5분이 지났어요. 계속해도, 여기서 멈춰도 좋아요.' : tm.draw ? '착수 보상을 받았어요. 끝내면 책이 완성돼요.' : '';
  return `<div class="overlay timer-ov"><div class="sheet timer" role="dialog" aria-modal="true" aria-labelledby="tm-title">
    <div class="timer-top"><button class="text-btn" data-act="tm-close">${ICON.left} 책상으로</button><span class="muted">제본 중</span></div>
    <div class="timer-head">${t.seriesId ? `<p class="muted small">${seriesText(t)}</p>` : ''}<h2 id="tm-title">${esc(t.title)}</h2></div>
    <div class="ring"><svg width="168" height="168" viewBox="0 0 168 168" aria-hidden="true">
      <circle cx="84" cy="84" r="74" fill="none" stroke="#E2E2E2" stroke-width="10"/>
      <circle id="tm-ring" cx="84" cy="84" r="74" fill="none" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${ringOffset(left, tm.total)}" transform="rotate(-90 84 84)"/></svg>
      <div class="ring-txt"><span id="tm-time" role="timer">${fmt(left)}</span><span class="muted small">남은 시간</span></div></div>
    ${reward}
    ${msg ? `<p class="timer-msg">${msg}</p>` : ''}
    <div class="timer-actions">
      <button class="btn-primary big" data-act="complete" data-id="${t.id}">다 했어요 · 제본 완료</button>
      <div class="two"><button class="btn-ghost" data-act="tm-more">5분 더</button><button class="btn-ghost" data-act="tm-close">오늘은 여기까지</button></div>
    </div></div></div>`;
}

/* ───────── 전체 렌더 ───────── */
function render() {
  deferred = false;
  if (ui.error) { app.innerHTML = `<div class="login"><h1>서가</h1><p>${esc(ui.error)}</p></div>`; return; }
  if (isCloud && !ui.authReady) { app.innerHTML = '<p class="loading">불러오는 중…</p>'; return; }
  if (isCloud && !user) {
    app.innerHTML = `<div class="login"><h1>서가</h1><p class="muted">할 일을 끝내면 책이 한 권씩 꽂히는 투두리스트</p>
      <button class="btn-primary big" data-act="login">Google로 로그인</button></div>`; return;
  }
  if (!S) { app.innerHTML = '<p class="loading">불러오는 중…</p>'; return; }

  const content = ui.tab === 'desk' ? `<div class="only-phone">${phoneDesk()}</div><div class="only-wide">${wideDesk()}</div>`
    : ui.tab === 'shelf' ? shelfView() : ui.tab === 'dex' ? dexView() : boxView();
  const wideTabs = TABS.map(([k, n]) => `<button class="wtab${ui.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}"${ui.tab === k ? ' aria-current="page"' : ''}>${n}</button>`).join('');
  const phoneTabs = TABS.map(([k, n]) => `<button class="ptab${ui.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}"${ui.tab === k ? ' aria-current="page"' : ''}>${ICON[k]}<span>${n}</span></button>`).join('');
  const banner = !isCloud && ui.banner
    ? `<div class="banner"><span>이 기기에만 저장 중이에요. 기기 간 동기화는 README를 참고하세요.</span><button class="text-btn" data-act="banner-off">닫기</button></div>` : '';

  const scroll = window.scrollY;
  app.innerHTML = `
    <header class="wide-head only-wide"><div class="wide-head-in">
      <span class="brand">서가</span><nav class="wtabs" aria-label="주 메뉴">${wideTabs}</nav><span class="grow"></span>
      <button class="btn-primary" data-act="new">${ICON.plus} 할 일 추가</button></div></header>
    ${banner}
    <div class="content">${content}</div>
    <nav class="ptabs only-phone" aria-label="주 메뉴">${phoneTabs}</nav>
    ${ui.modal ? modalView() : ''}
    ${ui.timer ? timerView() : ''}`;
  window.scrollTo(0, scroll);

  const form = document.getElementById('tf');
  if (form && ui.modal?.type === 'new' && !ui.modal.focused) { ui.modal.focused = true; form.title.focus(); }
}

/* ───────── 이벤트 ───────── */
const app = document.getElementById('app');
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act; const id = el.dataset.id;
  switch (act) {
    case 'close-bg': if (e.target === el && !ui.timer) { ui.modal = null; render(); } break;
    case 'close': ui.modal = null; render(); break;
    case 'new': ui.modal = { type: 'new', due: el.dataset.due }; render(); break;
    case 'edit': ui.modal = { type: 'edit', id }; render(); break;
    case 'start': start(id); break;
    case 'complete': complete(id); break;
    case 'reopen': reopen(id); break;
    case 'delete': remove(id); break;
    case 'skip': ui.nowSkip++; render(); break;
    case 'day': ui.sel = el.dataset.k; ui.more = false; ui.showDone = false; render(); break;
    case 'wk': ui.weekOff += Number(el.dataset.d); ui.sel = null; render(); break;
    case 'wk0': ui.weekOff = 0; ui.sel = null; render(); break;
    case 'more': ui.more = !ui.more; render(); break;
    case 'done-toggle': ui.showDone = !ui.showDone; render(); break;
    case 'tab': ui.tab = el.dataset.tab; ui.showDone = false; render(); window.scrollTo(0, 0); break;
    case 'tm-more': { const tm = ui.timer; const left = Math.max(0, tm.endAt - Date.now()); tm.endAt = Date.now() + left + TIMER_MS; tm.total = left + TIMER_MS; tm.over = false; render(); break; }
    case 'tm-close': { const drew = ui.timer?.draw; ui.timer = null; stopTick(); render(); if (drew) toast('착수 보상은 도감에 넣어 뒀어요'); break; }
    case 'banner-off': ui.banner = false; localStorage.setItem('seoga-banner-off', '1'); render(); break;
    case 'login': try { await store.signIn(); } catch (err) { toast('로그인하지 못했어요: ' + (err.code || err.message)); } break;
    case 'logout': await store.signOut(); break;
  }
});
app.addEventListener('submit', (e) => { if (e.target.id === 'tf') { e.preventDefault(); submitForm(e.target); } });
app.addEventListener('change', (e) => {
  const form = e.target.closest('#tf'); if (!form) return;
  if (e.target.name === 'series') { form.querySelector('#serbox').hidden = !e.target.checked; if (e.target.checked) volRows(form); }
  if (e.target.name === 'vols' || (e.target.name === 'due' && form.series?.checked)) volRows(form);
  if (e.target.dataset.f === 'd') e.target.closest('.volrow').dataset.dirty = '1';
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.modal && !ui.timer) { ui.modal = null; render(); }
});
// 자정이 지나면 '오늘' 갱신
setInterval(() => { const T = todayKey(); if (T !== ui.today) { ui.today = T; ui.sel = null; if (!ui.modal && !ui.timer) render(); } }, 60000);

/* ───────── 시작 ───────── */
function applyState(s) { S = norm(s); if (ui.modal) deferred = true; else render(); }

async function boot() {
  if (!isCloud) { store = createLocalStore(applyState); return; }
  try {
    store = await createCloudStore({
      onAuth: (u) => { user = u; ui.authReady = true; if (!u) S = null; render(); },
      onState: (s) => {
        if (s == null) { // 클라우드가 비어 있으면 이 기기의 데이터를 올림
          S = norm(loadLocal()); store.save(S); render();
        } else applyState(s);
      },
      onError: (err) => toast('동기화 오류: ' + (err.code || err.message))
    });
  } catch (err) {
    ui.error = 'Firebase를 불러오지 못했어요. 인터넷 연결과 firebase-config.js 설정을 확인해 주세요.';
    render();
  }
}
boot();
