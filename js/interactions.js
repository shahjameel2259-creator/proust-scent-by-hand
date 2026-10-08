/* ============================================================
   interactions.js — everything the visitor can actually do.

   machine  : choose a composition, the paper takes its colour
   blotter  : drag a paper strip across the notes, it stains
   filters  : narrow the collection, always with a live count
   quiz     : three questions -> one composition -> one record
   forms    : validated, and never a success message it cannot prove
   ============================================================ */

import { esc, notice, log, clearNotices } from './ui.js';
import { submitCapture, listRecords } from './store.js';
import { inkFor } from './render.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   scroll reveals
   ============================================================ */

export function initReveals(root = document) {
  const targets = root.querySelectorAll('[data-reveal], [data-stagger], [data-wipe]');
  const sections = root.querySelectorAll('[data-section], .section');

  if (reduceMotion() || !('IntersectionObserver' in window)) {
    targets.forEach((t) => t.classList.add('is-in'));
    sections.forEach((s) => s.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

  targets.forEach((t) => io.observe(t));

  const sectionIo = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-in');
    });
  }, { rootMargin: '-10% 0px -30% 0px' });
  sections.forEach((s) => sectionIo.observe(s));

  // stagger indexes for children
  root.querySelectorAll('[data-stagger]').forEach((group) => {
    [...group.children].forEach((child, i) => child.style.setProperty('--i', i));
  });
}

/* ============================================================
   the colour machine
   ============================================================ */

