/* ============================================================
   app.js — bootstrap.

   Order matters: error handling first, then content, then paint,
   then interactions. If content cannot be loaded the visitor gets
   a real explanation and a retry, not a blank page.
   ============================================================ */

import { renderSection, renderFooter, knownTypes } from './render.js';
import { initReveals, initMachine, initBlotter, initFilters, initCapture, initNewsletter, refreshCaptureHint } from './interactions.js';
import { installErrorHandlers, notice, log, setLogSink, esc } from './ui.js';
import { logEvent } from './store.js';

const CONTENT_URL = 'content.json';

const REQUIRES = {
  machine: ['scents'],
  blotter: ['notes'],
  collection: ['products'],
  journal: ['articles'],
  capture: ['quiz'],
};

function applyMeta(content) {
  document.title = content.meta.title || document.title;
  const set = (selector, attr, value) => {
    const node = document.head.querySelector(selector);
    if (node && value) node.setAttribute(attr, value);
  };
  set('meta[name="description"]', 'content', content.meta.description);
  set('meta[property="og:title"]', 'content', content.meta.title);
  set('meta[property="og:description"]', 'content', content.meta.description);
  set('meta[name="theme-color"]', 'content', '#f5f0e6');
}

/**
 * Content is data, so it can be wrong. A missing section must degrade
 * to a readable empty state plus a log entry — never a broken page.
 */
function sanitize(content) {
  const problems = [];
  const ok = [];
  if (!content || typeof content !== 'object') {
    return { sections: [], problems: ['content.json is not a JSON object.'] };
  }
  if (!content.meta) problems.push('meta block is missing — title and footer fall back to defaults.');
  if (!Array.isArray(content.sections) || !content.sections.length) {
    problems.push('sections is empty — nothing to render.');
  }
  const data = content.data || {};
  for (const section of content.sections || []) {
    if (!knownTypes().includes(section.type)) {
      problems.push(`section "${section.id}" has unknown type "${section.type}" — skipped.`);
      continue;
    }
    if (!section.id) problems.push(`a "${section.type}" section has no id — anchors may be wrong.`);
    const needs = REQUIRES[section.type] || [];
    const missing = needs.filter((key) => !Array.isArray(data[key]) || data[key].length === 0);
    if (missing.length) {
      problems.push(`section "${section.id}" needs data.${missing.join(', data.')} but it is empty — showing an empty state.`);
      ok.push({ section, missing });
    } else {
      ok.push({ section, missing: [] });
    }
  }
  return { sections: ok, problems };
}

const emptyState = (section, missing) => `
<section class="section wrap" id="${esc(section.id)}" data-section="${esc(section.type)}">
  <p class="eyebrow">${esc(section.eyebrow || section.type)}</p>
  <h2 class="h2">This section has nothing to show yet.</h2>
  <p class="body" style="margin-top:12px">
    <code>content.json</code> contains a <strong>${esc(section.type)}</strong> section, but
    <code>data.${esc(missing.join(', data.'))}</code> is empty, so there is no content to lay out.
    Add an entry there and this section comes back — no layout code needs changing.
  </p>
</section>`;

function contentError(error) {
  const message = String((error && error.message) || error);
  return `
  <section class="section wrap">
    <p class="eyebrow">Content unavailable</p>
    <h1 class="h2">The page could not load its content file.</h1>
    <p class="body" style="margin-top:14px">
      Everything on this page is rendered from <code>content.json</code>, and that request failed
      (<span class="mono">${esc(message)}</span>). This is usually a bad path on a static host, a
      file that was not uploaded, or a network drop.
    </p>
    <div class="hero__actions" style="margin-top:20px">
      <button class="btn" type="button" data-retry-content>Try again</button>
      <a class="btn btn--ghost" href="ledger.html">Open the submission ledger</a>
    </div>
    <p class="body" style="margin-top:20px;color:var(--ink-55)">
      If you are the person who deployed this: check that <code>content.json</code> sits next to
      <code>index.html</code> on the host. The handoff doc lists the exact files.
    </p>
  </section>`;
}

async function loadContent() {
  const res = await fetch(CONTENT_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`content.json responded with ${res.status} ${res.statusText || ''}`.trim());
  return res.json();
}

async function boot() {
  installErrorHandlers();
  setLogSink(logEvent);
  log('info', 'boot: script started', { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });

  const main = document.querySelector('[data-app]');
  if (!main) return;

  let content;
  try {
    content = await loadContent();
  } catch (error) {
    main.innerHTML = contentError(error);
    main.querySelector('[data-retry-content]')?.addEventListener('click', () => location.reload());
    log('error', 'content load failed', { error: String(error && error.message || error) });
    notice({
      kind: 'error',
      title: 'Content file failed to load',
      message: 'The page rendered a fallback explaining the failure. Nothing was lost.',
      actions: [{ label: 'Retry', run: () => location.reload() }],
    });
    return;
  }

  const { sections: sanitized, problems } = sanitize(content);
  if (problems.length) {
    log('warn', 'content problems detected', { problems });
    notice({
      kind: 'warn',
      title: `${problems.length} content problem${problems.length === 1 ? '' : 's'} found`,
      message: problems.join(' '),
      autoClose: 0,
    });
    problems.forEach((p) => logEvent({ at: new Date().toISOString(), level: 'warn', message: p, meta: { stage: 'sanitize' } }));
  }

  // each section renders on its own, so a section with missing data is
  // replaced by an empty state in place and the order never shifts
  const parts = sanitized.map((entry) => (entry.missing.length
    ? emptyState(entry.section, entry.missing)
    : renderSection(entry.section, content)));

  main.innerHTML = parts.join('\n');

  const foot = document.querySelector('[data-foot]');
  const footerHtml = renderFooter(content);
  if (foot && footerHtml) { foot.innerHTML = footerHtml; foot.hidden = false; }

  applyMeta(content);

  initReveals(document);
  initMachine(content);
  initBlotter(content);
  initFilters(content);
  initCapture(content);
  initNewsletter(content);
  refreshCaptureHint(content).catch(() => {});

  log('info', 'boot: rendered', {
    sections: sanitized.length,
    products: (content.data && content.data.products || []).length,
    scents: (content.data && content.data.scents || []).length,
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
