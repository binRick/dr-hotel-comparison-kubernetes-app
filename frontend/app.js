/* dr.ximg.app — shared client. Vanilla JS, same-origin API at /api/*. */
'use strict';

const API = '';
// Bounding box of the Dominican Republic for projecting lat/lng onto the map.
const DR_BOUNDS = { minLng: -72.05, maxLng: -68.30, minLat: 17.55, maxLat: 19.95 };
// DR coastline projected through DR_BOUNDS onto the 600x400 viewBox so the
// outline and the lat/lng markers share one coordinate system.
const DR_PATH = 'M54.0,39.3 L74.0,10.8 L198.9,11.6 L293.7,54.5 L335.9,50.3 L364.9,109.5 L452.5,106.1 L447.3,155.8 L518.5,161.8 L597.1,223.0 L537.7,290.8 L461.6,254.6 L388.2,261.5 L335.5,253.6 L306.7,284.0 L245.3,294.3 L220.9,253.9 L168.0,277.8 L104.0,391.9 L62.8,365.4 L54.7,317.5 L58.0,272.2 L16.8,222.2 L55.8,194.1 L68.0,130.0 L54.0,39.3Z';

async function api(path, opts) {
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}
function qs(k) { return new URLSearchParams(location.search).get(k); }

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return e;
}
const svgEl = (n) => document.createElementNS('http://www.w3.org/2000/svg', n);

const fmtPrice = (n) => '$' + Math.round(n || 0).toLocaleString();
const fmtRating = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
function stars(n) { const f = Math.round(n || 0); return '★'.repeat(Math.max(0, f)) + '☆'.repeat(Math.max(0, 5 - f)); }
function airportCode(s) { return (s || '').split(/[ —-]/)[0]; }

function projectXY(lat, lng, w, h) {
  const x = (lng - DR_BOUNDS.minLng) / (DR_BOUNDS.maxLng - DR_BOUNDS.minLng) * w;
  const y = (DR_BOUNDS.maxLat - lat) / (DR_BOUNDS.maxLat - DR_BOUNDS.minLat) * h;
  return { x, y };
}

function thumb(images, emoji) {
  const wrap = el('div', { class: 'thumb' });
  const ph = el('div', { class: 'ph' }, emoji || '🌴');
  wrap.append(ph);
  const first = images && images[0] && images[0].url;
  if (first) {
    const img = el('img', { loading: 'lazy', alt: (images[0].alt || '') });
    img.addEventListener('load', () => { ph.style.display = 'none'; });
    img.addEventListener('error', () => { img.remove(); });
    img.src = first;
    wrap.append(img);
  }
  return wrap;
}

function chip(text, kind) { return el('span', { class: 'chip' + (kind ? ' ' + kind : '') }, text); }
function sargassumChip(risk) {
  const kind = /low|none/i.test(risk) ? 'accent' : (/high/i.test(risk) ? 'coral' : '');
  return chip('🌿 ' + risk, kind);
}

function scoreBars(obj) {
  const b = el('div', { class: 'bars' });
  for (const [k, v] of Object.entries(obj)) {
    const row = el('div', { class: 'bar' });
    row.append(el('span', { class: 'lbl' }, k.replace(/_/g, ' ')));
    const track = el('div', { class: 'track' });
    track.append(el('div', { class: 'fill', style: 'width:' + (Math.max(0, Math.min(10, v)) * 10) + '%' }));
    row.append(track);
    row.append(el('span', { class: 'num' }, String(Math.round(v * 10) / 10)));
    b.append(row);
  }
  return b;
}

/* ── cards ──────────────────────────────────────────────────────────────── */
function areaCard(a, withCompare) {
  const c = el('a', { class: 'card', href: 'area.html?id=' + encodeURIComponent(a.id) });
  c.append(thumb(a.images, '🏝️'));
  const body = el('div', { class: 'body' });
  body.append(el('h3', {}, a.name));
  const meta = el('div', { class: 'meta' });
  meta.append(chip(a.region, 'accent'));
  meta.append(chip('✈ ' + airportCode(a.nearest_airport)));
  meta.append(chip('~' + fmtPrice(a.avg_hotel_price_usd) + '/nt', 'gold'));
  if (a.sargassum_risk) meta.append(sargassumChip(a.sargassum_risk));
  body.append(meta);
  body.append(el('div', { class: 'desc' }, a.summary));
  if (withCompare) {
    const foot = el('div', { class: 'meta', style: 'justify-content:flex-end' });
    foot.append(el('button', {
      class: 'btn', onclick: (e) => { e.preventDefault(); trayAdd('area', a.id, a.name); }
    }, '+ Compare'));
    body.append(foot);
  }
  c.append(body);
  return c;
}