export function initMachine(content) {
  const section = document.getElementById('machine');
  if (!section) return;
  const rows = [...section.querySelectorAll('[data-machine-row]')];
  const card = section.querySelector('[data-machine-card]');
  const inner = section.querySelector('[data-machine-inner]');
  const floodNum = section.querySelector('[data-flood-num]');
  const anno = section.querySelector('[data-machine-anno]');
  if (!rows.length || !inner) return;

  const scents = content.data.scents;
  const bySlug = Object.fromEntries(scents.map((s) => [s.slug, s]));
  let current = rows[0].dataset.slug;

  const annotations = ['not brown', 'not grey', 'not dusty pink', 'not beige', 'not gold', 'not cold', 'not pale', 'not yellow', 'not a dessert', 'not black'];

  function paint(slug, { scroll = false } = {}) {
    const scent = bySlug[slug];
    if (!scent) return;
    current = slug;
    const index = scents.findIndex((s) => s.slug === slug);

    section.dataset.burst = slug;
    section.dataset.active = '';
    floodNum.textContent = String(index + 1).padStart(2, '0');
    if (anno) anno.textContent = annotations[index] || '';

    rows.forEach((row) => {
      const on = row.dataset.slug === slug;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-pressed', String(on));
      if (on && scroll) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    const swap = () => {
      inner.innerHTML = `
        <img class="machine__bottle" src="${esc(scent.img)}" alt="${esc(scent.imgAlt)}" width="900" height="1125" loading="lazy" decoding="async">
        <div class="machine__card-meta">
          <h3>${esc(scent.name)}</h3>
          <span class="machine__price">${esc(content.meta.priceNote)}</span>
        </div>
        <p class="hand" style="margin-top:-6px">${esc(scent.character)}</p>
        <div class="machine__notes">${scent.notes.map((n) => `<span class="machine__note">${esc(n)}</span>`).join('')}</div>
        <p class="machine__story">${esc(scent.story)}</p>
        <p class="machine__price">Wear · ${esc(scent.wear)}${scent.bestSeller ? ' · best seller' : ''}</p>`;
      card?.classList.remove('is-swapping');
    };

    if (reduceMotion()) { swap(); return; }
    card?.classList.add('is-swapping');
    setTimeout(swap, 140);
  }

  rows.forEach((row, i) => {
    row.addEventListener('click', () => paint(row.dataset.slug));
    row.addEventListener('mouseenter', () => { if (window.matchMedia('(hover: hover)').matches) paint(row.dataset.slug); });
    row.addEventListener('focus', () => paint(row.dataset.slug));
    row.addEventListener('keydown', (event) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = rows[(i + step + rows.length) % rows.length];
      next.focus();
      paint(next.dataset.slug);
    });
  });

  paint(current);
}

/* ============================================================
   the blotter
   ============================================================ */

export function initBlotter(content) {
  const stage = document.querySelector('[data-blotter]');
  if (!stage) return;
  const strip = stage.querySelector('[data-strip]');
  const wells = [...stage.querySelectorAll('[data-well]')];
  const pickedHost = document.querySelector('[data-picked]');
  const emptyHint = document.querySelector('[data-picked-empty]');
  const copyHost = document.querySelector('[data-note-copy]');
  const resetBtn = document.querySelector('[data-blotter-reset]');
  const noteData = Object.fromEntries(content.data.notes.map((n) => [n.name, n]));

  const picked = [];
  let dragging = false;
  let offset = { x: 0, y: 0 };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function place(left, top) {
    const rect = stage.getBoundingClientRect();
    const w = strip.offsetWidth || 46;
    const h = strip.offsetHeight || 116;
    const x = clamp(left, 8, Math.max(8, rect.width - w - 8));
    const y = clamp(top, 8, Math.max(8, rect.height - h - 8));
    strip.style.left = x + 'px';
    strip.style.top = y + 'px';
    return { x, y, w, h };
  }

  function stain(x, y, burst) {
    const node = document.createElement('span');
    node.className = 'stain';
    node.style.left = (x - 27) + 'px';
    node.style.top = (y - 27) + 'px';
    node.style.setProperty('--stain', burst);
    stage.appendChild(node);
  }

  function pickNote(name, { x, y, burst }) {
    const note = noteData[name];
    if (!note) return;
    const already = picked.includes(name);
    if (!already) {
      picked.push(name);
      stain(x, y, note.burst);
      const chip = document.createElement('span');
      chip.className = 'machine__note';
      chip.style.setProperty('--burst', note.burst);
      chip.style.borderColor = note.burst;
      chip.style.background = note.burst + '22';
      chip.textContent = name;
      pickedHost.appendChild(chip);
      if (emptyHint) emptyHint.hidden = true;
      log('info', 'blotter picked a note', { note: name, count: picked.length });
    }
    if (copyHost) copyHost.textContent = note.copy;
    wells.forEach((w) => w.classList.toggle('is-picked', picked.includes(w.dataset.note)));
    strip.style.setProperty('--strip-color', note.burst);
  }

  function hitTest() {
    const s = strip.getBoundingClientRect();
    const cx = s.left + s.width / 2;
    const cy = s.top + s.height / 2;
    wells.forEach((well) => {
      const r = well.getBoundingClientRect();
      if (cx >= r.left - 10 && cx <= r.right + 10 && cy >= r.top - 10 && cy <= r.bottom + 10) {
        const st = stage.getBoundingClientRect();
        pickNote(well.dataset.note, { x: cx - st.left, y: cy - st.top, burst: well.dataset.burst });
      }
    });
  }

  strip.addEventListener('pointerdown', (event) => {
    dragging = true;
    strip.classList.add('is-dragging');
    strip.setPointerCapture?.(event.pointerId);
    const r = strip.getBoundingClientRect();
    offset = { x: event.clientX - r.left, y: event.clientY - r.top };
    event.preventDefault();
  });

  strip.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const st = stage.getBoundingClientRect();
    place(event.clientX - st.left - offset.x, event.clientY - st.top - offset.y);
    hitTest();
  });

  const stop = () => { dragging = false; strip.classList.remove('is-dragging'); };
  strip.addEventListener('pointerup', stop);
  strip.addEventListener('pointercancel', stop);

  // keyboard path: every well is a button
  wells.forEach((well) => {
    well.addEventListener('click', () => {
      const st = stage.getBoundingClientRect();
      const r = well.getBoundingClientRect();
      pickNote(well.dataset.note, { x: r.left - st.left + r.width / 2, y: r.top - st.top + r.height / 2, burst: well.dataset.burst });
      place(r.left - st.left, r.top - st.top + r.height + 14);
      well.setAttribute('aria-pressed', String(picked.includes(well.dataset.note)));
    });
    well.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); well.click(); }
    });
  });

  resetBtn?.addEventListener('click', () => {
    picked.length = 0;
    stage.querySelectorAll('.stain').forEach((n) => n.remove());
    pickedHost.querySelectorAll('.machine__note').forEach((n) => n.remove());
    if (emptyHint) emptyHint.hidden = false;
    if (copyHost) copyHost.textContent = 'Each note you touch leaves a stain and prints what it does here.';
    strip.style.setProperty('--strip-color', 'transparent');
    wells.forEach((w) => { w.classList.remove('is-picked'); w.setAttribute('aria-pressed', 'false'); });
    const rect = stage.getBoundingClientRect();
    place(rect.width * 0.04, rect.height * 0.55);
  });

  // initial placement once layout is known
  const start = () => {
    const rect = stage.getBoundingClientRect();
    place(rect.width * 0.04, rect.height * 0.52);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  setTimeout(start, 60);
}

