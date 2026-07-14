// DOM recon — paste-into-console snippet for building a new scraper userscript.
//
// Not a userscript. Open the target page (with the "results" you want visible),
// open DevTools (F12) → Console, paste this whole file, and hand back what it copies.
// It reports the URL/title, ranks the candidate "result" containers, and dumps the full
// outerHTML of the single best candidate so selectors can be designed against real markup.
//
// Two strategies, tried in order:
//   A. item-link — group the ancestors of every product link (a[href*="/item/"]) that also
//      hold an image + a price. This is the reliable path for e-commerce product grids where
//      the card wrapper carries no stable class (e.g. AliExpress store/search cards are
//      class-less <div>s with everything in inline styles).
//   B. class-frequency — fall back to ranking elements by how often their tag+class repeats.
//      Works for any list/feed where the repeated row does carry a class.
//
// This is the same feedback loop the shipped scripts use at runtime via their 🐞 Debug
// button — this file is just the cold-start version for a page that has no script yet.
// If a target uses a link pattern other than /item/, edit ITEM_LINK below.
(() => {
  const ITEM_LINK = 'a[href*="/item/"]';   // product-link selector; tweak per site
  const lines = [], push = (s = '') => lines.push(s);
  push('=== DOM recon ===');
  push('URL: ' + location.href);
  push('title: ' + document.title);
  push('');

  const dump = (el, cap = 6500) => {
    let html = el.outerHTML;
    if (html.length > cap) html = html.slice(0, cap) + `\n<!-- …truncated ${el.outerHTML.length - cap} chars… -->`;
    return html;
  };

  // Strategy A — product cards via item links.
  const itemLinks = [...document.querySelectorAll(ITEM_LINK)];
  push(`Strategy A — ${ITEM_LINK} found: ${itemLinks.length}`);
  if (itemLinks.length) {
    const priceRe = /\$\s?\d/;
    const cardOf = (a) => {              // climb to the smallest ancestor holding an image + a price
      let el = a;
      for (let i = 0; i < 6 && el.parentElement; i++) {
        el = el.parentElement;
        if (el.querySelector('img') && (el.querySelector('[aria-label^="$"]') || priceRe.test(el.textContent))) return el;
      }
      return a;
    };
    const sig = new Map();
    itemLinks.forEach(a => {
      const c = cardOf(a);
      const cls = typeof c.className === 'string' ? c.className.trim().split(/\s+/).sort().join('.') : '';
      const key = c.tagName + '.' + cls;
      const o = sig.get(key) || { n: 0, sample: c };
      o.n++; sig.set(key, o);
    });
    const ranked = [...sig.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    push('card wrapper signatures (count — tag.class):');
    ranked.forEach(([k, v]) => push(`  ${String(v.n).padStart(4)}  ${k}`));
    push('');
    push('--- Full outerHTML of #1 product card ---');
    push(dump(ranked[0][1].sample));
  } else {
    // Strategy B — most-repeated container with content inside.
    push('(no item links — falling back to class-frequency)');
    push('');
    const counts = new Map();
    document.querySelectorAll('*').forEach(el => {
      if (!el.className || typeof el.className !== 'string') return;
      const key = el.tagName + '.' + [...el.classList].sort().join('.');
      const o = counts.get(key) || { n: 0, sample: el };
      o.n++; counts.set(key, o);
    });
    const top = [...counts.entries()]
      .filter(([, v]) => v.n >= 4 && v.sample.querySelector('a,img,[class*=price],[class*=title]'))
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 12);
    push('Strategy B — top repeating candidate containers (count — tag.class):');
    top.forEach(([k, v]) => push(`  ${String(v.n).padStart(4)}  ${k}`));
    push('');
    if (top.length) {
      push('--- Full outerHTML of #1 candidate ---');
      push(dump(top[0][1].sample));
    } else {
      push('No repeating content containers found — results may be in an iframe, a shadow');
      push('DOM, or lazily rendered on scroll. Scroll to load items, then re-run.');
    }
  }

  const out = lines.join('\n');
  try { copy(out); } catch (e) {}      // copy() exists only in the DevTools console
  console.log(out);
  return `recon: ${out.length} chars copied`;
})();
