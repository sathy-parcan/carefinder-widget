/*! CareFinder listing widget for Webflow (Parkinson Canada prototype).
 *  Markup:  <div id="carefinder" data-api="https://YOUR-WORKER.workers.dev/api/listings"></div>
 *  Options: window.CAREFINDER_CONFIG = { intro: {...}, pageSize: 10 }   (set before this script loads)
 */
(function () {
  'use strict';

  // ---------- pure logic (also exercised by test/run.mjs) ----------
  var GROUPS = {
    pro: { label: 'Healthcare professionals', all: 'All healthcare professionals' },
    well: { label: 'Health and wellness programs', all: 'All health and wellness programs' },
    sup: { label: 'Support groups', all: 'All support groups' },
  };
  var LANGUAGE_NAMES = { EN: 'English', FR: 'French', ES: 'Spanish', FIL: 'Filipino', HI: 'Hindi', PA: 'Punjabi', ZH: 'Chinese' };
  var LANGUAGE_ORDER = ['EN', 'ES', 'FIL', 'FR', 'HI', 'PA', 'ZH'];
  var DELIVERY = ['In-person', 'In-home', 'Virtual'];
  var COST = ['Free', 'Fee-based', 'Donation'];

  function haversineKm(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r;
    var dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  }

  function intersects(have, wanted) {
    for (var i = 0; i < have.length; i += 1) if (wanted.has(have[i])) return true;
    return false;
  }

  function haystack(r) {
    return [r.name, r.description, r.expertise, r.city, r.province, r.postal,
      r.subs.pro.join(' '), r.subs.well.join(' '), r.subs.sup.join(' ')].join(' ').toLowerCase();
  }

  // Returns [{ r: listing, d: distanceKm | null }] filtered and sorted.
  function applyFilters(all, s) {
    var tokens = s.kw.toLowerCase().split(/\s+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < all.length; i += 1) {
      var r = all[i];
      if (s.group) {
        if (r.groups.indexOf(s.group) === -1) continue;
        if (s.sub && s.sub !== '__all' && r.subs[s.group].indexOf(s.sub) === -1) continue;
      }
      if (s.delivery.size && !intersects(r.delivery, s.delivery)) continue;
      if (s.cost.size && !intersects(r.cost, s.cost)) continue;
      if (s.lang.size && !intersects(r.languages, s.lang)) continue;
      if (tokens.length) {
        var h = haystack(r);
        var ok = true;
        for (var t = 0; t < tokens.length; t += 1) if (h.indexOf(tokens[t]) === -1) { ok = false; break; }
        if (!ok) continue;
      }
      var d = null;
      if (s.loc && r.lat !== null && r.lng !== null) {
        d = haversineKm(s.loc.lat, s.loc.lng, r.lat, r.lng);
        if (d > s.km) continue;
      }
      out.push({ r: r, d: d });
    }
    out.sort(function (a, b) {
      if (s.loc) {
        if (a.d === null && b.d !== null) return 1;
        if (a.d !== null && b.d === null) return -1;
        if (a.d !== null && b.d !== null && a.d !== b.d) return a.d - b.d;
      }
      return byName(a.r, b.r);
    });
    return out;
  }

  function subOptions(all, group) {
    var seen = {};
    all.forEach(function (r) {
      r.subs[group].forEach(function (v) { seen[v] = true; });
    });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'en', { sensitivity: 'base' }); });
  }

  function languageOptions(all) {
    var seen = {};
    all.forEach(function (r) { r.languages.forEach(function (l) { seen[l] = true; }); });
    var known = LANGUAGE_ORDER.filter(function (l) { return seen[l]; });
    var other = Object.keys(seen).filter(function (l) { return LANGUAGE_ORDER.indexOf(l) === -1; }).sort();
    return known.concat(other);
  }

  function pageList(total, page) {
    if (total <= 7) {
      var all = [];
      for (var i = 1; i <= total; i += 1) all.push(i);
      return all;
    }
    var set = { 1: true };
    set[total] = true;
    for (var p = page - 1; p <= page + 1; p += 1) if (p > 1 && p < total) set[p] = true;
    var nums = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    nums.forEach(function (n, idx) {
      if (idx && n - nums[idx - 1] > 1) out.push('…');
      out.push(n);
    });
    return out;
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    var cut = text.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
  }

  function num(v) {
    var n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && isFinite(n) ? n : null;
  }

  function pointFrom(item) {
    if (!item || typeof item !== 'object') return null;
    var lat = num(item.lat !== undefined ? item.lat : item.latitude);
    var lon = num(item.lon !== undefined ? item.lon : item.lng !== undefined ? item.lng : item.longitude);
    if (lat === null || lon === null) {
      var g = (item.geometry && item.geometry.coordinates) || item.coordinates || item.center;
      if (Array.isArray(g) && g.length >= 2) { lon = num(g[0]); lat = num(g[1]); }
    }
    if ((lat === null || lon === null) && Array.isArray(item.bbox) && item.bbox.length === 4) {
      var b = item.bbox.map(num);
      if (b.every(function (x) { return x !== null; })) { lon = (b[0] + b[2]) / 2; lat = (b[1] + b[3]) / 2; }
    }
    if (lat === null || lon === null) return null;
    if (lat < 0 && lon > 0) { var tmp = lat; lat = lon; lon = tmp; }
    if (lat < 41 || lat > 84 || lon < -142 || lon > -52) return null; // inside Canada only
    return { lat: lat, lng: lon };
  }

  function extractPoint(data) {
    var list = Array.isArray(data) ? data : data && (data.results || data.features || data.items) || [];
    for (var i = 0; i < list.length; i += 1) {
      var p = pointFrom(list[i]);
      if (p) return p;
    }
    return null;
  }

  // Listings that share a map point (many sit on the centre of their postal-code area) become one pin.
  function groupByLocation(items) {
    var byKey = {};
    var groups = [];
    var missing = 0;
    items.forEach(function (item) {
      var r = item.r;
      if (r.lat === null || r.lng === null || r.lat === undefined || r.lng === undefined) { missing += 1; return; }
      var key = r.lat.toFixed(4) + ',' + r.lng.toFixed(4);
      if (!byKey[key]) { byKey[key] = { lat: r.lat, lng: r.lng, items: [] }; groups.push(byKey[key]); }
      byKey[key].items.push(item);
    });
    return { groups: groups, missing: missing };
  }

  var api = {
    groupByLocation: groupByLocation,
    applyFilters: applyFilters, subOptions: subOptions, languageOptions: languageOptions,
    pageList: pageList, truncate: truncate, extractPoint: extractPoint, haversineKm: haversineKm,
  };
  if (typeof window !== 'undefined' && window.__CAREFINDER_EXPOSE__) window.__CAREFINDER_TEST__ = api;
  if (typeof document === 'undefined' || !document.getElementById) return;
  var root = document.getElementById('carefinder');
  if (!root) return;

  // ---------- configuration ----------
  var cfg = window.CAREFINDER_CONFIG || {};
  var API_URL = cfg.api || root.getAttribute('data-api') || '';
  var GEO_URL = cfg.geolocator || 'https://geolocator.api.geo.ca/';
  var PAGE_SIZE = cfg.pageSize || 10;
  // Map: Leaflet is loaded only when someone opens Map View. Integrity hashes are the ones published by leafletjs.com for 1.9.4.
  var LEAFLET = cfg.leaflet || {
    css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', cssIntegrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
    js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', jsIntegrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  };
  var TILE_URL = cfg.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_ATTRIBUTION = cfg.tileAttribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  // ---------- styles ----------
  var CSS = [
    '.cf,.cf *{box-sizing:border-box}',
    '.cf{--cf-blue:#263B7F;--cf-coral:#E25744;--cf-coral-ink:#B93B2B;--cf-bg:#F2F2F2;--cf-ink:#1E2230;--cf-muted:#5A5F70;--cf-line:#D9DCE5;',
    'font-family:var(--cf-font,"Lato",system-ui,-apple-system,"Segoe UI",sans-serif);color:var(--cf-ink);line-height:1.5;background:var(--cf-bg);padding:48px 0 72px}',
    '.cf h2,.cf h3,.cf h4,.cf legend{font-family:var(--cf-heading-font,"Filson Pro","Lato",system-ui,sans-serif);font-weight:800;margin:0}',
    '.cf-inner{max-width:1200px;margin:0 auto;padding:0 24px}',
    '.cf button,.cf input,.cf select{font:inherit;color:inherit}',
    '.cf a{color:var(--cf-blue)}',
    '.cf :focus-visible{outline:3px solid var(--cf-blue-2,#4F6ED4);outline-offset:2px}',
    '.cf-linkbtn{background:none;border:0;padding:0;cursor:pointer;color:var(--cf-blue);font-weight:700;text-decoration:underline;text-underline-offset:3px}',
    /* intro */
    '.cf-intro{display:grid;grid-template-columns:1.2fr 1fr;gap:32px;margin-bottom:40px;align-items:start}',
    '.cf-intro h2{color:var(--cf-blue);font-size:24px;margin-bottom:8px}',
    '.cf-intro p{margin:0 0 8px;color:var(--cf-ink);max-width:70ch}',
    '.cf-cards{display:grid;gap:16px}',
    '.cf-note{background:#E6E8EC;border-radius:12px;padding:20px 24px}',
    '.cf-note h3{color:var(--cf-blue);font-size:19px;margin-bottom:6px}',
    /* filters */
    '.cf-filterhead{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 16px;margin-bottom:20px}',
    '.cf-filterhead h2{color:var(--cf-coral);font-size:38px;line-height:1.15}',
    '.cf-or{color:var(--cf-muted);font-size:18px}',
    '.cf-selects{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:28px}',
    '.cf-select{width:100%;appearance:none;-webkit-appearance:none;background:#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'10\' viewBox=\'0 0 16 10\'%3E%3Cpath d=\'M2 2l6 6 6-6\' fill=\'none\' stroke=\'%23263B7F\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E") no-repeat right 16px center;',
    'border:0;border-bottom:4px solid var(--cf-coral);border-radius:6px 6px 0 0;padding:16px 44px 14px 18px;font-size:18px;font-weight:700;color:var(--cf-blue);cursor:pointer}',
    '.cf-kw{display:flex;gap:12px;margin:-8px 0 24px;max-width:560px}',
    '.cf-kw[hidden]{display:none}',
    '.cf-kw input{flex:1;border:0;border-bottom:3px solid var(--cf-blue);background:transparent;padding:10px 4px;font-size:18px}',
    '.cf-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}',
    '.cf-count{color:var(--cf-blue);font-size:32px}',
    '.cf-narrowbtn{display:inline-flex;align-items:center;gap:10px;background:none;border:0;padding:8px 0;cursor:pointer;color:var(--cf-blue);font-weight:800;font-size:19px}',
    '.cf-narrowbtn svg{transition:transform .15s}',
    '.cf-narrowbtn[aria-expanded="true"] svg{transform:rotate(180deg)}',
    '.cf-narrow{background:#fff;border-radius:12px;padding:24px;margin:8px 0 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px}',
    '.cf-narrow[hidden]{display:none}',
    '.cf-narrow fieldset{border:0;margin:0;padding:0;min-width:0}',
    '.cf-narrow legend{color:var(--cf-blue);font-size:18px;padding:0;margin-bottom:10px}',
    '.cf-check{display:flex;align-items:center;gap:10px;margin:0 0 8px;cursor:pointer}',
    '.cf-check input{width:20px;height:20px;accent-color:var(--cf-blue);margin:0}',
    '.cf-loc{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:end;margin-bottom:12px}',
    '.cf-loc label{display:block;font-weight:700;color:var(--cf-blue);margin-bottom:4px}',
    '.cf-locrow{display:flex;border-bottom:3px solid var(--cf-blue)}',
    '.cf-locrow input{flex:1;min-width:0;border:0;background:transparent;padding:10px 4px;font-size:18px}',
    '.cf-locrow button{background:none;border:0;cursor:pointer;padding:0 8px;color:var(--cf-blue);display:flex;align-items:center}',
    '.cf-range input{width:100%;accent-color:var(--cf-blue)}',
    '.cf-status{min-height:24px;color:var(--cf-muted);margin:0 0 20px;font-size:15px}',
    '.cf-status.cf-err{color:var(--cf-coral-ink);font-weight:700}',
    /* results */
    '.cf-list{display:grid;gap:20px;margin:0;padding:0;list-style:none}',
    '.cf-card{background:#fff;border-radius:14px;padding:22px 28px 26px;box-shadow:0 1px 2px rgba(20,30,60,.06)}',
    '.cf-top{display:flex;justify-content:space-between;gap:12px;font-weight:800;color:var(--cf-blue);font-size:15px;padding-bottom:12px;border-bottom:2px solid var(--cf-coral);margin-bottom:18px}',
    '.cf-top span:last-child{font-weight:700;color:var(--cf-muted)}',
    '.cf-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,260px);gap:12px 40px}',
    '.cf-name{color:var(--cf-blue);font-size:26px;line-height:1.2;margin-bottom:8px;overflow-wrap:anywhere}',
    '.cf-desc{margin:0 0 10px;white-space:pre-line;max-width:75ch}',
    '.cf-tags{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none}',
    '.cf-tags li{background:#E8ECF8;color:var(--cf-blue);font-weight:700;font-size:14px;border-radius:999px;padding:3px 12px}',
    '.cf-links{list-style:none;margin:0;padding:0;display:grid;gap:10px;align-content:start}',
    '.cf-links a{font-weight:800;overflow-wrap:anywhere}',
    '.cf-details{margin-top:16px;padding-top:16px;border-top:1px solid var(--cf-line);display:grid;gap:12px}',
    '.cf-details[hidden]{display:none}',
    '.cf-details h4{font-size:15px;color:var(--cf-blue);margin-bottom:2px}',
    '.cf-details p{margin:0;white-space:pre-line}',
    '.cf-empty{background:#fff;border-radius:14px;padding:32px;text-align:center}',
    '.cf-empty h3{color:var(--cf-blue);font-size:24px;margin-bottom:8px}',
    /* pagination */
    '.cf-pages{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:36px 0 0}',
    '.cf-pages button{min-width:44px;height:44px;padding:0 14px;border-radius:8px;border:2px solid transparent;background:#fff;color:var(--cf-blue);font-weight:800;cursor:pointer}',
    '.cf-pages button[aria-current="page"]{background:var(--cf-blue);color:#fff}',
    '.cf-pages button:disabled{opacity:.45;cursor:default}',
    '.cf-pages .cf-gap{display:inline-flex;align-items:center;color:var(--cf-muted);padding:0 4px}',
    '.cf-top-btn{position:fixed;right:24px;bottom:24px;width:52px;height:52px;border-radius:50%;border:0;background:var(--cf-blue);color:#fff;cursor:pointer;display:none;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(20,30,60,.3);z-index:50}',
    '.cf-top-btn.cf-show{display:flex}',
    '.cf-loading{padding:48px 0;text-align:center;color:var(--cf-muted);font-size:18px}',
    /* view toggle + map */
    '.cf-toggle{display:inline-flex;background:#DADDE5;border-radius:999px;padding:4px}',
    '.cf-toggle button{border:0;border-radius:999px;padding:10px 22px;font-weight:800;font-size:16px;cursor:pointer;background:transparent;color:var(--cf-blue)}',
    '.cf-toggle button[aria-pressed="true"]{background:var(--cf-coral);color:#fff}',
    '.cf-narrowrow{margin:0 0 4px}',
    '.cf-map-wrap[hidden],.cf-list[hidden],.cf-pages[hidden]{display:none}',
    '.cf-map{height:600px;border-radius:14px;overflow:hidden;background:#E6E8EC;border:1px solid var(--cf-line)}',
    '.cf .leaflet-container img{max-width:none!important;max-height:none!important}',
    '.cf .leaflet-container{font-family:inherit}',
    '.cf-pin-wrap{background:transparent;border:0}',
    '.cf-pin{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;background:var(--cf-blue);border:3px solid #fff;box-shadow:0 1px 6px rgba(15,25,60,.45);color:#fff;font-weight:800;font-size:14px}',
    '.cf-pop{min-width:210px;max-width:300px}',
    '.cf-pop-list{max-height:240px;overflow:auto;margin:0;padding:0;list-style:none;display:grid;gap:14px}',
    '.cf-pop-name{margin:0 0 2px;font-weight:800;color:var(--cf-blue);font-size:16px;line-height:1.25}',
    '.cf-pop-meta{margin:0 0 4px;font-size:14px;color:var(--cf-muted)}',
    '.cf-pop-links{display:flex;flex-wrap:wrap;gap:4px 12px;font-weight:700;font-size:14px}',
    '.cf-pop-more{margin:8px 0 0;font-size:14px;color:var(--cf-muted)}',
    '@media (max-width:900px){.cf-map{height:440px}}',
    '@media (max-width:900px){.cf-intro{grid-template-columns:1fr}.cf-selects,.cf-narrow{grid-template-columns:1fr}.cf-loc{grid-template-columns:1fr}.cf-body{grid-template-columns:1fr}.cf-filterhead h2{font-size:30px}.cf-count{font-size:26px}}',
    '@media (prefers-reduced-motion:reduce){.cf *{transition:none!important}}',
  ].join('\n');

  // ---------- tiny DOM helpers (all text goes through textContent) ----------
  function h(tag, props, kids) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(pathD, size, extra) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.5');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', pathD);
    s.appendChild(p);
    if (extra) s.setAttribute('class', extra);
    return s;
  }
  var CHEVRON = 'M6 9l6 6 6-6';
  var UP = 'M6 15l6-6 6 6';
  var SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4-4';

  // ---------- state ----------
  var state = {
    all: [], group: '', sub: '', kw: '', delivery: new Set(), cost: new Set(), lang: new Set(),
    loc: null, km: 100, page: 1, open: {}, view: 'list',
  };
  var els = {};

  function locationLabel(r) {
    var parts = [r.city, r.province].filter(Boolean);
    if (parts.length) return parts.join(', ');
    if (r.delivery.length === 1 && r.delivery[0] === 'Virtual') return 'Virtual';
    return 'Location not listed';
  }

  function phoneHref(p) { return 'tel:' + p.replace(/[^\d+]/g, ''); }
  function siteLabel(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'Website'; } }

  function detailBlock(title, text) {
    if (!text) return null;
    return h('div', null, [h('h4', { text: title }), h('p', { text: text })]);
  }

  function addressText(r) {
    var line = [r.address, [r.city, r.province].filter(Boolean).join(', '), r.postal].filter(Boolean).join('\n');
    return line;
  }

  function renderCard(item, idx) {
    var r = item.r;
    var open = !!state.open[r.id];
    var detailId = 'cf-d-' + idx;
    var desc = r.description || r.expertise;
    var tags = [].concat(r.subs.pro, r.subs.well, r.subs.sup).slice(0, 4);
    var details = h('div', { class: 'cf-details', id: detailId, hidden: !open }, [
      r.description && r.expertise ? detailBlock('Area of expertise', r.expertise) : null,
      r.description ? detailBlock('About this service', r.description) : null,
      detailBlock('How to register', r.register.join(', ')),
      detailBlock('Availability', r.delivery.join(', ')),
      detailBlock('Cost', r.cost.join(', ')),
      detailBlock('Languages', r.languages.map(function (l) { return LANGUAGE_NAMES[l] || l; }).join(', ')),
      detailBlock('Accessibility', r.accessibility),
      detailBlock('Address', addressText(r)),
    ]);
    var more = h('button', {
      class: 'cf-linkbtn', type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId,
      text: open ? 'Hide details' : 'Read full details',
      onclick: function () {
        state.open[r.id] = !state.open[r.id];
        var now = state.open[r.id];
        more.setAttribute('aria-expanded', now ? 'true' : 'false');
        more.textContent = now ? 'Hide details' : 'Read full details';
        if (now) details.removeAttribute('hidden'); else details.setAttribute('hidden', '');
      },
    });
    var links = [];
    if (r.phone) links.push(h('li', null, [h('a', { href: phoneHref(r.phone), text: r.phone })]));
    if (r.email) links.push(h('li', null, [h('a', { href: 'mailto:' + r.email, text: r.email })]));
    if (r.website && /^https?:\/\//i.test(r.website)) links.push(h('li', null, [h('a', { href: r.website, target: '_blank', rel: 'noopener noreferrer', text: siteLabel(r.website) })]));
    return h('li', null, [h('article', { class: 'cf-card' }, [
      h('div', { class: 'cf-top' }, [
        h('span', { text: locationLabel(r) }),
        item.d !== null ? h('span', { text: Math.round(item.d) + ' km away' }) : null,
      ]),
      h('div', { class: 'cf-body' }, [
        h('div', null, [
          h('h3', { class: 'cf-name', text: r.name }),
          desc ? h('p', { class: 'cf-desc', text: truncate(desc, 230) }) : null,
          more,
          tags.length ? h('ul', { class: 'cf-tags' }, tags.map(function (t) { return h('li', { text: t }); })) : null,
          details,
        ]),
        links.length ? h('ul', { class: 'cf-links' }, links) : null,
      ]),
    ])]);
  }

  function render() {
    var results = applyFilters(state.all, state);
    var pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var slice = results.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

    els.count.textContent = results.length + (results.length === 1 ? ' result found' : ' results found');
    els.list.textContent = '';
    if (!slice.length) {
      els.list.appendChild(h('li', null, [h('div', { class: 'cf-empty' }, [
        h('h3', { text: 'No listings match these filters' }),
        h('p', { text: 'Try removing a filter, searching a different keyword, or widening the distance.' }),
      ])]));
    } else {
      slice.forEach(function (item, i) { els.list.appendChild(renderCard(item, i)); });
    }

    if (state.view === 'map') drawMap(results);

    els.pages.textContent = '';
    if (pages > 1) {
      var go = function (p) { state.page = p; render(); root.scrollIntoView({ behavior: 'auto', block: 'start' }); };
      els.pages.appendChild(h('button', { type: 'button', text: 'Previous', disabled: state.page === 1, onclick: function () { go(state.page - 1); } }));
      pageList(pages, state.page).forEach(function (p) {
        if (p === '…') els.pages.appendChild(h('span', { class: 'cf-gap', text: '…' }));
        else els.pages.appendChild(h('button', {
          type: 'button', text: String(p), 'aria-label': 'Page ' + p, 'aria-current': p === state.page ? 'page' : null,
          onclick: function () { go(p); },
        }));
      });
      els.pages.appendChild(h('button', { type: 'button', text: 'Next', disabled: state.page === pages, onclick: function () { go(state.page + 1); } }));
    }
  }

  // ---------- map view ----------
  var leafletPromise = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (!leafletPromise) {
      leafletPromise = new Promise(function (resolve, reject) {
        document.head.appendChild(h('link', { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssIntegrity, crossorigin: '' }));
        var js = h('script', { src: LEAFLET.js, integrity: LEAFLET.jsIntegrity, crossorigin: '' });
        js.addEventListener('load', function () { if (window.L && window.L.map) resolve(window.L); else { leafletPromise = null; reject(new Error('Leaflet missing')); } });
        js.addEventListener('error', function () { leafletPromise = null; reject(new Error('Leaflet blocked')); });
        document.head.appendChild(js);
      });
    }
    return leafletPromise;
  }

  var mapState = null;
  function popupFor(group) {
    var MAX = 25;
    var shown = group.items.slice(0, MAX);
    var list = h('ul', { class: 'cf-pop-list' }, shown.map(function (item) {
      var r = item.r;
      var links = [];
      if (r.phone) links.push(h('a', { href: phoneHref(r.phone), text: r.phone }));
      if (r.email) links.push(h('a', { href: 'mailto:' + r.email, text: r.email }));
      if (r.website && /^https?:\/\//i.test(r.website)) links.push(h('a', { href: r.website, target: '_blank', rel: 'noopener noreferrer', text: siteLabel(r.website) }));
      return h('li', null, [
        h('p', { class: 'cf-pop-name', text: r.name }),
        h('p', { class: 'cf-pop-meta', text: locationLabel(r) }),
        links.length ? h('div', { class: 'cf-pop-links' }, links) : null,
      ]);
    }));
    return h('div', { class: 'cf-pop' }, [
      list,
      group.items.length > MAX ? h('p', { class: 'cf-pop-more', text: (group.items.length - MAX) + ' more at this location. Use List View to see them all.' }) : null,
    ]);
  }

  function drawMap(results) {
    var grouped = groupByLocation(results);
    var shown = results.length - grouped.missing;
    els.mapNote.className = 'cf-status';
    els.mapNote.textContent = shown + (shown === 1 ? ' listing is' : ' listings are') + ' shown on the map.'
      + (grouped.missing ? ' ' + grouped.missing + (grouped.missing === 1 ? ' listing has' : ' listings have') + ' no map location. Use List View to see ' + (grouped.missing === 1 ? 'it' : 'them') + '.' : '');
    loadLeaflet().then(function (L) {
      if (state.view !== 'map') return;
      if (!mapState) {
        var map = L.map(els.mapEl, { scrollWheelZoom: false });
        L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(map);
        mapState = { map: map, layer: L.layerGroup().addTo(map) };
      }
      var map = mapState.map;
      map.invalidateSize();
      mapState.layer.clearLayers();
      var points = [];
      grouped.groups.forEach(function (g) {
        var n = g.items.length;
        var size = n > 1 ? 36 : 24;
        var icon = L.divIcon({ className: 'cf-pin-wrap', html: '<span class="cf-pin">' + (n > 1 ? n : '') + '</span>', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
        var marker = L.marker([g.lat, g.lng], { icon: icon, title: g.items[0].r.name + (n > 1 ? ' and ' + (n - 1) + ' more' : ''), keyboard: true });
        marker.bindPopup(popupFor(g), { maxWidth: 320 });
        mapState.layer.addLayer(marker);
        points.push([g.lat, g.lng]);
      });
      if (state.loc) {
        mapState.layer.addLayer(L.circle([state.loc.lat, state.loc.lng], { radius: state.km * 1000, color: '#E25744', weight: 1.5, fillOpacity: 0.04, interactive: false }));
        mapState.layer.addLayer(L.circleMarker([state.loc.lat, state.loc.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#E25744', fillOpacity: 1 }).bindTooltip('Your search location'));
        points.push([state.loc.lat, state.loc.lng]);
      }
      if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 12 });
      else if (points.length === 1) map.setView(points[0], 11);
      else map.setView([56, -96], 3);
    }).catch(function () {
      els.mapNote.className = 'cf-status cf-err';
      els.mapNote.textContent = 'The map could not be loaded. Use List View instead.';
    });
  }

  function setView(v) {
    state.view = v;
    els.viewList.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false');
    els.viewMap.setAttribute('aria-pressed', v === 'map' ? 'true' : 'false');
    if (v === 'map') {
      els.list.setAttribute('hidden', ''); els.pages.setAttribute('hidden', ''); els.mapWrap.removeAttribute('hidden');
    } else {
      els.mapWrap.setAttribute('hidden', ''); els.list.removeAttribute('hidden'); els.pages.removeAttribute('hidden');
    }
    render();
  }

  function refresh() { state.page = 1; render(); }

  function setStatus(msg, isErr) {
    els.status.textContent = msg || '';
    els.status.className = 'cf-status' + (isErr ? ' cf-err' : '');
  }

  // ---------- location search (free NRCan Geolocator API, called from the visitor's browser) ----------
  function findLocation(raw) {
    var q = raw.trim();
    if (!q) { state.loc = null; els.km.disabled = true; setStatus(''); refresh(); return; }
    var postal = /^[A-Za-z]\d[A-Za-z]/.test(q);
    var query = postal ? q.slice(0, 3).toUpperCase() : q;
    var url = GEO_URL + '?q=' + encodeURIComponent(query) + '&lang=en&keys=' + (postal ? 'fsa' : 'geonames,fsa');
    setStatus('Finding ' + query + '…');
    fetch(url).then(function (res) {
      if (!res.ok) throw new Error('lookup ' + res.status);
      return res.json();
    }).then(function (data) {
      var p = extractPoint(data);
      if (!p) { setStatus('We could not find that location. Try a postal code such as M5R or a city name.', true); return; }
      state.loc = { lat: p.lat, lng: p.lng };
      els.km.disabled = false;
      setStatus('Showing listings within ' + state.km + ' km of ' + query + '. Listings without a known location appear last.');
      refresh();
    }).catch(function () {
      setStatus('Location search is unavailable right now. Try again in a moment.', true);
    });
  }

  // ---------- page shell ----------
  function checkGroup(title, options, set, labelFor) {
    return h('fieldset', null, [h('legend', { text: title })].concat(options.map(function (opt) {
      var input = h('input', { type: 'checkbox', value: opt, onchange: function () {
        if (input.checked) set.add(opt); else set.delete(opt);
        refresh();
      } });
      return h('label', { class: 'cf-check' }, [input, h('span', { text: labelFor ? labelFor(opt) : opt })]);
    })));
  }

  function buildSelect(group) {
    var g = GROUPS[group];
    var sel = h('select', { class: 'cf-select', 'aria-label': g.label, 'data-group': group }, [
      h('option', { value: '', text: g.label }),
      h('option', { value: '__all', text: g.all }),
    ].concat(subOptions(state.all, group).map(function (v) { return h('option', { value: v, text: v }); })));
    sel.addEventListener('change', function () {
      Object.keys(els.selects).forEach(function (k) { if (k !== group) els.selects[k].value = ''; });
      state.group = sel.value ? group : '';
      state.sub = sel.value;
      refresh();
    });
    els.selects[group] = sel;
    return sel;
  }

  function buildIntro() {
    var intro = cfg.intro;
    if (!intro) return null;
    var left = h('div', null, [
      intro.disclaimerTitle ? h('h2', { text: intro.disclaimerTitle }) : null,
    ].concat((intro.disclaimer || []).map(function (t) { return h('p', { text: t }); })));
    var cards = (intro.cards || []).filter(function (c) { return c && c.title; }).map(function (c) {
      return h('div', { class: 'cf-note' }, [
        h('h3', { text: c.title }),
        c.href && c.linkText ? h('a', { href: c.href, text: c.linkText }) : null,
      ]);
    });
    return h('div', { class: 'cf-intro' }, [left, h('div', { class: 'cf-cards' }, cards)]);
  }

  function build() {
    els.selects = {};
    els.count = h('h2', { class: 'cf-count', 'aria-live': 'polite', text: '' });
    els.list = h('ul', { class: 'cf-list' });
    els.pages = h('nav', { class: 'cf-pages', 'aria-label': 'Pagination' });
    els.status = h('p', { class: 'cf-status', 'aria-live': 'polite' });

    var kwInput = h('input', { type: 'search', id: 'cf-kw', placeholder: 'Search by keyword', 'aria-label': 'Search by keyword', oninput: function () { state.kw = kwInput.value; refresh(); } });
    var kwRow = h('div', { class: 'cf-kw', hidden: true }, [kwInput]);
    var kwToggle = h('button', { type: 'button', class: 'cf-linkbtn', 'aria-expanded': 'false', 'aria-controls': 'cf-kwrow', text: 'Search by keyword', onclick: function () {
      var show = kwRow.hasAttribute('hidden');
      if (show) { kwRow.removeAttribute('hidden'); kwInput.focus(); } else { kwRow.setAttribute('hidden', ''); kwInput.value = ''; state.kw = ''; refresh(); }
      kwToggle.setAttribute('aria-expanded', show ? 'true' : 'false');
    } });
    kwRow.id = 'cf-kwrow';

    var narrow = h('div', { class: 'cf-narrow', id: 'cf-narrow', hidden: true }, [
      checkGroup('Availability', DELIVERY, state.delivery),
      checkGroup('Cost', COST, state.cost),
      checkGroup('Language', languageOptions(state.all), state.lang),
    ]);
    var narrowBtn = h('button', { type: 'button', class: 'cf-narrowbtn', 'aria-expanded': 'false', 'aria-controls': 'cf-narrow', onclick: function () {
      var show = narrow.hasAttribute('hidden');
      if (show) narrow.removeAttribute('hidden'); else narrow.setAttribute('hidden', '');
      narrowBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
    } }, [h('span', { text: 'Narrow the results' }), icon(CHEVRON, 18)]);

    var locInput = h('input', { type: 'text', id: 'cf-loc', placeholder: 'Postal code or city', autocomplete: 'postal-code', onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); findLocation(locInput.value); } } });
    var kmLabel = h('label', { for: 'cf-km', text: 'Distance (km): ' + state.km });
    els.km = h('input', { type: 'range', id: 'cf-km', min: 5, max: 500, step: 5, value: state.km, disabled: true, oninput: function () {
      state.km = Number(els.km.value);
      kmLabel.textContent = 'Distance (km): ' + state.km;
      if (state.loc) { refresh(); }
    } });
    var locBlock = h('div', { class: 'cf-loc' }, [
      h('div', null, [h('label', { for: 'cf-loc', text: 'Search near you' }),
        h('div', { class: 'cf-locrow' }, [locInput, h('button', { type: 'button', 'aria-label': 'Search location', onclick: function () { findLocation(locInput.value); } }, [icon(SEARCH, 22)])])]),
      h('div', { class: 'cf-range' }, [kmLabel, els.km]),
    ]);

    els.viewList = h('button', { type: 'button', 'aria-pressed': 'true', text: 'List View', onclick: function () { setView('list'); } });
    els.viewMap = h('button', { type: 'button', 'aria-pressed': 'false', text: 'Map View', onclick: function () { setView('map'); } });
    var toggle = h('div', { class: 'cf-toggle', role: 'group', 'aria-label': 'Choose how to view results' }, [els.viewList, els.viewMap]);
    els.mapNote = h('p', { class: 'cf-status', 'aria-live': 'polite' });
    els.mapEl = h('div', { class: 'cf-map', role: 'region', 'aria-label': 'Map of CareFinder listings' });
    els.mapWrap = h('div', { class: 'cf-map-wrap', hidden: true }, [els.mapNote, els.mapEl]);

    var topBtn = h('button', { type: 'button', class: 'cf-top-btn', 'aria-label': 'Back to top', onclick: function () { root.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, [icon(UP, 24)]);
    window.addEventListener('scroll', function () {
      if (window.scrollY > 700) topBtn.classList.add('cf-show'); else topBtn.classList.remove('cf-show');
    }, { passive: true });

    var inner = h('div', { class: 'cf-inner' }, [
      buildIntro(),
      h('div', { class: 'cf-filterhead' }, [
        h('h2', { text: 'Filter by category' }), h('span', { class: 'cf-or', text: 'or' }), kwToggle,
      ]),
      h('div', { class: 'cf-selects' }, [buildSelect('pro'), buildSelect('well'), buildSelect('sup')]),
      kwRow,
      h('div', { class: 'cf-bar' }, [els.count, toggle]),
      h('div', { class: 'cf-narrowrow' }, [narrowBtn]),
      narrow,
      locBlock,
      els.status,
      els.list,
      els.mapWrap,
      els.pages,
    ]);
    root.textContent = '';
    root.appendChild(h('div', { class: 'cf' }, [inner, topBtn]));
  }

  // ---------- start ----------
  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  root.textContent = '';
  root.appendChild(h('div', { class: 'cf' }, [h('div', { class: 'cf-inner' }, [h('p', { class: 'cf-loading', role: 'status', text: 'Loading CareFinder listings…' })])]));

  function load() {
    fetch(API_URL).then(function (res) {
      if (!res.ok) throw new Error('listings ' + res.status);
      return res.json();
    }).then(function (data) {
      state.all = (data.listings || []).filter(function (l) { return l && l.name; });
      build();
      render();
    }).catch(function () {
      root.textContent = '';
      root.appendChild(h('div', { class: 'cf' }, [h('div', { class: 'cf-inner' }, [h('div', { class: 'cf-empty' }, [
        h('h3', { text: 'CareFinder is unavailable right now' }),
        h('p', { text: 'We could not load the listings. Please try again.' }),
        h('button', { type: 'button', class: 'cf-linkbtn', text: 'Try again', onclick: load }),
      ])])]));
    });
  }
  load();
})();