/* ============================================================
   collection filters
   ============================================================ */

export function initFilters(content) {
  const root = document.querySelector('[data-filters]');
  const grid = document.querySelector('[data-products]');
  if (!root || !grid) return;
  const cards = [...grid.querySelectorAll('[data-product]')];
  const status = root.querySelector('[data-filter-status]');
  const state = { family: '', tier: '' };

  function apply() {
    let shown = 0;
    cards.forEach((card) => {
      const families = (card.dataset.family || '').split('|');
      const tiers = (card.dataset.tiers || '').split('|');
      const okFamily = !state.family || families.includes(state.family);
      const okTier = !state.tier || tiers.includes(state.tier);
      const ok = okFamily && okTier;
      card.classList.toggle('is-hidden', !ok);
      if (ok) shown += 1;
    });
    if (status) {
      const bits = [state.family || 'all families', state.tier || 'any size'];
      status.textContent = shown === 0
        ? `No composition matches ${bits.join(' · ')}. Try clearing a filter.`
        : `Showing ${shown} of ${cards.length} compositions · ${bits.join(' · ')}.`;
    }
    const existing = grid.parentNode.querySelector('[data-empty-products]');
    if (shown === 0 && !existing) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.dataset.emptyProducts = '';
      empty.textContent = 'Nothing in the range matches both filters. That is a real answer, not an error — clear one and try again.';
      grid.after(empty);
    } else if (shown > 0 && existing) {
      existing.remove();
    }
  }

  root.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter;
      const value = chip.dataset.value;
      state[key] = state[key] === value ? '' : value;
      root.querySelectorAll(`[data-filter="${key}"]`).forEach((other) => {
        other.setAttribute('aria-pressed', String(other.dataset.value === state[key] || (!state[key] && other.dataset.value === '')));
      });
      apply();
      log('info', 'collection filtered', { ...state });
    });
  });

  apply();
}

/* ============================================================
   the quiz -> one record
   ============================================================ */

