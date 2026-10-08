/* ============================================================
   render.js — one renderer per section type.

   The page is built from content.json: `sections` is an ordered
   list, and each entry names its own type. Reorder the array and
   the page reorders. Nothing here is page-specific markup that
   a content edit could break.
   ============================================================ */

import { esc } from './ui.js';

/* ---------- colour helpers (plain JS so tints stay deterministic) ---------- */
const hex2rgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgb2hex = (rgb) => '#' + rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
export const mix = (hex, other, amount) => {
  const a = hex2rgb(hex); const b = hex2rgb(other);
  return rgb2hex(a.map((v, i) => v + (b[i] - v) * amount));
};
const PAPER = '#f5f0e6';
const tint = (hex, amount = 0.26) => mix(hex, PAPER, 1 - amount);

/* Type colour for a burst background, chosen by measured contrast rather
   than by taste — this is what the accessibility check verifies. */
const relLum = (hex) => {
  const [r, g, b] = hex2rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const l1 = relLum(a); const l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
export const inkFor = (burst) => (contrast('#14100c', burst) >= contrast(PAPER, burst) ? '#14100c' : PAPER);

/* ---------- brand crest, drawn from the engraving on the real label ---------- */
const crest = `
<svg viewBox="0 0 120 92" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M46 30C42 18 34 12 24 8M46 30C40 20 40 12 42 4M74 30C78 18 86 12 96 8M74 30C80 20 80 12 78 4"/>
  <path d="M60 32C48 32 42 40 42 50C42 62 50 74 60 78C70 74 78 62 78 50C78 40 72 32 60 32Z"/>
  <path d="M42 44C34 40 28 42 26 47C30 52 38 52 43 50"/>
  <path d="M78 44C86 40 92 42 94 47C90 52 82 52 77 50"/>
  <circle cx="52" cy="52" r="2.4" fill="currentColor" stroke="none"/>
  <circle cx="68" cy="52" r="2.4" fill="currentColor" stroke="none"/>
  <path d="M60 62C56 66 56 70 60 72C64 70 64 66 60 62"/>
</svg>`;

const inkRule = (width = 1200) => `
<svg class="ink-rule" viewBox="0 0 ${width} 8" preserveAspectRatio="none" aria-hidden="true" focusable="false" style="--len:${width}">
  <path d="M4 5.5C${width * 0.18} 1.5, ${width * 0.34} 6.5, ${width * 0.52} 4S${width * 0.8} 1, ${width - 4} 3.5"/>
</svg>`;

const handArrow = `
<svg viewBox="0 0 90 60" aria-hidden="true" focusable="false">
  <path d="M4 8C22 4 54 8 78 34"/><path d="M64 32l16 3-6 15"/>
</svg>`;

const handCircle = `
<svg viewBox="0 0 200 90" aria-hidden="true" focusable="false">
  <ellipse cx="100" cy="45" rx="94" ry="38"/>
</svg>`;

/* ============================================================
   sections
   ============================================================ */

const hero = (s) => `
<section class="section hero" id="${esc(s.id)}" data-section="hero" aria-labelledby="${esc(s.id)}-title">
  <div class="wrap">
    <div class="hero__grid">
      <div class="hero__copy">
        <p class="eyebrow hero__kicker">${esc(s.kicker)}</p>
        <h1 class="display" id="${esc(s.id)}-title">${esc(s.title)}<br><span class="hero__accent">${esc(s.titleAccent)}</span></h1>
        <p class="lede hero__lede">${esc(s.lede)}</p>
        <div class="hero__actions">
          <a class="btn" href="${esc(s.primary.href)}">${esc(s.primary.label)}<svg class="btn__arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></a>
          <a class="btn btn--ghost" href="${esc(s.secondary.href)}">${esc(s.secondary.label)}</a>
        </div>
      </div>
      <div class="hero__stage">
        <div class="hero__blob" aria-hidden="true"></div>
        <img class="hero__bottle" src="${esc(s.image)}" alt="${esc(s.imageAlt)}" width="900" height="1125" fetchpriority="high" decoding="async">
      </div>
    </div>

    <dl class="hero__facts" data-stagger>
      ${s.facts.map((f) => `<div class="hero__fact"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}
    </dl>

    <p class="scroll-cue"><i aria-hidden="true"></i><span>${esc(s.scrollCue)}</span></p>
  </div>
</section>`;

const statement = (s) => `
<section class="section statement" id="${esc(s.id)}" data-section="statement">
  <div class="wrap">
    <div class="statement__grid">
      <div>
        <p class="eyebrow" data-reveal>${esc(s.eyebrow)}</p>
        <h2 class="h2" data-reveal style="--i:1">${esc(s.headline)}</h2>
        ${inkRule()}
      </div>
      <div class="statement__aside" data-reveal style="--i:2">
        <p>${esc(s.aside)}</p>
      </div>
    </div>
    <div class="statement__rule wrap" data-reveal style="--i:3">
      <p class="body">${esc(s.body)}</p>
    </div>
  </div>
