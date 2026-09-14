/* ==========================================================================
   NOLA LABS · TABLERO FINANCIERO — bank.js (v2.1)
   Importador de extractos bancarios: lee el XLSX del banco en el navegador (sin librerías),
   clasifica cada movimiento con reglas editables, evita duplicados y concilia el saldo.
   Formato soportado: Bancolombia · "Extracto" de cuenta de ahorros/corriente (XLSX).
   Todo el código es plantilla genérica; las reglas con nombres propios viven en la nube (S.bank.rules).
   ========================================================================== */

/* ========================================================= ZIP + XLSX mínimos */
function zipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw userErr('El archivo no es un XLSX válido');
  const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const out = []; let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, compSize, size, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
async function zipRead(buf, e) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nameLen = dv.getUint16(e.localOff + 26, true), extraLen = dv.getUint16(e.localOff + 28, true);
  const start = e.localOff + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8 || typeof DecompressionStream === 'undefined') throw userErr('Este navegador no puede descomprimir el archivo. Probá con Chrome, Safari o Edge actualizados.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}
const xmlDecode = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
function colIndex(ref) { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return null; let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
// Devuelve las filas de la primera hoja como arrays de strings
async function readXlsxRows(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = zipEntries(buf);
  const get = async name => { const e = entries.find(x => x.name === name); return e ? await zipRead(buf, e) : null; };
  const sst = [];
  const sstXml = await get('xl/sharedStrings.xml');
  if (sstXml) for (const m of sstXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)) sst.push(xmlDecode(m[1].replace(/<[^>]+>/g, '')));
  let sheetName = 'xl/worksheets/sheet1.xml';
  if (!entries.some(e => e.name === sheetName)) { const alt = entries.find(e => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)); if (alt) sheetName = alt.name; }
  const xml = await get(sheetName);
  if (!xml) throw userErr('No encontré la hoja de cálculo dentro del archivo');
  const rows = [];
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const cells = []; let pos = 0;
    for (const cm of rm[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = cm[1] || '', inner = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1]; const ci = ref ? colIndex(ref) : null;
      if (ci != null) pos = ci;
      const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
      let v = ''; const vm = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
      if (vm) v = vm[1]; else { const im = inner.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/); if (im) v = im[1]; }
      if (t === 's') v = sst[+v] || '';
      cells[pos] = xmlDecode(v); pos++;
    }
    rows.push(Array.from(cells, x => x == null ? '' : x));
  }
  return rows;
}