export function initCapture(content) {
  const form = document.querySelector('[data-capture-form]');
  if (!form) return;
  const quiz = content.data.quiz;
  const answers = {};
  const optionButtons = [...document.querySelectorAll('[data-quiz-opt]')];
  const stateLine = form.querySelector('[data-capture-state]');
  const result = document.querySelector('[data-result]');
  const emailInput = form.querySelector('input[name="email"]');
  const emailError = form.querySelector('#cap-email-error');
  const submitBtn = form.querySelector('[data-capture-submit]');

  optionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.q;
      answers[key] = btn.dataset.value;
      optionButtons.filter((b) => b.dataset.q === key).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const done = quiz.filter((q) => answers[q.key]).length;
      if (stateLine) stateLine.textContent = done === quiz.length
        ? 'All three answered. Add an email and this records the result.'
        : `${done} of ${quiz.length} answered.`;
    });
  });

  function recommend() {
    const scores = {};
    quiz.forEach((q) => {
      const chosen = answers[q.key];
      const option = q.options.find((o) => o.label === chosen);
      if (!option) return;
      for (const [slug, weight] of Object.entries(option.weights || {})) {
        scores[slug] = (scores[slug] || 0) + weight;
      }
    });
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return ranked.length ? ranked[0][0] : null;
  }

  function renderResult(record, sent) {
    const scent = content.data.scents.find((s) => s.slug === record.recommendation);
    if (!scent) return;
    result.hidden = false;
    result.innerHTML = `
      <div class="result__card" style="--burst:${esc(scent.burst)};--burst-ink:${inkFor(scent.burst)}" data-burst="${esc(scent.slug)}">
        <p class="eyebrow" style="color:currentColor;opacity:.8">Your composition</p>
        <h3>${esc(scent.name)}</h3>
        <p>${esc(scent.character)} — ${esc(scent.notes.join(' · '))}</p>
        <div class="result__notes">${scent.notes.map((n) => `<span>${esc(n)}</span>`).join('')}</div>
        <p style="margin-top:14px">100 ml ₹1,600 · 50 ml ₹1,300 · 11 ml roll-on ₹800</p>
      </div>
      <div class="notice ${sent ? 'notice--ok' : 'notice--warn'}">
        <p><strong>${sent ? 'Recorded and sent.' : 'Recorded on this device.'}</strong>
        ${sent ? 'The submission reached the collection endpoint.' : 'There is no collection endpoint configured for this build, so the record is stored locally and appears in the ledger with a timestamp. Nothing has been emailed.'}</p>
        <dl class="kv">
          <dt>Reference</dt><dd class="mono">${esc(record.id)}</dd>
          <dt>Stored at</dt><dd class="mono">${esc(record.created_at)}</dd>
          <dt>Storage</dt><dd>${esc(record.storage || 'unknown')}</dd>
        </dl>
      </div>
      <p class="receipt">Look it up on the <a href="ledger.html">ledger page</a> — it is the last row, and the CSV export contains every submission on this device.</p>`;
    result.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotices('error');
    emailError.hidden = true;
    emailInput.removeAttribute('aria-invalid');

    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      emailError.textContent = 'That email address does not look complete — check it and try again.';
      emailError.hidden = false;
      emailInput.setAttribute('aria-invalid', 'true');
      emailInput.focus();
      log('warn', 'capture rejected: invalid email', { value: email.slice(0, 40) });
      return;
    }
    const unanswered = quiz.filter((q) => !answers[q.key]).map((q) => q.question);
    if (unanswered.length) {
      notice({ kind: 'warn', title: 'One answer is missing', message: `Still to answer: ${unanswered.join(' ')}` });
      log('warn', 'capture rejected: incomplete quiz', { unanswered });
      quiz.find((q) => !answers[q.key]) && document.querySelector(`[data-quiz-opt][data-q="${quiz.find((q) => !answers[q.key]).key}"]`)?.focus();
      return;
    }

    const slug = recommend();
    const fragrance = content.data.scents.find((s) => s.slug === slug);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Recording…';
    if (stateLine) stateLine.textContent = 'Writing the record…';

    try {
      const { record, sent, error } = await submitCapture({
        source: 'scent-quiz',
        recommendation: slug,
        recommendation_name: fragrance ? fragrance.name : slug,
        email,
        name: form.querySelector('input[name="name"]').value.trim(),
        consent: form.querySelector('input[name="consent"]').checked,
        answers,
      }, { endpoint: content.meta.captureEndpoint || '' });

      renderResult(record, sent);
      if (stateLine) stateLine.textContent = 'Recorded. The ledger has the receipt.';
      if (!sent && error) {
        notice({
          kind: 'warn',
          title: 'Saved, but not relayed',
          message: `The record is safely stored on this device. The relay endpoint did not accept it (${error}). It stays in the outbox.`,
        });
      }
    } catch (error) {
      const message = String((error && error.message) || error);
      if (stateLine) stateLine.textContent = 'Nothing was recorded.';
      notice({
        kind: 'error',
        title: 'Could not save that',
        message: `This browser refused the write (${message}). Try again, or open the site in a normal window rather than private mode.`,
      });
      log('error', 'capture write failed', { error: message });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = content.sections.find((s) => s.type === 'capture')?.submitLabel || 'Show me mine';
    }
  });
}

/* ============================================================
   newsletter
   ============================================================ */

export function initNewsletter(content) {
  const form = document.querySelector('[data-newsletter]');
  if (!form) return;
  const state = form.parentNode.querySelector('[data-news-state]');
  const input = form.querySelector('input[name="email"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      state.textContent = 'That email address does not look complete.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Saving…';
    try {
      const { record } = await submitCapture({ source: 'newsletter', email, consent: true }, { endpoint: content.meta.captureEndpoint || '' });
      state.textContent = `Saved at ${record.created_at}.`;
      input.value = '';
      input.removeAttribute('aria-invalid');
      log('info', 'newsletter signup stored', { id: record.id });
    } catch (error) {
      state.textContent = 'Could not save that just now. Try again in a moment.';
      log('error', 'newsletter write failed', { error: String(error && error.message || error) });
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

/* ============================================================
   a small honesty check: counts shown on the page must match the store
   ============================================================ */

export async function refreshCaptureHint(content) {
  const state = document.querySelector('[data-capture-state]');
  if (!state) return;
  try {
    const rows = await listRecords();
    const mine = rows.filter((r) => r.source === 'scent-quiz').length;
    if (mine > 0) {
      const line = document.createElement('span');
      line.className = 'skeleton-note';
      line.textContent = ` ${mine} result${mine === 1 ? '' : 's'} already recorded on this device.`;
      state.appendChild(line);
    }
  } catch { /* non-critical */ }
}
