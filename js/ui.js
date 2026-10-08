/* ============================================================
   ui.js — tiny DOM helpers, escaping, and every visitor-facing
   message the site can produce (including the failure paths).
   ============================================================ */

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export const el = (tag, attrs = {}, html = '') => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  if (html) node.innerHTML = html;
  return node;
};

export const host = () => document.getElementById('system-status');

/**
 * A message the visitor must be able to see: errors, confirmations, warnings.
 * Nothing here is decorative — every status item maps to a real condition.
 */
export function notice({ kind = 'info', title, message, actions = [], autoClose = 0, persistent = true }) {
  const node = el('div', { class: `notice notice--${kind} status-item`, role: kind === 'error' ? 'alert' : 'status' });
  const actionsHtml = actions.length
    ? `<div class="notice__actions">${actions.map((a, i) => `<button type="button" class="btn btn--sm ${a.primary ? '' : 'btn--ghost'}" data-action="${i}">${esc(a.label)}</button>`).join('')}</div>`
    : '';
  node.innerHTML = `
    <div class="status-item__head">
      <div>
        ${title ? `<h4>${esc(title)}</h4>` : ''}
        <p>${esc(message)}</p>
      </div>
      ${persistent ? '<button type="button" class="btn btn--ghost btn--sm status-item__close" data-close aria-label="Dismiss message">Close</button>' : ''}
    </div>
    ${actionsHtml}`;

  const remove = () => { if (node.parentNode) node.parentNode.removeChild(node); };
  node.querySelector('[data-close]')?.addEventListener('click', remove);
  node.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = actions[Number(btn.dataset.action)];
      if (action) action.run?.(remove);
    });
  });
  if (autoClose) setTimeout(remove, autoClose);
  host()?.appendChild(node);
  return { node, remove };
}

export function clearNotices(kind) {
  host()?.querySelectorAll(kind ? `.notice--${kind}` : '.notice').forEach((n) => n.remove());
}

/* ---- append-only activity log (mirrored into the ledger page) ---- */
let logSink = () => {};
export const setLogSink = (fn) => { logSink = fn; };

export function log(level, message, meta = {}) {
  const entry = { at: new Date().toISOString(), level, message, meta };
  try { logSink(entry); } catch { /* never let logging break the page */ }
  if (level === 'error') console.error('[proust]', message, meta);
  else if (level === 'warn') console.warn('[proust]', message, meta);
  else console.info('[proust]', message, meta);
  return entry;
}

/**
 * Global safety net: an unhandled script error must never leave the visitor
 * staring at a frozen page with no explanation.
 */
export function installErrorHandlers() {
  const seen = new Set();
  const surface = (message, detail) => {
    const key = `${message}|${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    log('error', message, { detail });
    notice({
      kind: 'error',
      title: 'Something broke on this page',
      message: `${message} Reload to try again — everything you submitted is already stored on this device.`,
      actions: [{ label: 'Reload', run: () => location.reload() }],
    });
  };

  window.addEventListener('error', (event) => {
    if (event.target && event.target !== window && event.target.tagName === 'IMG') {
      const img = event.target;
      const alt = img.getAttribute('alt') || 'image';
      log('error', 'image failed to load', { src: img.currentSrc || img.src });
      // a missing asset must be visible, not a silent empty hole
      const fallback = document.createElement('div');
      fallback.className = 'img-fallback';
      fallback.setAttribute('role', 'img');
      fallback.setAttribute('aria-label', `Image unavailable: ${alt}`);
      fallback.innerHTML = `<span>Image unavailable</span><span class="img-fallback__alt">${alt}</span>`;
      img.replaceWith(fallback);
      return;
    }
    surface(event.message || 'Unexpected script error', `${event.filename || ''}:${event.lineno || 0}`);
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    surface('Unexpected failure', String(reason && reason.message ? reason.message : reason));
  });
}

/* ---- safe write of one record, with a visible receipt ---- */
export function stamp() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}
