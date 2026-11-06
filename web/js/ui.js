// High5 web - DOM layer: router, screens, D-pad / gamepad navigation, player.
import { AgeRating, RATING_LABELS, LocalStore, createServices, HomeVM, ShowVM, SearchVM, MyListVM, GuideVM, SignInVM, PlayerVM, progressOf } from './core.js';
import { CHANNELS, pickChannel, findChannel } from './channels/index.js';

// Channel = where the data comes from. All channels share this interface and stylesheet; a channel only supplies data.
const store = new LocalStore();
const channel = pickChannel(store, globalThis.__HIGH5_DEFAULT_CHANNEL__ ?? (globalThis.__HIGH5_DEFAULT_SOURCE__ === 'demo' ? 'demo' : undefined));
const isLive = channel.kind === 'live';
const caps = channel.capabilities;           // which screens make sense for this channel
const services = createServices(store, { catalogue: channel.create() });
services.mode = channel.id;
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
const poster = (url, cls = 'poster') => url ? h('img', { class: cls, src: url, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null;   // a failed image just disappears
const tile = (item, href, extra) => nav({ class: 'tile', href }, poster(item.imageUrl), item.ratingKnown === false ? null : h('span', { class: 'badge' }, RATING_LABELS[item.rating] ?? ''), h('span', { class: 't' }, item.title), h('span', { class: 'g' }, item.genre ?? ''), extra);
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
// Routing: URL hash by default. In a sandbox that can't use #/paths (e.g. an embedded preview) set
// globalThis.__HIGH5_MEMORY_ROUTER__ = true (or add ?router=memory) to keep the route in memory instead.
const memoryRouter = !!globalThis.__HIGH5_MEMORY_ROUTER__ || new URLSearchParams(location.search).get('router') === 'memory';
const stack = [];                                   // memory mode only
const currentHash = () => (memoryRouter ? stack[stack.length - 1] ?? '#/home' : location.hash || '#/home');
const go = (hash) => { if (memoryRouter) { stack.push(hash); route(); } else location.hash = hash; };
const replaceRoute = (hash) => { if (memoryRouter) { stack[Math.max(0, stack.length - 1)] = hash; route(); } else location.replace(hash); };
const goBack = () => {
  if (memoryRouter) { if (stack.length > 1) { stack.pop(); route(); } return; }
  if (history.length > 1) history.back(); else location.hash = '#/home';
};
document.addEventListener('click', (e) => {
  if (!memoryRouter) return;
  const a = e.target.closest?.('a[href^="#/"]');
  if (a) { e.preventDefault(); go(a.getAttribute('href')); }
});

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
const signedIn = () => isLive || !!services.auth.session || services.store.get('mock.signedIn') === '1';   // live mode is read-only and uses no account
const routes = {
  home: renderHome, show: renderShow, play: renderPlayer, live: renderLive, search: renderSearch, guide: renderGuide,
  mylist: renderMyList, settings: renderSettings, signin: renderSignIn, channels: renderChannels,
};
function focusFirst() {
  if (matchMedia('(pointer: coarse)').matches) return;     // touch screens: don't pop a focus ring up after each tap
  (view.querySelector('[data-nav]') ?? document.querySelector('#topbar [data-nav]'))?.focus({ preventScroll: true });
}

async function route() {
  if (cleanup) { try { await cleanup(); } catch { /* ignore */ } cleanup = null; }
  const [, name = 'home', ...rest] = currentHash().split('/');
  const arg = decodeURIComponent(rest.join('/'));
  const target = signedIn() || name === 'signin' || name === 'channels' ? name : 'signin';   // the Channels page never needs a sign-in
  if (target !== name) { replaceRoute('#/signin'); return; }
  document.querySelectorAll('#topbar nav a').forEach((a) => { a.classList.toggle('active', a.dataset.route === target); if (!caps.guide && a.dataset.route === 'guide') a.style.display = 'none'; });
  const pill = document.getElementById('channel-link'); if (pill) pill.textContent = `Channel: ${channel.name}`;
  document.getElementById('topbar').style.display = target === 'signin' || target === 'play' || target === 'live' ? 'none' : '';
  view.replaceChildren(h('p', { class: 'dim' }, 'Loading…'));
  try { await (routes[target] ?? renderHome)(arg); } catch (e) { view.replaceChildren(h('p', { class: 'error' }, e.message), button('Back', goBack)); }
  focusFirst();
}
if (!memoryRouter) addEventListener('hashchange', route);

// ---------- screens ----------
async function renderHome() {
  if (!caps.home) {
    view.replaceChildren(h('h1', {}, 'Home'),
      h('p', {}, `${channel.name}: ${channel.blurb}`),
      h('p', { class: 'dim' }, 'Search and show pages work. Browse rails, the TV guide and playback are not built yet.'),
      h('div', { class: 'row' }, nav({ class: 'btn primary', href: '#/search' }, 'Search shows'), nav({ class: 'btn', href: '#/mylist' }, 'My List')));
    return;
  }
  const { rails, continueWatching } = await vms.home.load();
  const out = [h('h1', {}, 'Home')];
  if (continueWatching.length) out.push(...rail('Continue watching', continueWatching.map((c) =>
    nav({ class: 'tile', href: `#/play/${encodeURIComponent(c.episode.id)}` }, h('span', { class: 't' }, c.caption), h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(progressOf(c.point) * 100)}%` }))))));
  for (const r of rails) out.push(...rail(r.title, r.items.map((i) => tile(i, `#/show/${encodeURIComponent(i.id)}`))));
  view.replaceChildren(...out);
}

const mins = (sec) => `${Math.round(sec / 60)} min`;
const dateOf = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function renderShow(id) {
  const vm = vms.show, v = await vm.load(id);
  let season = v.selectedSeason, inList = v.inMyList;
  const eps = h('div'), listBtn = button(inList ? 'Remove from My List' : 'Add to My List', async () => {
    inList = await vm.toggleMyList(id); listBtn.textContent = inList ? 'Remove from My List' : 'Add to My List'; toast(inList ? 'Added to My List' : 'Removed from My List');
  });
  const seasonBtns = v.seasons.map((s) => button(`Series ${s}`, () => { season = s; drawEps(); }));
  const markSeasons = () => seasonBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(v.seasons[i] === season)));
  const drawEps = () => { markSeasons(); eps.replaceChildren(...v.episodesFor(season).map((e) => {
    if (!caps.playback) {   // read-only channel: details only, no playback
      const meta = [e.durationSeconds ? mins(e.durationSeconds) : '', e.ratingCode, e.available ? (e.availableUntilMs ? `Available until ${dateOf(e.availableUntilMs)}` : 'Available') : 'Not currently available', e.hasSubtitles ? 'Subtitles' : ''].filter(Boolean).join(' · ');
      return h('div', { class: 'ep thumbed', tabindex: '0', 'data-nav': true }, poster(e.imageUrl, 'thumb'),
        h('div', { class: 'body' }, h('div', { class: 't' }, `${e.episode}. ${e.title}`), h('div', { class: 's' }, e.synopsis), h('div', { class: 's' }, meta), e.advisory ? h('div', { class: 's' }, e.advisory) : null));
    }
    return nav({ class: 'ep', href: `#/play/${encodeURIComponent(e.id)}` }, h('div', { class: 't' }, `${e.episode}. ${e.title}`), h('div', { class: 's' }, e.synopsis));
  })); };
  drawEps();
  const next = v.nextToWatch, first = v.show.episodes[0];
  const playControl = !caps.playback ? h('span', { class: 'dim' }, 'Playback is not available in this version.')
    : next ? nav({ class: 'btn primary', href: `#/play/${encodeURIComponent(next.id)}` }, next.id !== first?.id ? 'Resume' : 'Play') : null;
  const sub = [v.show.genre, ...(v.show.subgenres ?? []), v.show.channel ? `Channel ${v.show.channel}` : '', v.show.ratingKnown === false ? '' : RATING_LABELS[v.show.rating]].filter(Boolean).join(' · ');
  view.replaceChildren(
    poster(v.show.bannerUrl, 'banner'), h('h1', {}, v.show.title), h('p', { class: 'dim' }, sub), h('p', {}, v.show.synopsis),
    h('div', { class: 'row' }, playControl, listBtn, ...seasonBtns), v.show.episodes.length ? eps : h('p', { class: 'dim' }, 'No episodes are listed for this show.'));
}

async function renderSearch() {
  const results = h('div', { class: 'grid' }), status = h('p', { class: 'dim' }, isLive ? `Type at least two letters to search ${channel.name}.` : 'Type to search shows and genres.');
  const input = h('input', { 'data-nav': true, type: 'search', placeholder: 'Search shows', 'aria-label': 'Search', autocomplete: 'off' });
  const run = async () => {
    try {
      status.className = 'dim';
      const r = await vms.search.search(input.value);
      if (r.stale) return;
      results.replaceChildren(...r.results.map((i) => tile(i, `#/show/${encodeURIComponent(i.id)}`)));
      status.textContent = !r.query.trim() ? 'Type to search.' : r.query.trim().length < 2 && isLive ? 'Type at least two letters.' : r.results.length ? '' : 'No results.';
    } catch (e) { status.className = 'error'; status.textContent = e.message; results.replaceChildren(); }
  };
  let timer; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, isLive ? 400 : 0); });   // be gentle on a third-party server
  cleanup = () => clearTimeout(timer);
  view.replaceChildren(h('h1', {}, 'Search'), h('div', { class: 'search-box' }, input, button('Search', () => { clearTimeout(timer); run(); })), status, results);
}