function hotelCard(h) {
  const c = el('div', { class: 'card' });
  const link = el('a', { href: 'hotel.html?id=' + encodeURIComponent(h.id) });
  link.append(thumb(h.images, '🏨'));
  c.append(link);
  const body = el('div', { class: 'body' });
  body.append(el('h3', {}, el('a', { href: 'hotel.html?id=' + encodeURIComponent(h.id), style: 'color:inherit' }, h.name)));
  const meta = el('div', { class: 'meta' });
  meta.append(chip(stars(h.stars), 'gold'));
  meta.append(chip('★ ' + fmtRating(h.guest_rating), 'accent'));
  meta.append(chip(h.board));
  if (h.adults_only) meta.append(chip('Adults-only', 'coral'));
  if (h.beachfront) meta.append(chip('Beachfront'));
  body.append(meta);
  body.append(el('div', { class: 'desc' }, h.summary));
  const foot = el('div', { class: 'meta', style: 'justify-content:space-between;align-items:center' });
  foot.append(el('span', { class: 'price' }, fmtPrice(h.price_per_night_usd), el('small', {}, ' /night')));
  foot.append(el('button', { class: 'btn', onclick: () => trayAdd('hotel', h.id, h.name) }, '+ Compare'));
  body.append(foot);
  c.append(body);
  return c;
}

/* ── compare tray (localStorage) ────────────────────────────────────────── */
const TRAY_KEY = 'dr_compare';
function trayGet() { try { return JSON.parse(localStorage.getItem(TRAY_KEY)) || { type: null, ids: [], names: {} }; } catch { return { type: null, ids: [], names: {} }; } }
function traySet(t) { localStorage.setItem(TRAY_KEY, JSON.stringify(t)); renderTray(); }
function trayAdd(type, id, name) {
  const t = trayGet();
  if (t.type !== type) { t.type = type; t.ids = []; t.names = {}; }
  t.names = t.names || {};
  if (!t.ids.includes(id)) {
    if (t.ids.length >= 4) { alert('Compare up to 4 at a time.'); return; }
    t.ids.push(id); t.names[id] = name;
  }
  traySet(t);
}
function trayRemove(id) { const t = trayGet(); t.ids = (t.ids || []).filter((x) => x !== id); if (t.names) delete t.names[id]; traySet(t); }
function trayClear() { traySet({ type: null, ids: [], names: {} }); }
function renderTray() {
  let tray = document.getElementById('tray');
  if (!tray) { tray = el('div', { id: 'tray' }, el('div', { class: 'inner' })); document.body.append(tray); }
  const t = trayGet();
  const inner = tray.querySelector('.inner');
  inner.innerHTML = '';
  if (!t.ids || !t.ids.length) { tray.classList.remove('show'); return; }
  inner.append(el('span', { class: 'muted', style: 'font-size:.8rem' }, 'Compare ' + t.type + 's'));
  const items = el('div', { class: 'items' });
  t.ids.forEach((id) => {
    const name = (t.names && t.names[id]) || id;
    items.append(el('span', { class: 'pill' }, name, el('b', { title: 'remove', onclick: () => trayRemove(id) }, '✕')));
  });
  inner.append(items);
  inner.append(el('a', { class: 'btn primary', href: 'compare.html' }, 'Compare (' + t.ids.length + ')'));
  inner.append(el('button', { class: 'btn', onclick: trayClear }, 'Clear'));
  tray.classList.add('show');
}

/* ── area cache ─────────────────────────────────────────────────────────── */
let _areas = null;
async function getAreas() { if (!_areas) _areas = await api('/api/areas'); return _areas; }
function areaName(areas, id) { const a = areas.find((x) => x.id === id); return a ? a.name : id; }