</section>`;

const machine = (s, data) => `
<section class="section machine" id="${esc(s.id)}" data-section="machine" data-active data-burst="${esc(data.scents[0].slug)}" aria-labelledby="${esc(s.id)}-title">
  <div class="machine__pin">
    <div class="machine__flood" aria-hidden="true"></div>
    <span class="flood-num" data-flood-num aria-hidden="true">01</span>
    <div class="wrap">
      <div class="section-head machine__head">
        <p class="eyebrow" data-reveal>${esc(s.eyebrow)}</p>
        <h2 class="h2" id="${esc(s.id)}-title" data-reveal style="--i:1">${esc(s.headline)}</h2>
        <p class="lede" data-reveal style="--i:2">${esc(s.lede)}</p>
      </div>

      <div class="machine__grid">
        <div class="machine__list" data-machine-list>
          ${data.scents.map((sc, i) => `
          <button type="button" class="machine__row${i === 0 ? ' is-active' : ''}"
                  data-machine-row data-slug="${esc(sc.slug)}" data-burst="${esc(sc.slug)}"
                  data-name="${esc(sc.name)}" aria-pressed="${i === 0 ? 'true' : 'false'}">
            <span class="machine__num">${String(i + 1).padStart(2, '0')}</span>
            <span class="machine__name">${esc(sc.name)}</span>
            <span class="machine__swatch" style="--swatch:${esc(sc.burst)}" aria-hidden="true"></span>
          </button>`).join('')}
        </div>

        <div class="machine__card" data-machine-card>
          <div class="machine__card-inner" data-machine-inner aria-live="polite"></div>
          <p class="hand machine__anno" data-machine-anno aria-hidden="true">pick one ↓</p>
        </div>
      </div>

      <p class="hand machine__foot" style="margin-top:28px">${esc(s.footnote)}</p>
    </div>
  </div>
</section>`;

const blotter = (s, data) => `
<section class="section blotter" id="${esc(s.id)}" data-section="blotter" aria-labelledby="${esc(s.id)}-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow" data-reveal>${esc(s.eyebrow)}</p>
      <h2 class="h2" id="${esc(s.id)}-title" data-reveal style="--i:1">${esc(s.headline)}</h2>
      <p class="lede" data-reveal style="--i:2">${esc(s.lede)}</p>
    </div>

    <div class="blotter__stage" data-blotter>
      <div class="blotter__wells" data-wells>
        ${data.notes.map((n) => `
        <button type="button" class="well" data-well data-note="${esc(n.name)}" data-burst="${esc(n.burst)}"
                style="--well:${tint(n.burst, 0.24)};--burst:${esc(n.burst)}" aria-pressed="false">
          <span class="well__tier">${esc(n.tier)}</span>
          <span>${esc(n.name)}</span>
          <span class="sr-only">— press Enter to touch the blotter to this note</span>
        </button>`).join('')}
      </div>
      <div class="blotter__strip" data-strip aria-hidden="true">
        <span class="blotter__strip__label">drag me</span>
      </div>
    </div>

    <div class="blotter__readout">
      <div>
        <p class="eyebrow">On the blotter</p>
        <div class="blotter__picked" data-picked><span class="blotter__hint" data-picked-empty>Nothing yet — drag the strip across a note.</span></div>
      </div>
      <div class="blotter__hint" data-note-copy>Each note you touch leaves a stain and prints what it does here.</div>
      <button type="button" class="btn btn--ghost btn--sm" data-blotter-reset>${esc(s.resetLabel)}</button>
    </div>
  </div>
