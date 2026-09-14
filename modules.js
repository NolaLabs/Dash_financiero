/* ==========================================================================
   NOLA LABS · TABLERO FINANCIERO — modules.js (v2)
   Módulos: Documentos · Movimientos (ingresos/egresos) · Equipo (cuentas de cobro)
            · Seguridad social (PILA) · Renta (documentos por año gravable) · Alertas
   Se carga DESPUÉS de app.js y comparte el estado global (S, D, VIEWS, cloud).
   Todo el código es plantilla genérica: los datos reales viven en la nube.
   ========================================================================== */

/* ========================================================= ICONOS (SVG inline) */
const ICON = {
  paperclip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};
const ico = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;

/* ========================================================= FECHAS */
function localISO(d = new Date()) { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
const ymOf = iso => (iso || '').slice(0, 7);
function parseISO(iso) { const [y, m, d] = String(iso || '').split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); }
function fmtDate(iso) { if (!iso) return '—'; const t = parseISO(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); return t.replace('.', ''); }
function daysUntil(iso) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseISO(iso) - t) / 86400000); }
function daysSince(iso) { return -daysUntil(iso); }
function addMonths(ym, n) { const y = +ym.slice(0, 4), m = +ym.slice(5) - 1 + n; const d = new Date(y, m, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function lastNMonths(n) { const cur = currentYM(); const out = []; for (let i = n - 1; i >= 0; i--) out.push(addMonths(cur, -i)); return out; }
function ymShort(ym) { return CAL_MESES[+ym.slice(5) - 1] + '-' + ym.slice(2, 4); }
function monthsOfYear(y) { return Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0')); }
function endOfMonthISO() { const n = new Date(); return localISO(new Date(n.getFullYear(), n.getMonth() + 1, 0)); }
function addDaysISO(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return localISO(d); }
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
const num = v => { const n = parseFloat(String(v).replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
function saveQuiet() { reEditor(); }

/* ========================================================= DOCUMENTOS (Storage / IndexedDB) */
const DOCS_BUCKET = 'documentos';
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('Sin IndexedDB')); return; }
      const r = indexedDB.open('nola_tablero_docs', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('docs'); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async put(id, blob) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('docs', 'readwrite'); t.objectStore('docs').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(id) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('docs', 'readonly'); const q = t.objectStore('docs').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); },
  async del(id) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('docs', 'readwrite'); t.objectStore('docs').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
};
const docById = id => (S.docs || []).find(x => x.id === id) || null;
const safeName = n => String(n || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80);
const fmtBytes = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? Math.round(b / 1024) + ' KB' : b + ' B';

const DOC_MAX_BYTES = 10 * 1048576;
const DOC_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv' };
// Detecta el tipo real por la cabecera del archivo (no por lo que diga el navegador) y lo cruza con la extensión
async function sniffDocType(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const want = DOC_TYPES[ext];
  if (!want) throw userErr('Formato no permitido. Subí PDF, imagen (PNG/JPG/WebP), Word, Excel o CSV.');
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const s = (a, b) => a.every((v, i) => head[i] === v);
  const ok = ext === 'pdf' ? s([0x25, 0x50, 0x44, 0x46])
    : ext === 'png' ? s([0x89, 0x50, 0x4E, 0x47])
    : (ext === 'jpg' || ext === 'jpeg') ? s([0xFF, 0xD8, 0xFF])
    : ext === 'webp' ? (s([0x52, 0x49, 0x46, 0x46]) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50)
    : (ext === 'docx' || ext === 'xlsx') ? s([0x50, 0x4B, 0x03, 0x04])
    : ext === 'csv' ? !head.slice(0, 8).some(b => b === 0) // texto plano
    : false;
  if (!ok) throw userErr('El contenido del archivo no coincide con su extensión .' + ext);
  return want;
}
async function docUpload(file, meta) {
  if (!file) return null;
  if (file.size > DOC_MAX_BYTES) throw userErr('Máximo 10 MB por archivo');
  const mime = await sniffDocType(file);
  const id = uid();
  const doc = { id, module: meta.module || 'otro', refId: meta.refId || null, year: meta.year || String(new Date().getFullYear()), name: file.name, size: file.size, mime, at: Date.now(), storage: 'local', path: null };
  if (cloud.client && cloud.user) {
    const path = `${cloud.user.id}/${doc.module}/${doc.year}/${Date.now()}-${safeName(file.name)}`;
    const { error } = await cloud.client.storage.from(DOCS_BUCKET).upload(path, file, { contentType: doc.mime, upsert: false });
    if (error) { console.warn('storage upload', error); throw userErr('No se pudo subir el archivo a la nube. Revisá la conexión e intentá de nuevo.'); }
    doc.storage = 'cloud'; doc.path = path;
  } else {
    await idb.put(id, file);
  }
  if (!Array.isArray(S.docs)) S.docs = [];
  S.docs.push(doc);
  return doc;
}
async function docOpen(id) {
  const doc = docById(id); if (!doc) { toast('Archivo no encontrado', 'err'); return; }
  const w = window.open('', '_blank'); // abrir antes del await para no chocar con bloqueadores de popups
  try {
    let url;
    if (doc.storage === 'cloud') {
      if (!cloud.client || !cloud.user) throw userErr('Este archivo vive en la nube: entrá con tu cuenta para verlo.');
      const { data, error } = await cloud.client.storage.from(DOCS_BUCKET).createSignedUrl(doc.path, 600);
      if (error) throw error; url = data.signedUrl;
    } else {
      const blob = await idb.get(id);
      if (!blob) throw userErr('Este archivo se guardó en otro dispositivo (modo local).');
      url = URL.createObjectURL(blob);
    }
    if (w) w.location = url; else window.open(url, '_blank');
  } catch (e) { if (w) w.close(); console.warn('docOpen', e); toast(userMsg(e, 'No se pudo abrir el archivo'), 'err'); }
}
async function docDelete(id) {
  const doc = docById(id); if (!doc) return;
  try {
    if (doc.storage === 'cloud' && cloud.client && cloud.user) await cloud.client.storage.from(DOCS_BUCKET).remove([doc.path]);
    else if (doc.storage === 'local') await idb.del(id);
  } catch (e) { console.warn('docDelete', e); }
  S.docs = S.docs.filter(x => x.id !== id);
}
// Chip de documento o botón para adjuntar. target: descriptor de dónde guardar el id (ver applyDocTarget)
function docSlot(label, docId, target) {
  const doc = docId ? docById(docId) : null;
  const t = esc(JSON.stringify(target));
  const inner = doc
    ? `<span class="docchip" title="${esc(doc.name)} · ${fmtBytes(doc.size)} · ${doc.storage === 'cloud' ? 'nube' : 'este dispositivo'}"><span class="nm">${esc(doc.name)}</span>
        <button type="button" data-act="doc:open" data-p="${doc.id}" title="Abrir">${ico('external')}</button>
        <button type="button" data-act="doc:unlink" data-p="${doc.id}" data-target="${t}" title="Quitar">${ico('x')}</button></span>`
    : `<button type="button" class="attach" data-act="doc:attach" data-target="${t}">${ico('paperclip')} Adjuntar</button>`;
  return `<div class="doc-slot">${label ? `<label>${esc(label)}</label>` : ''}${inner}</div>`;
}
let pendingAttach = null;
function applyDocTarget(target, docId) {
  const t = target || {};
  switch (t.t) {
    case 'cc': { const c = S.cuentasCobro.find(x => x.id === t.id); if (c) { c[t.f] = docId; if (t.f === 'docCuentaId' && docId && c.status === 'pendiente') { c.status = 'recibida'; c.receivedAt = c.receivedAt || localISO(); } } break; }
    case 'pila': { const p = S.pila.find(x => x.id === t.id); if (p) p[t.f] = docId; break; }
    case 'ledger': { const m = S.ledger.find(x => x.id === t.id); if (m) m.docId = docId; break; }
    case 'renta-doc': { const ry = rentaEnsure(t.year); const d = ry.docs.find(x => x.key === t.key); if (d) { d.docId = docId; if (docId) d.status = 'obtenido'; } break; }
    case 'renta-decl': { const ry = rentaEnsure(t.year); ry.declarationDocId = docId; break; }
    case 'team': { const p = S.team.find(x => x.id === t.id); if (p) p[t.f] = docId; break; }
  }
}
async function onDocFileChosen(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file || !pendingAttach) return;
  const { target, btn } = pendingAttach; pendingAttach = null;
  if (btn) btn.classList.add('busy');
  try {
    const meta = { module: target.module || target.t, refId: target.id || target.key || null, year: target.year || String(new Date().getFullYear()) };
    const doc = await docUpload(file, meta);
    applyDocTarget(target, doc.id);
    toast(doc.storage === 'cloud' ? 'Archivo guardado en la nube' : 'Archivo guardado en este dispositivo', 'ok');
    re();
  } catch (e) { console.warn('docUpload', e); toast(userMsg(e, 'No se pudo adjuntar el archivo'), 'err'); if (btn) btn.classList.remove('busy'); }
}

/* ========================================================= LIBRO DE MOVIMIENTOS */
const LEDGER_CATS = {
  cliente:          { label: 'Cobro a cliente',      type: 'ingreso' },
  salario_empleo:   { label: 'Salario (empleo)',     type: 'ingreso' },
  otro_ingreso:     { label: 'Otro ingreso',         type: 'ingreso' },
  capital:          { label: 'Aporte / capital',     type: 'ingreso' },
  nomina:           { label: 'Nómina / contratistas', type: 'egreso' },
  herramientas:     { label: 'Herramientas',         type: 'egreso' },
  seguridad_social: { label: 'Seguridad social',     type: 'egreso' },
  impuestos:        { label: 'Impuestos',            type: 'egreso' },
  proveedores:      { label: 'Proveedores',          type: 'egreso' },
  salario_ceo:      { label: 'Salario CEO (empresa → personal)', type: 'egreso' },
  gasto_personal:   { label: 'Gasto personal',       type: 'egreso' },
  deuda:            { label: 'Deuda (cuotas y tarjetas)', type: 'egreso' },
  bancario:         { label: 'Bancario (comisiones, intereses)', type: 'auto' },
  transferencia:    { label: 'Transferencia entre mis cuentas', type: 'auto' },
  otro_egreso:      { label: 'Otro egreso',          type: 'egreso' },
};
const catLabel = k => (LEDGER_CATS[k] || { label: k || '—' }).label;

function ledgerNormalize(m) {
  m.id = m.id || uid();
  m.date = /^\d{4}-\d{2}-\d{2}$/.test(m.date || '') ? m.date : localISO();
  m.type = m.type === 'ingreso' ? 'ingreso' : 'egreso';
  m.account = m.account === 'personal' ? 'personal' : 'empresa';
  if (!LEDGER_CATS[m.category]) m.category = m.type === 'ingreso' ? 'cliente' : 'otro_egreso';
  if (m.subcat === undefined) m.subcat = null;
  m.gross = Number(m.gross) || 0; m.withholding = Number(m.withholding) || 0;
  const n = Number(m.net); m.net = (m.net === '' || m.net == null || !isFinite(n)) ? m.gross - m.withholding : n;
  m.status = m.status === 'pendiente' ? 'pendiente' : 'hecho';
  m.applied = !!m.applied;
  m.source = m.source || 'manual';
  m.party = m.party || ''; m.concept = m.concept || ''; m.notes = m.notes || '';
  return m;
}
// Efecto sobre los saldos (solo para movimientos que administran su propio saldo)
function ledgerEffect(m, sign) {
  if (m.balanceBy === 'pagos' || m.balanceBy === 'banco') return;
  const L = S.liquidity; L.cajaEmpresaHoy = Number(L.cajaEmpresaHoy) || 0; L.ahorrosPersonalesHoy = Number(L.ahorrosPersonalesHoy) || 0;
  const amt = (Number(m.net) || 0) * sign;
  if (m.category === 'salario_ceo') { L.cajaEmpresaHoy -= amt; L.ahorrosPersonalesHoy += amt; return; }
  const dir = m.type === 'ingreso' ? 1 : -1;
  if (m.account === 'personal') L.ahorrosPersonalesHoy += dir * amt; else L.cajaEmpresaHoy += dir * amt;
}
function ledgerAdd(m) {
  if (!Array.isArray(S.ledger)) S.ledger = [];
  ledgerNormalize(m);
  if (m.status === 'hecho' && !m.applied) { ledgerEffect(m, +1); m.applied = true; }
  S.ledger.push(m); return m;
}
function ledgerSetStatus(id, status) {
  const m = S.ledger.find(x => x.id === id); if (!m) return;
  if (status === 'hecho' && !m.applied) { ledgerEffect(m, +1); m.applied = true; if (!m.doneAt) m.doneAt = localISO(); }
  if (status === 'pendiente' && m.applied) { ledgerEffect(m, -1); m.applied = false; }
  m.status = status;
}
function ledgerUpdate(m, patch) {
  const was = m.applied; if (was) ledgerEffect(m, -1);
  Object.assign(m, patch); ledgerNormalize(m);
  if (was) { ledgerEffect(m, +1); m.applied = true; }
}
function ledgerRemove(id) {
  const m = S.ledger.find(x => x.id === id); if (!m) return;
  if (m.source === 'pago' && m.refKey) { const [ym, key] = m.refKey.split('|'); const mm = S.payments.months[ym]; if (mm && mm.paid && mm.paid[key]) { togglePayment(ym, key); return; } }
  if (m.applied) ledgerEffect(m, -1);
  S.ledger = S.ledger.filter(x => x.id !== id);
}
// Pagos del mes ↔ libro (el saldo lo administra Pagos; acá solo el registro)
function ledgerSyncPayment(ym, key, it, on) {
  if (!Array.isArray(S.ledger)) S.ledger = [];
  const refKey = ym + '|' + key;
  if (!on) { S.ledger = S.ledger.filter(m => !(m.source === 'pago' && m.refKey === refKey)); return; }
  if (S.ledger.some(m => m.source === 'pago' && m.refKey === refKey)) return;
  const side = it ? it.side : sideForKey(key);
  const cat = (key.indexOf('team:') === 0 || key === 'prest') ? 'nomina' : key.indexOf('lic:') === 0 ? 'herramientas' : key === 'ceo' ? 'salario_ceo' : 'gasto_personal';
  const today = localISO();
  const amt = it ? Number(it.amount) || 0 : 0;
  S.ledger.push(ledgerNormalize({ id: uid(), date: ymOf(today) === ym ? today : ym + '-15', type: 'egreso', account: side === 'personal' ? 'personal' : 'empresa', category: cat, party: it ? String(it.name).replace(/^Nómina · /, '') : '', concept: it ? it.name : 'Pago del mes', gross: amt, withholding: 0, net: amt, status: 'hecho', applied: false, balanceBy: 'pagos', source: 'pago', refKey }));
}
function ledgerStats(s) {
  const L = Array.isArray(s.ledger) ? s.ledger : [];
  const months = lastNMonths(12);
  const mk = () => ({ ing: 0, egr: 0 });
  const series = { empresa: months.map(mk), personal: months.map(mk), todas: months.map(mk) };
  const idx = {}; months.forEach((m, i) => idx[m] = i);
  const year = String(new Date().getFullYear()), thisYm = currentYM();
  const z = () => ({ ing: 0, egr: 0, ret: 0 });
  const ytd = { empresa: z(), personal: z(), todas: z() }, cur = { empresa: z(), personal: z(), todas: z() };
  let pendingIn = 0, pendingInN = 0, oldestPending = 0, pendingOut = 0;
  L.forEach(m => {
    const net = Number(m.net) || 0, ym = ymOf(m.date);
    if (m.category === 'transferencia') return; // movimiento entre tus cuentas: ni ingreso ni gasto
    if (m.status === 'pendiente') {
      if (m.type === 'ingreso') { pendingIn += net; pendingInN++; oldestPending = Math.max(oldestPending, daysSince(m.date)); } else pendingOut += net;
      return;
    }
    const entries = m.category === 'salario_ceo' ? [{ acc: 'empresa', type: 'egreso' }, { acc: 'personal', type: 'ingreso' }] : [{ acc: m.account, type: m.type }, { acc: 'todas', type: m.type }];
    entries.forEach(e => {
      const f = e.type === 'ingreso' ? 'ing' : 'egr';
      if (idx[ym] != null) series[e.acc][idx[ym]][f] += net;
      if (ym.slice(0, 4) === year) { ytd[e.acc][f] += net; if (e.type === 'ingreso') ytd[e.acc].ret += Number(m.withholding) || 0; }
      if (ym === thisYm) cur[e.acc][f] += net;
    });
  });
  return { months, labels: months.map(ymShort), series, ytd, cur, pendingIn, pendingInN, oldestPending, pendingOut, count: L.length };
}

