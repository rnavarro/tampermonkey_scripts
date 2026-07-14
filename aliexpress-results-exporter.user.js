// ==UserScript==
// @name         AliExpress Results Exporter
// @namespace    rnavarro.aliexpress.results
// @version      1.0
// @description  Copy the visible AliExpress product results (store all-items / search grid) as TSV or JSON, with a debug dump for cards the parser can't classify
// @author       rnavarro
// @match        https://www.aliexpress.com/store/*
// @match        https://www.aliexpress.us/store/*
// @match        https://www.aliexpress.com/w/*
// @match        https://www.aliexpress.us/w/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/rnavarro/tampermonkey_scripts/main/aliexpress-results-exporter.user.js
// @updateURL    https://raw.githubusercontent.com/rnavarro/tampermonkey_scripts/main/aliexpress-results-exporter.user.js
// @supportURL   https://github.com/rnavarro/tampermonkey_scripts/issues
// ==/UserScript==
(function () {
  'use strict';

  // These cards carry no stable class (the wrappers are class-less <div>s with everything in
  // inline styles), so every selector below anchors on structural / attribute signals:
  //   card      → a[href*="/item/"]        (one anchor per product)
  //   itemId    → /item/(\d+).html         (from the href path)
  //   productId → utlogmap.x_object_id      (canonical AliExpress product id, URL-encoded JSON)
  //   title     → img[alt]                  (full, untruncated — the on-card text is line-clamped)
  //   image     → img[src]
  //   sold      → "N sold" text
  //   price     → decoded from the pdp_npi href param (gives both list + sale price)

  const ITEM_HREF = /\/item\/(\d+)\.html/;

  // pdp_npi looks like: 4@dis!USD!US $56.96!US $56.39!!!56.96!56.39!@2103...!12000...!sh!US!...
  // The bare numeric fields (no "US $" prefix) are [listPrice, salePrice]; currency is field 1.
  function priceFromNpi(href) {
    const raw = href.match(/[?&]pdp_npi=([^&]+)/)?.[1];
    if (!raw) return null;
    let s; try { s = decodeURIComponent(raw); } catch (e) { s = raw; }
    const parts = s.split('!');
    const currency = /^[A-Z]{3}$/.test(parts[1] || '') ? parts[1] : 'USD';
    const nums = parts.filter(p => /^\d+(\.\d+)?$/.test(p)).map(Number);
    if (!nums.length) return { currency };
    const list = nums[0], sale = nums.length > 1 ? nums[1] : nums[0];
    return { currency, price: Math.min(list, sale), priceList: Math.max(list, sale) };
  }

  // Fallback when there's no pdp_npi: first "$NN.NN" in the card text.
  function priceFromText(a) {
    const m = a.textContent.match(/\$\s?([\d,]+(?:\.\d+)?)/);
    return m ? { currency: 'USD', price: Number(m[1].replace(/,/g, '')), priceList: null } : {};
  }

  function logmap(a) {
    try { return JSON.parse(decodeURIComponent(a.getAttribute('utlogmap') || '') || '{}'); }
    catch (e) { return {}; }
  }

  // A product card = an item link that actually holds a product image. Filters out stray
  // /item/ links (breadcrumbs, "recently viewed" text links, etc.).
  function cards() {
    const seen = new Set(), out = [];
    document.querySelectorAll('a[href*="/item/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const itemId = href.match(ITEM_HREF)?.[1];
      if (!itemId || seen.has(itemId)) return;
      const img = a.querySelector('img');
      if (!img) return;
      seen.add(itemId);
      out.push({ a, href, itemId, img });
    });
    return out;
  }

  function parseCard(c) {
    const lm = logmap(c.a);
    const title = (c.img.getAttribute('alt') || '').trim();
    const p = priceFromNpi(c.href) || priceFromText(c.a);
    const sold = c.a.textContent.match(/([\d.,]+\s*[KkMm]?\+?)\s*sold/)?.[1]?.trim() || '';
    return {
      itemId: c.itemId,
      productId: lm.x_object_id || lm.prod || null,
      title,
      price: p.price ?? null,
      priceList: (p.priceList != null && p.priceList !== p.price) ? p.priceList : null,
      currency: p.currency || 'USD',
      sold,
      url: 'https://www.aliexpress.com/item/' + c.itemId + '.html',
      image: c.img.getAttribute('src') || ''
    };
  }

  function pageMeta(count) {
    const storeId = location.pathname.match(/\/store\/(\d+)/)?.[1] || null;
    const storeName = (document.title.split(' - ')[0] || '').trim() || null;
    const params = new URLSearchParams(location.search);
    return {
      storeId,
      storeName,
      query: params.get('SearchText') || params.get('q') || null,
      sort: params.get('sortType') || params.get('shop_sortType') || null,
      count,
      url: location.href
    };
  }

  function extract() {
    const rows = cards().map(parseCard);
    return { meta: pageMeta(rows.length), products: rows };
  }

  // ---- output formats ------------------------------------------------------
  const TSV_COLS = ['title', 'price', 'priceList', 'currency', 'sold', 'itemId', 'productId', 'url', 'image'];
  const cell = (v) => (v == null ? '' : String(v)).replace(/[\t\r\n]+/g, ' ').trim();

  function toTSV({ meta, products }) {
    const head = `# aliexpress · store ${meta.storeId ?? '-'} "${meta.storeName ?? ''}"` +
      (meta.query ? ` · query "${meta.query}"` : '') +
      (meta.sort ? ` · sort ${meta.sort}` : '') +
      ` · ${meta.count} products`;
    const lines = [head, TSV_COLS.join('\t')];
    products.forEach(p => lines.push(TSV_COLS.map(k => cell(p[k])).join('\t')));
    return lines.join('\n');
  }

  // ---- debug ---------------------------------------------------------------
  function debugReport() {
    const cs = cards();
    const flagged = [];
    cs.forEach((c, idx) => {
      const p = parseCard(c);
      const issues = [];
      if (!p.title) issues.push('empty title (img[alt] missing)');
      if (p.price == null) issues.push('no price (no pdp_npi bare-number field and no $ in text)');
      if (!p.productId) issues.push('no productId (utlogmap.x_object_id missing)');
      if (issues.length) {
        let html = c.a.outerHTML;
        if (html.length > 5000) html = html.slice(0, 5000) + `\n<!-- …truncated ${c.a.outerHTML.length - 5000} chars… -->`;
        flagged.push({ idx, itemId: c.itemId, issues, html });
      }
    });
    const allItemLinks = document.querySelectorAll('a[href*="/item/"]').length;
    const lines = [];
    lines.push('=== AliExpress Results Exporter — DEBUG ===');
    lines.push('exporter version: 1.0');
    lines.push('URL: ' + location.href);
    lines.push('a[href*="/item/"] total: ' + allItemLinks);
    lines.push('product cards (item link + <img>, deduped): ' + cs.length);
    lines.push('flagged (missing title/price/productId): ' + flagged.length);
    lines.push('');
    flagged.slice(0, 25).forEach((f, i) => {
      lines.push(`--- [${i + 1}] card #${f.idx} · itemId=${f.itemId} ---`);
      lines.push('issues: ' + f.issues.join('; '));
      lines.push('outerHTML:');
      lines.push(f.html);
      lines.push('');
    });
    if (!flagged.length) lines.push('No anomalies — every card parsed with title, price and productId.');
    return { text: lines.join('\n'), flaggedCount: flagged.length, total: cs.length };
  }

  // ---- clipboard + UI (shared shape with alibaba-chat-exporter) -------------
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  let toastEl;
  function toast(msg, bad) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, { position: 'fixed', bottom: '76px', left: '20px', zIndex: 2147483647,
        padding: '8px 12px', borderRadius: '6px', font: '13px/1.4 system-ui, sans-serif',
        color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.25)', transition: 'opacity .3s', pointerEvents: 'none' });
      document.body.appendChild(toastEl);
    }
    toastEl.style.background = bad ? '#c0392b' : '#00820D';
    toastEl.textContent = msg; toastEl.style.opacity = '1';
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 3000);
  }

  async function run(kind) {
    const data = extract();
    if (!data.products.length) { toast('No product results found on this page', true); return; }
    const out = kind === 'json' ? JSON.stringify(data, null, 2) : toTSV(data);
    const ok = await copyText(out);
    toast(ok ? `Copied ${data.products.length} products (${kind === 'json' ? 'JSON' : 'TSV'})` : 'Clipboard blocked — see console', !ok);
    if (!ok) { window.__aliExport = out; console.log('Clipboard blocked. Run: copy(window.__aliExport)'); }
  }

  async function runDebug() {
    const r = debugReport();
    const ok = await copyText(r.text);
    console.log(r.text);
    toast(ok ? `Debug copied — ${r.flaggedCount} flagged / ${r.total} cards` : 'Debug printed to console (clipboard blocked)', !ok);
    if (!ok) { window.__aliDebug = r.text; console.log('Clipboard blocked. Run: copy(window.__aliDebug)'); }
  }

  function makeBtn(label, cb, left, bg) {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, { position: 'fixed', bottom: '20px', left: left + 'px', zIndex: 2147483647,
      padding: '8px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
      font: '13px/1 system-ui, sans-serif', color: '#fff', background: bg, boxShadow: '0 2px 8px rgba(0,0,0,.25)' });
    b.addEventListener('click', cb);
    return b;
  }

  function inject() {
    if (document.getElementById('ali-results-tsv')) return;
    const tsv = makeBtn('📋 Copy TSV', () => run('tsv'), 20, '#ff6a00'); tsv.id = 'ali-results-tsv';
    const js = makeBtn('{ } JSON', () => run('json'), 140, '#555'); js.id = 'ali-results-json';
    const dbg = makeBtn('🐞 Debug', () => runDebug(), 230, '#8e44ad'); dbg.id = 'ali-results-dbg';
    document.body.append(tsv, js, dbg);
  }

  const ready = () => document.querySelector('a[href*="/item/"]');
  if (ready()) inject();
  else {
    const obs = new MutationObserver(() => { if (ready()) { inject(); obs.disconnect(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 30000);
  }
})();
