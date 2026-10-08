/* ============================================================
   ledger.js — the reviewable record of every capture.

   This is the page a non-developer opens to answer "did anyone
   submit anything, and did it arrive?" Data comes straight from
   the same store the forms write to.
   ============================================================ */

import { esc, notice, log, installErrorHandlers, setLogSink } from './ui.js';
import {
  listRecords, listEvents, toCsv, downloadCsv, clearRecords, retryOutbox, deleteRecord, storageMode, logEvent,
} from './store.js';

const state = { filter: '', records: [], events: [], endpoint: '' };

const fmt = (iso) => (iso ? iso.replace('T', ' ').slice(0, 19) : '—');

function stats() {
  const rows = state.records;
  const quiz = rows.filter((r) => r.source === 'scent-quiz');
  const news = rows.filter((r) => r.source === 'newsletter');
  const undelivered = rows.filter((r) => r.delivery === 'queued' || r.delivery === 'pending' || r.delivery === 'local-only');
  const last = rows.map((r) => r.created_at).sort().pop();
  const top = {};
  quiz.forEach((r) => { const k = r.recommendation_name || r.recommendation || '—'; top[k] = (top[k] || 0) + 1; });
  const leader = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
  return [
    ['Records', rows.length],
    ['Quiz results', quiz.length],
    ['Newsletter', news.length],
    ['Not relayed', undelivered.length],
    ['Last record (UTC)', last ? fmt(last) : '—'],
    ['Most recommended', leader ? `${leader[0]} (${leader[1]})` : '—'],
    ['Storage', storageMode() || 'unknown'],
  ];
}

function renderStats() {
  const host = document.querySelector('[data-stats]');
  host.innerHTML = stats().map(([k, v]) => `<div class="ledger-stat"><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('');
}

function visible() {
  if (!state.filter) return state.records;
  if (state.filter === 'undelivered') {
    return state.records.filter((r) => ['queued', 'pending', 'local-only'].includes(r.delivery));
  }
  return state.records.filter((r) => r.source === state.filter);
}

function deliveryPill(r) {
  const map = {
    sent: ['pill--ok', 'relayed'],
    queued: ['pill--queued', 'outbox'],
    pending: ['pill--queued', 'pending'],
    'local-only': ['pill', 'device only'],
  };
  const [cls, label] = map[r.delivery] || ['pill', r.delivery || 'unknown'];
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

function renderRows() {
  const rows = visible().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const tbody = document.querySelector('[data-rows]');
  const empty = document.querySelector('[data-empty]');
  const wrap = document.querySelector('[data-table-wrap]');

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="mono">${esc(fmt(r.created_at))}</td>
      <td>${esc(r.source)}</td>
      <td>${r.recommendation_name ? `<strong>${esc(r.recommendation_name)}</strong><br><span class="mono" style="font-size:.72rem">${esc(r.recommendation)}</span>` : '—'}</td>
      <td>${esc(r.email || '—')}</td>
      <td>${r.answers ? esc(Object.entries(r.answers).map(([k, v]) => `${k}: ${v}`).join(' · ')) : '—'}</td>
      <td>${deliveryPill(r)}${(r.errors && r.errors.length) ? `<br><span class="mono" style="font-size:.7rem;color:#b3261e">${esc(r.errors[r.errors.length - 1])}</span>` : ''}</td>
      <td class="mono" style="font-size:.7rem">${esc(r.id)}<br>${esc(r.storage || '')}<br><button class="btn btn--ghost btn--sm" type="button" data-delete="${esc(r.id)}">Delete</button></td>
    </tr>`).join('');

  empty.hidden = rows.length > 0;
  wrap.hidden = rows.length === 0;

  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteRecord(btn.dataset.delete);
      await logEvent({ at: new Date().toISOString(), level: 'warn', message: 'record deleted by operator', meta: { id: btn.dataset.delete } });
      await refresh();
    });
  });
}

function renderEvents() {
  const host = document.querySelector('[data-events]');
  if (!state.events.length) {
    host.innerHTML = '<div class="log__line"><span>—</span><span>info</span><span>No events recorded yet on this device.</span></div>';
    return;
  }
  host.innerHTML = state.events.slice(0, 120).map((e) => `
    <div class="log__line ${e.level === 'error' ? 'log__line--error' : ''}">
      <span>${esc(fmt(e.at))}</span>
      <span>${esc(e.level)}</span>
      <span>${esc(e.message)}${e.meta && Object.keys(e.meta).length ? ' · ' + esc(JSON.stringify(e.meta).slice(0, 220)) : ''}</span>
    </div>`).join('');
}

async function refresh() {
  state.records = await listRecords();
  state.events = await listEvents();
  renderStats();
  renderRows();
  renderEvents();
  const status = document.querySelector('[data-ledger-status]');
  status.textContent = state.endpoint
    ? `Storage: ${storageMode() || 'unknown'} · relay endpoint configured: ${state.endpoint}`
    : `Storage: ${storageMode() || 'unknown'} · no relay endpoint configured, so every record is device-local and exportable as CSV.`;
}

async function boot() {
  installErrorHandlers();
  setLogSink(logEvent);
  log('info', 'ledger opened');

  try {
    const res = await fetch('content.json', { cache: 'no-cache' });
    const content = await res.json();
    state.endpoint = (content.meta && content.meta.captureEndpoint) || '';
  } catch (error) {
    log('warn', 'ledger could not read content.json', { error: String(error && error.message || error) });
  }

  const retry = document.querySelector('[data-retry]');
  retry.disabled = !state.endpoint;
  retry.title = state.endpoint ? '' : 'No relay endpoint is configured in content.json';
  retry.addEventListener('click', async () => {
    if (!state.endpoint) {
      notice({ kind: 'warn', title: 'Nothing to relay', message: 'Set meta.captureEndpoint in content.json to enable relay retries.' });
      return;
    }
    const results = await retryOutbox(state.endpoint);
    notice({
      kind: results.some((r) => !r.sent) ? 'warn' : 'ok',
      title: `Outbox retry: ${results.filter((r) => r.sent).length}/${results.length} sent`,
      message: results.length ? 'See the activity log below for per-record detail.' : 'The outbox was empty.',
    });
    await refresh();
  });

  document.querySelector('[data-export]').addEventListener('click', () => {
    const rows = visible();
    if (!rows.length) {
      notice({ kind: 'warn', title: 'Nothing to export', message: 'There are no records for the current filter.' });
      return;
    }
    const n = downloadCsv(rows);
    notice({ kind: 'ok', title: `Exported ${n} record${n === 1 ? '' : 's'}`, message: 'Timestamps are UTC, ISO 8601, one row per submission.' });
  });

  document.querySelector('[data-refresh]').addEventListener('click', refresh);

  document.querySelector('[data-clear]').addEventListener('click', async () => {
    if (!window.confirm('Delete every record stored on this device? The CSV export is the only other copy.')) return;
    await clearRecords();
    await logEvent({ at: new Date().toISOString(), level: 'warn', message: 'all local records cleared by operator', meta: {} });
    await refresh();
  });

  document.querySelectorAll('[data-ledger-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.ledgerFilter;
      document.querySelectorAll('[data-ledger-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      renderRows();
    });
  });

  await refresh();
}

boot();