/* ========================================================= CUENTAS DE COBRO (equipo) */
function ccFind(pid, ym) { return (S.cuentasCobro || []).find(c => c.personId === pid && c.ym === ym) || null; }
function ccGet(pid, ym) {
  let c = ccFind(pid, ym);
  if (!c) { const t = S.team.find(x => x.id === pid); c = { id: uid(), personId: pid, ym, amount: t ? Number(t.pay) || 0 : 0, status: 'pendiente', receivedAt: null, paidAt: null, docCuentaId: null, docPilaId: null, docPagoId: null, notes: '' }; S.cuentasCobro.push(c); }
  return c;
}
function ccIsPaid(pid, ym) { const mm = S.payments && S.payments.months && S.payments.months[ym]; return !!(mm && mm.paid && mm.paid['team:' + pid]); }
function ccStatus(pid, ym) {
  if (ccIsPaid(pid, ym)) return 'pagada';
  const c = ccFind(pid, ym);
  if (c && c.status === 'pagada') return 'pagada';
  if (c && (c.status === 'recibida' || c.docCuentaId || c.receivedAt)) return 'recibida';
  return 'pendiente';
}
function ccMarkPaid(pid, ym) {
  const c = ccGet(pid, ym);
  if (ccIsPaid(pid, ym)) return;
  const key = 'team:' + pid;
  const it = paymentItemsFor(S, ym).find(x => x.key === key);
  if (it) {
    togglePayment(ym, key);
    const p = S.payments.months[ym] && S.payments.months[ym].paid[key];
    if (p && Math.abs((Number(c.amount) || 0) - p.amount) > 0.5) { // respetar el monto de la cuenta de cobro
      const diff = (Number(c.amount) || 0) - p.amount;
      if (p.applied) applyPayEffect('empresa', diff, +1);
      p.amount = Number(c.amount) || 0;
      const lm = S.ledger.find(m => m.source === 'pago' && m.refKey === ym + '|' + key); if (lm) { lm.gross = lm.net = p.amount; }
    }
  } else { // persona inactiva o fuera de nómina: registrar directo en el libro
    const t = S.team.find(x => x.id === pid);
    ledgerAdd({ date: ymOf(localISO()) === ym ? localISO() : ym + '-15', type: 'egreso', account: 'empresa', category: 'nomina', party: t ? t.name : '', concept: 'Cuenta de cobro · ' + ymLabel(ym), gross: c.amount, withholding: 0, net: c.amount, status: 'hecho', source: 'equipo', refKey: 'cc|' + c.id });
  }
  c.status = 'pagada'; c.paidAt = c.paidAt || localISO();
}
function ccUnpay(pid, ym) {
  const c = ccGet(pid, ym);
  if (ccIsPaid(pid, ym)) togglePayment(ym, 'team:' + pid);
  const m = S.ledger.find(x => x.refKey === 'cc|' + c.id); if (m) ledgerRemove(m.id);
  c.status = (c.docCuentaId || c.receivedAt) ? 'recibida' : 'pendiente'; c.paidAt = null;
}
function ccSyncFromPayment(ym, key, on) {
  if (key.indexOf('team:') !== 0) return;
  const pid = key.slice(5); if (!S.team.some(t => t.id === pid)) return;
  const c = ccGet(pid, ym);
  if (on) { c.status = 'pagada'; c.paidAt = c.paidAt || localISO(); }
  else { c.status = (c.docCuentaId || c.receivedAt) ? 'recibida' : 'pendiente'; c.paidAt = null; }
}

/* ========================================================= SEGURIDAD SOCIAL (PILA) */
function pilaFind(ym) { return (S.pila || []).find(p => p.ym === ym) || null; }
function pilaGet(ym) { let p = pilaFind(ym); if (!p) { p = { id: uid(), ym, planilla: '', salud: 0, pension: 0, arl: 0, ccf: 0, total: 0, paidAt: null, account: 'empresa', docId: null, docPagoId: null, notes: '' }; S.pila.push(p); } return p; }
function pilaSyncLedger(p) {
  const refKey = 'pila|' + p.id;
  const m = S.ledger.find(x => x.refKey === refKey);
  const total = Number(p.total) || 0;
  const concept = 'Seguridad social · ' + ymLabel(p.ym) + (p.planilla ? ' · planilla ' + p.planilla : '');
  if (!p.paidAt || total <= 0) { if (m) ledgerRemove(m.id); return; }
  if (!m) { ledgerAdd({ date: p.paidAt, type: 'egreso', account: p.account || 'empresa', category: 'seguridad_social', party: 'PILA', concept, gross: total, withholding: 0, net: total, status: 'hecho', source: 'pila', refKey }); return; }
  ledgerUpdate(m, { date: p.paidAt, account: p.account || 'empresa', gross: total, withholding: 0, net: total, concept });
}

/* ========================================================= RENTA */
const RENTA_DOCS = [
  { key: 'cert_ingresos_220', label: 'Certificado de ingresos y retenciones (Form. 220)', source: 'Empleador' },
  { key: 'cert_ret_clientes', label: 'Certificados de retención en la fuente por honorarios', source: 'Cada cliente que retuvo' },
  { key: 'cuentas_cobro', label: 'Cuentas de cobro / facturas emitidas en el año', source: 'Este tablero · Movimientos' },
  { key: 'cert_bancarios', label: 'Certificados tributarios bancarios (saldos 31 dic, GMF, rendimientos, retenciones)', source: 'Cada banco' },
  { key: 'cert_deudas', label: 'Certificados de deudas a 31 de diciembre (créditos, tarjetas, créditos educativos)', source: 'Bancos / entidades' },
  { key: 'cert_ss', label: 'Certificado de aportes a salud y pensión del año (PILA)', source: 'Operador PILA / EPS / fondo' },
  { key: 'pagos_contratistas', label: 'Soportes de pagos a contratistas (cuentas de cobro + planillas)', source: 'Este tablero · Equipo' },
  { key: 'cert_voluntarios', label: 'Aportes voluntarios AFC / pensiones voluntarias', source: 'Fondo / banco', optional: true },
  { key: 'cert_prepagada', label: 'Medicina prepagada / seguros de salud pagados', source: 'Aseguradora', optional: true },
  { key: 'cert_intereses_vivienda', label: 'Intereses de crédito de vivienda', source: 'Banco', optional: true },
  { key: 'dependientes', label: 'Soporte de dependientes económicos', source: 'Propio', optional: true },
  { key: 'cert_inversiones', label: 'Certificados de inversiones (broker, fondos, cripto) a 31 dic', source: 'Broker / fondo' },
  { key: 'patrimonio', label: 'Soportes de patrimonio (vehículo, inmuebles, avalúos)', source: 'Propio', optional: true },
  { key: 'facturas_electronicas', label: 'Facturas electrónicas de compras del año (deducción)', source: 'DIAN · factura electrónica', optional: true },
  { key: 'exogena', label: 'Información exógena reportada por terceros', source: 'DIAN · portal' },
  { key: 'rut', label: 'RUT actualizado', source: 'DIAN' },
  { key: 'renta_anterior', label: 'Declaración del año anterior', source: 'DIAN / este tablero' },
];
const RENTA_FIGS = [
  ['grossWork', 'Ingresos brutos rentas de trabajo (32)'], ['grossFees', 'Ingresos brutos honorarios (43)'], ['grossCapital', 'Rentas de capital (58)'],
  ['taxableIncome', 'Renta líquida gravable (111)'], ['netTax', 'Impuesto neto de renta (126)'], ['withholdings', 'Retenciones del año (132)'],
  ['prevAdvance', 'Anticipo del año anterior (130)'], ['nextAdvance', 'Anticipo para el año siguiente (133)'], ['balanceDue', 'Saldo a pagar (136)'], ['balanceFavor', 'Saldo a favor (137)'],
  ['patrimonyGross', 'Patrimonio bruto (29)'], ['debts', 'Deudas (30)'],
];
function rentaDefaults() { return { status: 'en_curso', deadline: '', deadlineEstimated: true, deadlineNote: '', filedAt: '', form: '', figures: {}, docs: RENTA_DOCS.map(d => ({ key: d.key, status: 'pendiente', docId: null, note: '' })), declarationDocId: null, notes: '' }; }
function rentaEnsure(year) {
  year = String(year);
  if (!S.renta || typeof S.renta !== 'object') S.renta = { years: {} };
  if (!S.renta.years) S.renta.years = {};
  let ry = S.renta.years[year];
  if (!ry || typeof ry !== 'object') { ry = rentaDefaults(); S.renta.years[year] = ry; }
  if (!Array.isArray(ry.docs)) ry.docs = [];
  RENTA_DOCS.forEach(d => { if (!ry.docs.some(x => x.key === d.key)) ry.docs.push({ key: d.key, status: 'pendiente', docId: null, note: '' }); });
  if (!ry.figures || typeof ry.figures !== 'object') ry.figures = {};
  return ry;
}
function rentaOpenYear() {
  const ys = Object.keys(S.renta.years || {});
  const open = ys.filter(y => S.renta.years[y].status !== 'presentada').sort();
  return open.length ? open[open.length - 1] : String(new Date().getFullYear());
}
function rentaFromLedger(year) {
  const L = (S.ledger || []).filter(m => m.status === 'hecho' && (m.date || '').slice(0, 4) === String(year));
  const byClient = {}; let ret = 0, grossIn = 0;
  L.filter(m => m.type === 'ingreso' && m.account === 'empresa' && m.category !== 'capital').forEach(m => {
    const k = m.party || catLabel(m.category); byClient[k] = byClient[k] || { gross: 0, ret: 0, net: 0 };
    byClient[k].gross += m.gross; byClient[k].ret += m.withholding; byClient[k].net += m.net; ret += m.withholding; grossIn += m.gross;
  });
  const by = cat => sum(L.filter(m => m.type === 'egreso' && m.category === cat).map(m => m.net));
  return { byClient, ret, grossIn, contractors: by('nomina'), pila: by('seguridad_social'), tools: by('herramientas'), suppliers: by('proveedores') + by('otro_egreso'), taxes: by('impuestos') };
}