/* ── map ────────────────────────────────────────────────────────────────── */
function renderMap(areas, container) {
  container.innerHTML = '';
  const W = 600, H = 400;
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Map of the Dominican Republic with area markers');
  const land = svgEl('path');
  land.setAttribute('d', DR_PATH);
  land.setAttribute('class', 'land');
  svg.append(land);
  areas.forEach((a) => {
    const { x, y } = projectXY(a.lat, a.lng, W, H);
    const g = svgEl('g'); g.setAttribute('class', 'marker');
    g.addEventListener('click', () => { location.href = 'area.html?id=' + encodeURIComponent(a.id); });
    const c = svgEl('circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 7);
    const t = svgEl('text'); t.setAttribute('x', x); t.setAttribute('y', y - 12); t.setAttribute('text-anchor', 'middle');
    t.textContent = a.name.split(/[ &]/)[0];
    g.append(c, t); svg.append(g);
  });
  container.append(svg);
}

/* ── page initializers ──────────────────────────────────────────────────── */
async function initIndex() {
  const areas = await getAreas();
  const map = document.getElementById('map');
  if (map) renderMap(areas, map);
  const sub = document.getElementById('areas-sub');
  if (sub) sub.textContent = areas.length + ' areas, ranked your way — or just browse below.';
  const grid = document.getElementById('areas');
  if (grid) { grid.innerHTML = ''; areas.forEach((a) => grid.append(areaCard(a))); }
}

async function initAreas() {
  const areas = await getAreas();
  const grid = document.getElementById('areas');
  const sortSel = document.getElementById('sort');
  function draw() {
    const mode = sortSel ? sortSel.value : 'name';
    const list = areas.slice();
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      price: (a, b) => a.avg_hotel_price_usd - b.avg_hotel_price_usd,
      beach: (a, b) => b.scores.beach - a.scores.beach,
      nature: (a, b) => b.scores.nature - a.scores.nature,
      nightlife: (a, b) => b.scores.nightlife - a.scores.nightlife,
    }[mode] || ((a, b) => a.name.localeCompare(b.name));
    list.sort(by);
    grid.innerHTML = '';
    list.forEach((a) => grid.append(areaCard(a, true)));
  }
  if (sortSel) sortSel.addEventListener('change', draw);
  draw();
}

async function initArea() {
  const id = qs('id');
  const main = document.getElementById('main');
  const data = await api('/api/areas/' + encodeURIComponent(id));
  const a = data.area, hotels = data.hotels || [];
  document.title = a.name + ' — DR Area Guide';
  main.innerHTML = '';

  const head = el('section', { class: 'section' });
  head.append(el('h1', { style: 'margin:.2rem 0' }, a.name));
  head.append(el('div', { class: 'meta', style: 'margin-bottom:.8rem' },
    chip(a.region, 'accent'), chip('✈ ' + a.nearest_airport), chip('🚗 ' + Math.round(a.airport_transfer_min) + ' min'),
    chip('~' + fmtPrice(a.avg_hotel_price_usd) + '/nt', 'gold'), sargassumChip(a.sargassum_risk),
    chip('English: ' + a.english_prevalence)));
  if (a.images && a.images.length) {
    const g = el('div', { class: 'gallery', style: 'margin-bottom:1rem' });
    a.images.slice(0, 4).forEach((im) => { const i = el('img', { alt: im.alt || a.name, loading: 'lazy' }); i.addEventListener('error', () => i.remove()); i.src = im.url; g.append(i); });
    head.append(g);
  }
  head.append(el('p', { class: 'muted', style: 'max-width:70ch' }, a.description));

  const split = el('div', { class: 'split' });
  const left = el('div', {});
  left.append(el('h3', {}, 'Highlights'));
  const ul = el('ul'); (a.highlights || []).forEach((h) => ul.append(el('li', {}, h))); left.append(ul);
  const pc = el('div', { class: 'pros-cons', style: 'margin-top:1rem' });
  const pros = el('div', { class: 'pros' }, el('strong', {}, '👍 Pros')); const pl = el('ul'); (a.pros || []).forEach((p) => pl.append(el('li', {}, p))); pros.append(pl);
  const cons = el('div', { class: 'cons' }, el('strong', {}, '👎 Cons')); const cl = el('ul'); (a.cons || []).forEach((p) => cl.append(el('li', {}, p))); cons.append(cl);
  pc.append(pros, cons); left.append(pc);
  const right = el('div', {});
  right.append(el('h3', {}, 'How it scores'));
  right.append(scoreBars(a.scores));
  const facts = el('div', { class: 'meta', style: 'margin-top:1rem' },
    chip('Best months: ' + (a.best_months || []).join(', ')), a.whale_season && !/n\/?a/i.test(a.whale_season) ? chip('🐋 ' + a.whale_season, 'accent') : null,
    chip('Vibe: ' + a.vibe));
  right.append(facts);
  split.append(left, right); head.append(split);
  main.append(head);

  const hs = el('section', { class: 'section' });
  hs.append(el('h2', {}, 'Top hotels in ' + a.name.split(/[ &]/)[0]));
  hs.append(el('p', { class: 'sub' }, hotels.length + ' hotels — add any to compare.'));
  const grid = el('div', { class: 'grid' }); hotels.forEach((h) => grid.append(hotelCard(h)));
  hs.append(grid); main.append(hs);
}