/* ========================================================= PARSER BANCOLOMBIA */
function bankNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, '');
  if (!/^-?[\d,]*\.?\d+$/.test(t)) return null;
  const n = parseFloat(t.replace(/,/g, '')); return isFinite(n) ? n : null;
}
function parseBancolombia(rows) {
  let period = null, acct = '', holder = '', summary = null; const movs = [];
  const isDate = s => /^\d{4}\/\d{2}\/\d{2}$/.test(s);
  rows.forEach((r, i) => {
    const v = r.map(x => String(x == null ? '' : x).trim());
    if (isDate(v[0]) && isDate(v[1])) { period = { from: v[0].replace(/\//g, '-'), to: v[1].replace(/\//g, '-') }; acct = v[3] || acct; return; }
    if (v[0] === 'CLIENTE' && rows[i + 1]) { holder = String(rows[i + 1][0] || '').trim(); return; }
    if (v[0] === 'SALDO ANTERIOR' && rows[i + 1] && !summary) { const n = rows[i + 1].map(bankNum); summary = { prev: n[0], credits: n[1], debits: n[2], final: n[3] }; return; }
    if (/^\d{1,2}\/\d{2}$/.test(v[0]) && bankNum(v[4]) != null && period) {
      const [d, m] = v[0].split('/').map(Number);
      let year = +period.to.slice(0, 4);
      if (m > +period.to.slice(5, 7)) year -= 1; // extracto que cruza de diciembre a enero
      movs.push({ date: `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, desc: v[1].replace(/\s+/g, ' ').trim(), ref: v[3] || '', amount: bankNum(v[4]), balance: bankNum(v[5]) });
    }
  });
  if (!period || !movs.length) throw userErr('No reconozco el formato. Por ahora se importa el "Extracto" en XLSX de Bancolombia.');
  // verificación del saldo corrido
  let prev = summary ? summary.prev : null, bad = 0;
  if (prev != null) movs.forEach(mv => { if (mv.balance != null && Math.abs(prev + mv.amount - mv.balance) > 0.011) bad++; prev = mv.balance != null ? mv.balance : prev + mv.amount; });
  return { bank: 'Bancolombia', acct, acctLast4: acct.slice(-4), holder, period, summary, movs, balanceOk: prev != null && bad === 0 };
}

/* ========================================================= CLASIFICACIÓN */
const BANK_SUBCATS = { transporte: 'Transporte', mercado: 'Mercado', restaurantes: 'Restaurantes y domicilios', compras: 'Compras', suscripciones: 'Suscripciones y apps', salud: 'Salud y bienestar', hogar: 'Hogar y servicios', nequi: 'Nequi (salidas a tu billetera)', efectivo: 'Efectivo', deuda: 'Deuda', bancario: 'Bancario', viajes: 'Viajes', educacion: 'Educación', otros: 'Otros' };
// Reglas genéricas (comercios y descriptores comunes). Las reglas con nombres propios (clientes, empleador) se crean
// desde el importador y se guardan en la nube. Orden: la primera que coincide gana.
function defaultBankRules() {
  const R = (match, o) => Object.assign({ id: 'b-' + match.toLowerCase().replace(/[^a-z0-9]+/g, '-'), match, builtin: true }, o);
  return [
    R('ABONO INTERESES', { type: 'ingreso', category: 'bancario', subcat: 'bancario', party: 'Banco' }),
    R('AJUSTE INTERES', { type: 'auto', category: 'bancario', subcat: 'bancario', party: 'Banco' }),
    R('C MANEJO TARJ', { type: 'egreso', category: 'bancario', subcat: 'bancario', party: 'Banco' }),
    R('CUOTA MANEJO', { type: 'egreso', category: 'bancario', subcat: 'bancario', party: 'Banco' }),
    R('GRAVAMEN', { type: 'egreso', category: 'impuestos', subcat: 'bancario', party: 'Banco · 4x1000' }),
    R('RETEFUENTE', { type: 'egreso', category: 'impuestos', subcat: 'bancario', party: 'Retención' }),
    R('RETIRO CAJERO', { type: 'egreso', category: 'gasto_personal', subcat: 'efectivo', party: 'Cajero' }),
    R('TRANSFERENCIAS A NEQUI', { type: 'egreso', category: 'gasto_personal', subcat: 'nequi', party: 'Nequi' }),
    R('TRANSFERENCIA DESDE NEQUI', { type: 'ingreso', category: 'transferencia', subcat: 'nequi', party: 'Nequi' }),
    R('TRANSFERENCIA CTA SUC VIRTUAL', { type: 'auto', category: 'transferencia', party: 'Cuenta propia', review: true }),
    R('DEBITO POR ABONO CARTERA', { type: 'egreso', category: 'deuda', subcat: 'deuda', party: 'Crédito (cuota)' }),
    R('NU COMPANIA', { type: 'egreso', category: 'deuda', subcat: 'deuda', party: 'Nu (tarjeta)' }),
    R('PAGO CREDITO', { type: 'egreso', category: 'deuda', subcat: 'deuda', party: 'Crédito' }),
    R('DLO*DIDI', { type: 'egreso', category: 'gasto_personal', subcat: 'transporte', party: 'Didi' }),
    R('UBER', { type: 'egreso', category: 'gasto_personal', subcat: 'transporte', party: 'Uber' }),
    R('CABIFY', { type: 'egreso', category: 'gasto_personal', subcat: 'transporte', party: 'Cabify' }),
    R('INDRIVE', { type: 'egreso', category: 'gasto_personal', subcat: 'transporte', party: 'inDrive' }),
    R('CARULLA', { type: 'egreso', category: 'gasto_personal', subcat: 'mercado', party: 'Carulla' }),
    R('TIENDA D1', { type: 'egreso', category: 'gasto_personal', subcat: 'mercado', party: 'D1' }),
    R('EXITO', { type: 'egreso', category: 'gasto_personal', subcat: 'mercado', party: 'Éxito' }),
    R('JUMBO', { type: 'egreso', category: 'gasto_personal', subcat: 'mercado', party: 'Jumbo' }),
    R('OLIMPICA', { type: 'egreso', category: 'gasto_personal', subcat: 'mercado', party: 'Olímpica' }),
    R('ARA ', { type: 'egreso', category: 'gasto_personal', subcat: 'mercado', party: 'Ara' }),
    R('RAPPI', { type: 'egreso', category: 'gasto_personal', subcat: 'restaurantes', party: 'Rappi' }),
    R('DOMICILIOS', { type: 'egreso', category: 'gasto_personal', subcat: 'restaurantes', party: 'Domicilios' }),
    R('SPOTIFY', { type: 'egreso', category: 'gasto_personal', subcat: 'suscripciones', party: 'Spotify' }),
    R('NETFLIX', { type: 'egreso', category: 'gasto_personal', subcat: 'suscripciones', party: 'Netflix' }),
    R('APPLE.COM', { type: 'egreso', category: 'gasto_personal', subcat: 'suscripciones', party: 'Apple' }),
    R('TRADINGVIEW', { type: 'egreso', category: 'gasto_personal', subcat: 'suscripciones', party: 'TradingView' }),
    R('PINECONNECTOR', { type: 'egreso', category: 'gasto_personal', subcat: 'suscripciones', party: 'PineConnector' }),
    R('THINK HUGE', { type: 'egreso', category: 'gasto_personal', subcat: 'suscripciones', party: 'Think Huge' }),
    R('TRELLO', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'Trello', tool: true }),
    R('CANVA', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'Canva', tool: true }),
    R('GOOGLE', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'Google', tool: true }),
    R('ANTHROPIC', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'Anthropic', tool: true }),
    R('CLAUDE.AI', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'Claude', tool: true }),
    R('OPENAI', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'OpenAI', tool: true }),
    R('VERCEL', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'Vercel', tool: true }),
    R('SUPABASE', { type: 'egreso', category: 'herramientas', subcat: 'suscripciones', party: 'Supabase', tool: true }),
    R('FARMATODO', { type: 'egreso', category: 'gasto_personal', subcat: 'salud', party: 'Farmatodo' }),
    R('CRUZ VERDE', { type: 'egreso', category: 'gasto_personal', subcat: 'salud', party: 'Cruz Verde' }),
    R('DROGUERIA', { type: 'egreso', category: 'gasto_personal', subcat: 'salud', party: 'Droguería' }),
    R('AVIANCA', { type: 'egreso', category: 'gasto_personal', subcat: 'viajes', party: 'Avianca' }),
    R('LATAM', { type: 'egreso', category: 'gasto_personal', subcat: 'viajes', party: 'LATAM' }),
    R('AIRBNB', { type: 'egreso', category: 'gasto_personal', subcat: 'viajes', party: 'Airbnb' }),
    R('REV COMPRA', { type: 'ingreso', category: 'otro_ingreso', subcat: 'compras', party: 'Reverso de compra' }),
    R('REVERSO', { type: 'ingreso', category: 'otro_ingreso', subcat: 'compras', party: 'Reverso' }),
  ];
}
function bankRules() { if (!S.bank) S.bank = {}; if (!Array.isArray(S.bank.rules)) S.bank.rules = []; return S.bank.rules.concat(defaultBankRules()); }
const bankPartyFrom = (desc, prefix) => desc.slice(desc.toUpperCase().indexOf(prefix) + prefix.length).trim().replace(/\s+/g, ' ');
const nameTokens = () => String((S.profile && S.profile.name) || '').toUpperCase().split(/\s+/).filter(x => x.length > 2);
function looksLikeOwner(name) { const t = nameTokens(); if (!t.length) return false; const u = String(name).toUpperCase(); return t.filter(x => u.includes(x.slice(0, 5))).length >= 2; }
// Clasifica un movimiento: devuelve { type, category, subcat, party, review, ruleId }
function bankClassify(mv, side) {
  const D = mv.desc.toUpperCase(); const inc = mv.amount > 0;
  for (const r of bankRules()) {
    if (!r.match || !D.includes(String(r.match).toUpperCase())) continue;
    const type = r.type === 'auto' || !r.type ? (inc ? 'ingreso' : 'egreso') : r.type;
    if ((type === 'ingreso') !== inc && r.category !== 'transferencia') continue; // signo incompatible: seguir buscando
    let category = r.category, subcat = r.subcat || null;
    if (r.tool && side === 'personal') { category = 'gasto_personal'; subcat = 'suscripciones'; }
    if (r.tool && side === 'empresa') { category = 'herramientas'; }
    return { type, category, subcat, party: r.party || '', review: !!r.review, ruleId: r.id };
  }
  // descriptores estructurados
  let m;
  if ((m = /^PAGO INTERBANC\s+(.+)$/i.exec(mv.desc)) || (m = /^PAGO DE PROV\s+(.+)$/i.exec(mv.desc))) return { type: inc ? 'ingreso' : 'egreso', category: inc ? 'cliente' : 'proveedores', subcat: null, party: m[1].trim(), review: true };
  if ((m = /^TRANSF DE\s+(.+)$/i.exec(mv.desc))) { const own = looksLikeOwner(m[1]); return { type: 'ingreso', category: own ? 'transferencia' : 'otro_ingreso', subcat: null, party: own ? 'Cuenta propia' : m[1].trim(), review: !own }; }
  if ((m = /^TRANSF A\s+(.+)$/i.exec(mv.desc))) { const own = looksLikeOwner(m[1]); return { type: 'egreso', category: own ? 'transferencia' : (side === 'empresa' ? 'proveedores' : 'gasto_personal'), subcat: own ? null : 'otros', party: own ? 'Cuenta propia' : m[1].trim(), review: true }; }
  if ((m = /^TRANSFERENCIA A\s+(.+)$/i.exec(mv.desc))) return { type: 'egreso', category: side === 'empresa' ? 'proveedores' : 'gasto_personal', subcat: 'otros', party: m[1].trim(), review: true };
  if ((m = /^COMPRA (?:EN|INTL)\s+(.+)$/i.exec(mv.desc))) return { type: 'egreso', category: side === 'empresa' ? 'proveedores' : 'gasto_personal', subcat: 'compras', party: m[1].trim(), review: false };
  if ((m = /^PAGO PSE\s+(.+)$/i.exec(mv.desc))) return { type: 'egreso', category: side === 'empresa' ? 'proveedores' : 'gasto_personal', subcat: 'otros', party: m[1].trim(), review: true };
  return { type: inc ? 'ingreso' : 'egreso', category: inc ? 'otro_ingreso' : (side === 'empresa' ? 'otro_egreso' : 'gasto_personal'), subcat: inc ? null : 'otros', party: '', review: true };
}
// Sugerencia de patrón para crear una regla desde una fila
function bankRuleHint(desc) {
  let m;
  if ((m = /^(PAGO INTERBANC|PAGO DE PROV|TRANSF DE|TRANSF A|TRANSFERENCIA A|COMPRA EN|COMPRA INTL|PAGO PSE)\s+(.+)$/i.exec(desc))) return m[2].trim().split(/\s+/).slice(0, 2).join(' ');
  return desc.split(/\s+/).slice(0, 3).join(' ');
}

/* ========================================================= IMPORTACIÓN */
let bankImp = null; // { parsed, side, rows, skipTiny, setBalance, fileName }
// Huella compacta del movimiento (cuenta + fecha + monto + descripción + saldo) para no importar dos veces lo mismo
function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
const bankKeyOf = (acct4, mv) => { const s = `${acct4}|${mv.date}|${mv.amount}|${mv.desc}|${mv.balance == null ? '' : mv.balance}`; return acct4 + ':' + fnv1a(s) + fnv1a(s.split('').reverse().join('')); };
function bankAccounts() { if (!S.bank) S.bank = {}; if (!S.bank.accounts || typeof S.bank.accounts !== 'object') S.bank.accounts = {}; return S.bank.accounts; }
async function bankImportFile(file) {
  const rows = await readXlsxRows(file);
  const parsed = parseBancolombia(rows);
  const acc = bankAccounts()[parsed.acctLast4];
  const side = acc ? acc.side : 'personal';
  // conciliar el saldo solo si el extracto es reciente (un extracto viejo no representa el saldo de hoy)
  bankImp = { parsed, side, fileName: file.name, skipTiny: true, setBalance: daysSince(parsed.period.to) <= 31, rows: [] };
  bankBuildRows();
  return bankImp;
}
function bankBuildRows() {
  const P = bankImp.parsed, side = bankImp.side;
  const existing = new Set((S.ledger || []).filter(m => m.bankKey).map(m => m.bankKey));
  bankImp.rows = P.movs.map((mv, i) => {
    const c = bankClassify(mv, side);
    const key = bankKeyOf(P.acctLast4, mv);
    const dup = existing.has(key);
    // coincidencia con un movimiento manual (mismo monto, ±3 días, misma cuenta) → se enlaza en vez de duplicar
    const twin = !dup ? (S.ledger || []).find(m => !m.bankKey && m.account === side && Math.abs((m.type === 'ingreso' ? m.net : -m.net) - mv.amount) < 1 && Math.abs(daysUntil(m.date) - daysUntil(mv.date)) <= 3) : null;
    const tiny = c.category === 'bancario' && Math.abs(mv.amount) < 1000;
    return { i, mv, key, dup, twinId: twin ? twin.id : null, type: c.type, category: c.category, subcat: c.subcat, party: c.party, review: c.review, include: !dup && !(bankImp.skipTiny && tiny), tiny };
  });
}
function bankSummary() {
  const rows = bankImp.rows.filter(r => r.include);
  const ing = sum(rows.filter(r => r.mv.amount > 0 && r.category !== 'transferencia').map(r => r.mv.amount));
  const egr = sum(rows.filter(r => r.mv.amount < 0 && r.category !== 'transferencia').map(r => -r.mv.amount));
  return { n: rows.length, dup: bankImp.rows.filter(r => r.dup).length, twins: rows.filter(r => r.twinId).length, review: rows.filter(r => r.review).length, ing, egr, transfers: rows.filter(r => r.category === 'transferencia').length };
}
function bankCommit() {
  const P = bankImp.parsed, side = bankImp.side; let added = 0, linked = 0;
  bankImp.rows.filter(r => r.include).forEach(r => {
    const mv = r.mv; const isTransfer = r.category === 'transferencia';
    if (r.twinId) { const t = S.ledger.find(m => m.id === r.twinId); if (t) { t.bankKey = r.key; t.bankAcct = P.acctLast4; t.bankDesc = mv.desc; if (!t.subcat && r.subcat) t.subcat = r.subcat; linked++; return; } }
    const entry = { id: uid(), date: mv.date, type: mv.amount > 0 ? 'ingreso' : 'egreso', account: side, category: r.category, subcat: r.subcat || null, party: r.party || '', concept: mv.desc, gross: Math.abs(mv.amount), withholding: 0, net: Math.abs(mv.amount), status: 'hecho', applied: true, balanceBy: 'banco', source: 'banco', bankKey: r.key, bankAcct: P.acctLast4, notes: r.review && !isTransfer ? 'Clasificación automática: revisar' : '' };
    if (mv.ref) entry.bankRef = mv.ref;
    S.ledger.push(ledgerNormalize(entry));
    added++;
  });
  const accs = bankAccounts();
  const prev = accs[P.acctLast4] || {};
  accs[P.acctLast4] = { bank: P.bank, side, label: prev.label || (P.bank + ' ···' + P.acctLast4), reconciledTo: (prev.reconciledTo && prev.reconciledTo > P.period.to) ? prev.reconciledTo : P.period.to, balance: (prev.reconciledTo && prev.reconciledTo > P.period.to) ? prev.balance : (P.summary ? P.summary.final : prev.balance), main: prev.main !== undefined ? prev.main : true, updatedAt: Date.now() };
  // conciliación: el saldo de la cuenta principal del lado pasa a ser el del extracto (si es el más reciente)
  const a = accs[P.acctLast4];
  if (bankImp.setBalance && a.main && a.reconciledTo === P.period.to && P.summary) {
    if (side === 'personal') S.liquidity.ahorrosPersonalesHoy = P.summary.final; else S.liquidity.cajaEmpresaHoy = P.summary.final;
  }
  const res = { added, linked, period: P.period, side };
  bankImp = null;
  return res;
}
function bankAddRule(row, match) {
  if (!S.bank.rules) S.bank.rules = [];
  const m = String(match || '').trim(); if (!m) return null;
  S.bank.rules = S.bank.rules.filter(r => String(r.match).toUpperCase() !== m.toUpperCase());
  const rule = { id: uid(), match: m, type: row.category === 'transferencia' ? 'auto' : row.type, category: row.category, subcat: row.subcat || null, party: row.party || '', createdAt: Date.now() };
  S.bank.rules.unshift(rule);
  return rule;
}

/* ========================================================= UI: panel de importación */
function bankPanelHTML() {
  if (!bankImp) return '';
  const P = bankImp.parsed, s = bankSummary();
  const catOpts = sel => Object.keys(LEDGER_CATS).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(LEDGER_CATS[k].label)}</option>`).join('');
  const subOpts = sel => `<option value="">—</option>` + Object.keys(BANK_SUBCATS).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(BANK_SUBCATS[k])}</option>`).join('');
  const rows = bankImp.rows.map(r => `<tr class="bk-row ${r.include ? '' : 'off'} ${r.dup ? 'dup' : ''} ${r.review && r.include ? 'rev' : ''}">
    <td><input type="checkbox" data-bk="${r.i}|include" ${r.include ? 'checked' : ''} ${r.dup ? 'disabled' : ''}></td>
    <td class="nowrap">${fmtDate(r.mv.date)}</td>
    <td><span class="party">${esc(r.mv.desc)}</span>${r.dup ? '<span class="concept">Ya importado</span>' : r.twinId ? '<span class="concept">Coincide con un movimiento manual: se enlaza</span>' : r.tiny ? '<span class="concept">Movimiento bancario menor</span>' : ''}</td>
    <td class="r amt"><span class="${r.mv.amount > 0 ? 'in' : 'out'}">${r.mv.amount > 0 ? '+' : '−'}${fmtCOP(Math.abs(r.mv.amount))}</span></td>
    <td><select data-bk="${r.i}|category" ${r.dup ? 'disabled' : ''}>${catOpts(r.category)}</select></td>
    <td>${r.category === 'gasto_personal' || r.category === 'transferencia' || r.category === 'deuda' || r.category === 'bancario' ? `<select data-bk="${r.i}|subcat" ${r.dup ? 'disabled' : ''}>${subOpts(r.subcat)}</select>` : ''}</td>
    <td><input type="text" value="${esc(r.party || '')}" data-bk="${r.i}|party" placeholder="quién" ${r.dup ? 'disabled' : ''}></td>
    <td class="nowrap">${r.dup ? '' : `<button class="btn btn--ghost btn--xs" data-act="bk:rule" data-p="${r.i}" title="Crear una regla para clasificar así las próximas veces">${ico('plus')} regla</button>`}</td>
  </tr>`).join('');
  return `<div class="card warm mb-16" id="bankPanel">
    <div class="card-h"><h3>Importar extracto · ${esc(P.bank)} ···${esc(P.acctLast4)}</h3><button class="iconbtn" data-act="bk:cancel" title="Cancelar">${ico('x')}</button></div>
    <div class="stat-row mb-16">
      <div class="mini-stat"><div class="l">Período</div><div class="v" style="font-size:18px">${fmtDate(P.period.from)} → ${fmtDate(P.period.to)}</div></div>
      <div class="mini-stat"><div class="l">Saldo inicial → final</div><div class="v" style="font-size:18px">${P.summary ? fmtShort(P.summary.prev) + ' → ' + fmtCOP(P.summary.final) : '—'}</div><div class="hint" style="margin:2px 0 0">${P.balanceOk ? 'saldo corrido verificado' : 'saldo corrido con diferencias'}</div></div>
      <div class="mini-stat"><div class="l">A importar</div><div class="v" style="font-size:18px">${s.n} de ${P.movs.length}</div><div class="hint" style="margin:2px 0 0">${s.dup ? s.dup + ' ya estaban · ' : ''}${s.twins ? s.twins + ' se enlazan · ' : ''}${s.review} por revisar</div></div>
      <div class="mini-stat"><div class="l">Entradas / salidas (sin transferencias propias)</div><div class="v" style="font-size:18px"><span class="pos">${fmtShort(s.ing)}</span> / <span class="neg">${fmtShort(s.egr)}</span></div><div class="hint" style="margin:2px 0 0">${s.transfers} transferencias entre tus cuentas</div></div>
    </div>
    <div class="toolbar" style="margin-bottom:10px">
      <div class="left">
        <div class="field-inline"><label>Esta cuenta es</label><select data-bkopt="side"><option value="personal" ${bankImp.side === 'personal' ? 'selected' : ''}>Cuenta personal</option><option value="empresa" ${bankImp.side === 'empresa' ? 'selected' : ''}>Cuenta empresa</option></select></div>
        <label class="toggle"><input type="checkbox" data-bkopt="skipTiny" ${bankImp.skipTiny ? 'checked' : ''}><span class="tr"></span><span class="tl">Omitir intereses y ajustes menores a $1.000</span></label>
        <label class="toggle"><input type="checkbox" data-bkopt="setBalance" ${bankImp.setBalance ? 'checked' : ''}><span class="tr"></span><span class="tl">Poner el saldo de la cuenta en ${P.summary ? fmtCOP(P.summary.final) : '—'} (saldo al ${fmtDate(P.period.to)}${daysSince(P.period.to) > 31 ? ' · extracto de hace ' + daysSince(P.period.to) + ' días: mejor no' : ''})</span></label>
      </div>
      <div class="right"><button class="btn btn--primary" data-act="bk:commit">Importar ${s.n} movimientos</button></div>
    </div>
    <p class="hint">Las filas marcadas en color piden revisión: son pagos de clientes o transferencias que el tablero no puede distinguir solo. Corregí la categoría y usá "regla" para que la próxima vez se clasifiquen solas. Las transferencias entre tus cuentas no cuentan como ingreso ni gasto.</p>
    <div class="tscroll" style="max-height:520px;overflow:auto"><table class="tbl bk-table"><thead><tr><th></th><th>Fecha</th><th>Descripción del banco</th><th class="r">Monto</th><th>Categoría</th><th>Detalle</th><th>Quién</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}
function bankRulesHTML() {
  const own = (S.bank && S.bank.rules) || [];
  if (!own.length) return '';
  return `<details class="card mt-16"><summary style="cursor:pointer;font-weight:800;color:var(--cyprus)">Reglas de clasificación propias · ${own.length}</summary>
    <div class="tscroll mt-16"><table class="tbl"><thead><tr><th>Si la descripción contiene</th><th>Tipo</th><th>Categoría</th><th>Detalle</th><th>Quién</th><th></th></tr></thead><tbody>
    ${own.map(r => `<tr><td><b>${esc(r.match)}</b></td><td>${esc(r.type || 'auto')}</td><td>${esc(catLabel(r.category))}</td><td>${esc(BANK_SUBCATS[r.subcat] || '—')}</td><td>${esc(r.party || '')}</td><td><button class="iconbtn" data-act="bk:rule-del" data-p="${r.id}" title="Eliminar">${ico('trash')}</button></td></tr>`).join('')}
    </tbody></table></div><p class="hint">Además de estas, el tablero trae reglas genéricas para comercios y descriptores comunes (Didi, Carulla, Nequi, intereses, cuota de manejo…).</p></details>`;
}
// Cambios en el panel (delegados desde modules.js)
function bankPanelChange(t) {
  if (t.dataset.bkopt) {
    const k = t.dataset.bkopt;
    if (k === 'side') { bankImp.side = t.value; bankBuildRows(); }
    else { bankImp[k] = t.checked; if (k === 'skipTiny') bankBuildRows(); }
    re(); return true;
  }
  if (t.dataset.bk) {
    const [i, f] = t.dataset.bk.split('|'); const r = bankImp.rows[+i]; if (!r) return true;
    if (f === 'include') { r.include = t.checked; const sm = $('#bankPanel'); if (sm) re(); return true; }
    if (f === 'category') { r.category = t.value; const c = LEDGER_CATS[r.category]; if (c && c.type === 'ingreso') r.type = 'ingreso'; else if (c && c.type === 'egreso') r.type = 'egreso'; r.review = false; re(); return true; }
    if (f === 'subcat') { r.subcat = t.value || null; return true; }
    if (f === 'party') { r.party = t.value; return true; }
  }
  return false;
}
function bankPanelClick(act, p) {
  switch (act) {
    case 'bk:cancel': bankImp = null; re(); return true;
    case 'bk:commit': {
      const res = bankCommit();
      toast(`${res.added} movimientos importados${res.linked ? ` · ${res.linked} enlazados` : ''} · ${res.side === 'personal' ? 'cuenta personal' : 'cuenta empresa'}`, 'ok');
      mvYear = res.period.to.slice(0, 4); mvAcc = res.side; re(); return true; }
    case 'bk:rule': {
      const r = bankImp.rows[+p[0]]; if (!r) return true;
      const match = prompt('Crear regla: clasificar así toda descripción que contenga…', bankRuleHint(r.mv.desc));
      if (match == null) return true;
      const rule = bankAddRule(r, match);
      if (rule) { bankBuildRows(); bankImp.rows.forEach(x => { if (x.mv.desc.toUpperCase().includes(rule.match.toUpperCase()) && !x.dup) { x.category = rule.category; x.subcat = rule.subcat; x.party = rule.party; x.type = rule.type === 'auto' ? (x.mv.amount > 0 ? 'ingreso' : 'egreso') : rule.type; x.review = false; } }); toast('Regla creada: "' + rule.match + '"', 'ok'); re(); }
      return true; }
    case 'bk:rule-del': { S.bank.rules = (S.bank.rules || []).filter(r => r.id !== p[0]); if (bankImp) bankBuildRows(); re(); return true; }
    case 'bk:pick': { const inp = $('#bankFile'); if (inp) inp.click(); return true; }
  }
  return false;
}
async function onBankFileChosen(ev) {
  const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  try {
    if (!/\.xlsx$/i.test(file.name)) throw userErr('Por ahora se importa el extracto en XLSX (el que descargás del banco).');
    await bankImportFile(file);
    mvFormOpen = false;
    if (current !== 'movimientos') go('movimientos'); else re();
    const el = $('#bankPanel'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.warn('bank import', e); toast(userMsg(e, 'No se pudo leer el extracto'), 'err'); }
}
document.addEventListener('DOMContentLoaded', () => { const bf = $('#bankFile'); if (bf) bf.addEventListener('change', onBankFileChosen); });
