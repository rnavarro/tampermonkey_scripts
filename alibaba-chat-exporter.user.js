// ==UserScript==
// @name         Alibaba Chat Exporter
// @namespace    rnavarro.alibaba.chat
// @version      1.3
// @description  Copy the current Alibaba message-center conversation as Markdown or JSON, with a debug dump for edge cases
// @author       rnavarro
// @match        https://message.alibaba.com/*
// @match        https://*.alibaba.com/*message*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/rnavarro/tampermonkey_scripts/main/alibaba-chat-exporter.user.js
// @updateURL    https://raw.githubusercontent.com/rnavarro/tampermonkey_scripts/main/alibaba-chat-exporter.user.js
// @supportURL   https://github.com/rnavarro/tampermonkey_scripts/issues
// ==/UserScript==
(function () {
  'use strict';
  const SELF_NAME = 'Robert Navarro'; // label for your own (item-right) messages

  const readText = (root) => {
    const c = root.cloneNode(true);
    c.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    c.querySelectorAll('img').forEach(img => {
      const m = (img.getAttribute('src') || '').match(/smily[^/]*\/([^/.]+)/i);
      img.replaceWith(m ? `:${m[1]}:` : '[img]');
    });
    return c.textContent.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  };

  // System/UI cards that aren't part of the conversation (order protection banner,
  // "Ready to make the purchase?" payment card, "Select an address" notice, etc.).
  const isSystem = (w) => !!w.querySelector('.session-security-content, .sys-dx, .item-system-notice');

  // Product-card title: normal product cards (type 2000) put it in a -webkit-line-clamp
  // span; requirement cards (type 2111) don't, so fall back to the longest non-price span.
  function cardTitle(card) {
    const clamp = card.querySelector('span[style*="line-clamp"]')?.textContent.trim();
    if (clamp) return clamp;
    const spans = [...card.querySelectorAll('span')].map(s => s.textContent.trim()).filter(Boolean);
    return spans.filter(t => !/^\$/.test(t)).sort((a, b) => b.length - a.length)[0] || '';
  }

  // productId: type 2000 carries extBizId in data-expinfo; type 2111 only has it in the
  // wrapper's data-original URL (productId=… , or ids=<long id> for 2000-style URLs).
  function cardProductId(w, info) {
    if (info.extBizId !== undefined) return info.extBizId;
    const orig = w.getAttribute('data-original') || '';
    return orig.match(/[?&]productId=(\d+)/)?.[1] || orig.match(/[?&]ids=(\d{6,})/)?.[1];
  }

  function extract() {
    const msgs = [];
    document.querySelectorAll('.message-item-wrapper').forEach(w => {
      let info = {}; try { info = JSON.parse(w.dataset.expinfo || '{}'); } catch (e) {}
      if (isSystem(w)) return;
      const dir = w.classList.contains('item-right') ? 'sent' : 'received';
      const displayName = w.querySelector('.item-base-info .name')?.textContent.trim() || '';
      const sender = dir === 'sent' ? SELF_NAME : (displayName || 'seller');
      const base = { id: info.messageId, ts: info.sendTime, timeDisplay: w.querySelector('.item-base-info span:last-child')?.textContent.trim() || '', sender, senderId: info.senderId, direction: dir, read: info.read_status };
      if (w.querySelector('.revert-msg')) { msgs.push({ ...base, type: 'recalled' }); return; }
      const q = w.querySelector('.quote-container');
      if (q) base.quote = { name: q.querySelector('.name')?.textContent.replace(/:\s*$/, '').trim(), content: q.querySelector('.content') ? readText(q.querySelector('.content')) : '' };
      const card = w.querySelector('.session-rich-content.card');
      if (card) {
        const price = [...card.querySelectorAll('span')].map(s => s.textContent.trim()).find(t => /^\$/.test(t)) || '';
        msgs.push({ ...base, type: 'product_card', product: { productId: cardProductId(w, info), title: cardTitle(card), price } });
        return;
      }
      const file = w.querySelector('.inquiry-file-item');
      if (file) { let fq = {}; try { fq = JSON.parse(file.getAttribute('data-query') || '{}'); } catch (e) {} msgs.push({ ...base, type: 'file', file: { name: fq.fileName, size: fq.fileSize, url: fq.downloadUrl } }); return; }
      const video = w.querySelector('video');
      if (video) { msgs.push({ ...base, type: 'video', media: { kind: 'video', src: video.getAttribute('src') } }); return; }
      const img = w.querySelector('.session-rich-content.media img');
      if (img) { msgs.push({ ...base, type: 'image', media: { kind: 'image', src: img.getAttribute('src') } }); return; }
      const textEl = w.querySelector('.session-rich-content.text');
      if (textEl) { msgs.push({ ...base, type: 'text', text: readText(textEl) }); return; }
    });
    msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return msgs;
  }

  const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
  function toMarkdown(msgs) {
    const other = msgs.find(m => m.direction === 'received')?.sender || 'supplier';
    const body = msgs.map(m => {
      if (m.type === 'recalled') return `_${m.sender} recalled a message._\n`;
      const head = `**${m.sender}** · ${m.timeDisplay}`;
      let b;
      if (m.type === 'product_card') b = `🛒 **${m.product.title}** — ${m.product.price}${m.product.productId ? ` (product ${m.product.productId})` : ''}`;
      else if (m.type === 'file') b = `📎 **${m.file.name}** (${mb(m.file.size)})\n${m.file.url}`;
      else if (m.type === 'video') b = `🎬 Video\n${m.media.src}`;
      else if (m.type === 'image') b = `🖼️ Image\n${m.media.src}`;
      else b = m.text;
      const quote = m.quote ? `> **${m.quote.name}:** ${m.quote.content.replace(/\n/g, '\n> ')}\n\n` : '';
      return `${head}\n${quote}${b}\n`;
    }).join('\n');
    return `# Alibaba chat — ${other}\n\n${body}`;
  }

  // Re-walk the wrappers, classify each the same way extract() does, and flag anything
  // that parsed with missing/empty fields or matched no branch (silently dropped).
  function debugReport() {
    const wrappers = [...document.querySelectorAll('.message-item-wrapper')];
    const census = {};
    const flagged = [];
    wrappers.forEach((w, idx) => {
      let info = {}; try { info = JSON.parse(w.dataset.expinfo || '{}'); } catch (e) {}
      if (isSystem(w)) { census.system = (census.system || 0) + 1; return; }
      const issues = [];
      let type = 'unknown';
      if (w.querySelector('.revert-msg')) type = 'recalled';
      else if (w.querySelector('.session-rich-content.card')) {
        type = 'product_card';
        const card = w.querySelector('.session-rich-content.card');
        if (!cardTitle(card)) issues.push('empty product title (no line-clamp or text span found)');
        if (cardProductId(w, info) === undefined) issues.push('productId not found (no extBizId / data-original productId)');
        if (![...card.querySelectorAll('span')].some(s => /^\$/.test(s.textContent.trim()))) issues.push('no $ price span found');
      } else if (w.querySelector('.inquiry-file-item')) {
        type = 'file';
        let fq = {}; try { fq = JSON.parse(w.querySelector('.inquiry-file-item').getAttribute('data-query') || '{}'); } catch (e) {}
        if (!fq.fileName) issues.push('file missing fileName');
        if (!fq.downloadUrl) issues.push('file missing downloadUrl');
      } else if (w.querySelector('video')) {
        type = 'video';
        if (!w.querySelector('video').getAttribute('src')) issues.push('video missing src');
      } else if (w.querySelector('.session-rich-content.media img')) {
        type = 'image';
        if (!w.querySelector('.session-rich-content.media img').getAttribute('src')) issues.push('image missing src');
      } else if (w.querySelector('.session-rich-content.media')) {
        type = 'media(unrecognized)';
        issues.push('has .media but no <video>, .inquiry-file-item, or <img> — new media shape');
      } else if (w.querySelector('.session-rich-content.text')) {
        type = 'text';
        if (!readText(w.querySelector('.session-rich-content.text'))) issues.push('empty text');
      } else {
        type = 'UNMATCHED';
        issues.push('matched no branch — this message is DROPPED from the export');
      }
      census[type] = (census[type] || 0) + 1;
      if (issues.length) {
        let html = w.outerHTML;
        if (html.length > 9000) html = html.slice(0, 9000) + `\n<!-- …truncated ${w.outerHTML.length - 9000} chars… -->`;
        flagged.push({ idx, type, messageId: info.messageId, messageType: info.messageType, cardType: info.cardType, extBizType: info.extBizType, issues, html });
      }
    });

    const lines = [];
    lines.push('=== Alibaba Chat Exporter — DEBUG ===');
    lines.push('exporter version: 1.2');
    lines.push('total .message-item-wrapper: ' + wrappers.length);
    lines.push('type census: ' + JSON.stringify(census));
    lines.push('flagged (up to 25 shown): ' + flagged.length);
    lines.push('');
    flagged.slice(0, 25).forEach((f, i) => {
      lines.push(`--- [${i + 1}] wrapper #${f.idx} · type=${f.type} · messageType=${f.messageType} · cardType=${f.cardType} · extBizType=${f.extBizType} ---`);
      lines.push('issues: ' + f.issues.join('; '));
      lines.push('outerHTML:');
      lines.push(f.html);
      lines.push('');
    });
    if (!flagged.length) lines.push('No anomalies found — every wrapper parsed cleanly.');
    return { text: lines.join('\n'), flaggedCount: flagged.length, total: wrappers.length };
  }

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

  async function run(asJson) {
    const msgs = extract();
    if (!msgs.length) { toast('No messages found on this page', true); return; }
    const out = asJson ? JSON.stringify(msgs, null, 2) : toMarkdown(msgs);
    const ok = await copyText(out);
    toast(ok ? `Copied ${msgs.length} messages (${asJson ? 'JSON' : 'Markdown'})` : 'Clipboard blocked — see console', !ok);
    if (!ok) { window.__chatExport = out; console.log('Clipboard blocked. Run: copy(window.__chatExport)'); }
  }

  async function runDebug() {
    const r = debugReport();
    const ok = await copyText(r.text);
    console.log(r.text);
    toast(ok ? `Debug copied — ${r.flaggedCount} flagged / ${r.total} total` : 'Debug printed to console (clipboard blocked)', !ok);
    if (!ok) { window.__chatDebug = r.text; console.log('Clipboard blocked. Run: copy(window.__chatDebug)'); }
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
    if (document.getElementById('ali-chat-export-md')) return;
    const md = makeBtn('📋 Copy chat', () => run(false), 20, '#ff6a00'); md.id = 'ali-chat-export-md';
    const js = makeBtn('{ } JSON', () => run(true), 130, '#555'); js.id = 'ali-chat-export-json';
    const dbg = makeBtn('🐞 Debug', () => runDebug(), 220, '#8e44ad'); dbg.id = 'ali-chat-export-dbg';
    document.body.append(md, js, dbg);
  }

  const ready = () => document.querySelector('.message-flow-wrapper, .send-box-container, .message-item-wrapper');
  if (ready()) inject();
  else {
    const obs = new MutationObserver(() => { if (ready()) { inject(); obs.disconnect(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 30000);
  }
})();
