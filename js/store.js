/* ============================================================
   store.js — where a visitor's submission actually goes.

   Every submission is written to IndexedDB (durable on the
   device) FIRST. Only when that write resolves is the visitor
   told it worked. If a server endpoint is configured the record
   is then POSTed; a failed POST keeps the record in an outbox
   and the visitor is told plainly that it has not been sent yet.
   Nothing here ever reports success it cannot prove.
   ============================================================ */

import { log } from './ui.js';

const DB_NAME = 'proust-scent-by-hand';
const DB_VERSION = 1;
const RECORDS = 'records';
const EVENTS = 'events';
const LS_KEY = 'proust.records.v1';
const LS_EVENTS = 'proust.events.v1';

export const uuid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

let dbPromise = null;
let mode = 'unknown'; // 'idb' | 'localstorage' | 'memory'

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

function tx(store, mode_, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode_);
    const request = fn(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request && request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('transaction aborted'));
  }));
}

/* ---------- localStorage fallback (private mode, file://, blocked IDB) ---------- */
const lsRead = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
const lsWrite = (key, value) => localStorage.setItem(key, JSON.stringify(value));

/* ---------- records ---------- */

export async function putRecord(record) {
  try {
    await tx(RECORDS, 'readwrite', (s) => s.put(record));
    mode = 'idb';
    return { stored: true, mode };
  } catch (error) {
    log('warn', 'IndexedDB write failed, falling back to localStorage', { error: String(error && error.message || error) });
    const all = lsRead(LS_KEY);
    all.push(record);
    lsWrite(LS_KEY, all); // throws if storage is full / blocked — caller decides
    mode = 'localstorage';
    return { stored: true, mode };
  }
}

export async function listRecords() {
  try {
    const rows = await tx(RECORDS, 'readonly', (s) => s.getAll());
    mode = 'idb';
    return rows || [];
  } catch {
    mode = lsRead(LS_KEY).length ? 'localstorage' : mode;
    return lsRead(LS_KEY);
  }
}

export async function deleteRecord(id) {
  try {
    await tx(RECORDS, 'readwrite', (s) => s.delete(id));
  } catch {
    lsWrite(LS_KEY, lsRead(LS_KEY).filter((r) => r.id !== id));
  }
}

export async function clearRecords() {
  try { await tx(RECORDS, 'readwrite', (s) => s.clear()); } catch { /* fall through */ }
  lsWrite(LS_KEY, []);
}

export const storageMode = () => mode;

/* ---------- events (the audit log shown on the ledger page) ---------- */

export async function logEvent(entry) {
  const row = { id: uuid(), ...entry };
  try {
    await tx(EVENTS, 'readwrite', (s) => s.put(row));
  } catch {
    const all = lsRead(LS_EVENTS);
    all.push(row);
    lsWrite(LS_EVENTS, all.slice(-400));
  }
  return row;
}

export async function listEvents() {
  try {
    const rows = await tx(EVENTS, 'readonly', (s) => s.getAll());
    return (rows || []).sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch {
    return lsRead(LS_EVENTS).sort((a, b) => (a.at < b.at ? 1 : -1));
  }
}

/* ---------- submission ---------- */

export async function submitCapture(payload, { endpoint = '' } = {}) {
  const record = {
    id: uuid(),
    created_at: new Date().toISOString(),
    source: payload.source || 'unknown',
    page: location.pathname.split('/').pop() || 'index.html',
    referrer: document.referrer || '',
    ua: navigator.userAgent,
    title: document.title,
    ...payload,
    delivery: endpoint ? 'pending' : 'local-only',
    attempts: 0,
    errors: [],
  };
  delete record.source_override;

  // 1. durable write first
  const write = await putRecord(record);
  record.storage = write.mode;
  await logEvent({ at: record.created_at, level: 'info', message: 'record stored', meta: { id: record.id, source: record.source, mode: write.mode } });

  if (!endpoint) return { record, sent: false, reason: 'no-endpoint' };

  // 2. optional relay
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`endpoint responded ${res.status}`);
    record.delivery = 'sent';
    record.attempts = 1;
    await putRecord(record);
    await logEvent({ at: new Date().toISOString(), level: 'info', message: 'record relayed', meta: { id: record.id, endpoint } });
    return { record, sent: true };
  } catch (error) {
    record.delivery = 'queued';
    record.attempts = 1;
    record.errors = [String(error && error.message ? error.message : error)];
    await putRecord(record);
    await logEvent({ at: new Date().toISOString(), level: 'error', message: 'relay failed, kept in outbox', meta: { id: record.id, endpoint, error: record.errors[0] } });
    return { record, sent: false, reason: 'relay-failed', error: record.errors[0] };
  }
}

export async function retryOutbox(endpoint) {
  const rows = (await listRecords()).filter((r) => r.delivery === 'queued' || r.delivery === 'pending');
  const results = [];
  for (const row of rows) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(`endpoint responded ${res.status}`);
      row.delivery = 'sent';
      row.attempts = (row.attempts || 0) + 1;
      await putRecord(row);
      results.push({ id: row.id, sent: true });
    } catch (error) {
      row.attempts = (row.attempts || 0) + 1;
      row.errors = [...(row.errors || []), String(error && error.message || error)];
      await putRecord(row);
      results.push({ id: row.id, sent: false });
    }
  }
  await logEvent({ at: new Date().toISOString(), level: results.some((r) => !r.sent) ? 'warn' : 'info', message: `outbox retry: ${results.filter((r) => r.sent).length}/${results.length} sent`, meta: {} });
  return results;
}

/* ---------- export ---------- */

export const CSV_COLUMNS = [
  'id', 'created_at', 'source', 'delivery', 'storage', 'recommendation', 'recommendation_name',
  'email', 'name', 'consent', 'answers', 'page', 'referrer', 'attempts', 'errors',
];

export function toCsv(rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c])).join(','))].join('\r\n');
}

export function downloadCsv(rows, filename) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `proust-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return rows.length;
}