async function initHotels() {
  const areas = await getAreas();
  const areaSel = document.getElementById('f-area');
  if (areaSel) areas.forEach((a) => areaSel.append(el('option', { value: a.id }, a.name)));
  const grid = document.getElementById('hotels');
  const count = document.getElementById('count');
  async function draw() {
    grid.innerHTML = '<div class="spinner"></div>';
    const p = new URLSearchParams();
    const get = (id) => document.getElementById(id);
    if (get('f-area').value) p.set('area', get('f-area').value);
    if (get('f-board').value) p.set('board', get('f-board').value);
    if (get('f-adults').checked) p.set('adults_only', 'true');
    if (get('f-family').checked) p.set('family', 'true');
    if (get('f-beach').checked) p.set('beachfront', 'true');
    if (get('f-maxprice').value) p.set('max_price', get('f-maxprice').value);
    p.set('sort', get('f-sort').value);
    const hotels = await api('/api/hotels?' + p.toString());
    grid.innerHTML = '';
    if (!hotels.length) { grid.append(el('p', { class: 'empty' }, 'No hotels match those filters.')); }
    hotels.forEach((h) => grid.append(hotelCard(h)));
    if (count) count.textContent = hotels.length + ' hotels';
  }
  ['f-area', 'f-board', 'f-adults', 'f-family', 'f-beach', 'f-maxprice', 'f-sort'].forEach((id) => {
    const e = document.getElementById(id); if (e) e.addEventListener('change', draw);
  });
  draw();
}

async function initHotel() {
  const id = qs('id');
  const main = document.getElementById('main');
  const h = await api('/api/hotels/' + encodeURIComponent(id));
  const areas = await getAreas();
  document.title = h.name + ' — DR Hotel';
  main.innerHTML = '';
  const s = el('section', { class: 'section' });
  s.append(el('h1', { style: 'margin:.2rem 0' }, h.name));
  s.append(el('div', { class: 'meta', style: 'margin-bottom:.8rem' },
    chip(stars(h.stars), 'gold'), chip('★ ' + fmtRating(h.guest_rating) + ' guest', 'accent'),
    el('a', { class: 'chip', href: 'area.html?id=' + h.area_id }, '📍 ' + areaName(areas, h.area_id)),
    chip(h.board), h.adults_only ? chip('Adults-only', 'coral') : null, h.family_friendly ? chip('Family') : null,
    h.beachfront ? chip('Beachfront') : null, chip(h.brand)));
  if (h.images && h.images.length) {
    const g = el('div', { class: 'gallery', style: 'margin-bottom:1rem' });
    h.images.slice(0, 6).forEach((im) => { const i = el('img', { alt: im.alt || h.name, loading: 'lazy' }); i.addEventListener('error', () => i.remove()); i.src = im.url; g.append(i); });
    s.append(g);
  }
  s.append(el('p', { class: 'muted', style: 'max-width:70ch' }, h.description));
  const split = el('div', { class: 'split' });
  const left = el('div', {});
  const facts = el('div', { class: 'meta' },
    chip('💵 ' + fmtPrice(h.price_per_night_usd) + ' /night', 'gold'),
    chip('🍽 ' + Math.round(h.num_restaurants) + ' restaurants'),
    chip('🏊 ' + Math.round(h.num_pools) + ' pools'),
    h.num_rooms ? chip('🛏 ' + Math.round(h.num_rooms) + ' rooms') : null,
    chip('✈ ' + h.nearest_airport + ' · ' + Math.round(h.airport_transfer_min) + ' min'));
  left.append(facts);
  left.append(el('h3', { style: 'margin-top:1rem' }, 'Amenities'));
  const am = el('div', { class: 'meta' }); (h.amenities || []).forEach((a) => am.append(chip(a))); left.append(am);
  const pc = el('div', { class: 'pros-cons', style: 'margin-top:1rem' });
  const pros = el('div', { class: 'pros' }, el('strong', {}, '👍 Pros')); const pl = el('ul'); (h.pros || []).forEach((p) => pl.append(el('li', {}, p))); pros.append(pl);
  const cons = el('div', { class: 'cons' }, el('strong', {}, '👎 Cons')); const cl = el('ul'); (h.cons || []).forEach((p) => cl.append(el('li', {}, p))); cons.append(cl);
  pc.append(pros, cons); left.append(pc);
  const right = el('div', {});
  right.append(el('button', { class: 'btn primary', onclick: () => trayAdd('hotel', h.id, h.name) }, '+ Add to compare'));
  if (h.official_site) right.append(el('a', { class: 'btn', href: h.official_site, target: '_blank', rel: 'noopener', style: 'margin-top:.5rem' }, 'Official site ↗'));
  split.append(left, right); s.append(split);
  main.append(s);
}