async function renderMyList() {
  const items = await vms.myList.load();
  view.replaceChildren(h('h1', {}, 'My List'), items.length ? h('div', { class: 'grid' }, items.map((i) => tile(i, `#/show/${encodeURIComponent(i.id)}`))) : h('p', { class: 'dim' }, 'Nothing here yet - add shows from their page.'));
}

async function renderGuide() {
  if (!caps.guide) { view.replaceChildren(h('h1', {}, 'TV guide'), h('p', { class: 'dim' }, `The TV guide is not available for ${channel.name} yet.`)); return; }
  const rows = await vms.guide.load(6 * 3600_000);
  view.replaceChildren(h('h1', {}, 'TV guide'), h('table', { class: 'guide' }, rows.map((r) =>
    h('tr', {}, h('td', {}, nav({ class: 'btn', href: `#/live/${encodeURIComponent(r.channel.id)}` }, r.channel.name)),
      h('td', {}, h('div', { class: 'dim' }, 'Now'), h('div', {}, r.onNow ? `${r.onNow.title} (${fmtTime(r.onNow.startMs)}-${fmtTime(r.onNow.endMs)})` : '-')),
      h('td', {}, h('div', { class: 'dim' }, 'Next'), h('div', {}, r.next ? `${r.next.title} (${fmtTime(r.next.startMs)})` : '-'))))));
}