</section>`;

const collection = (s, data) => `
<section class="section collection" id="${esc(s.id)}" data-section="collection" aria-labelledby="${esc(s.id)}-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow" data-reveal>${esc(s.eyebrow)}</p>
      <h2 class="h2" id="${esc(s.id)}-title" data-reveal style="--i:1">${esc(s.headline)}</h2>
      <p class="lede" data-reveal style="--i:2">${esc(s.lede)}</p>
    </div>

    <div class="filters" data-filters>
      <div class="filter-row" role="group" aria-label="Filter by scent family">
        <span class="filter-row__label">Family</span>
        <button type="button" class="chip" data-filter="family" data-value="" aria-pressed="true">All ten</button>
        ${s.filters.family.map((f) => `<button type="button" class="chip" data-filter="family" data-value="${esc(f)}" aria-pressed="false"><span class="chip__dot"></span>${esc(f)}</button>`).join('')}
      </div>
      <div class="filter-row" role="group" aria-label="Filter by size">
        <span class="filter-row__label">Size</span>
        <button type="button" class="chip" data-filter="tier" data-value="" aria-pressed="true">Any size</button>
        ${s.filters.tier.map((t) => `<button type="button" class="chip" data-filter="tier" data-value="${esc(t)}" aria-pressed="false">${esc(t)}${t === 'Roll-on' ? ' · ₹800' : ''}</button>`).join('')}
      </div>
      <p class="blotter__hint" data-filter-status aria-live="polite">Showing all 10 compositions.</p>
    </div>

    <div class="grid-products" data-products data-stagger>
      ${data.products.map((p) => {
        const sc = data.scents.find((x) => x.slug === p.slug);
        const burst = sc ? sc.burst : '#e0361f';
        return `
      <article class="card" data-product data-family="${esc(p.family.join('|'))}" data-tiers="${esc(p.tiers.join('|'))}"
               style="--card-burst:${esc(burst)}" tabindex="-1">
        <div class="card__media">
          ${p.tag ? `<span class="tag card__tag">${esc(p.tag)}</span>` : ''}
          <img src="${esc(p.img)}" alt="${esc(p.name)}, 100 ml eau de parfum" width="900" height="1125" loading="lazy" decoding="async">
          <img src="${esc(p.imgHover)}" alt="" width="900" height="1125" loading="lazy" decoding="async" aria-hidden="true">
        </div>
        <div class="card__head">
          <h3 class="card__name">${esc(p.name)}</h3>
          <p class="card__price">${esc(p.price)}</p>
        </div>
        <p class="card__notes">${esc(p.notes)}</p>
        <div class="card__tiers">
          ${p.tiers.map((t) => `<span class="card__tier">${esc(t)}</span>`).join('')}
          ${p.priceEntry !== '—' ? `<span class="card__tier">from ${esc(p.priceEntry)}</span>` : ''}
        </div>
        <span class="card__bar" aria-hidden="true"></span>
      </article>`;
      }).join('')}
    </div>

    <div class="rollons">
      <div>
        <h3 class="h3">${esc(s.rollonTitle)}</h3>
        <p class="body" style="margin-top:10px">${esc(s.rollonCopy)}</p>
      </div>
      <ul class="rollons__strip" data-stagger aria-label="Available roll-ons">
        ${data.rollons.map((r) => `
        <li class="rollons__item">
          <img src="${esc(r.img)}" alt="${esc(r.name)} roll-on, 11 ml" width="620" height="620" loading="lazy" decoding="async">
          <span><strong>${esc(r.name)}</strong>11 ml · ₹800</span>
        </li>`).join('')}
      </ul>
    </div>
  </div>