/* ========================================================= ALERTAS */
const ALERT_TYPES = {
  fecha:        { label: 'Fecha límite', desc: 'Avisa N días antes de una fecha (única, mensual o anual).' },
  umbral:       { label: 'Umbral de una métrica', desc: 'Avisa cuando una métrica del tablero cruza un valor.' },
  pila:         { label: 'PILA del mes', desc: 'Avisa si al llegar el día indicado no hay planilla pagada del mes.' },
  cuentas:      { label: 'Cuentas de cobro del equipo', desc: 'Avisa si al día indicado falta la cuenta de cobro del mes anterior de alguien del equipo.' },
  pagos:        { label: 'Pagos del mes pendientes', desc: 'Avisa si al día indicado quedan pagos sin marcar.' },
  cobros:       { label: 'Cobros a clientes sin pagar', desc: 'Avisa cuando un ingreso pendiente supera N días.' },
  renta:        { label: 'Documentos de renta', desc: 'Avisa si faltan documentos del año gravable abierto a N días del límite.' },
  renta_limite: { label: 'Vencimiento de la renta', desc: 'Usa la fecha límite del año gravable abierto (pestaña Renta).' },
};
const ALERT_METRICS = {
  cajaEmpresa: { label: 'Caja empresa (COP)', fmt: 'cop' }, ahorros: { label: 'Cuenta personal (COP)', fmt: 'cop' },
  reservaMeses: { label: 'Reserva de caja (meses de operación)', fmt: 'months' }, runway: { label: 'Runway personal (meses)', fmt: 'months' },
  margen: { label: 'Margen operativo recurrente (%)', fmt: 'pctn' }, resultadoMes: { label: 'Resultado real del mes · empresa (COP)', fmt: 'cop' },
};
function defaultAlertRules() {
  const ny = new Date().getFullYear() + 1;
  return [
    { id: 'r-renta-limite', type: 'renta_limite', name: 'Vence la declaración de renta', active: true, severity: 'crit', daysBefore: 45, go: 'renta' },
    { id: 'r-renta-docs', type: 'renta', name: 'Documentos de renta pendientes', active: true, severity: 'warn', daysBefore: 120, go: 'renta' },
    { id: 'r-renta-inicio', type: 'fecha', name: 'Empezar a recoger certificados de renta', active: true, severity: 'info', date: ny + '-03-01', repeat: 'anual', daysBefore: 0, graceDays: 25, go: 'renta', note: 'Certificado de ingresos y retenciones, certificados bancarios y de clientes del año anterior.' },
    { id: 'r-pila', type: 'pila', name: 'PILA del mes sin registrar', active: true, severity: 'crit', dayOfMonth: 8, go: 'pila' },
    { id: 'r-cuentas', type: 'cuentas', name: 'Cuentas de cobro del equipo sin recibir', active: true, severity: 'warn', dayOfMonth: 3, go: 'equipo' },
    { id: 'r-pagos', type: 'pagos', name: 'Pagos del mes pendientes', active: true, severity: 'warn', dayOfMonth: 5, go: 'pagos' },
    { id: 'r-reserva', type: 'umbral', name: 'Caja de la empresa bajo la reserva', active: true, severity: 'warn', metric: 'reservaMeses', op: '<', value: 3, go: 'empresa' },
    { id: 'r-ahorros', type: 'umbral', name: 'Cuenta personal en negativo', active: true, severity: 'crit', metric: 'ahorros', op: '<', value: 0, go: 'personal' },
    { id: 'r-cobros', type: 'cobros', name: 'Cobros a clientes sin pagar', active: true, severity: 'warn', days: 30, go: 'movimientos' },
  ];
}
function metricValue(metric, d) {
  switch (metric) {
    case 'cajaEmpresa': return d.cajaEmpresa;
    case 'ahorros': return d.ahorros;
    case 'reservaMeses': return d.opex ? d.cajaEmpresa / d.opex : 0;
    case 'runway': return d.deficit > 0 ? d.runwayMonths : 999;
    case 'margen': return d.margen * 100;
    case 'resultadoMes': return d.ledger ? d.ledger.cur.empresa.ing - d.ledger.cur.empresa.egr : 0;
    default: return 0;
  }
}
function metricFmt(metric, v) {
  const f = (ALERT_METRICS[metric] || {}).fmt;
  return f === 'cop' ? fmtCOP(v) : f === 'months' ? fmtMonths(v) : f === 'pctn' ? (Math.round(v * 10) / 10) + '%' : String(v);
}
function sevRank(s) { return s === 'crit' ? 3 : s === 'warn' ? 2 : 1; }
function evalAlerts(s, d) {
  const out = []; const rules = (s.alerts && s.alerts.rules) || [];
  const today = localISO(), ym = currentYM(), day = new Date().getDate();
  const push = a => out.push(Object.assign({ sev: 'warn', go: 'alertas' }, a));
  rules.forEach(r => {
    if (!r || r.active === false) return;
    const sev = r.severity || 'warn';
    try {
      switch (r.type) {
        case 'fecha': {
          let date = r.date; if (!date) return;
          if (r.repeat === 'anual') { const y = new Date().getFullYear(); let c = y + date.slice(4); if (daysUntil(c) < -(Number(r.graceDays) || 0)) c = (y + 1) + date.slice(4); date = c; }
          else if (r.repeat === 'mensual') { const dd = date.slice(8); let c = ym + '-' + dd; if (daysUntil(c) < -(Number(r.graceDays) || 0)) c = addMonths(ym, 1) + '-' + dd; date = c; }
          const du = daysUntil(date);
          if (du <= (Number(r.daysBefore) || 0) && du >= -(Number(r.graceDays) || 7)) push({ key: r.id + '|' + date, ruleId: r.id, sev: du <= 3 ? (sev === 'info' ? 'warn' : sev) : sev, title: r.name, detail: (du < 0 ? `Venció hace ${-du} día${-du === 1 ? '' : 's'} (${fmtDate(date)})` : du === 0 ? 'Es hoy' : `Faltan ${du} día${du === 1 ? '' : 's'} · ${fmtDate(date)}`) + (r.note ? ' · ' + r.note : ''), go: r.go || 'alertas' });
          break; }
        case 'renta_limite': {
          const y = rentaOpenYear(); const ry = s.renta.years[y]; if (!ry || !ry.deadline) return;
          const du = daysUntil(ry.deadline);
          if (du <= (Number(r.daysBefore) || 0) && du >= -30) push({ key: r.id + '|' + ry.deadline, ruleId: r.id, sev: du <= 7 ? 'crit' : sev, title: `${r.name} · año gravable ${y}`, detail: (du < 0 ? `Venció hace ${-du} días` : du === 0 ? 'Vence hoy' : `Faltan ${du} días · ${fmtDate(ry.deadline)}`) + (ry.deadlineEstimated ? ' · fecha estimada, confirmala con el calendario DIAN' : ''), go: 'renta' });
          break; }
        case 'renta': {
          const y = rentaOpenYear(); const ry = s.renta.years[y]; if (!ry) return;
          const pend = ry.docs.filter(x => x.status === 'pendiente' && !(RENTA_DOCS.find(k => k.key === x.key) || {}).optional);
          if (!pend.length) return;
          const du = ry.deadline ? daysUntil(ry.deadline) : null;
          if (du != null && du > (Number(r.daysBefore) || 0)) return;
          push({ key: r.id + '|' + y + '|' + ym, ruleId: r.id, sev, title: `Faltan ${pend.length} documentos de renta · año gravable ${y}`, detail: pend.slice(0, 3).map(x => (RENTA_DOCS.find(k => k.key === x.key) || {}).label).join(' · ') + (pend.length > 3 ? ' …' : ''), go: 'renta' });
          break; }
        case 'umbral': {
          const v = metricValue(r.metric, d); const val = Number(r.value) || 0;
          const hit = r.op === '>' ? v > val : v < val;
          if (hit) push({ key: r.id + '|' + today, ruleId: r.id, sev, title: r.name, detail: `${(ALERT_METRICS[r.metric] || {}).label || r.metric}: ${metricFmt(r.metric, v)} (umbral ${r.op} ${metricFmt(r.metric, val)})`, go: r.go || 'alertas' });
          break; }
        case 'pila': {
          if (day < (Number(r.dayOfMonth) || 1)) return;
          const p = pilaFind(ym); if (p && p.paidAt) return;
          push({ key: r.id + '|' + ym, ruleId: r.id, sev, title: `PILA de ${ymLabel(ym)} sin registrar`, detail: `Pasó el día ${r.dayOfMonth} y no hay planilla pagada este mes. Registrala en Seguridad social.`, go: 'pila' });
          break; }
        case 'cuentas': {
          if (day < (Number(r.dayOfMonth) || 1)) return;
          const prev = addMonths(ym, -1);
          const missing = s.team.filter(t => t.active !== false && t.kind !== 'empleado').filter(t => ccStatus(t.id, prev) === 'pendiente').map(t => t.name);
          if (missing.length) push({ key: r.id + '|' + prev, ruleId: r.id, sev, title: `Cuentas de cobro de ${ymLabel(prev)} sin recibir`, detail: missing.join(', ') + ' · pediles la cuenta de cobro y la planilla de seguridad social.', go: 'equipo' });
          break; }
        case 'pagos': {
          if (day < (Number(r.dayOfMonth) || 1)) return;
          const pend = paymentItemsFor(s, ym).filter(i => !i.paid);
          if (pend.length) push({ key: r.id + '|' + ym, ruleId: r.id, sev, title: `${pend.length} pagos de ${ymLabel(ym)} pendientes`, detail: `Faltan ${fmtCOP(sum(pend.map(p => p.amount)))} por pagar.`, go: 'pagos' });
          break; }
        case 'cobros': {
          const lim = Number(r.days) || 30;
          const pend = (s.ledger || []).filter(m => m.type === 'ingreso' && m.status === 'pendiente' && daysSince(m.date) > lim);
          if (pend.length) push({ key: r.id + '|' + ym, ruleId: r.id, sev, title: `${pend.length} cobro${pend.length > 1 ? 's' : ''} con más de ${lim} días`, detail: pend.slice(0, 3).map(m => `${m.party || m.concept} · ${fmtShort(m.net)} · ${daysSince(m.date)} días`).join(' · '), go: 'movimientos' });
          break; }
      }
    } catch (e) { console.warn('alert rule', r && r.id, e); }
  });
  return out.sort((a, b) => sevRank(b.sev) - sevRank(a.sev));
}
function activeAlerts() {
  const all = (D && D.alerts) || []; const dis = (S.alerts && S.alerts.dismissed) || {}; const today = localISO();
  return all.filter(a => !(dis[a.key] && dis[a.key] >= today));
}
function updateAlertBadge() {
  const b = $('#alertBadge'); if (!b) return;
  const act = activeAlerts();
  b.hidden = !act.length; b.textContent = act.length;
  const top = act.length ? act[0].sev : 'info';
  b.className = 'nbadge ' + (top === 'crit' ? '' : top);
}
function alertCard(a, compact) {
  const icon = a.sev === 'crit' ? 'alert' : a.sev === 'warn' ? 'bell' : 'info';
  return `<div class="alert-card ${a.sev}">
    <span class="ai">${ico(icon)}</span>
    <div><div class="at">${esc(a.title)}</div><div class="ad">${esc(a.detail || '')}</div></div>
    <div class="aa">
      <button class="btn btn--primary btn--xs" data-go="${esc(a.go)}">Ir</button>
      ${compact ? '' : `<button class="btn btn--ghost btn--xs" data-act="alert:snooze" data-key="${esc(a.key)}" data-p="1" title="Silenciar hasta mañana">Mañana</button>
      <button class="btn btn--ghost btn--xs" data-act="alert:snooze" data-key="${esc(a.key)}" data-p="7">7 días</button>
      <button class="btn btn--ghost btn--xs" data-act="alert:snooze" data-key="${esc(a.key)}" data-p="mes">Este mes</button>`}
    </div></div>`;
}
function alertStripHTML() {
  const act = activeAlerts(); if (!act.length) return '';
  return `<div class="alert-strip">${act.slice(0, 3).map(a => alertCard(a, true)).join('')}
    ${act.length > 3 ? `<button class="btn btn--ghost btn--sm" data-go="alertas" style="align-self:flex-start">Ver las ${act.length} alertas →</button>` : ''}</div>`;
}
// Avisos del navegador (opcional): solo alertas críticas nuevas
function notifyCritical() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const seen = JSON.parse(localStorage.getItem('nola_notified_v1') || '{}'); const today = localISO(); let changed = false;
    activeAlerts().filter(a => a.sev === 'crit').forEach(a => {
      const k = a.key + '|' + today; if (seen[k]) return; seen[k] = 1; changed = true;
      new Notification('Tablero Nola · ' + a.title, { body: a.detail || '', silent: true });
    });
    if (changed) { Object.keys(seen).forEach(k => { if (k.slice(-10) < addDaysISO(today, -14)) delete seen[k]; }); localStorage.setItem('nola_notified_v1', JSON.stringify(seen)); }
  } catch (e) { /* mejor esfuerzo */ }
}

/* ========================================================= GRÁFICA COMBINADA (barras agrupadas + línea) */
function comboChart(el, { labels, bars, line = null, fmt = fmtShort, h = 260 }) {
  const W = 760, H = h, mL = 56, mR = 16, mT = 16, mB = 30;
  const all = bars.flatMap(b => b.data).concat(line ? line.data : []).filter(v => v != null && isFinite(v));
  let lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const pad = (hi - lo) * 0.1; hi += pad; if (lo < 0) lo -= pad;
  const n = labels.length, gw = (W - mL - mR) / n, bw = gw * 0.62 / Math.max(1, bars.length);
  const X = i => mL + gw * (i + 0.5);
  const Y = v => mT + (H - mT - mB) * (1 - (v - lo) / (hi - lo));
  let grid = '';
  for (let t = 0; t <= 4; t++) { const val = lo + (hi - lo) * t / 4, y = Y(val); grid += `<line class="grid-line" x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}"/><text class="axis-label" x="${mL - 8}" y="${y + 3}" text-anchor="end">${fmt(val)}</text>`; }
  if (lo < 0) { const z = Y(0); grid += `<line class="zero-line" x1="${mL}" y1="${z}" x2="${W - mR}" y2="${z}"/>`; }
  let rects = '';
  bars.forEach((b, bi) => b.data.forEach((v, i) => {
    const x = X(i) - (bars.length * bw) / 2 + bi * bw;
    const y = Y(Math.max(v, 0)), hgt = Math.abs(Y(v) - Y(0));
    rects += `<rect x="${x + 1}" y="${y}" width="${Math.max(2, bw - 2)}" height="${Math.max(1, hgt)}" rx="3" fill="${b.color}" data-i="${i}" style="--i:${i}"/>`;
  }));
  let lp = '';
  if (line) { const pts = line.data.map((v, i) => `${X(i)},${Y(v)}`); lp = `<polyline points="${pts.join(' ')}" pathLength="1" fill="none" stroke="${line.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` + line.data.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="2.8" fill="${line.color}"/>`).join(''); }
  let xlab = ''; const step = Math.ceil(n / 12);
  labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) xlab += `<text class="axis-label" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  let bands = ''; for (let i = 0; i < n; i++) bands += `<rect x="${X(i) - gw / 2}" y="${mT}" width="${gw}" height="${H - mT - mB}" fill="transparent" data-b="${i}"/>`;
  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${grid}${rects}${lp}${xlab}<g class="bands">${bands}</g></svg></div>`;
  el.querySelectorAll('.bands rect').forEach(r => {
    r.addEventListener('mousemove', ev => {
      const i = +r.dataset.b;
      const rows = bars.concat(line ? [line] : []).map(s => `<div class="tt-row"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px"></span>${esc(s.name)}</span><b>${fmt(s.data[i])}</b></div>`).join('');
      showTip(`<div class="tt-h">${esc(labels[i])}</div>${rows}`, ev.clientX, ev.clientY);
    });
    r.addEventListener('mouseleave', hideTip);
  });
}