async function renderChannels() {
  const choose = (c) => () => { services.store.set('channel', c.id); services.store.set('source', null); location.reload(); };
  view.replaceChildren(h('h1', {}, 'Channels'), h('p', { class: 'dim' }, 'Every channel uses the same screens. A channel only supplies the shows.'),
    h('div', { class: 'grid' }, CHANNELS.map((c) => h('button', { class: 'tile', type: 'button', 'data-nav': true, 'aria-pressed': String(c.id === channel.id), onclick: choose(c) },
      h('span', { class: 't' }, c.name), h('span', { class: 'g' }, c.blurb), c.id === channel.id ? h('span', { class: 'badge' }, 'Current') : (c.experimental ? h('span', { class: 'badge' }, 'Beta') : null)))));
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
    h('h2', {}, 'Channel'), h('p', { class: 'dim' }, `${channel.name}: ${channel.blurb}`), h('div', { class: 'row' }, nav({ class: 'btn', href: '#/channels' }, 'Change channel')),
    h('h2', {}, 'Account'), button('Sign out', async () => { await services.auth.signOut(); services.store.set('mock.signedIn', null); go('#/signin'); }));
}

async function renderSignIn() {
  const code = h('div', { class: 'code' }, '…'), status = h('p', { class: 'dim' }, ''), retry = button('Get a new code', () => start(), 'btn primary');
  retry.style.display = 'none';
  view.replaceChildren(h('div', { class: 'center' }, h('h1', {}, 'Sign in'), h('p', {}, 'On your phone or computer, open the activation page and enter this code:'), code, status, retry,
    h('div', { class: 'row', style: 'justify-content:center' }, nav({ class: 'btn', href: '#/channels' }, `Channel: ${channel.name} - change`))));
  let ac;
  const start = async () => {
    ac?.abort(); ac = new AbortController(); retry.style.display = 'none'; status.textContent = 'Waiting for you to enter the code…';
    const vm = new SignInVM({ auth: services.auth });
    const result = await vm.run({ signal: ac.signal, onCode: (c) => { code.textContent = c; } });
    if (result === 'signedIn') { services.store.set('mock.signedIn', '1'); replaceRoute('#/home'); }
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
  if (!caps.playback) throw new Error('Playback is not available in this version.');
  const ep = await services.catalogue.getEpisode(id); if (!ep) throw new Error('Episode not found.');
  await playerScreen(await new PlayerVM(services).loadEpisode(ep));
}
async function renderLive(channelId) { if (!caps.playback) throw new Error('Live TV is not available in this version.'); await playerScreen(await new PlayerVM(services).loadLive(channelId)); }

route();