</section>`;

const house = (s) => `
<section class="section house" id="${esc(s.id)}" data-section="house" aria-labelledby="${esc(s.id)}-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow" data-reveal>${esc(s.eyebrow)}</p>
      <h2 class="h2" id="${esc(s.id)}-title" data-reveal style="--i:1">${esc(s.headline)}</h2>
    </div>
    <div class="house__grid">
      <div class="house__shots" data-stagger>
        ${s.images.map((im) => `<figure class="house__shot"><img src="${esc(im.src)}" alt="${esc(im.alt)}" width="1200" height="900" loading="lazy" decoding="async"></figure>`).join('')}
      </div>
      <div>
        <p class="body" data-reveal>${esc(s.body)}</p>
        <dl class="house__facts" data-stagger>
          ${s.facts.map((f) => `<div class="house__fact"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}
        </dl>
        <blockquote class="house__quote" data-reveal>“${esc(s.quote)}”</blockquote>
      </div>
    </div>
  </div>
</section>`;

const journal = (s, data) => `
<section class="section journal" id="${esc(s.id)}" data-section="journal" aria-labelledby="${esc(s.id)}-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow" data-reveal>${esc(s.eyebrow)}</p>
      <h2 class="h2" id="${esc(s.id)}-title" data-reveal style="--i:1">${esc(s.headline)}</h2>
      <p class="lede" data-reveal style="--i:2">${esc(s.lede)}</p>
    </div>
    <div class="grid-journal" data-stagger>
      ${data.articles.map((a) => `
      <article class="article">
        <div class="article__media"><img src="${esc(a.img)}" alt="${esc(a.imgAlt)}" width="1200" height="800" loading="lazy" decoding="async"></div>
        <div class="article__meta"><span class="tag" style="--burst:#9c5b2e">${esc(a.tag)}</span><span>${esc(a.read)} read</span></div>
        <h3 class="article__title">${esc(a.title)}</h3>
        <details>
          <summary>${esc(a.excerpt)} <strong>Read it</strong></summary>
          ${(a.body || []).map((p) => `<p class="article__excerpt">${esc(p)}</p>`).join('')}
        </details>
      </article>`).join('')}
    </div>
  </div>
</section>`;

const capture = (s, data) => `
<section class="section capture" id="${esc(s.id)}" data-section="capture" aria-labelledby="${esc(s.id)}-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow" data-reveal>${esc(s.eyebrow)}</p>
      <h2 class="h2" id="${esc(s.id)}-title" data-reveal style="--i:1">${esc(s.headline)}</h2>
      <p class="lede" data-reveal style="--i:2">${esc(s.lede)}</p>
    </div>

    <div class="capture__shell">
      <div class="quiz" data-quiz>
        ${data.quiz.map((q, qi) => `
        <fieldset class="quiz__q">
          <legend class="quiz__legend"><span>Question ${qi + 1} of ${data.quiz.length}</span>${esc(q.question)}</legend>
          <div class="quiz__opts" role="group" aria-label="${esc(q.question)}">
            ${q.options.map((o) => `<button type="button" class="opt" data-quiz-opt data-q="${esc(q.key)}" data-value="${esc(o.label)}" aria-pressed="false"><span class="opt__box" aria-hidden="true"></span><span>${esc(o.label)}</span></button>`).join('')}
          </div>
        </fieldset>`).join('')}
      </div>

      <div>
        <form class="form" data-capture-form novalidate>
          <div class="field">
            <label for="cap-email">${esc(s.emailLabel)}</label>
            <input id="cap-email" name="email" type="email" inputmode="email" autocomplete="email"
                   aria-describedby="cap-email-help cap-email-error" required>
            <p class="field__help" id="cap-email-help">${esc(s.emailHelp)}</p>
            <p class="field__error" id="cap-email-error" hidden></p>
          </div>
          <div class="field">
            <label for="cap-name">${esc(s.nameLabel)}</label>
            <input id="cap-name" name="name" type="text" autocomplete="given-name">
          </div>
          <label class="check">
            <input type="checkbox" name="consent" value="yes" checked>
            <span>${esc(s.consentLabel)}</span>
          </label>
          <button class="btn btn--burst" type="submit" data-capture-submit>${esc(s.submitLabel)}</button>
          <p class="field__help" data-capture-state aria-live="polite">Answer all three, then this records the result.</p>
        </form>

        <div class="result" data-result hidden></div>

        <p class="field__help" style="margin-top:14px">
          <a href="ledger.html">${esc(s.ledgerLink)}</a>
        </p>
      </div>
    </div>
  </div>
</section>`;

const footer = (s, meta, data) => `
<div class="wrap foot__inner">
  <div class="foot__top">
    <div>
      <h2 class="foot__headline">${esc(s.headline)}</h2>
      <div class="foot__crest" aria-hidden="true">${crest}</div>
    </div>
    <div class="foot__news">
      <p class="eyebrow" style="color:var(--label-gold)">${esc(s.newsletterLabel)}</p>
      <form class="foot__form" data-newsletter novalidate>
        <label class="sr-only" for="news-email">Email address</label>
        <input id="news-email" name="email" type="email" placeholder="${esc(s.newsletterPlaceholder)}" autocomplete="email" required
               aria-describedby="news-help">
        <button class="btn btn--burst" type="submit">${esc(s.newsletterButton)}</button>
      </form>
      <p class="field__help" id="news-help" data-news-state aria-live="polite" style="color:#a79d92">One email when an article is published. Nothing else, ever.</p>
    </div>
  </div>

  <div class="foot__cols">
    ${s.columns.map((c) => `
    <div>
      <h2>${esc(c.heading)}</h2>
      <ul>
        ${c.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')}
      </ul>
    </div>`).join('')}
  </div>

  <div class="foot__disclaimer">
    <p>${esc(meta.disclaimer)}</p>
    <p>${esc(meta.contactPlace)} · <a href="mailto:${esc(meta.contactEmail)}">${esc(meta.contactEmail)}</a></p>
    <p>${esc(meta.priceNote)} · Product names, prices and note data belong to Proust Fragrances. Concept build ${new Date().getFullYear()} · <a href="ledger.html">submission ledger</a></p>
  </div>
</div>`;

/* ============================================================
   dispatcher
   ============================================================ */

const RENDERERS = { hero, statement, machine, blotter, collection, house, journal, capture };

/** Render exactly one section, in isolation. Used so a broken section
 *  can be swapped for an empty state without shifting anything else. */
export function renderSection(section, content) {
  const fn = RENDERERS[section.type];
  return fn ? fn(section, content.data, content.meta) : '';
}

export function renderFooter(content) {
  const footSection = (content.sections || []).find((s) => s.type === 'footer');
  return footSection ? footer(footSection, content.meta, content.data) : '';
}

export function renderMain(content) {
  return (content.sections || [])
    .filter((s) => RENDERERS[s.type])
    .map((s) => renderSection(s, content))
    .join('\n');
}

export function knownTypes() {
  return [...Object.keys(RENDERERS), 'footer'];
}