async function initCompare() {
  const main = document.getElementById('main');
  const t = trayGet();
  main.innerHTML = '';
  main.append(el('h1', { style: 'margin:.4rem 0' }, 'Side-by-side comparison'));
  if (!t.ids || !t.ids.length) {
    main.append(el('p', { class: 'empty' }, 'Nothing selected yet. Add areas or hotels with the “+ Compare” buttons.'));
    main.append(el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: 'areas.html' }, 'Browse areas'), el('a', { class: 'btn', href: 'hotels.html' }, 'Browse hotels')));
    return;
  }
  const data = await api('/api/compare?type=' + t.type + '&ids=' + encodeURIComponent(t.ids.join(',')));
  const areas = await getAreas();
  const items = t.type === 'area' ? data.areas : data.hotels;
  const rows = t.type === 'area' ? [
    ['Region', (a) => a.region], ['Airport', (a) => a.nearest_airport], ['Transfer', (a) => Math.round(a.airport_transfer_min) + ' min'],
    ['Avg price/night', (a) => fmtPrice(a.avg_hotel_price_usd)], ['Sargassum risk', (a) => a.sargassum_risk],
    ['Beach', (a) => a.scores.beach], ['Nightlife', (a) => a.scores.nightlife], ['Family', (a) => a.scores.family],
    ['Nature', (a) => a.scores.nature], ['Culture', (a) => a.scores.culture], ['Value', (a) => a.scores.value],
    ['Safety', (a) => a.scores.safety], ['Walkability', (a) => a.scores.walkability],
    ['Whale season', (a) => a.whale_season || '—'], ['Best months', (a) => (a.best_months || []).join(', ')],
    ['Best for', (a) => (a.best_for || []).join(', ')],
  ] : [
    ['Area', (h) => areaName(areas, h.area_id)], ['Stars', (h) => stars(h.stars)], ['Guest rating', (h) => fmtRating(h.guest_rating)],
    ['Price/night', (h) => fmtPrice(h.price_per_night_usd)], ['Board', (h) => h.board], ['Adults-only', (h) => h.adults_only ? 'Yes' : 'No'],
    ['Family-friendly', (h) => h.family_friendly ? 'Yes' : 'No'], ['Beachfront', (h) => h.beachfront ? 'Yes' : 'No'],
    ['Restaurants', (h) => Math.round(h.num_restaurants) || '—'], ['Pools', (h) => Math.round(h.num_pools) || '—'],
    ['Rooms', (h) => Math.round(h.num_rooms) || '—'], ['Transfer', (h) => Math.round(h.airport_transfer_min) + ' min'],
    ['Amenities', (h) => (h.amenities || []).join(', ')],
  ];
  const wrap = el('div', { class: 'tablewrap' });
  const table = el('table', { class: 'compare' });
  const thead = el('tr', {}, el('th', { class: 'rowlbl' }, ''));
  items.forEach((it) => thead.append(el('th', {}, it.name)));
  table.append(el('thead', {}, thead));
  const tbody = el('tbody');
  rows.forEach(([label, fn]) => {
    const tr = el('tr', {}, el('th', { class: 'rowlbl' }, label));
    items.forEach((it) => tr.append(el('td', {}, String(fn(it)))));
    tbody.append(tr);
  });
  table.append(tbody); wrap.append(table); main.append(wrap);
  main.append(el('div', { class: 'btn-row', style: 'margin-top:1.2rem' }, el('button', { class: 'btn', onclick: () => { trayClear(); initCompare(); } }, 'Clear selection')));
}

