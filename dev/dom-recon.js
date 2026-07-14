// DOM recon — paste-into-console snippet for building a new scraper userscript.
//
// Not a userscript. Open the target page (with the "results" you want visible),
// open DevTools (F12) → Console, paste this whole file, and hand back what it copies.
// It reports the URL/title, ranks the most-repeated candidate containers (the repeated
// element is almost always the "result" row/card), and dumps the full outerHTML of the
// single best candidate so selectors can be designed against real markup.
//
// This is the same feedback loop the shipped scripts use at runtime via their 🐞 Debug
// button — this file is just the cold-start version for a page that has no script yet.
(() => {
  // Tally every element by tag + sorted class list; repeats bubble to the top.
  const counts = new Map();
  document.querySelectorAll('*').forEach(el => {
    if (!el.className || typeof el.className !== 'string') return;
    const key = el.tagName + '.' + [...el.classList].sort().join('.');
    const o = counts.get(key) || { n: 0, sample: el };
    o.n++; counts.set(key, o);
  });
  // Keep containers that repeat and look like content (have a link/image/price/title inside).
  const top = [...counts.entries()]
    .filter(([, v]) => v.n >= 4 && v.sample.querySelector('a,img,[class*=price],[class*=title]'))
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 12);

  const lines = [];
  lines.push('=== DOM recon ===');
  lines.push('URL: ' + location.href);
  lines.push('title: ' + document.title);
  lines.push('');
  lines.push('Top repeating candidate containers (count — class):');
  top.forEach(([k, v]) => lines.push(`  ${v.n.toString().padStart(4)}  ${k}`));
  lines.push('');
  const best = top[0]?.[1].sample;
  if (best) {
    let html = best.outerHTML;
    if (html.length > 6000) html = html.slice(0, 6000) + `\n<!-- …truncated ${best.outerHTML.length - 6000} chars… -->`;
    lines.push('--- Full outerHTML of #1 candidate ---');
    lines.push(html);
  } else {
    lines.push('No repeating content containers found — the page may render results in an iframe,');
    lines.push('a shadow DOM, or lazily on scroll. Scroll to load items, then re-run.');
  }

  const out = lines.join('\n');
  try { copy(out); } catch (e) {}      // copy() exists only in the DevTools console
  console.log(out);
  return `recon: ${top.length} candidates, ${out.length} chars copied`;
})();
