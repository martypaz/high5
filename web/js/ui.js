// High5 web - DOM layer: router, screens, D-pad / gamepad navigation, player.
import { AgeRating, RATING_LABELS, LocalStore, createServices, HomeVM, ShowVM, SearchVM, MyListVM, GuideVM, SignInVM, PlayerVM, progressOf } from './core.js';

const services = createServices(new LocalStore());
const vms = {
  home: new HomeVM(services), show: new ShowVM(services), search: new SearchVM(services), myList: new MyListVM(services), guide: new GuideVM(services),
};
const view = document.getElementById('view');
let cleanup = null;           // per-screen teardown (timers, abort controllers, players)

// ---------- tiny DOM helper (text is always set as text, never as HTML) ----------
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
};
const toast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2500); };
const nav = (attrs = {}, ...kids) => h('a', { 'data-nav': true, ...attrs }, ...kids);
const button = (label, onclick, cls = 'btn') => h('button', { class: cls, 'data-nav': true, type: 'button', onclick }, label);
const tile = (item, href, extra) => nav({ class: 'tile', href }, h('span', { class: 'badge' }, RATING_LABELS[item.rating] ?? ''), h('span', { class: 't' }, item.title), h('span', { class: 'g' }, item.genre ?? ''), extra);
const rail = (title, tiles) => [h('h2', {}, title), h('div', { class: 'rail' }, tiles)];
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- spatial navigation ----------
const navigables = () => [...document.querySelectorAll('[data-nav]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled; });
const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function move(dir) {
  const items = navigables(), cur = document.activeElement;
  if (!items.includes(cur)) { (items.find((e) => view.contains(e)) ?? items[0])?.focus(); return; }
  const c = centre(cur.getBoundingClientRect());
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const e = centre(el.getBoundingClientRect()), dx = e.x - c.x, dy = e.y - c.y;
    const ok = dir === 'right' ? dx > 4 : dir === 'left' ? dx < -4 : dir === 'down' ? dy > 4 : dy < -4;
    if (!ok) continue;
    const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 3;           // prefer things lined up with the current item
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
const goBack = () => { if (history.length > 1) history.back(); else location.hash = '#/home'; };

addEventListener('keydown', (e) => {
  const map = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' };
  if (map[e.key]) {
    // Let <select> and text inputs keep left/right/up/down when they need them.
    if (typing() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || document.activeElement.tagName === 'SELECT')) return;
    e.preventDefault(); move(map[e.key]);
  } else if ((e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || (e.key === 'Backspace' && !typing()))) { e.preventDefault(); goBack(); }
});

// Gamepad (Xbox controller): D-pad / left stick to move, A to select, B to go back.
const padState = { last: {}, wasA: false, wasB: false };
function pollPad() {
  const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
  if (pad) {
    const now = performance.now(), b = (i) => !!pad.buttons[i]?.pressed, ax = pad.axes ?? [];
    const dirs = { up: b(12) || ax[1] < -0.6, down: b(13) || ax[1] > 0.6, left: b(14) || ax[0] < -0.6, right: b(15) || ax[0] > 0.6 };
    for (const [d, on] of Object.entries(dirs)) {
      if (!on) { padState.last[d] = 0; continue; }
      const t = padState.last[d];
      if (!t || now - t > (t === padState.first?.[d] ? 350 : 140)) { move(d); padState.last[d] = now; (padState.first ??= {})[d] = padState.first[d] ?? now; }
    }
    const a = b(0), bb = b(1);
    if (a && !padState.wasA) document.activeElement?.click?.();
    if (bb && !padState.wasB && !typing()) goBack();
    padState.wasA = a; padState.wasB = bb;
  }
  requestAnimationFrame(pollPad);
}
requestAnimationFrame(pollPad);

// ---------- routing ----------
const signedIn = () => !!services.auth.session || services.store.get('mock.signedIn') === '1';
const routes = {
  home: renderHome, show: renderShow, play: renderPlayer, live: renderLive, search: renderSearch, guide: renderGuide,
  mylist: renderMyList, settings: renderSettings, signin: renderSignIn,
};
function focusFirst() { (view.querySelector('[data-nav]') ?? document.querySelector('#topbar [data-nav]'))?.focus({ preventScroll: true }); }

async function route() {
  if (cleanup) { try { await cleanup(); } catch { /* ignore */ } cleanup = null; }
  const [, name = 'home', ...rest] = (location.hash || '#/home').split('/');
  const arg = decodeURIComponent(rest.join('/'));
  const target = signedIn() || name === 'signin' ? name : 'signin';
  if (target !== name) { location.replace('#/signin'); return; }
  document.querySelectorAll('#topbar nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === target));
  document.getElementById('topbar').style.display = target === 'signin' || target === 'play' || target === 'live' ? 'none' : '';
  view.replaceChildren(h('p', { class: 'dim' }, 'Loading…'));
  try { await (routes[target] ?? renderHome)(arg); } catch (e) { view.replaceChildren(h('p', { class: 'error' }, e.message), button('Back', goBack)); }
  focusFirst();
}
addEventListener('hashchange', route);

// ---------- screens ----------
async function renderHome() {
  const { rails, continueWatching } = await vms.home.load();
  const out = [h('h1', {}, 'Home')];
  if (continueWatching.length) out.push(...rail('Continue watching', continueWatching.map((c) =>
    nav({ class: 'tile', href: `#/play/${encodeURIComponent(c.episode.id)}` }, h('span', { class: 't' }, c.caption), h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(progressOf(c.point) * 100)}%` }))))));
  for (const r of rails) out.push(...rail(r.title, r.items.map((i) => tile(i, `#/show/${encodeURIComponent(i.id)}`))));
  view.replaceChildren(...out);
}

async function renderShow(id) {
  const vm = vms.show, v = await vm.load(id);
  let season = v.selectedSeason, inList = v.inMyList;
  const eps = h('div'), listBtn = button(inList ? 'Remove from My List' : 'Add to My List', async () => {
    inList = await vm.toggleMyList(id); listBtn.textContent = inList ? 'Remove from My List' : 'Add to My List'; toast(inList ? 'Added to My List' : 'Removed from My List');
  });
  const seasonBtns = v.seasons.map((s) => button(`Series ${s}`, () => { season = s; drawEps(); }));
  const drawEps = () => eps.replaceChildren(...v.episodesFor(season).map((e) =>
    nav({ class: 'ep', href: `#/play/${encodeURIComponent(e.id)}` }, h('div', { class: 't' }, `${e.episode}. ${e.title}`), h('div', { class: 's' }, e.synopsis))));
  drawEps();
  view.replaceChildren(
    h('h1', {}, v.show.title), h('p', { class: 'dim' }, `${v.show.genre} · ${RATING_LABELS[v.show.rating]}`), h('p', {}, v.show.synopsis),
    h('div', { class: 'row' }, nav({ class: 'btn primary', href: `#/play/${encodeURIComponent(v.nextToWatch.id)}` }, v.nextToWatch.id !== v.show.episodes[0].id ? 'Resume' : 'Play'), listBtn, ...seasonBtns), eps);
}

async function renderSearch() {
  const results = h('div', { class: 'grid' }), status = h('p', { class: 'dim' }, 'Type to search shows and genres.');
  const input = h('input', { 'data-nav': true, type: 'search', placeholder: 'Search shows and genres', 'aria-label': 'Search', autocomplete: 'off' });
  const run = async () => {
    const r = await vms.search.search(input.value);
    if (r.stale) return;
    results.replaceChildren(...r.results.map((i) => tile(i, `#/show/${encodeURIComponent(i.id)}`)));
    status.textContent = !r.query ? 'Type to search shows and genres.' : r.results.length ? '' : 'No results.';
  };
  input.addEventListener('input', run);
  view.replaceChildren(h('h1', {}, 'Search'), h('div', { class: 'search-box' }, input, button('Search', run)), status, results);
}

async function renderMyList() {
  const items = await vms.myList.load();
  view.replaceChildren(h('h1', {}, 'My List'), items.length ? h('div', { class: 'grid' }, items.map((i) => tile(i, `#/show/${encodeURIComponent(i.id)}`))) : h('p', { class: 'dim' }, 'Nothing here yet - add shows from their page.'));
}

async function renderGuide() {
  const rows = await vms.guide.load(6 * 3600_000);
  view.replaceChildren(h('h1', {}, 'TV guide'), h('table', { class: 'guide' }, rows.map((r) =>
    h('tr', {}, h('td', {}, nav({ class: 'btn', href: `#/live/${encodeURIComponent(r.channel.id)}` }, r.channel.name)),
      h('td', {}, h('div', { class: 'dim' }, 'Now'), h('div', {}, r.onNow ? `${r.onNow.title} (${fmtTime(r.onNow.startMs)}-${fmtTime(r.onNow.endMs)})` : '-')),
      h('td', {}, h('div', { class: 'dim' }, 'Next'), h('div', {}, r.next ? `${r.next.title} (${fmtTime(r.next.startMs)})` : '-'))))));
}

async function renderSettings() {
  const p = services.parental;
  const pin = h('input', { 'data-nav': true, type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '4-digit PIN', 'aria-label': 'PIN' });
  const rating = h('select', { 'data-nav': true, 'aria-label': 'Maximum age rating' }, Object.entries(AgeRating).map(([name, v]) => h('option', { value: v, selected: v === p.maxRating }, `${RATING_LABELS[v]} (${name})`)));
  const status = h('p', { class: 'dim' }, p.hasPin ? 'A PIN is set. Enter it to change the rating limit.' : 'No PIN set.');
  rating.addEventListener('change', async () => {
    const ok = await p.setMaxRating(Number(rating.value), pin.value);
    status.textContent = ok ? 'Rating limit updated.' : 'Enter your PIN above to change the rating limit.';
    if (!ok) rating.value = String(p.maxRating);
  });
  view.replaceChildren(h('h1', {}, 'Settings'), h('h2', {}, 'Parental controls'),
    h('div', { class: 'row' }, pin, button('Set PIN', async () => { try { await p.setPin(pin.value); pin.value = ''; status.textContent = 'PIN saved.'; } catch (e) { status.textContent = e.message; } })),
    h('div', { class: 'row' }, rating), status,
    h('h2', {}, 'Account'), button('Sign out', async () => { await services.auth.signOut(); services.store.set('mock.signedIn', null); location.hash = '#/signin'; }));
}

async function renderSignIn() {
  const code = h('div', { class: 'code' }, '…'), status = h('p', { class: 'dim' }, ''), retry = button('Get a new code', () => start(), 'btn primary');
  retry.style.display = 'none';
  view.replaceChildren(h('div', { class: 'center' }, h('h1', {}, 'Sign in to My5'), h('p', {}, 'On your phone or computer, open the My5 activation page and enter this code:'), code, status, retry));
  let ac;
  const start = async () => {
    ac?.abort(); ac = new AbortController(); retry.style.display = 'none'; status.textContent = 'Waiting for you to enter the code…';
    const vm = new SignInVM({ auth: services.auth });
    const result = await vm.run({ signal: ac.signal, onCode: (c) => { code.textContent = c; } });
    if (result === 'signedIn') { services.store.set('mock.signedIn', '1'); location.hash = '#/home'; }
    else if (result === 'expired') { status.textContent = 'That code expired.'; retry.style.display = ''; retry.focus(); }
    else if (result === 'error') { status.textContent = vm.error ?? 'Something went wrong.'; status.className = 'error'; retry.style.display = ''; }
  };
  cleanup = () => ac?.abort();
  start();
}

// ---------- player ----------
async function attachStream(video, info) {
  if (info.drm === 'playready') throw new Error('Protected (PlayReady) streams are not implemented in the web app yet.');
  if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = info.manifestUrl; return () => {}; }
  const { default: Hls } = await import('https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.mjs');
  if (!Hls.isSupported()) throw new Error('This browser cannot play HLS streams.');
  const hls = new Hls(); hls.loadSource(info.manifestUrl); hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) toast('Playback error: ' + d.type); });
  return () => hls.destroy();
}

async function playerScreen(vm) {
  const video = h('video', { playsinline: true, autoplay: true, 'aria-label': vm.info.title });
  const timeLabel = h('span', { class: 'dim' }, '0:00');
  const playBtn = button('Pause', () => { if (video.paused) video.play(); else video.pause(); });
  const seek = (d) => () => { video.currentTime = Math.max(0, (video.currentTime || 0) + d); };
  video.addEventListener('play', () => (playBtn.textContent = 'Pause'));
  video.addEventListener('pause', () => (playBtn.textContent = 'Play'));
  video.addEventListener('loadedmetadata', () => { if (vm.startAt > 0 && !vm.info.isLive) video.currentTime = vm.startAt; });
  video.addEventListener('timeupdate', () => { timeLabel.textContent = `${mmss(video.currentTime)} / ${vm.info.isLive ? 'live' : mmss(video.duration)}`; vm.report(video.currentTime, video.duration || 0); });
  video.addEventListener('error', () => toast('Could not play this stream.'));
  view.replaceChildren(video, h('div', { class: 'player-bar' }, button('Back', goBack), playBtn, button('-10s', seek(-10)), button('+30s', seek(30)), timeLabel, h('span', { class: 'dim' }, vm.episode ? `${vm.episode.showTitle} · S${vm.episode.season}:E${vm.episode.episode}` : vm.info.title)));
  let detach = () => {};
  try { detach = await attachStream(video, vm.info); } catch (e) { toast(e.message); }
  const onHide = () => vm.report(video.currentTime, video.duration || 0, true);
  addEventListener('pagehide', onHide);
  cleanup = async () => { removeEventListener('pagehide', onHide); await onHide(); video.pause(); detach(); video.removeAttribute('src'); video.load(); };
}
async function renderPlayer(id) {
  const ep = await services.catalogue.getEpisode(id); if (!ep) throw new Error('Episode not found.');
  await playerScreen(await new PlayerVM(services).loadEpisode(ep));
}
async function renderLive(channelId) { await playerScreen(await new PlayerVM(services).loadLive(channelId)); }

route();