async function initMatch() {
  const main = document.getElementById('main');
  const dims = [
    ['beach', '🏖 Beaches'], ['low_sargassum', '🌿 Seaweed-free'], ['nightlife', '🍸 Nightlife'],
    ['family', '👨‍👩‍👧 Family'], ['nature', '🌋 Nature'], ['culture', '🏛 Culture & history'],
    ['value', '💰 Value'], ['safety', '🛡 Safety'], ['walkability', '🚶 Walkable'],
  ];
  const form = el('div', { class: 'sliders' });
  dims.forEach(([k, label]) => {
    const out = el('span', { class: 'rating' }, '3');
    const inp = el('input', { type: 'range', min: '0', max: '5', step: '1', value: '3', id: 'w-' + k });
    inp.addEventListener('input', () => { out.textContent = inp.value; });
    form.append(el('div', { class: 'slider' }, el('label', {}, el('span', {}, label), out), inp));
  });
  const results = el('div', { id: 'match-results', style: 'margin-top:1.6rem' });
  async function run() {
    const weights = {};
    dims.forEach(([k]) => { weights[k] = Number(document.getElementById('w-' + k).value); });
    results.innerHTML = '<div class="spinner"></div>';
    const [scored, areas] = await Promise.all([
      api('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'area', weights }) }),
      getAreas(),
    ]);
    results.innerHTML = '';
    results.append(el('h2', {}, 'Your best-matched areas'));
    const grid = el('div', { class: 'grid' });
    scored.results.forEach((r, i) => {
      const card = areaCard(r.area);
      const badge = el('div', { style: 'position:absolute;top:.6rem;left:.6rem;z-index:2' }, chip('#' + (i + 1) + ' · ' + r.score + '%', i === 0 ? 'gold' : 'accent'));
      card.querySelector('.thumb').append(badge);
      grid.append(card);
    });
    results.append(grid);
    // Show top hotels in the winning area.
    const top = scored.results[0];
    if (top) {
      const data = await api('/api/areas/' + encodeURIComponent(top.area.id));
      const hs = el('section', { class: 'section' });
      hs.append(el('h2', {}, 'Top hotels in your #1 match: ' + top.area.name));
      const hg = el('div', { class: 'grid' });
      (data.hotels || []).slice(0, 6).forEach((h) => hg.append(hotelCard(h)));
      hs.append(hg); results.append(hs);
    }
  }
  main.append(el('p', { class: 'sub' }, 'Slide what matters to you (0 = don’t care, 5 = essential), then see your match.'));
  main.append(form);
  main.append(el('div', { class: 'btn-row', style: 'margin-top:1.2rem' }, el('button', { class: 'btn primary', onclick: run }, 'Show my matches →')));
  main.append(results);
}

/* ── boot ───────────────────────────────────────────────────────────────── */
function highlightSubnav() {
  document.querySelectorAll('#subnav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (location.pathname.endsWith(href) || (href === 'index.html' && (location.pathname.endsWith('/') || location.pathname.endsWith('/dr')))) a.classList.add('active');
  });
}
function boot() {
  highlightSubnav();
  renderTray();
  const page = document.body.dataset.page;
  const fn = { index: initIndex, areas: initAreas, area: initArea, hotels: initHotels, hotel: initHotel, compare: initCompare, match: initMatch }[page];
  if (fn) Promise.resolve(fn()).catch((err) => {
    console.error(err);
    const m = document.getElementById('main');
    if (m) m.innerHTML = '<p class="empty">Couldn’t load data — the API may still be starting. Try again in a moment.</p>';
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