/* ========================================================= VISTA: MOVIMIENTOS */
let mvAcc = 'empresa', mvYear = String(new Date().getFullYear()), mvType = 'todos', mvFormOpen = false, mvOpenId = null;
let mvDraft = null;
function mvNewDraft() { return { date: localISO(), type: 'ingreso', account: 'empresa', category: 'cliente', party: '', concept: '', gross: '', withholding: '', net: '', status: 'hecho', notes: '' }; }
const ACC_LABEL = { empresa: 'Cuenta empresa', personal: 'Cuenta personal', todas: 'Ambas cuentas' };
function mvCatOptions(type, sel) { return Object.keys(LEDGER_CATS).filter(k => LEDGER_CATS[k].type === type || LEDGER_CATS[k].type === 'auto').map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(LEDGER_CATS[k].label)}</option>`).join(''); }
function personalSpendBySubcat(year, acc) {
  const out = {};
  (S.ledger || []).filter(m => m.status === 'hecho' && m.type === 'egreso' && (acc === 'todas' || m.account === acc) && (m.date || '').slice(0, 4) === String(year) && ['gasto_personal', 'deuda', 'bancario'].includes(m.category)).forEach(m => {
    const k = m.category === 'deuda' ? 'deuda' : m.category === 'bancario' ? 'bancario' : (m.subcat || 'otros');
    out[k] = (out[k] || 0) + (Number(m.net) || 0);
  });
  return out;
}
function renderMovimientos() {
  const s = S, d = D, el = $('#view-movimientos');
  const st = d.ledger || ledgerStats(s);
  const ym = currentYM(), year = String(new Date().getFullYear());
  const cur = st.cur[mvAcc] || st.cur.empresa, y = st.ytd[mvAcc] || st.ytd.empresa;
  const margin = y.ing ? (y.ing - y.egr) / y.ing : 0;
  const net = cur.ing - cur.egr;
  const years = [...new Set((s.ledger || []).map(m => (m.date || '').slice(0, 4)).filter(Boolean).concat([year]))].sort().reverse();
  const rows = (s.ledger || []).filter(m => (m.date || '').slice(0, 4) === mvYear)
    .filter(m => mvAcc === 'todas' || m.account === mvAcc || m.category === 'salario_ceo')
    .filter(m => mvType === 'todos' || (mvType === 'pendientes' ? m.status === 'pendiente' : m.type === mvType))
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const acc = mvAcc === 'todas' ? 'todas' : mvAcc;
  const ledgerGross2026 = {}; (s.ledger || []).filter(m => m.status === 'hecho' && m.type === 'ingreso' && m.account === 'empresa' && m.category !== 'capital' && (m.date || '').slice(0, 4) === '2026').forEach(m => { const i = +m.date.slice(5, 7) - 1; ledgerGross2026[i] = (ledgerGross2026[i] || 0) + m.gross; });

  el.innerHTML = head('05', 'Movimientos', 'El libro real de ingresos y egresos de tus dos cuentas. Cada cobro, cada pago y cada comprobante en un solo lugar; de acá salen la rentabilidad real del negocio y los soportes de tu declaración de renta.', {
    label: `Resultado real · ${ymLabel(ym)} · ${ACC_LABEL[mvAcc]}`, value: net, fmt: 'cop', cls: net < 0 ? 'neg' : '',
    sub: `Ingresos ${fmtCOP(cur.ing)} − egresos ${fmtCOP(cur.egr)} en lo que va del mes${st.pendingIn ? ` · ${fmtCOP(st.pendingIn)} por cobrar` : ''}`,
    side: [
      { label: `Ingresos ${year}`, value: y.ing, fmt: 'short', cls: 'pos' },
      { label: `Egresos ${year}`, value: y.egr, fmt: 'short', cls: 'neg' },
      { label: `Rentabilidad ${year}`, value: margin, fmt: 'pct', cls: margin >= 0 ? 'pos' : 'neg', sub: y.ing ? `${fmtShort(y.ing - y.egr)} de resultado` : 'sin ingresos registrados' },
      { label: 'Por cobrar', value: st.pendingIn, fmt: 'short', sub: st.pendingInN ? `${st.pendingInN} pendiente${st.pendingInN > 1 ? 's' : ''} · el más viejo ${st.oldestPending} días` : 'nada pendiente' },
    ],
  }) + `
  <div class="toolbar">
    <div class="left">
      <div class="seg" id="mvAccSeg">${['empresa', 'personal', 'todas'].map(k => `<button class="${mvAcc === k ? 'on' : ''}" data-act="mv:acc" data-p="${k}">${k === 'todas' ? 'Ambas' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <select data-act="mv:year">${years.map(yy => `<option value="${yy}" ${yy === mvYear ? 'selected' : ''}>${yy}</option>`).join('')}</select>
      <div class="seg">${[['todos', 'Todos'], ['ingreso', 'Ingresos'], ['egreso', 'Egresos'], ['pendientes', 'Pendientes']].map(([k, l]) => `<button class="${mvType === k ? 'on' : ''}" data-act="mv:type" data-p="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="right"><button class="btn btn--ghost" data-act="bk:pick" title="Subí el extracto XLSX del banco: se clasifica solo y concilia el saldo">${ico('download')} Importar extracto</button><button class="btn btn--signature" data-act="mv:form">${ico('plus')} Registrar movimiento</button></div>
  </div>

  ${typeof bankPanelHTML === 'function' ? bankPanelHTML() : ''}
  ${mvFormOpen && !bankImp ? mvFormHTML() : ''}

  <div class="grid g-12">
    <div class="card pad-lg">
      <div class="card-h"><h3>Ingresos vs. egresos · últimos 12 meses</h3><span class="eyebrow">${esc(ACC_LABEL[mvAcc])}</span></div>
      <div id="chart-mv"></div>
      <div class="legend"><div class="li"><span class="sw" style="background:#2D7D6F"></span>Ingresos</div><div class="li"><span class="sw" style="background:#B85C38"></span>Egresos</div><div class="li"><span class="sw" style="background:#004643"></span>Resultado</div></div>
      <p class="card-note">Solo movimientos hechos (no pendientes). El salario CEO aparece como egreso de la empresa e ingreso personal; en "Ambas" no se cuenta, porque es una transferencia entre tus cuentas.</p>
    </div>
    <div class="card">
      <div class="card-h"><h3>Rentabilidad ${year}</h3><span class="eyebrow">${esc(ACC_LABEL[mvAcc])}</span></div>
      <div class="stat-row" style="flex-direction:column">
        <div class="mini-stat"><div class="l">Ingresos netos recibidos</div><div class="v pos">${fmtCOP(y.ing)}</div></div>
        <div class="mini-stat"><div class="l">Egresos pagados</div><div class="v neg">${fmtCOP(y.egr)}</div></div>
        <div class="mini-stat"><div class="l">Resultado</div><div class="v ${y.ing - y.egr >= 0 ? 'pos' : 'neg'}">${fmtCOP(y.ing - y.egr)}</div></div>
        <div class="mini-stat"><div class="l">Margen real</div><div class="v ${margin >= 0 ? 'pos' : 'neg'}">${fmtPct(margin)}</div></div>
        ${mvAcc !== 'personal' ? `<div class="mini-stat"><div class="l">Retenciones que te practicaron</div><div class="v">${fmtCOP(st.ytd.empresa.ret)}</div></div>` : ''}
      </div>
      <p class="card-note">La rentabilidad real compara lo que efectivamente entró contra lo que efectivamente salió; el P&amp;L de <b>Empresa</b> es el recurrente teórico.</p>
    </div>
  </div>

  ${(() => { const sp = personalSpendBySubcat(mvYear, mvAcc); const keys = Object.keys(sp).sort((a, b) => sp[b] - sp[a]); if (!keys.length) return ''; const tot = sum(Object.values(sp)); const SC = (typeof BANK_SUBCATS !== 'undefined') ? BANK_SUBCATS : {}; return `<div class="card mt-16"><div class="card-h"><h3>¿En qué se va la plata? · ${mvYear} (real, del extracto)</h3><span class="eyebrow">${fmtShort(tot)} en gastos personales y deuda</span></div>
    <div class="grid g-12"><div id="chart-spend"></div><div><table class="tbl"><thead><tr><th>Detalle</th><th class="r">Total</th><th class="r">%</th></tr></thead><tbody>${keys.map(k => `<tr><td>${esc(SC[k] || k)}</td><td class="r tabnum">${fmtCOP(sp[k])}</td><td class="r tabnum">${fmtPct(sp[k] / tot)}</td></tr>`).join('')}</tbody></table></div></div></div>`; })()}
  ${typeof bankRulesHTML === 'function' ? bankRulesHTML() : ''}

  <div class="card mt-16">
    <div class="card-h"><h3>${rows.length} movimiento${rows.length === 1 ? '' : 's'} · ${mvYear}</h3>
      <div class="flex gap-8 wrap">${Object.keys(ledgerGross2026).length ? `<button class="btn btn--ghost btn--sm" data-act="mv:sync-billing" title="Copia los ingresos brutos de la empresa por mes a 'Facturación 2026 real' de Datos · Editar">Actualizar facturación 2026 con el libro</button>` : ''}
      <button class="btn btn--ghost btn--sm" data-act="mv:csv">${ico('download')} CSV</button></div></div>
    ${rows.length ? `<div class="tscroll"><table class="tbl"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Categoría</th><th>Cuenta</th><th class="r">Neto</th><th>Estado</th><th></th></tr></thead><tbody>
      ${rows.map(m => mvRowHTML(m)).join('')}</tbody></table></div>`
      : `<div class="empty"><b>Sin movimientos ${mvType !== 'todos' ? 'con ese filtro ' : ''}en ${mvYear}</b>Registrá el primero con el botón de arriba. Los pagos que marcás en <b>Pagos del mes</b> y las planillas de <b>Seguridad social</b> también aparecen acá solos.</div>`}
  </div>`;

  const spEl = $('#chart-spend');
  if (spEl) { const sp = personalSpendBySubcat(mvYear, mvAcc); const SC = (typeof BANK_SUBCATS !== 'undefined') ? BANK_SUBCATS : {}; const pal = ['#004643', '#2D7D6F', '#7ED3B2', '#B85C38', '#C88166', '#A9E2CB', '#0A3625', '#DCEFE7', '#CB6E4A', '#6B7280', '#9CA3AF', '#D1D5DB', '#4B5563', '#E5E7EB']; const keys = Object.keys(sp).sort((a, b) => sp[b] - sp[a]); donut(spEl, { segments: keys.map((k, i) => ({ label: SC[k] || k, value: sp[k], color: pal[i % pal.length] })), centerTop: fmtShort(sum(Object.values(sp))), centerBot: mvYear }); }
  const ser = st.series[acc];
  comboChart($('#chart-mv'), { labels: st.labels, bars: [{ name: 'Ingresos', color: '#2D7D6F', data: ser.map(x => x.ing) }, { name: 'Egresos', color: '#B85C38', data: ser.map(x => x.egr) }], line: { name: 'Resultado', color: '#004643', data: ser.map(x => x.ing - x.egr) }, h: 280 });
}
function mvRowHTML(m) {
  const inc = m.type === 'ingreso';
  const open = mvOpenId === m.id;
  const chip = m.status === 'pendiente' ? `<span class="chip chip--info click" data-act="mv:status" data-p="${m.id}|hecho" title="Marcar como ${inc ? 'recibido' : 'pagado'}"><span class="cdot"></span>Pendiente</span>` : `<span class="chip chip--ok click" data-act="mv:status" data-p="${m.id}|pendiente" title="Volver a pendiente"><span class="cdot"></span>${inc ? 'Recibido' : 'Pagado'}</span>`;
  const src = m.source === 'pago' ? 'Pagos del mes' : m.source === 'pila' ? 'Seguridad social' : m.source === 'equipo' ? 'Equipo' : m.source === 'banco' ? 'Extracto del banco' + (m.bankAcct ? ' ···' + m.bankAcct : '') : 'manual';
  const SCn = (typeof BANK_SUBCATS !== 'undefined' && m.subcat && BANK_SUBCATS[m.subcat]) ? `<span class="subcat">${esc(BANK_SUBCATS[m.subcat])}</span>` : '';
  const main = `<tr class="mv-row exp ${m.status === 'pendiente' ? 'pend' : ''}" data-act="mv:open" data-p="${m.id}">
    <td class="nowrap">${fmtDate(m.date)}</td>
    <td><span class="party">${esc(m.party || catLabel(m.category))}</span><span class="concept">${esc(m.concept || '')}${m.withholding ? ` · bruto ${fmtShort(m.gross)} − ret. ${fmtShort(m.withholding)}` : ''}</span></td>
    <td><span class="cat">${esc(catLabel(m.category))}</span>${SCn}</td>
    <td>${m.account === 'personal' ? 'Personal' : 'Empresa'}</td>
    <td class="r amt"><span class="${m.category === 'transferencia' ? '' : inc ? 'in' : 'out'}">${inc ? '+' : '−'}${fmtCOP(Math.abs(m.net))}</span></td>
    <td>${chip}</td>
    <td class="nowrap">${m.docId ? `<button class="iconbtn soft" data-act="doc:open" data-p="${m.docId}" title="Ver comprobante">${ico('paperclip')}</button>` : ''}<button class="iconbtn" data-act="mv:del" data-p="${m.id}" title="Eliminar">${ico('trash')}</button></td></tr>`;
  if (!open) return main;
  return main + `<tr class="detail"><td colspan="7">
    <div class="form-grid">
      <div class="field-inline"><label>Fecha</label><input type="date" value="${esc(m.date)}" data-mvf="${m.id}|date"></div>
      <div class="field-inline"><label>Contraparte</label><input type="text" value="${esc(m.party)}" data-mvf="${m.id}|party"></div>
      <div class="field-inline span-2"><label>Concepto</label><input type="text" value="${esc(m.concept)}" data-mvf="${m.id}|concept"></div>
      <div class="field-inline"><label>Bruto</label><input type="number" value="${m.gross}" data-mvf="${m.id}|gross" ${m.source === 'pago' ? 'disabled' : ''}></div>
      <div class="field-inline"><label>Retención</label><input type="number" value="${m.withholding}" data-mvf="${m.id}|withholding" ${m.source === 'pago' ? 'disabled' : ''}></div>
      <div class="field-inline"><label>Neto</label><input type="number" value="${m.net}" data-mvf="${m.id}|net" ${m.source === 'pago' ? 'disabled' : ''}></div>
      <div class="field-inline"><label>Categoría</label><select data-mvf="${m.id}|category">${mvCatOptions(m.type, m.category)}</select></div>
      <div class="field-inline span-2"><label>Notas</label><input type="text" value="${esc(m.notes || '')}" data-mvf="${m.id}|notes" placeholder="Nº de factura, referencia, observación…"></div>
      <div class="span-2">${docSlot('Comprobante (factura, cuenta de cobro, soporte)', m.docId, { t: 'ledger', id: m.id, module: 'movimientos', year: m.date.slice(0, 4) })}</div>
    </div>
    <p class="hint">Origen: ${src}${m.source === 'pago' ? ' — el monto se edita desmarcando el pago en Pagos del mes.' : ''} · Los cambios de monto ajustan el saldo de la cuenta si el movimiento ya está ${inc ? 'recibido' : 'pagado'}.</p>
  </td></tr>`;
}
function mvFormHTML() {
  const f = mvDraft || (mvDraft = mvNewDraft());
  return `<div class="card warm mb-16" id="mvForm"><div class="card-h"><h3>Registrar movimiento</h3><button class="iconbtn" data-act="mv:form" title="Cerrar">${ico('x')}</button></div>
    <div class="form-grid">
      <div class="field-inline"><label>Fecha</label><input type="date" value="${esc(f.date)}" data-mvd="date"></div>
      <div class="field-inline"><label>Tipo</label><select data-mvd="type"><option value="ingreso" ${f.type === 'ingreso' ? 'selected' : ''}>Ingreso</option><option value="egreso" ${f.type === 'egreso' ? 'selected' : ''}>Egreso</option></select></div>
      <div class="field-inline"><label>Cuenta</label><select data-mvd="account"><option value="empresa" ${f.account === 'empresa' ? 'selected' : ''}>Empresa</option><option value="personal" ${f.account === 'personal' ? 'selected' : ''}>Personal</option></select></div>
      <div class="field-inline"><label>Categoría</label><select data-mvd="category" id="mvCat">${mvCatOptions(f.type, f.category)}</select></div>
      <div class="field-inline span-2"><label>${f.type === 'ingreso' ? 'Cliente / quien paga' : 'Proveedor / a quién se paga'}</label><input type="text" value="${esc(f.party)}" data-mvd="party" placeholder="Nombre"></div>
      <div class="field-inline span-2"><label>Concepto</label><input type="text" value="${esc(f.concept)}" data-mvd="concept" placeholder="Qué es este movimiento"></div>
      <div class="field-inline"><label>Bruto</label><input type="number" value="${esc(f.gross)}" data-mvd="gross" placeholder="0"></div>
      <div class="field-inline"><label>Retención (si te retuvieron)</label><input type="number" value="${esc(f.withholding)}" data-mvd="withholding" placeholder="0"></div>
      <div class="field-inline"><label>Neto (lo que entra/sale)</label><input type="number" value="${esc(f.net)}" data-mvd="net" id="mvNet" placeholder="bruto − retención"></div>
      <div class="field-inline"><label>Estado</label><select data-mvd="status"><option value="hecho" ${f.status === 'hecho' ? 'selected' : ''}>${f.type === 'ingreso' ? 'Ya recibido' : 'Ya pagado'}</option><option value="pendiente" ${f.status === 'pendiente' ? 'selected' : ''}>Pendiente</option></select></div>
      <div class="field-inline span-all"><label>Notas</label><input type="text" value="${esc(f.notes)}" data-mvd="notes" placeholder="Nº de factura, referencia, observación (opcional)"></div>
    </div>
    <div class="form-actions"><button class="btn btn--primary" data-act="mv:save">Guardar movimiento</button><button class="btn btn--ghost" data-act="mv:form">Cancelar</button><span class="hint" style="margin:0">Si está "ya recibido/pagado", el neto se suma o resta de inmediato al saldo de la cuenta elegida.</span></div>
  </div>`;
}
function mvExportCSV() {
  const rows = (S.ledger || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = ['fecha,tipo,cuenta,categoria,contraparte,concepto,bruto,retencion,neto,estado,origen,notas'].concat(rows.map(m => [m.date, m.type, m.account, catLabel(m.category), m.party, m.concept, m.gross, m.withholding, m.net, m.status, m.source, m.notes].map(q).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'nola-movimientos-' + localISO() + '.csv'; a.click();
}

/* ========================================================= VISTA: EQUIPO (cuentas de cobro) */
let eqOpen = null; // { pid, ym }
function renderEquipo() {
  const s = S, el = $('#view-equipo');
  const active = s.team.filter(t => t.active !== false), inactive = s.team.filter(t => t.active === false);
  const ym = currentYM(), prev = addMonths(ym, -1), year = String(new Date().getFullYear());
  const months = lastNMonths(6);
  const pendingPrev = active.filter(t => ccStatus(t.id, prev) === 'pendiente').length;
  const paidYTD = sum((s.ledger || []).filter(m => m.status === 'hecho' && m.category === 'nomina' && (m.date || '').slice(0, 4) === year).map(m => m.net));
  const all = (s.cuentasCobro || []).slice().sort((a, b) => b.ym.localeCompare(a.ym));

  el.innerHTML = head('06', 'Equipo', 'Cada persona con sus cuentas de cobro y planillas de seguridad social por mes. Marcar una cuenta como pagada la registra en <b>Pagos del mes</b> y en el libro de <b>Movimientos</b>; los soportes quedan listos para la declaración de renta.', {
    label: 'Nómina mensual del equipo activo', value: sum(active.map(t => Number(t.pay) || 0)), fmt: 'cop',
    sub: `${active.length} persona${active.length === 1 ? '' : 's'} activa${active.length === 1 ? '' : 's'}${inactive.length ? ` · ${inactive.length} en historial` : ''} · factor prestacional ${s.global.factorPrestacional}`,
    side: [
      { label: `Pagado al equipo en ${year}`, value: paidYTD, fmt: 'short' },
      { label: `Cuentas de ${ymShort(prev)} sin recibir`, value: pendingPrev, fmt: 'int', cls: pendingPrev ? 'neg' : 'pos', sub: pendingPrev ? 'pedí cuenta de cobro + planilla' : 'todo recibido' },
      { label: 'Soportes cargados', value: all.filter(c => c.docCuentaId).length, fmt: 'int', sub: `de ${all.length} cuentas registradas` },
    ],
  }) + `
  <div class="grid g-2">${active.map(t => personCard(t, months, ym)).join('') || '<div class="card"><div class="empty"><b>Sin equipo activo</b>Agregá personas en Datos · Editar.</div></div>'}</div>
  <div class="flex gap-12 wrap mt-16"><button class="btn btn--ghost" data-go="editor">${ico('plus')} Agregar o editar personas</button></div>

  ${inactive.length ? `<div class="eyebrow" style="margin:26px 0 12px">Historial · personas que ya no están</div>
  <div class="grid g-2">${inactive.map(t => personCard(t, months, ym, true)).join('')}</div>` : ''}

  <div class="card mt-24"><div class="card-h"><h3>Todas las cuentas de cobro</h3><span class="eyebrow">${all.length} registros</span></div>
    ${all.length ? `<div class="tscroll"><table class="tbl"><thead><tr><th>Mes</th><th>Persona</th><th class="r">Monto</th><th>Cuenta de cobro</th><th>Planilla SS</th><th>Estado</th><th>Pago</th></tr></thead><tbody>
    ${all.map(c => { const t = s.team.find(x => x.id === c.personId) || { name: '—' }; const st = ccStatus(c.personId, c.ym); return `<tr class="exp" data-act="cc:open" data-p="${c.personId}|${c.ym}"><td>${esc(ymLabel(c.ym))}</td><td>${esc(t.name)}</td><td class="r tabnum">${fmtCOP(c.amount)}</td><td>${c.docCuentaId ? `<span class="chip chip--ok"><span class="cdot"></span>Cargada</span>` : '<span class="chip chip--neutral"><span class="cdot"></span>Falta</span>'}</td><td>${c.docPilaId ? `<span class="chip chip--ok"><span class="cdot"></span>Cargada</span>` : '<span class="chip chip--neutral"><span class="cdot"></span>Falta</span>'}</td><td>${ccChip(st)}</td><td>${c.paidAt ? fmtDate(c.paidAt) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="hint">Todavía no hay cuentas registradas. Hacé clic en un mes de una persona para empezar.</p>'}
  </div>`;
}
function ccChip(st) { return st === 'pagada' ? '<span class="chip chip--ok"><span class="cdot"></span>Pagada</span>' : st === 'recibida' ? '<span class="chip chip--info"><span class="cdot"></span>Recibida</span>' : '<span class="chip chip--neutral"><span class="cdot"></span>Pendiente</span>'; }
function personCard(t, months, ym, off) {
  const open = eqOpen && eqOpen.pid === t.id ? eqOpen.ym : null;
  const strip = months.map(m => {
    const st = ccStatus(t.id, m); const recent = m < ym && m >= addMonths(ym, -2); const due = st === 'pendiente' && recent;
    const lab = st === 'pagada' ? 'Pagada' : st === 'recibida' ? 'Recibida' : m === ym ? 'En curso' : recent ? 'Falta' : 'Sin registro';
    return `<button class="mchip ${st} ${due ? 'due' : ''} ${open === m ? 'open' : ''}" data-act="cc:open" data-p="${t.id}|${m}"><span class="ml">${ymShort(m)}</span><span class="ms">${lab}</span></button>`;
  }).join('');
  return `<article class="card person ${off ? 'off' : ''}">
    <div class="person-h"><div class="avatar">${esc(initials(t.name))}</div>
      <div><div class="pn">${esc(t.name)}</div><div class="pr">${esc(t.role || '')} · ${t.kind === 'empleado' ? 'empleado' : 'contratista'}${t.doc ? ' · ' + esc(t.doc) : ''}${off ? ' · inactivo' : ''}</div></div>
      <div class="pay">${fmtShort(t.pay)}<small>por mes</small></div></div>
    <div class="mstrip">${strip}</div>
    ${open ? ccDetailHTML(t, open) : ''}
    ${off ? `<div class="flex gap-8 mt-16"><button class="btn btn--ghost btn--sm" data-act="team:reactivate" data-p="${t.id}">Reactivar</button></div>` : ''}
  </article>`;
}
function ccDetailHTML(t, ym) {
  const c = ccGet(t.id, ym); const st = ccStatus(t.id, ym); const paid = st === 'pagada';
  const isCur = ym === currentYM();
  return `<div class="cc-detail">
    <div class="flex between center wrap gap-8 mb-8"><b>${esc(t.name)} · ${esc(ymLabel(ym))}</b>${ccChip(st)}</div>
    <div class="form-grid">
      <div class="field-inline"><label>Monto de la cuenta</label><input type="number" value="${c.amount}" data-ccf="${c.id}|amount" ${paid ? 'disabled' : ''}></div>
      <div class="field-inline"><label>Recibida el</label><input type="date" value="${esc(c.receivedAt || '')}" data-ccf="${c.id}|receivedAt"></div>
      <div class="field-inline"><label>Pagada el</label><input type="date" value="${esc(c.paidAt || '')}" data-ccf="${c.id}|paidAt" ${paid ? '' : 'disabled'}></div>
      ${docSlot('Cuenta de cobro', c.docCuentaId, { t: 'cc', id: c.id, f: 'docCuentaId', module: 'equipo', year: ym.slice(0, 4) })}
      ${docSlot('Planilla seguridad social', c.docPilaId, { t: 'cc', id: c.id, f: 'docPilaId', module: 'equipo', year: ym.slice(0, 4) })}
      ${docSlot('Comprobante de pago', c.docPagoId, { t: 'cc', id: c.id, f: 'docPagoId', module: 'equipo', year: ym.slice(0, 4) })}
      <div class="field-inline span-all"><label>Notas</label><input type="text" value="${esc(c.notes || '')}" data-ccf="${c.id}|notes" placeholder="Observaciones (ej. pago parcial, saldo pendiente)"></div>
    </div>
    <div class="form-actions">
      ${paid ? `<button class="btn btn--ghost btn--sm" data-act="cc:unpay" data-p="${t.id}|${ym}">Quitar el pago</button>` : `<button class="btn btn--primary btn--sm" data-act="cc:pay" data-p="${t.id}|${ym}">${ico('check')} Marcar pagada</button>`}
      ${!paid && st === 'pendiente' ? `<button class="btn btn--ghost btn--sm" data-act="cc:received" data-p="${t.id}|${ym}">Marcar recibida</button>` : ''}
      <button class="btn btn--ghost btn--sm" data-act="cc:close">Cerrar</button>
      <span class="hint" style="margin:0">${isCur ? 'Marcar pagada descuenta el monto de la caja de la empresa y lo registra en Pagos del mes.' : 'Mes distinto al actual: pagar solo registra el historial, no toca los saldos de hoy.'}</span>
    </div></div>`;
}

/* ========================================================= VISTA: SEGURIDAD SOCIAL */
let pilaYear = String(new Date().getFullYear()), pilaOpen = null;
function renderPila() {
  const s = S, el = $('#view-pila');
  const ym = currentYM();
  const months = monthsOfYear(pilaYear);
  const rows = months.map(m => ({ ym: m, p: pilaFind(m) }));
  const paid = rows.filter(r => r.p && r.p.paidAt);
  const total = sum(paid.map(r => Number(r.p.total) || 0));
  const years = [...new Set((s.pila || []).map(p => p.ym.slice(0, 4)).concat([String(new Date().getFullYear())]))].sort().reverse();
  const cur = pilaFind(ym);
  const rule = (s.alerts.rules || []).find(r => r.type === 'pila' && r.active !== false);

  el.innerHTML = head('07', 'Seguridad social', 'Tus planillas PILA (salud, pensión, ARL, caja) mes a mes, con el comprobante adjunto. Cada planilla pagada entra al libro de <b>Movimientos</b> y suma al certificado de aportes que necesitás para la renta.', {
    label: `Aportes pagados en ${pilaYear}`, value: total, fmt: 'cop',
    sub: `${paid.length} de 12 meses con planilla pagada${paid.length ? ` · promedio ${fmtCOP(total / paid.length)} por mes` : ''}`,
    side: [
      { label: `${ymLabel(ym)}`, value: cur && cur.paidAt ? Number(cur.total) || 0 : 0, fmt: 'short', cls: cur && cur.paidAt ? 'pos' : 'neg', sub: cur && cur.paidAt ? 'pagada el ' + fmtDate(cur.paidAt) : rule ? `sin registrar · alarma el día ${rule.dayOfMonth}` : 'sin registrar' },
      { label: 'Planillas adjuntas', value: paid.filter(r => r.p.docId).length, fmt: 'int', sub: `de ${paid.length} pagadas` },
    ],
  }) + `
  <div class="toolbar"><div class="left"><select data-act="pila:year">${years.map(y => `<option value="${y}" ${y === pilaYear ? 'selected' : ''}>${y}</option>`).join('')}</select><span class="hint" style="margin:0">Hacé clic en un mes para registrar o editar la planilla.</span></div>
    <div class="right"><button class="btn btn--signature btn--sm" data-act="pila:open" data-p="${ym}">${ico('plus')} Registrar ${ymShort(ym)}</button></div></div>
  ${pilaOpen ? pilaFormHTML(pilaOpen) : ''}
  <div class="mgrid">${rows.map(r => {
    const p = r.p; const isPaid = p && p.paidAt; const future = r.ym > ym; const due = !isPaid && !future && r.ym < ym;
    return `<button class="mcard ${isPaid ? 'paid' : due ? 'due' : ''} ${future ? 'future' : ''} ${pilaOpen === r.ym ? 'open' : ''}" data-act="pila:open" data-p="${r.ym}">
      <div class="mm">${CAL_MESES[+r.ym.slice(5) - 1]} ${r.ym.slice(0, 4)}</div>
      <div class="mv">${isPaid ? fmtShort(p.total) : future ? '·' : '—'}</div>
      <div class="md">${isPaid ? 'pagada ' + fmtDate(p.paidAt) : future ? 'próximo' : due ? 'sin registrar' : 'en curso'}${p && p.docId ? ' · adjunta' : ''}</div></button>`; }).join('')}</div>

  <div class="grid g-12 mt-16">
    <div class="card pad-lg"><div class="card-h"><h3>Aportes por mes · ${pilaYear}</h3><span class="eyebrow">PILA</span></div><div id="chart-pila"></div></div>
    <div class="card"><div class="card-h"><h3>Resumen ${pilaYear}</h3></div>
      <dl class="kv">
        <dt>Salud</dt><dd>${fmtCOP(sum(paid.map(r => Number(r.p.salud) || 0)))}</dd>
        <dt>Pensión</dt><dd>${fmtCOP(sum(paid.map(r => Number(r.p.pension) || 0)))}</dd>
        <dt>ARL</dt><dd>${fmtCOP(sum(paid.map(r => Number(r.p.arl) || 0)))}</dd>
        <dt>Caja de compensación</dt><dd>${fmtCOP(sum(paid.map(r => Number(r.p.ccf) || 0)))}</dd>
        <dt>Total pagado</dt><dd>${fmtCOP(total)}</dd>
      </dl>
      <p class="card-note">Las planillas de <b>tu equipo</b> (contratistas) se adjuntan en cada cuenta de cobro, en la pestaña Equipo. Acá van las tuyas.</p>
    </div>
  </div>`;
  barChart($('#chart-pila'), { labels: months.map(m => CAL_MESES[+m.slice(5) - 1]), values: rows.map(r => r.p && r.p.paidAt ? Number(r.p.total) || 0 : 0), color: '#2D7D6F', fmt: fmtShort, h: 220 });
}
function pilaFormHTML(ym) {
  const p = pilaGet(ym);
  return `<div class="card warm mb-16"><div class="card-h"><h3>Planilla · ${esc(ymLabel(ym))}</h3><button class="iconbtn" data-act="pila:close" title="Cerrar">${ico('x')}</button></div>
    <div class="form-grid">
      <div class="field-inline"><label>Nº de planilla</label><input type="text" value="${esc(p.planilla || '')}" data-pf="${p.id}|planilla" placeholder="Número del operador"></div>
      <div class="field-inline"><label>Salud</label><input type="number" value="${p.salud || ''}" data-pf="${p.id}|salud" placeholder="0"></div>
      <div class="field-inline"><label>Pensión</label><input type="number" value="${p.pension || ''}" data-pf="${p.id}|pension" placeholder="0"></div>
      <div class="field-inline"><label>ARL</label><input type="number" value="${p.arl || ''}" data-pf="${p.id}|arl" placeholder="0"></div>
      <div class="field-inline"><label>Caja de compensación</label><input type="number" value="${p.ccf || ''}" data-pf="${p.id}|ccf" placeholder="0"></div>
      <div class="field-inline"><label>Total pagado</label><input type="number" value="${p.total || ''}" data-pf="${p.id}|total" id="pilaTotal" placeholder="suma automática"></div>
      <div class="field-inline"><label>Fecha de pago</label><input type="date" value="${esc(p.paidAt || '')}" data-pf="${p.id}|paidAt"></div>
      <div class="field-inline"><label>Se pagó desde</label><select data-pf="${p.id}|account"><option value="empresa" ${p.account !== 'personal' ? 'selected' : ''}>Cuenta empresa</option><option value="personal" ${p.account === 'personal' ? 'selected' : ''}>Cuenta personal</option></select></div>
      ${docSlot('Planilla (PDF)', p.docId, { t: 'pila', id: p.id, f: 'docId', module: 'pila', year: ym.slice(0, 4) })}
      ${docSlot('Comprobante de pago', p.docPagoId, { t: 'pila', id: p.id, f: 'docPagoId', module: 'pila', year: ym.slice(0, 4) })}
      <div class="field-inline span-2"><label>Notas</label><input type="text" value="${esc(p.notes || '')}" data-pf="${p.id}|notes" placeholder="IBC, novedades, observaciones"></div>
    </div>
    <div class="form-actions"><button class="btn btn--primary" data-act="pila:save" data-p="${p.id}">Guardar planilla</button>${p.paidAt ? `<button class="btn btn--danger btn--sm" data-act="pila:del" data-p="${p.id}">Eliminar</button>` : ''}<span class="hint" style="margin:0">Con fecha de pago y total, la planilla entra al libro de Movimientos y descuenta del saldo de la cuenta elegida.</span></div>
  </div>`;
}

/* ========================================================= VISTA: RENTA */
let rentaYearSel = null;
function renderRenta() {
  const s = S, el = $('#view-renta');
  const years = Object.keys(s.renta.years).sort().reverse();
  if (!rentaYearSel || !s.renta.years[rentaYearSel]) rentaYearSel = rentaOpenYear();
  const y = rentaYearSel; const ry = rentaEnsure(y); const f = ry.figures;
  const filed = ry.status === 'presentada';
  const docsReq = ry.docs.filter(x => !(RENTA_DOCS.find(k => k.key === x.key) || {}).optional);
  const done = ry.docs.filter(x => x.status !== 'pendiente').length, doneReq = docsReq.filter(x => x.status !== 'pendiente').length;
  const du = ry.deadline ? daysUntil(ry.deadline) : null;
  const L = rentaFromLedger(y);
  const fig = filed
    ? { label: `Año gravable ${y} · ${Number(f.balanceFavor) > 0 ? 'saldo a favor' : 'saldo a pagar'}`, value: Number(f.balanceFavor) > 0 ? Number(f.balanceFavor) : Number(f.balanceDue) || 0, fmt: 'cop', sub: `Presentada ${ry.filedAt ? 'el ' + fmtDate(ry.filedAt) : ''}${ry.form ? ' · formulario ' + ry.form : ''} · impuesto neto ${fmtCOP(f.netTax)} · retenciones ${fmtCOP(f.withholdings)}`,
        side: [{ label: 'Ingresos brutos declarados', value: (Number(f.grossWork) || 0) + (Number(f.grossFees) || 0) + (Number(f.grossCapital) || 0), fmt: 'short' }, { label: 'Renta líquida gravable', value: Number(f.taxableIncome) || 0, fmt: 'short' }, { label: 'Documentos archivados', value: done, fmt: 'int', sub: `de ${ry.docs.length}` }] }
    : { label: `Año gravable ${y} · ingresos brutos acumulados (libro)`, value: L.grossIn, fmt: 'cop', sub: `Retenciones que te practicaron ${fmtCOP(L.ret)} · pagos a contratistas ${fmtCOP(L.contractors)} · seguridad social ${fmtCOP(L.pila)}`,
        side: [{ label: 'Documentos listos', value: doneReq, fmt: 'int', sub: `de ${docsReq.length} obligatorios` }, { label: du == null ? 'Fecha límite' : du >= 0 ? 'Días para el límite' : 'Días de vencida', value: du == null ? 0 : Math.abs(du), fmt: 'int', cls: du != null && du < 30 ? 'neg' : '', sub: ry.deadline ? fmtDate(ry.deadline) + (ry.deadlineEstimated ? ' · estimada' : '') : 'sin definir' }] };

  el.innerHTML = head('08', 'Renta', 'Todo lo que necesitás para la declaración de renta de cada año gravable en Colombia: la lista de documentos con su soporte adjunto, la fecha límite con alarma, y lo que este tablero ya te resuelve solo (ingresos, retenciones, pagos a contratistas, seguridad social).', fig) + `
  <div class="ystrip mb-16">${years.map(yy => { const r = s.renta.years[yy]; return `<button class="ytab ${yy === y ? 'on' : ''}" data-act="renta:year" data-p="${yy}">${yy}<small>${r.status === 'presentada' ? 'presentada' : 'en curso'}</small></button>`; }).join('')}
    <button class="btn btn--ghost btn--sm" data-act="renta:add-year">${ico('plus')} Año</button></div>

  <div class="grid g-3">
    <div class="card"><div class="card-h"><h3>Estado</h3><span class="eyebrow">AG ${y}</span></div>
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="field-inline"><label>Estado</label><select data-rf="${y}|status"><option value="en_curso" ${!filed ? 'selected' : ''}>En curso · recogiendo documentos</option><option value="presentada" ${filed ? 'selected' : ''}>Presentada</option></select></div>
        <div class="field-inline"><label>Fecha límite de presentación</label><input type="date" value="${esc(ry.deadline || '')}" data-rf="${y}|deadline"></div>
        <label class="toggle" style="margin-top:2px"><input type="checkbox" data-rfb="${y}|deadlineEstimated" ${ry.deadlineEstimated ? 'checked' : ''}><span class="tr"></span><span class="tl">Fecha estimada (confirmar con el calendario DIAN)</span></label>
        <div class="field-inline"><label>Nota</label><input type="text" value="${esc(ry.deadlineNote || '')}" data-rf="${y}|deadlineNote" placeholder="Ej. según los dos últimos dígitos del NIT"></div>
      </div>
      ${ry.deadline ? `<div class="mt-16"><div class="countdown ${du < 30 ? 'warn' : ''}">${du >= 0 ? du : 0}<span style="font-size:18px"> días</span></div><div class="hint">${du >= 0 ? 'para el ' + fmtDate(ry.deadline) : 'venció el ' + fmtDate(ry.deadline)} · la alarma "Vence la declaración de renta" usa esta fecha.</div></div>` : '<p class="hint mt-8">Definí la fecha límite para activar la cuenta regresiva y la alarma.</p>'}
    </div>

    <div class="card span-2"><div class="card-h"><h3>Declaración presentada · formulario 210</h3>${docSlot('', ry.declarationDocId, { t: 'renta-decl', year: y, module: 'renta' })}</div>
      <div class="form-grid">
        <div class="field-inline"><label>Nº de formulario</label><input type="text" value="${esc(ry.form || '')}" data-rf="${y}|form"></div>
        <div class="field-inline"><label>Fecha de presentación</label><input type="date" value="${esc(ry.filedAt || '')}" data-rf="${y}|filedAt"></div>
        ${RENTA_FIGS.map(([k, l]) => `<div class="field-inline"><label>${esc(l)}</label><input type="number" value="${f[k] != null && f[k] !== '' ? f[k] : ''}" data-rff="${y}|${k}" placeholder="0"></div>`).join('')}
      </div>
      <p class="hint">Los números entre paréntesis son las casillas del formulario 210. Guardá acá el PDF firmado: es el primer documento que te van a pedir el año siguiente.</p>
    </div>
  </div>

  <div class="card mt-16"><div class="card-h"><h3>Documentos para la declaración</h3><span class="chip ${doneReq === docsReq.length ? 'chip--ok' : 'chip--info'}"><span class="cdot"></span>${doneReq} de ${docsReq.length} obligatorios · ${done} de ${ry.docs.length} en total</span></div>
    <div class="progress mb-16"><div style="width:${docsReq.length ? Math.round(doneReq / docsReq.length * 100) : 0}%"></div></div>
    ${ry.docs.map(x => { const k = RENTA_DOCS.find(q => q.key === x.key) || { label: x.key, source: '' }; const doneRow = x.status !== 'pendiente';
      return `<div class="check-row ${doneRow ? 'done' : ''}">
        <button class="pay-check ${x.status === 'obtenido' ? 'on' : ''}" data-act="renta:doc-toggle" data-p="${y}|${x.key}" aria-label="Marcar obtenido">✓</button>
        <div><div class="cn">${esc(k.label)}${k.optional ? ' <span class="cat">opcional</span>' : ''}</div><div class="cs">Lo emite: ${esc(k.source)}${x.note ? ' · ' + esc(x.note) : ''}</div></div>
        <select data-rds="${y}|${x.key}"><option value="pendiente" ${x.status === 'pendiente' ? 'selected' : ''}>Pendiente</option><option value="obtenido" ${x.status === 'obtenido' ? 'selected' : ''}>Obtenido</option><option value="na" ${x.status === 'na' ? 'selected' : ''}>No aplica</option></select>
        ${docSlot('', x.docId, { t: 'renta-doc', year: y, key: x.key, module: 'renta' })}
      </div>`; }).join('')}
  </div>

  <div class="card mt-16"><div class="card-h"><h3>Lo que el tablero ya te resuelve para AG ${y}</h3><span class="eyebrow">Del libro de movimientos</span></div>
    <div class="grid g-2">
      <div><table class="tbl"><thead><tr><th>Cliente / origen</th><th class="r">Bruto</th><th class="r">Retención</th><th class="r">Neto</th></tr></thead><tbody>
        ${Object.keys(L.byClient).length ? Object.keys(L.byClient).map(k => `<tr><td>${esc(k)}</td><td class="r tabnum">${fmtCOP(L.byClient[k].gross)}</td><td class="r tabnum">${fmtCOP(L.byClient[k].ret)}</td><td class="r tabnum">${fmtCOP(L.byClient[k].net)}</td></tr>`).join('') + `<tr class="total"><td>Total ingresos empresa</td><td class="r tabnum">${fmtCOP(L.grossIn)}</td><td class="r tabnum">${fmtCOP(L.ret)}</td><td class="r tabnum">${fmtCOP(L.grossIn - L.ret)}</td></tr>` : '<tr><td colspan="4" class="muted">Sin ingresos registrados en el libro para este año.</td></tr>'}
      </tbody></table></div>
      <div><dl class="kv">
        <dt>Pagos a contratistas (costos)</dt><dd>${fmtCOP(L.contractors)}</dd>
        <dt>Seguridad social pagada</dt><dd>${fmtCOP(L.pila)}</dd>
        <dt>Herramientas y licencias</dt><dd>${fmtCOP(L.tools)}</dd>
        <dt>Proveedores y otros</dt><dd>${fmtCOP(L.suppliers)}</dd>
        <dt>Impuestos pagados</dt><dd>${fmtCOP(L.taxes)}</dd>
      </dl>
      <div class="flex gap-8 wrap mt-16"><button class="btn btn--ghost btn--sm" data-act="mv:csv">${ico('download')} Exportar libro (CSV)</button><button class="btn btn--ghost btn--sm" data-go="movimientos">Ver movimientos →</button></div>
      <p class="hint">Cifras del libro (movimientos hechos). Son insumo para tu contador, no reemplazan los certificados oficiales.</p></div>
    </div>
  </div>`;
}

/* ========================================================= VISTA: ALERTAS */
let ruleEdit = null;
function renderAlertas() {
  const s = S, el = $('#view-alertas');
  const act = activeAlerts(); const all = (D.alerts || []);
  const rules = s.alerts.rules || [];
  const crit = act.filter(a => a.sev === 'crit').length;
  const notif = ('Notification' in window) ? Notification.permission : 'unsupported';

  el.innerHTML = head('09', 'Alertas', 'Las alarmas del tablero, todas parametrizables: fechas límite (renta, contratos), umbrales de caja o runway, la PILA del mes, las cuentas de cobro del equipo, los pagos pendientes y los cobros que se están demorando.', {
    label: 'Alertas activas hoy', value: act.length, fmt: 'int', cls: crit ? 'neg' : '',
    sub: crit ? `${crit} crítica${crit > 1 ? 's' : ''} · ${act.length - crit} de aviso` : act.length ? 'ninguna crítica' : 'todo en orden',
    side: [{ label: 'Reglas activas', value: rules.filter(r => r.active !== false).length, fmt: 'int', sub: `de ${rules.length}` }, { label: 'Silenciadas', value: all.length - act.length, fmt: 'int', sub: 'vuelven solas al vencer el silencio' }],
  }) + `
  <div class="grid g-12">
    <div>
      <div class="eyebrow mb-8">Ahora</div>
      ${act.length ? `<div class="alert-strip">${act.map(a => alertCard(a, false)).join('')}</div>` : `<div class="card"><div class="empty"><b>Sin alertas activas</b>Cuando una regla se cumpla, aparece acá y en la campana del dock.</div></div>`}
    </div>
    <div class="card"><div class="card-h"><h3>Avisos del navegador</h3></div>
      <p class="card-note" style="margin-top:0">Además de la campana, el tablero puede mostrar una notificación del sistema cuando aparece una alerta crítica (al abrir el tablero).</p>
      <div class="mt-16">${notif === 'granted' ? '<span class="chip chip--ok"><span class="cdot"></span>Activados en este navegador</span>' : notif === 'denied' ? '<span class="chip chip--warn"><span class="cdot"></span>Bloqueados en este navegador</span>' : notif === 'unsupported' ? '<span class="chip chip--neutral"><span class="cdot"></span>No disponible acá</span>' : `<button class="btn btn--primary btn--sm" data-act="alert:notif">Activar avisos</button>`}</div>
    </div>
  </div>

  <div class="card mt-24"><div class="card-h"><h3>Reglas</h3><div class="flex gap-8 wrap"><select id="newRuleType" style="width:auto">${Object.keys(ALERT_TYPES).map(k => `<option value="${k}">${esc(ALERT_TYPES[k].label)}</option>`).join('')}</select><button class="btn btn--signature btn--sm" data-act="rule:add">${ico('plus')} Nueva regla</button></div></div>
    ${rules.map(r => ruleRowHTML(r)).join('') || '<p class="hint">Sin reglas. Agregá una arriba.</p>'}
  </div>`;
}
function ruleDesc(r) {
  switch (r.type) {
    case 'fecha': return `${r.date ? fmtDate(r.date) : 'sin fecha'} · ${r.repeat === 'anual' ? 'cada año' : r.repeat === 'mensual' ? 'cada mes' : 'una vez'} · avisa ${Number(r.daysBefore) || 0} días antes`;
    case 'umbral': return `${(ALERT_METRICS[r.metric] || {}).label || r.metric} ${r.op} ${metricFmt(r.metric, Number(r.value) || 0)}`;
    case 'pila': case 'cuentas': case 'pagos': return `revisa desde el día ${r.dayOfMonth} de cada mes`;
    case 'cobros': return `ingresos pendientes con más de ${r.days} días`;
    case 'renta': return `si faltan documentos a ${r.daysBefore} días del límite del año gravable abierto`;
    case 'renta_limite': return `avisa ${r.daysBefore} días antes de la fecha límite definida en Renta`;
    default: return '';
  }
}
function ruleRowHTML(r) {
  const editing = ruleEdit === r.id;
  return `<div class="rule-row ${r.active === false ? 'off' : ''}">
    <label class="toggle" title="Activar / desactivar"><input type="checkbox" data-act="rule:toggle" data-p="${r.id}" ${r.active !== false ? 'checked' : ''}><span class="tr"></span></label>
    <div><div class="rn"><span class="sev ${r.severity || 'warn'}"></span> ${esc(r.name)}</div><div class="rd">${esc(ALERT_TYPES[r.type] ? ALERT_TYPES[r.type].label : r.type)} · ${esc(ruleDesc(r))}</div></div>
    <div class="flex gap-8"><button class="btn btn--ghost btn--xs" data-act="rule:edit" data-p="${r.id}">${editing ? 'Cerrar' : 'Editar'}</button><button class="iconbtn" data-act="rule:del" data-p="${r.id}" title="Eliminar">${ico('trash')}</button></div>
    ${editing ? ruleEditHTML(r) : ''}
  </div>`;
}
function ruleEditHTML(r) {
  const F = (label, inner) => `<div class="field-inline"><label>${esc(label)}</label>${inner}</div>`;
  const sel = (f, opts, val) => `<select data-rule="${r.id}|${f}">${opts.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const inp = (f, type, val, extra = '') => `<input type="${type}" value="${esc(val == null ? '' : val)}" data-rule="${r.id}|${f}" ${extra}>`;
  let specific = '';
  switch (r.type) {
    case 'fecha': specific = F('Fecha', inp('date', 'date', r.date)) + F('Repetir', sel('repeat', [['none', 'Una vez'], ['mensual', 'Cada mes'], ['anual', 'Cada año']], r.repeat || 'none')) + F('Avisar (días antes)', inp('daysBefore', 'number', r.daysBefore, 'min="0"')) + F('Mantener (días después)', inp('graceDays', 'number', r.graceDays == null ? 7 : r.graceDays, 'min="0"')) + F('Nota', inp('note', 'text', r.note)); break;
    case 'umbral': specific = F('Métrica', sel('metric', Object.keys(ALERT_METRICS).map(k => [k, ALERT_METRICS[k].label]), r.metric)) + F('Condición', sel('op', [['<', 'menor que'], ['>', 'mayor que']], r.op || '<')) + F('Valor', inp('value', 'number', r.value)); break;
    case 'pila': case 'cuentas': case 'pagos': specific = F('Revisar desde el día', inp('dayOfMonth', 'number', r.dayOfMonth, 'min="1" max="28"')); break;
    case 'cobros': specific = F('Días de mora', inp('days', 'number', r.days, 'min="1"')); break;
    case 'renta': case 'renta_limite': specific = F('Avisar (días antes del límite)', inp('daysBefore', 'number', r.daysBefore, 'min="0"')); break;
  }
  return `<div class="rule-edit"><div class="form-grid">
    ${F('Nombre', inp('name', 'text', r.name))}
    ${F('Severidad', sel('severity', [['info', 'Aviso'], ['warn', 'Atención'], ['crit', 'Crítica']], r.severity || 'warn'))}
    ${F('Al hacer clic en "Ir"', sel('go', [['resumen', 'Resumen'], ['empresa', 'Empresa'], ['personal', 'Personal'], ['pagos', 'Pagos'], ['movimientos', 'Movimientos'], ['equipo', 'Equipo'], ['pila', 'Seguridad social'], ['renta', 'Renta'], ['alertas', 'Alertas']], r.go || 'alertas'))}
    ${specific}
  </div><p class="hint">${esc(ALERT_TYPES[r.type] ? ALERT_TYPES[r.type].desc : '')} Los cambios se guardan solos.</p></div>`;
}
function ruleNew(type) {
  const base = { id: uid(), type, name: ALERT_TYPES[type] ? ALERT_TYPES[type].label : 'Nueva regla', active: true, severity: 'warn', go: 'alertas' };
  const extra = { fecha: { date: addDaysISO(localISO(), 30), repeat: 'none', daysBefore: 7, graceDays: 7 }, umbral: { metric: 'cajaEmpresa', op: '<', value: 1000000, go: 'empresa' }, pila: { dayOfMonth: 8, go: 'pila' }, cuentas: { dayOfMonth: 3, go: 'equipo' }, pagos: { dayOfMonth: 5, go: 'pagos' }, cobros: { days: 30, go: 'movimientos' }, renta: { daysBefore: 120, go: 'renta' }, renta_limite: { daysBefore: 45, go: 'renta' } }[type] || {};
  return Object.assign(base, extra);
}

/* ========================================================= EVENTOS (delegación) */
function modClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, p = (b.dataset.p || '').split('|');
  if (act.indexOf('bk:') === 0 && typeof bankPanelClick === 'function') { e.preventDefault(); bankPanelClick(act, p); return; }
  const tgt = b.dataset.target ? JSON.parse(b.dataset.target) : null;
  // los inputs de tipo checkbox con data-act se manejan en change
  if (b.tagName === 'INPUT' && b.type === 'checkbox') return;
  if (act === 'mv:open' && e.target.closest('button, input, select, .chip, a')) return; // clicks internos de la fila
  e.preventDefault();
  switch (act) {
    /* documentos */
    case 'doc:attach': pendingAttach = { target: tgt, btn: b }; $('#docFile').click(); return;
    case 'doc:open': docOpen(p[0]); return;
    case 'doc:unlink': if (confirm('¿Quitar este archivo? Se elimina del almacenamiento.')) { docDelete(p[0]).then(() => { applyDocTarget(tgt, null); re(); }); } return;
    /* movimientos */
    case 'mv:acc': mvAcc = p[0]; re(); return;
    case 'mv:type': mvType = p[0]; re(); return;
    case 'mv:form': mvFormOpen = !mvFormOpen; if (mvFormOpen) mvDraft = mvNewDraft(); re(); if (mvFormOpen) { const i = $('#mvForm input[data-mvd="party"]'); if (i) i.focus(); } return;
    case 'mv:save': {
      const f = mvDraft || mvNewDraft();
      if (!num(f.gross) && !num(f.net)) { toast('Poné al menos el monto', 'err'); return; }
      const gross = num(f.gross) || num(f.net), wh = num(f.withholding);
      const net = f.net !== '' && f.net != null ? num(f.net) : gross - wh;
      ledgerAdd({ date: f.date, type: f.type, account: f.account, category: f.category, party: f.party.trim(), concept: f.concept.trim(), gross, withholding: wh, net, status: f.status, notes: f.notes.trim(), source: 'manual' });
      mvFormOpen = false; mvDraft = null; toast('Movimiento registrado', 'ok'); re(); return; }
    case 'mv:open': mvOpenId = mvOpenId === p[0] ? null : p[0]; re(); return;
    case 'mv:status': ledgerSetStatus(p[0], p[1]); re(); return;
    case 'mv:del': { const m = S.ledger.find(x => x.id === p[0]); if (!m) return; if (confirm(`¿Eliminar "${m.party || m.concept}" por ${fmtCOP(m.net)}?${m.applied ? ' Se devuelve el monto al saldo.' : ''}`)) { ledgerRemove(p[0]); if (mvOpenId === p[0]) mvOpenId = null; re(); } return; }
    case 'mv:csv': mvExportCSV(); return;
    case 'mv:sync-billing': {
      const g = {}; (S.ledger || []).filter(m => m.status === 'hecho' && m.type === 'ingreso' && m.account === 'empresa' && m.category !== 'capital' && (m.date || '').slice(0, 4) === '2026').forEach(m => { const i = +m.date.slice(5, 7) - 1; g[i] = (g[i] || 0) + m.gross; });
      Object.keys(g).forEach(i => { S.billing2026.real[+i] = Math.round(g[i]); });
      toast('Facturación 2026 actualizada con el libro', 'ok'); re(); return; }
    /* equipo */
    case 'cc:open': eqOpen = (eqOpen && eqOpen.pid === p[0] && eqOpen.ym === p[1]) ? null : { pid: p[0], ym: p[1] }; if (eqOpen) ccGet(p[0], p[1]); if (current !== 'equipo') go('equipo'); else re(); return;
    case 'cc:close': eqOpen = null; re(); return;
    case 'cc:pay': ccMarkPaid(p[0], p[1]); toast('Cuenta marcada como pagada', 'ok'); re(); return;
    case 'cc:unpay': ccUnpay(p[0], p[1]); re(); return;
    case 'cc:received': { const c = ccGet(p[0], p[1]); c.status = 'recibida'; c.receivedAt = c.receivedAt || localISO(); re(); return; }
    case 'team:reactivate': { const t = S.team.find(x => x.id === p[0]); if (t) { t.active = true; t.endDate = ''; } re(); return; }
    /* pila */
    case 'pila:year': return;
    case 'pila:open': pilaOpen = pilaOpen === p[0] ? null : p[0]; pilaYear = p[0].slice(0, 4); re(); return;
    case 'pila:close': pilaOpen = null; re(); return;
    case 'pila:save': { const pl = S.pila.find(x => x.id === p[0]); if (!pl) return; if (!(Number(pl.total) > 0)) pl.total = (Number(pl.salud) || 0) + (Number(pl.pension) || 0) + (Number(pl.arl) || 0) + (Number(pl.ccf) || 0); pilaSyncLedger(pl); pilaOpen = null; toast(pl.paidAt ? 'Planilla guardada y registrada en Movimientos' : 'Planilla guardada (sin fecha de pago)', 'ok'); re(); return; }
    case 'pila:del': { const pl = S.pila.find(x => x.id === p[0]); if (pl && confirm('¿Eliminar esta planilla? Se revierte el egreso del libro.')) { pl.paidAt = null; pilaSyncLedger(pl); S.pila = S.pila.filter(x => x.id !== pl.id); pilaOpen = null; re(); } return; }
    /* renta */
    case 'renta:year': rentaYearSel = p[0]; re(); return;
    case 'renta:add-year': { const y = prompt('¿Qué año gravable querés abrir?', String(new Date().getFullYear() + 1)); if (!y || !/^\d{4}$/.test(y.trim())) return; rentaEnsure(y.trim()); rentaYearSel = y.trim(); re(); return; }
    case 'renta:doc-toggle': { const ry = rentaEnsure(p[0]); const d = ry.docs.find(x => x.key === p[1]); if (d) d.status = d.status === 'obtenido' ? 'pendiente' : 'obtenido'; re(); return; }
    /* alertas */
    case 'alert:snooze': { const until = p[0] === 'mes' ? endOfMonthISO() : addDaysISO(localISO(), Number(p[0]) || 1); S.alerts.dismissed[b.dataset.key] = until; Object.keys(S.alerts.dismissed).forEach(k => { if (S.alerts.dismissed[k] < localISO()) delete S.alerts.dismissed[k]; }); toast('Silenciada hasta el ' + fmtDate(until), ''); re(); return; }
    case 'alert:notif': if ('Notification' in window) Notification.requestPermission().then(() => { re(); notifyCritical(); }); return;
    case 'rule:add': { const t = $('#newRuleType'); const r = ruleNew(t ? t.value : 'fecha'); S.alerts.rules.push(r); ruleEdit = r.id; re(); return; }
    case 'rule:edit': ruleEdit = ruleEdit === p[0] ? null : p[0]; re(); return;
    case 'rule:del': { const r = S.alerts.rules.find(x => x.id === p[0]); if (r && confirm(`¿Eliminar la regla "${r.name}"?`)) { S.alerts.rules = S.alerts.rules.filter(x => x.id !== p[0]); re(); } return; }
  }
}
function modChange(e) {
  const t = e.target;
  if ((t.dataset.bk || t.dataset.bkopt) && typeof bankPanelChange === 'function') { bankPanelChange(t); return; }
  if (t.dataset.act === 'rule:toggle') { const r = S.alerts.rules.find(x => x.id === t.dataset.p); if (r) { r.active = t.checked; re(); } return; }
  if (t.dataset.act === 'mv:year') { mvYear = t.value; re(); return; }
  if (t.dataset.act === 'pila:year') { pilaYear = t.value; pilaOpen = null; re(); return; }
  if (t.dataset.rds) { const [y, k] = t.dataset.rds.split('|'); const d = rentaEnsure(y).docs.find(x => x.key === k); if (d) d.status = t.value; re(); return; }
  if (t.dataset.rfb) { const [y, f] = t.dataset.rfb.split('|'); rentaEnsure(y)[f] = t.checked; re(); return; }
  if (t.dataset.rf && t.tagName === 'SELECT') { const [y, f] = t.dataset.rf.split('|'); rentaEnsure(y)[f] = t.value; re(); return; }
  if (t.dataset.mvd && t.tagName === 'SELECT') { mvInput(t); if (t.dataset.mvd === 'type') { const f = mvDraft; f.category = Object.keys(LEDGER_CATS).find(k => LEDGER_CATS[k].type === f.type); re(); } return; }
  if (t.dataset.mvf && t.tagName === 'SELECT') { mvFieldInput(t); re(); return; }
  if (t.dataset.pf && t.tagName === 'SELECT') { pilaInput(t); return; }
  if (t.dataset.rule && t.tagName === 'SELECT') { ruleInput(t); re(); return; }
  if (t.dataset.ccf && (t.type === 'date')) { ccInput(t); re(); return; }
  if (t.dataset.mvf && t.type === 'date') { mvFieldInput(t); re(); return; }
  if (t.dataset.rf && t.type === 'date') { rfInput(t); re(); return; }
  if (t.dataset.pf && t.type === 'date') { pilaInput(t); return; }
  if (t.dataset.rule && t.type === 'date') { ruleInput(t); re(); return; }
}
function modInput(e) {
  const t = e.target;
  if (t.dataset.bk && t.type === 'text' && typeof bankPanelChange === 'function') { bankPanelChange(t); return; }
  if (t.dataset.mvd) { mvInput(t); return; }
  if (t.dataset.mvf && t.type !== 'date') { mvFieldInput(t); return; }
  if (t.dataset.ccf && t.type !== 'date') { ccInput(t); return; }
  if (t.dataset.pf && t.type !== 'date') { pilaInput(t); return; }
  if (t.dataset.rf && t.type !== 'date') { rfInput(t); return; }
  if (t.dataset.rff) { const [y, k] = t.dataset.rff.split('|'); rentaEnsure(y).figures[k] = t.value === '' ? '' : num(t.value); saveQuiet(); return; }
  if (t.dataset.rule && t.type !== 'date') { ruleInput(t); return; }
}
function mvInput(t) {
  const f = mvDraft || (mvDraft = mvNewDraft()); const k = t.dataset.mvd; f[k] = t.value;
  if (k === 'gross' || k === 'withholding') { const n = $('#mvNet'); if (n && !n.dataset.touched) { f.net = String(num(f.gross) - num(f.withholding) || ''); n.value = f.net; } }
  if (k === 'net') t.dataset.touched = '1';
}
function mvFieldInput(t) {
  const [id, f] = t.dataset.mvf.split('|'); const m = S.ledger.find(x => x.id === id); if (!m) return;
  if (f === 'gross' || f === 'withholding' || f === 'net') {
    const patch = {}; patch[f] = num(t.value);
    if (f !== 'net') { const g = f === 'gross' ? num(t.value) : m.gross, w = f === 'withholding' ? num(t.value) : m.withholding; patch.net = g - w; const nn = t.closest('.form-grid') && t.closest('.form-grid').querySelector(`[data-mvf="${id}|net"]`); if (nn) nn.value = patch.net; }
    ledgerUpdate(m, patch);
  } else m[f] = t.value;
  saveQuiet();
}
function ccInput(t) { const [id, f] = t.dataset.ccf.split('|'); const c = S.cuentasCobro.find(x => x.id === id); if (!c) return; c[f] = (f === 'amount') ? num(t.value) : t.value; if (f === 'receivedAt' && t.value && c.status === 'pendiente') c.status = 'recibida'; saveQuiet(); }
function pilaInput(t) {
  const [id, f] = t.dataset.pf.split('|'); const p = S.pila.find(x => x.id === id); if (!p) return;
  p[f] = ['salud', 'pension', 'arl', 'ccf', 'total'].includes(f) ? num(t.value) : t.value;
  if (['salud', 'pension', 'arl', 'ccf'].includes(f)) { const tot = $('#pilaTotal'); if (tot && !tot.dataset.touched) { p.total = (Number(p.salud) || 0) + (Number(p.pension) || 0) + (Number(p.arl) || 0) + (Number(p.ccf) || 0); tot.value = p.total || ''; } }
  if (f === 'total') t.dataset.touched = '1';
  saveQuiet();
}
function rfInput(t) { const [y, f] = t.dataset.rf.split('|'); rentaEnsure(y)[f] = t.value; saveQuiet(); }
function ruleInput(t) { const [id, f] = t.dataset.rule.split('|'); const r = S.alerts.rules.find(x => x.id === id); if (!r) return; r[f] = (t.type === 'number') ? num(t.value) : t.value; saveQuiet(); }

/* ========================================================= MIGRACIÓN v2 (se llama desde migrate()) */
function migrateModules(st) {
  // libro: normalizar y respaldar los pagos ya marcados como movimientos (registro, sin tocar saldos)
  st.ledger.forEach(m => ledgerNormalizeState(m));
  const months = (st.payments && st.payments.months) || {};
  Object.keys(months).forEach(ym => {
    const paid = months[ym].paid || {};
    Object.keys(paid).forEach(key => {
      const refKey = ym + '|' + key;
      if (st.ledger.some(m => m.source === 'pago' && m.refKey === refKey)) return;
      const pr = paid[key]; const amt = Number(pr.amount) || 0; if (!amt) return;
      const side = key.indexOf('exp:') === 0 ? 'personal' : 'empresa';
      const cat = (key.indexOf('team:') === 0 || key === 'prest') ? 'nomina' : key.indexOf('lic:') === 0 ? 'herramientas' : key === 'ceo' ? 'salario_ceo' : 'gasto_personal';
      let party = '', concept = 'Pago del mes';
      if (key.indexOf('team:') === 0) { const t = st.team.find(x => x.id === key.slice(5)); if (t) { party = t.name; concept = 'Nómina · ' + t.name; } }
      else if (key.indexOf('lic:') === 0) { const l = st.licenses.find(x => x.id === key.slice(4)); if (l) { party = l.name; concept = l.name; } }
      else if (key.indexOf('exp:') === 0) { const x = st.personalExpenses.find(q => q.id === key.slice(4)); if (x) { party = x.name; concept = x.name; } }
      else if (key === 'ceo') { party = 'Salario CEO'; concept = 'Tu salario CEO'; }
      const at = pr.at ? localISO(new Date(pr.at)) : null;
      const date = at && ymOf(at) === ym ? at : ym + '-15';
      st.ledger.push({ id: uid(), date, type: 'egreso', account: side, category: cat, party, concept, gross: amt, withholding: 0, net: amt, status: 'hecho', applied: false, balanceBy: 'pagos', source: 'pago', refKey, notes: '' });
    });
  });
  // banco: cuentas conciliadas y reglas propias
  if (!st.bank || typeof st.bank !== 'object' || Array.isArray(st.bank)) st.bank = { accounts: {}, rules: [] };
  if (!st.bank.accounts || typeof st.bank.accounts !== 'object') st.bank.accounts = {};
  if (!Array.isArray(st.bank.rules)) st.bank.rules = [];
  // renta: abrir el año en curso si no existe ninguno
  if (!Object.keys(st.renta.years).length) st.renta.years[String(new Date().getFullYear())] = rentaDefaults();
  Object.keys(st.renta.years).forEach(y => { const ry = st.renta.years[y]; if (!Array.isArray(ry.docs)) ry.docs = []; RENTA_DOCS.forEach(d => { if (!ry.docs.some(x => x.key === d.key)) ry.docs.push({ key: d.key, status: 'pendiente', docId: null, note: '' }); }); if (!ry.figures) ry.figures = {}; });
  // alertas: garantizar las reglas base (sin duplicar las editadas)
  const have = new Set(st.alerts.rules.map(r => r.id));
  defaultAlertRules().forEach(r => { if (!have.has(r.id) && !st.alerts.removedDefaults?.includes(r.id)) st.alerts.rules.push(r); });
  return st;
}
function ledgerNormalizeState(m) { // versión sin efectos sobre S (migración)
  m.id = m.id || uid(); m.gross = Number(m.gross) || 0; m.withholding = Number(m.withholding) || 0;
  const n = Number(m.net); m.net = (m.net === '' || m.net == null || !isFinite(n)) ? m.gross - m.withholding : n;
  m.type = m.type === 'ingreso' ? 'ingreso' : 'egreso'; m.account = m.account === 'personal' ? 'personal' : 'empresa';
  m.status = m.status === 'pendiente' ? 'pendiente' : 'hecho'; m.applied = !!m.applied; m.source = m.source || 'manual';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')) m.date = localISO();
}

/* ========================================================= REGISTRO */
Object.assign(VIEWS, { movimientos: renderMovimientos, equipo: renderEquipo, pila: renderPila, renta: renderRenta, alertas: renderAlertas });
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', modClick);
  document.addEventListener('change', modChange);
  document.addEventListener('input', modInput);
  const df = $('#docFile'); if (df) df.addEventListener('change', onDocFileChosen);
  // avisos del navegador: un momento después del primer render
  setTimeout(() => { if (S && D) notifyCritical(); }, 2500);
});
