/* ==========================================================================
   NOLA LABS · TABLERO FINANCIERO — motor de cálculo, gráficas y nube
   Modelo portado de Nola_Tablero_Financiero.xlsx (Supuestos · P&L · Personal · Flujo 12m)
   ========================================================================== */
'use strict';

/* --------------------------------------------------------- constantes */
const ACCESS_KEY = 'Nola$2026';
const LS_STATE = 'nola_tablero_state_v1';
const LS_CLOUD = 'nola_tablero_cloud_cfg';
const SUPABASE_CDN = 'https://esm.sh/@supabase/supabase-js@2';

// Proyección arranca en jun-26 (mes 1) … may-27 (mes 12) — igual que la hoja "Flujo 12m"
const MONTHS12 = ['jun-26','jul-26','ago-26','sep-26','oct-26','nov-26','dic-26','ene-27','feb-27','mar-27','abr-27','may-27'];
const MONTHS2026 = ['ene-26','feb-26','mar-26','abr-26','may-26','jun-26','jul-26','ago-26','sep-26','oct-26','nov-26','dic-26'];

const CATS = {
  vivienda:   { label: 'Vivienda',     color: '#004643' },
  deuda:      { label: 'Deuda',        color: '#B85C38' },
  fijo:       { label: 'Fijo',         color: '#2D7D6F' },
  suscripcion:{ label: 'Suscripción',  color: '#C9883A' },
  variable:   { label: 'Variable',     color: '#DB9C50' },
  salud:      { label: 'Salud',        color: '#6B7280' },
  otro:       { label: 'Otro',         color: '#0A3625' },
};

/* --------------------------------------------------------- utilidades */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uid = () => 'id' + Math.random().toString(36).slice(2, 9);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
// stringify con llaves ordenadas — para comparar estados sin importar el orden de claves (jsonb reordena)
function stableStr(o) {
  const seen = new WeakSet();
  const norm = v => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return null; seen.add(v);
      if (Array.isArray(v)) return v.map(norm);
      return Object.keys(v).sort().reduce((a, k) => { a[k] = norm(v[k]); return a; }, {});
    }
    return v;
  };
  try { return JSON.stringify(norm(o)); } catch (e) { return null; }
}

const copFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtCOP = n => (n == null || isNaN(n)) ? '—' : copFmt.format(Math.round(n));
function fmtShort(n) {
  if (n == null || isNaN(n)) return '—';
  const s = n < 0 ? '-' : '', a = Math.abs(n);
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + 'M';
  if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'k';
  return s + '$' + Math.round(a);
}
function fmtPct(x, dec = 0) {
  if (x === Infinity) return '∞';
  if (x == null || isNaN(x)) return '—';
  return (x * 100).toFixed(dec) + '%';
}
function fmtMonths(m) {
  if (m === Infinity) return 'sin déficit';
  if (m == null || isNaN(m)) return '—';
  return m.toFixed(1) + ' meses';
}
const cop = (amount, currency, trm) => currency === 'USD' ? (Number(amount) || 0) * trm : (Number(amount) || 0);
function monthlyOf(e, trm) {
  const base = cop(e.amount, e.currency, trm);
  if (e.period === 'quarterly') return base / 3;
  if (e.period === 'annual') return base / 12;
  return base;
}
function setPath(obj, path, val) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = val;
}

/* ========================================================= ESTADO BASE
   Plantilla genérica de arranque (sin cifras personales). Tus datos reales
   viven en la nube (Supabase) y se cargan al iniciar sesión. Para uso local
   sin nube, importá tu respaldo .json desde "Datos · Editar". */
function defaultState() {
  return {
    meta: { version: 1, updatedAt: null },
    global: {
      trm: 4000,
      ceoSalary: 3000000,
      ceoTopupSkandia: 0,
      factorPrestacional: 1.0,
      reserveMonths: 3,
      billingGoal: 120000000,
    },
    team: [
      { id: uid(), name: 'Empleado 1', role: 'Rol', pay: 1500000, projInclude: true },
      { id: uid(), name: 'Empleado 2', role: 'Rol', pay: 1500000, projInclude: true },
      { id: uid(), name: 'Empleado 3', role: 'Rol', pay: 1500000, projInclude: true },
    ],
    licenses: [
      { id: uid(), name: 'Canva',            unit: 23000,  currency: 'COP', qty: 1 },
      { id: uid(), name: 'Google Workspace', unit: 210000, currency: 'COP', qty: 1 },
      { id: uid(), name: 'Claude (Team)',    unit: 20,     currency: 'USD', qty: 3 },
    ],
    clients: [
      { id: uid(), name: 'Cliente 1', gross: 4000000, net: 3400000, recurring: true },
      { id: uid(), name: 'Cliente 2', gross: 4000000, net: 3400000, recurring: true },
    ],
    personalIncome: [
      { id: uid(), name: 'Ingreso adicional', amount: 0, currency: 'COP' },
    ],
    personalExpenses: [
      { id: uid(), name: 'Vivienda',       amount: 1500000, currency: 'COP', period: 'monthly',   category: 'vivienda' },
      { id: uid(), name: 'Deuda / créditos', amount: 0,     currency: 'COP', period: 'monthly',   category: 'deuda' },
      { id: uid(), name: 'Transporte',     amount: 300000,  currency: 'COP', period: 'monthly',   category: 'variable' },
      { id: uid(), name: 'Suscripciones',  amount: 100000,  currency: 'COP', period: 'monthly',   category: 'suscripcion' },
    ],
    skandia: {
      total: 30000000, retencionPct: 0.11, weeks: 10, mesCobro: 3,
      phase2On: false, phase2Value: 75000000, phase2Month: 6,
    },
    liquidity: { cajaEmpresaHoy: 0, ahorrosPersonalesHoy: 0 },
    billing2026: { real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    oneOffs: [],
    projection: { newClients: [], newHires: [], salaryScenario: 3000000 },
  };
}

/* ========================================================= CÁLCULO */
function compute(s) {
  const trm = s.global.trm;
  const C = (a, c) => cop(a, c, trm);

  // --- Empresa: ingresos recurrentes
  const clients = s.clients.filter(c => c.recurring !== false);
  const ingresosNetos = sum(clients.map(c => c.net));
  const facturacionBruta = sum(clients.map(c => c.gross));

  // --- Costos recurrentes
  const nominaBase = sum(s.team.map(t => t.pay));
  const nomina = nominaBase * s.global.factorPrestacional;
  const suscripciones = sum(s.licenses.map(l => C(l.unit, l.currency) * (Number(l.qty) || 1)));
  const opex = nomina + suscripciones;

  // --- Resultado
  const ceoSalary = s.global.ceoSalary;
  const resultAntesCEO = ingresosNetos - opex;
  const resultOperativo = resultAntesCEO - ceoSalary;
  const margen = ingresosNetos ? resultOperativo / ingresosNetos : 0;
  const selfFinances = ingresosNetos >= (opex + ceoSalary);

  // --- Punto de equilibrio
  const breakEvenCEO = opex + ceoSalary;     // ingresos netos para cubrir todo, incluido tu salario
  const breakEvenNoCEO = opex;               // ingresos netos para cubrir solo la operación
  const nClients = clients.length;
  const avgNet = nClients ? ingresosNetos / nClients : 0;
  const clientsToBE = avgNet ? breakEvenCEO / avgNet : 0;
  const maxClientNet = clients.length ? Math.max(...clients.map(c => c.net)) : 0;
  const maxClientShare = ingresosNetos ? maxClientNet / ingresosNetos : 0;

  // --- Skandia (proyecto único, capital)
  const sk = s.skandia;
  const skBruto = sk.total;
  const skRet = sk.total * sk.retencionPct;
  const skNeto = skBruto - skRet;
  const reserva = s.global.reserveMonths * opex;
  const fondoCrecimiento = skNeto - reserva;

  // --- Ingresos únicos esporádicos (proyectos puntuales, ej. un dash para un cliente)
  const oneOffs = Array.isArray(s.oneOffs) ? s.oneOffs : [];
  const oneOffsTotal = sum(oneOffs.map(o => o.amount));
  const oneOffsPending = sum(oneOffs.filter(o => !o.received).map(o => o.amount));
  const oneOffsReceived = oneOffsTotal - oneOffsPending;

  // --- Facturación run-rate vs meta
  const runRate = facturacionBruta * 12 + skBruto + oneOffsTotal;
  const metaProgress = s.global.billingGoal ? runRate / s.global.billingGoal : 0;
  const realized = sum(s.billing2026.real);
  const realizedPct = s.global.billingGoal ? realized / s.global.billingGoal : 0;

  // --- Personal
  const otherPersonalIncome = sum(s.personalIncome.map(i => C(i.amount, i.currency))) + s.global.ceoTopupSkandia;
  const ingresosPersonales = ceoSalary + otherPersonalIncome;
  const expRows = s.personalExpenses.map(e => ({ ...e, monthly: monthlyOf(e, trm) }));
  const gastosPersonales = sum(expRows.map(e => e.monthly));
  const resultPersonal = ingresosPersonales - gastosPersonales;
  const savingsRate = ingresosPersonales ? resultPersonal / ingresosPersonales : 0;
  const deficit = Math.max(-resultPersonal, 0);
  const ahorros = s.liquidity.ahorrosPersonalesHoy;
  const runwayMonths = deficit > 0 ? ahorros / deficit : Infinity;

  // ¿Qué salario CEO cubriría tu vida? y ¿cuánto ingreso recurrente neto falta para pagarlo?
  const salaryToCoverLife = gastosPersonales - otherPersonalIncome;
  const recurringNetGrowthNeeded = Math.max(0, (opex + salaryToCoverLife) - ingresosNetos);

  // categorías
  const catTotals = {};
  Object.keys(CATS).forEach(k => catTotals[k] = 0);
  expRows.forEach(e => { catTotals[e.category || 'otro'] = (catTotals[e.category || 'otro'] || 0) + e.monthly; });

  const cajaEmpresa = s.liquidity.cajaEmpresaHoy;

  const base = {
    trm, clients, ingresosNetos, facturacionBruta, nominaBase, nomina, suscripciones, opex,
    ceoSalary, resultAntesCEO, resultOperativo, margen, selfFinances,
    breakEvenCEO, breakEvenNoCEO, nClients, avgNet, clientsToBE, maxClientNet, maxClientShare,
    skBruto, skRet, skNeto, reserva, fondoCrecimiento,
    oneOffs, oneOffsTotal, oneOffsPending, oneOffsReceived,
    runRate, metaProgress, realized, realizedPct,
    otherPersonalIncome, ingresosPersonales, expRows, gastosPersonales, resultPersonal,
    savingsRate, deficit, ahorros, runwayMonths, salaryToCoverLife, recurringNetGrowthNeeded,
    catTotals, cajaEmpresa,
  };
  base.companyHealth = scoreCompany(base, s);
  base.personalHealth = scorePersonal(base, s);
  base.proj = project(s, base);
  return base;
}

/* ----- Health Score Empresa (0–100) ----- */
function scoreCompany(d, s) {
  const dims = [];
  let p;
  p = clamp(d.margen / 0.15, 0, 1);
  dims.push({ name: 'Margen operativo', max: 25, pct: p, pts: p * 25,
    note: `Margen ${fmtPct(d.margen)} tras tu salario · meta ≥ 15%` });
  const cover = d.opex + d.ceoSalary;
  p = cover ? clamp(d.ingresosNetos / cover, 0, 1) : (d.ingresosNetos > 0 ? 1 : 0);
  dims.push({ name: 'Autofinanciación', max: 20, pct: p, pts: p * 20,
    note: d.selfFinances ? 'Cubre equipo, herramientas y tu salario, y deja excedente' : 'Aún no cubre tu salario completo' });
  const monthsRes = d.opex ? d.cajaEmpresa / d.opex : 0;
  p = clamp(monthsRes / Math.max(1, s.global.reserveMonths), 0, 1);
  dims.push({ name: 'Reserva de caja', max: 20, pct: p, pts: p * 20,
    note: `${monthsRes.toFixed(1)} de ${s.global.reserveMonths} meses de colchón en la cuenta empresa` });
  p = clamp((1 - d.maxClientShare) / 0.5, 0, 1);
  dims.push({ name: 'Diversificación de clientes', max: 15, pct: p, pts: p * 15,
    note: `Tu cliente más grande es ${fmtPct(d.maxClientShare)} de la caja` });
  p = clamp(d.metaProgress, 0, 1);
  dims.push({ name: 'Avance a meta anual', max: 20, pct: p, pts: p * 20,
    note: `Run-rate en ${fmtPct(d.metaProgress)} de la meta de ${fmtShort(s.global.billingGoal)}` });
  return { score: Math.round(sum(dims.map(x => x.pts))), dims };
}

/* ----- Health Score Personal (0–100) ----- */
function scorePersonal(d, s) {
  const dims = [];
  let p;
  p = clamp((d.savingsRate + 0.2) / 0.4, 0, 1);
  dims.push({ name: 'Flujo de caja', max: 30, pct: p, pts: p * 30,
    note: d.resultPersonal >= 0 ? `Ahorrás ${fmtPct(d.savingsRate)} de tu ingreso cada mes`
                                : `Déficit de ${fmtCOP(-d.resultPersonal)}/mes` });
  p = d.deficit > 0 ? clamp(d.runwayMonths / 6, 0, 1) : 1;
  dims.push({ name: 'Runway (meses de aire)', max: 25, pct: p, pts: p * 25,
    note: d.deficit > 0 ? `${fmtMonths(d.runwayMonths)} hasta agotar ahorros al ritmo actual`
                        : 'Sin déficit — no estás consumiendo ahorros' });
  const debtRatio = d.ingresosPersonales ? d.catTotals.deuda / d.ingresosPersonales : 0;
  p = clamp(1 - debtRatio / 0.4, 0, 1);
  dims.push({ name: 'Carga de deuda', max: 20, pct: p, pts: p * 20,
    note: `Deuda = ${fmtPct(debtRatio)} de tu ingreso (créditos + tarjeta)` });
  const fixed = d.catTotals.vivienda + d.catTotals.fijo + d.catTotals.deuda + d.catTotals.suscripcion;
  const fixedRatio = d.ingresosPersonales ? fixed / d.ingresosPersonales : 0;
  p = clamp((1.0 - fixedRatio) / 0.5, 0, 1);
  dims.push({ name: 'Carga de gastos fijos', max: 15, pct: p, pts: p * 15,
    note: `Gastos fijos = ${fmtPct(fixedRatio)} de tu ingreso` });
  const monthsSaved = d.gastosPersonales ? d.ahorros / d.gastosPersonales : 0;
  p = clamp(monthsSaved / 3, 0, 1);
  dims.push({ name: 'Colchón de emergencia', max: 10, pct: p, pts: p * 10,
    note: `${monthsSaved.toFixed(1)} meses de vida ahorrados` });
  return { score: Math.round(sum(dims.map(x => x.pts))), dims };
}

/* ----- Proyección 12 meses (jun-26 → may-27) ----- */
function project(s, d) {
  const N = 12;
  const projSalary = s.projection.salaryScenario;
  const baseNet = d.ingresosNetos;
  const newCl = s.projection.newClients || [];
  const newHires = s.projection.newHires || [];
  const activeTeamPay = sum(s.team.filter(t => t.projInclude !== false).map(t => t.pay));
  const subs = d.suscripciones;

  // mes de cobro fuera de 1..12 (o en blanco) no debe hacer desaparecer el capital: lo acotamos
  const cobroMes = clamp(Math.round(Number(s.skandia.mesCobro) || 1), 1, N);
  const p2Mes = clamp(Math.round(Number(s.skandia.phase2Month) || 1), 1, N);
  const oneOffs = Array.isArray(s.oneOffs) ? s.oneOffs : [];

  let cajaE = d.cajaEmpresa, cajaET = d.cajaEmpresa, cajaP = d.ahorros;
  const arrE = [], arrET = [], arrP = [], arrInflow = [], arrCapital = [];
  for (let m = 1; m <= N; m++) {
    let inflow = baseNet;
    newCl.forEach(c => { if (m >= (c.startMonth || 1)) inflow += (Number(c.net) || 0); });
    let nominaPay = activeTeamPay;
    newHires.forEach(h => { if (m >= (h.startMonth || 1)) nominaPay += (Number(h.pay) || 0); });
    const outflow = nominaPay * s.global.factorPrestacional + subs + projSalary;
    const netOp = inflow - outflow;
    cajaE += netOp;
    let capital = 0;
    if (m === cobroMes) capital += d.skNeto;
    if (s.skandia.phase2On && m === p2Mes) capital += s.skandia.phase2Value * (1 - s.skandia.retencionPct);
    // ingresos únicos esporádicos aún no recibidos entran en su mes
    oneOffs.forEach(o => { if (!o.received && clamp(Math.round(Number(o.month) || 1), 1, N) === m) capital += (Number(o.amount) || 0); });
    cajaET += netOp + capital;
    cajaP += (projSalary + d.otherPersonalIncome) - d.gastosPersonales;
    arrE.push(cajaE); arrET.push(cajaET); arrP.push(cajaP); arrInflow.push(inflow); arrCapital.push(capital);
  }
  let runwayEnd = null;
  for (let i = 0; i < N; i++) { if (arrP[i] < 0) { runwayEnd = i + 1; break; } }

  // Máximo salario que aguantan los clientes (mes 12) manteniendo operación ≥ 0
  const inflow12 = arrInflow[N - 1];
  const nomina12 = (activeTeamPay + sum(newHires.map(h => Number(h.pay) || 0))) * s.global.factorPrestacional;
  const maxSalary = Math.max(0, inflow12 - (nomina12 + subs));

  return { months: MONTHS12, arrE, arrET, arrP, arrInflow, arrCapital, runwayEnd, projSalary, maxSalary };
}

/* ========================================================= GRÁFICAS (SVG) */
const TIP = () => $('#tip');
function showTip(html, x, y) {
  const t = TIP(); t.innerHTML = html; t.style.opacity = '1';
  const w = t.offsetWidth, h = t.offsetHeight;
  let nx = x + 14, ny = y - h - 10;
  if (nx + w > window.innerWidth - 8) nx = x - w - 14;
  if (ny < 8) ny = y + 18;
  t.style.left = nx + 'px'; t.style.top = ny + 'px';
}
function hideTip() { TIP().style.opacity = '0'; }

// Línea con áreas + bandas hover. series:[{name,color,data,fill?,dash?}]
function lineChart(el, { labels, series, fmt = fmtShort, h = 280 }) {
  const W = 760, H = h, mL = 56, mR = 16, mT = 16, mB = 30;
  const all = series.flatMap(s => s.data).filter(v => v != null);
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  if (lo === hi) hi = lo + 1;
  const pad = (hi - lo) * 0.08; hi += pad; lo -= (lo < 0 ? pad : 0);
  const n = labels.length;
  const X = i => mL + (W - mL - mR) * (n === 1 ? 0.5 : i / (n - 1));
  const Y = v => mT + (H - mT - mB) * (1 - (v - lo) / (hi - lo));

  const ticks = 4; let grid = '';
  for (let t = 0; t <= ticks; t++) {
    const val = lo + (hi - lo) * t / ticks, y = Y(val);
    grid += `<line class="grid-line" x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}"/>`;
    grid += `<text class="axis-label" x="${mL - 8}" y="${y + 3}" text-anchor="end">${fmt(val)}</text>`;
  }
  if (lo < 0) { const z = Y(0); grid += `<line class="zero-line" x1="${mL}" y1="${z}" x2="${W - mR}" y2="${z}"/>`; }

  let xlab = '';
  const step = Math.ceil(n / 12);
  labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) xlab += `<text class="axis-label" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });

  let paths = '';
  series.forEach(s => {
    const pts = s.data.map((v, i) => `${X(i)},${Y(v)}`);
    if (s.fill) {
      const area = `M${X(0)},${Y(0)} L` + pts.join(' L') + ` L${X(n - 1)},${Y(0)} Z`;
      paths += `<path d="${area}" fill="${s.color}" opacity="0.10"/>`;
    }
    paths += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="5 4"` : ''}/>`;
    s.data.forEach((v, i) => { paths += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${s.color}"/>`; });
  });

  // bandas hover
  let bands = '';
  for (let i = 0; i < n; i++) {
    const bw = (W - mL - mR) / n;
    bands += `<rect x="${X(i) - bw / 2}" y="${mT}" width="${bw}" height="${H - mT - mB}" fill="transparent" data-i="${i}"/>`;
  }

  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${grid}${paths}<g class="bands">${bands}</g></svg></div>`;
  const svg = el.querySelector('svg');
  svg.querySelectorAll('.bands rect').forEach(r => {
    r.addEventListener('mousemove', ev => {
      const i = +r.dataset.i;
      const rows = series.map(s => `<div class="tt-row"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px"></span>${esc(s.name)}</span><b>${fmt(s.data[i])}</b></div>`).join('');
      showTip(`<div class="tt-h">${esc(labels[i])}</div>${rows}`, ev.clientX, ev.clientY);
    });
    r.addEventListener('mouseleave', hideTip);
  });
}

// Barras verticales con línea de referencia
function barChart(el, { labels, values, color = '#004643', fmt = fmtShort, refLine = null, refLabel = '', h = 240, colorByValue = false }) {
  const W = 760, H = h, mL = 56, mR = 16, mT = 16, mB = 30;
  const vals = values.concat(refLine != null ? [refLine] : []);
  let hi = Math.max(1, ...vals), lo = Math.min(0, ...vals);
  hi += (hi - lo) * 0.1;
  const n = labels.length, bw = (W - mL - mR) / n * 0.58;
  const X = i => mL + (W - mL - mR) * (i + 0.5) / n;
  const Y = v => mT + (H - mT - mB) * (1 - (v - lo) / (hi - lo));
  let grid = '';
  for (let t = 0; t <= 4; t++) { const val = lo + (hi - lo) * t / 4, y = Y(val); grid += `<line class="grid-line" x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}"/><text class="axis-label" x="${mL - 8}" y="${y + 3}" text-anchor="end">${fmt(val)}</text>`; }
  let bars = '';
  values.forEach((v, i) => {
    const y = Y(Math.max(v, 0)), hgt = Math.abs(Y(v) - Y(0));
    const c = colorByValue ? (v >= 0 ? '#2D7D6F' : '#B85C38') : color;
    bars += `<rect x="${X(i) - bw / 2}" y="${y}" width="${bw}" height="${Math.max(1, hgt)}" rx="4" fill="${c}" data-i="${i}"/>`;
  });
  let xlab = ''; labels.forEach((l, i) => xlab += `<text class="axis-label" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`);
  let ref = '';
  if (refLine != null) { const y = Y(refLine); ref = `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}" stroke="#C9883A" stroke-width="2" stroke-dasharray="6 4"/><text class="axis-label" x="${W - mR}" y="${y - 6}" text-anchor="end" fill="#8a5a16" font-weight="800">${esc(refLabel)}</text>`; }
  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}">${grid}${bars}${ref}${xlab}</svg></div>`;
  el.querySelectorAll('rect[data-i]').forEach(r => {
    r.addEventListener('mousemove', ev => { const i = +r.dataset.i; showTip(`<div class="tt-h">${esc(labels[i])}</div><div class="tt-row"><span>Valor</span><b>${fmt(values[i])}</b></div>`, ev.clientX, ev.clientY); });
    r.addEventListener('mouseleave', hideTip);
  });
}

// Donut
function donut(el, { segments, centerTop = '', centerBot = '' }) {
  const total = sum(segments.map(s => s.value)) || 1;
  const R = 70, r = 46, cx = 90, cy = 90; let a0 = -Math.PI / 2; let arcs = '';
  segments.forEach(s => {
    const frac = s.value / total, a1 = a0 + frac * Math.PI * 2;
    const big = frac > 0.5 ? 1 : 0;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a1), yi0 = cy + r * Math.sin(a1), xi1 = cx + r * Math.cos(a0), yi1 = cy + r * Math.sin(a0);
    arcs += `<path d="M${x0},${y0} A${R},${R} 0 ${big} 1 ${x1},${y1} L${xi0},${yi0} A${r},${r} 0 ${big} 0 ${xi1},${yi1} Z" fill="${s.color}" data-lab="${esc(s.label)}" data-val="${s.value}"/>`;
    a0 = a1;
  });
  let legend = segments.map(s => `<div class="li"><span class="sw dot" style="background:${s.color}"></span>${esc(s.label)} · <b>${fmtPct(s.value / total)}</b></div>`).join('');
  el.innerHTML = `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <svg viewBox="0 0 180 180" width="160" height="160">${arcs}
      <text x="90" y="86" text-anchor="middle" font-family="var(--font-display)" font-size="22" fill="#004643">${esc(centerTop)}</text>
      <text x="90" y="104" text-anchor="middle" font-size="10" fill="#6B7280" font-weight="700">${esc(centerBot)}</text>
    </svg><div class="legend" style="flex-direction:column;gap:7px">${legend}</div></div>`;
  el.querySelectorAll('path[data-lab]').forEach(p => {
    p.addEventListener('mousemove', ev => showTip(`<div class="tt-row"><span>${esc(p.dataset.lab)}</span><b>${fmtCOP(+p.dataset.val)}</b></div>`, ev.clientX, ev.clientY));
    p.addEventListener('mouseleave', hideTip);
  });
}

// Gauge anillo (devuelve string SVG)
function gaugeSVG(value) {
  const v = clamp(value, 0, 100), R = 56, C = 2 * Math.PI * R, off = C * (1 - v / 100);
  const color = v >= 75 ? '#2D7D6F' : v >= 50 ? '#C9883A' : '#B85C38';
  return `<svg width="132" height="132" viewBox="0 0 132 132">
    <circle cx="66" cy="66" r="${R}" fill="none" stroke="rgba(0,70,67,0.10)" stroke-width="11"/>
    <circle cx="66" cy="66" r="${R}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)"/>
  </svg>`;
}
function scoreState(v) {
  if (v >= 80) return { t: 'Sólida', c: 'var(--sage)' };
  if (v >= 60) return { t: 'Estable', c: 'var(--sage)' };
  if (v >= 40) return { t: 'En vigilancia', c: 'var(--ochre)' };
  return { t: 'Crítica', c: 'var(--rust)' };
}

/* ========================================================= RENDER: componentes */
function gaugeBlock(title, score) {
  const st = scoreState(score);
  return `<div class="gauge-wrap">
    <div class="gauge">${gaugeSVG(score)}<div class="gctr"><span class="gnum">${score}</span><span class="gmax">/ 100</span></div></div>
    <div class="gauge-info"><div class="gtitle">${esc(title)}</div><div class="gstate" style="color:${st.c}">${st.t}</div></div>
  </div>`;
}
function dimsList(dims) {
  return dims.map(x => {
    const pct = Math.round(x.pct * 100);
    const col = x.pct >= 0.75 ? 'var(--sage)' : x.pct >= 0.45 ? 'var(--ochre)' : 'var(--rust)';
    return `<div class="dim">
      <div class="dim-h"><span class="dn">${esc(x.name)}</span><span class="dp">${Math.round(x.pts)}/${x.max}</span></div>
      <div class="dim-track"><div class="dim-fill" style="width:${pct}%;background:${col}"></div></div>
      <div class="dim-note">${esc(x.note)}</div>
    </div>`;
  }).join('');
}
const head = (num, title, lead) => `<div class="view-head">
  <span class="eyebrow"><span class="num">${num}</span> · Nola Labs</span>
  <h2>${esc(title)}</h2>${lead ? `<p class="lead">${lead}</p>` : ''}</div>`;

/* ========================================================= VISTAS */
function renderResumen() {
  const d = D;
  const selfChip = d.selfFinances
    ? `<span class="chip chip--ok"><span class="cdot"></span>Se autofinancia</span>`
    : `<span class="chip chip--warn"><span class="cdot"></span>No cubre tu salario</span>`;
  const runwayChip = d.deficit > 0
    ? `<span class="chip chip--warn"><span class="cdot"></span>${fmtMonths(d.runwayMonths)}</span>`
    : `<span class="chip chip--ok"><span class="cdot"></span>Sin déficit</span>`;
  const gap = d.salaryToCoverLife - d.ceoSalary;

  const el = $('#view-resumen');
  el.innerHTML = head('01', 'Resumen', 'Una sola lectura de tu salud financiera: la empresa y tu bolsillo, unidos por tu salario CEO. Editá cualquier dato en <b>Datos · Editar</b> y todo recalcula en vivo.') + `
  <div class="grid g-4">
    <div class="card kpi--dark kpi">
      <span class="klabel">Resultado recurrente / mes</span>
      <span class="kval">${fmtCOP(d.resultOperativo)}</span>
      <span class="ksub">Tras tu salario de ${fmtShort(d.ceoSalary)}. ${selfChip}</span>
    </div>
    <div class="card kpi">
      <span class="klabel">Runway personal</span>
      <span class="kval">${d.deficit > 0 ? fmtMonths(d.runwayMonths) : '∞'}</span>
      <span class="ksub">${d.deficit > 0 ? `Déficit ${fmtCOP(d.deficit)}/mes · ahorros ${fmtCOP(d.ahorros)}` : 'Tu ingreso cubre tu vida'} ${runwayChip}</span>
    </div>
    <div class="card kpi">
      <span class="klabel">Salario CEO sostenible</span>
      <span class="kval">${fmtShort(d.ceoSalary)}</span>
      <span class="ksub">Para cubrir tu vida necesitás <b>${fmtShort(d.salaryToCoverLife)}</b> ${gap > 0 ? `· faltan ${fmtShort(gap)}` : '· ya lo cubre'}</span>
    </div>
    <div class="card kpi--dark kpi">
      <span class="klabel">Fondo de crecimiento</span>
      <span class="kval">${fmtCOP(d.fondoCrecimiento)}</span>
      <span class="ksub">Capital tras reserva. Aún no recibido</span>
    </div>
  </div>

  <div class="grid g-12 mt-16">
    <div class="card pad-lg">
      <div class="card-h"><h3>Empresa vs. bolsillo personal · 12 meses</h3><span class="eyebrow">Caja</span></div>
      <div id="chart-overview"></div>
      <div class="legend"><div class="li"><span class="sw" style="background:#004643"></span>Caja empresa (con proyecto)</div><div class="li"><span class="sw" style="background:#B85C38"></span>Caja personal (runway)</div></div>
      <p class="card-note">La caja de la empresa sube sola; tu caja personal baja cada mes desde tus ahorros. El proyecto único entra como capital aparte, no a tu bolsillo.</p>
    </div>
    <div class="card">
      <div class="card-h"><h3>Salud financiera</h3></div>
      ${gaugeBlock('Empresa', d.companyHealth.score)}
      <div class="divider"></div>
      ${gaugeBlock('Personal', d.personalHealth.score)}
      <button class="btn btn--ghost btn--sm btn--full mt-16" data-go="salud">Ver desglose por dimensión →</button>
    </div>
  </div>

  <div class="grid g-3 mt-16">
    ${statusCallouts(d)}
  </div>`;

  lineChart($('#chart-overview'), {
    labels: d.proj.months,
    series: [
      { name: 'Caja empresa', color: '#004643', data: d.proj.arrET, fill: true },
      { name: 'Caja personal', color: '#B85C38', data: d.proj.arrP, fill: true },
    ],
  });
}

function statusCallouts(d) {
  const out = [];
  if (d.selfFinances) {
    out.push(`<div class="callout callout--ok span-2"><span class="ci">✓</span><div class="ct"><b>Operación recurrente sana.</b> Tus ingresos recurrentes cubren equipo, herramientas y tu salario de ${fmtShort(d.ceoSalary)}, y dejan ${fmtCOP(d.resultOperativo)} de excedente al mes. La empresa no es el problema.</div></div>`);
  } else {
    out.push(`<div class="callout callout--warn span-2"><span class="ci">!</span><div class="ct"><b>La operación aún no cubre tu salario.</b> Faltan ${fmtCOP(d.breakEvenCEO - d.ingresosNetos)} de ingreso neto recurrente para sostener ${fmtShort(d.ceoSalary)}/mes.</div></div>`);
  }
  if (d.deficit > 0) {
    out.push(`<div class="callout callout--ochre"><span class="ci">⏱</span><div class="ct"><b>El reloj.</b> Tu salario sostenible no cubre tu vida: déficit de ${fmtCOP(d.deficit)}/mes. A ese ritmo tus ahorros duran ${fmtMonths(d.runwayMonths)}.</div></div>`);
  } else {
    out.push(`<div class="callout callout--ok"><span class="ci">✓</span><div class="ct"><b>Tu vida está cubierta.</b> Tu ingreso personal supera tus gastos. Sin reloj corriendo.</div></div>`);
  }
  return out.join('');
}

function oneOffTable(s, d) {
  const list = Array.isArray(s.oneOffs) ? s.oneOffs : [];
  if (!list.length) return `<p class="hint">Sin ingresos únicos registrados. Agregá proyectos puntuales o esporádicos (cliente, monto, mes) en <b>Datos · Editar</b> — aparecen acá, entran a tu caja proyectada y suman a tu facturación anual.</p>`;
  const rows = list.slice().sort((a, b) => (a.month || 0) - (b.month || 0)).map(o => {
    const chip = o.received ? `<span class="chip chip--ok"><span class="cdot"></span>Recibido</span>` : `<span class="chip chip--info"><span class="cdot"></span>Esperado</span>`;
    const ml = MONTHS12[clamp(Math.round(Number(o.month) || 1), 1, 12) - 1];
    return `<tr><td>${esc(o.client || '—')}</td><td>${esc(o.name || '—')}</td><td>${esc(ml)}</td><td class="r tabnum">${fmtCOP(o.amount)}</td><td>${chip}</td></tr>`;
  }).join('');
  return `<table class="tbl"><thead><tr><th>Cliente</th><th>Proyecto</th><th>Mes</th><th class="r">Monto</th><th>Estado</th></tr></thead>
    <tbody>${rows}<tr class="total"><td>Total · ${list.length}</td><td></td><td></td><td class="r tabnum">${fmtCOP(d.oneOffsTotal)}</td><td></td></tr></tbody></table>
    <p class="card-note">Recibido ${fmtCOP(d.oneOffsReceived)} · esperado ${fmtCOP(d.oneOffsPending)}. Los esperados entran a tu caja proyectada en su mes; los recibidos se asumen ya en tu saldo de empresa.</p>`;
}

function renderEmpresa() {
  const d = D, s = S;
  const el = $('#view-empresa');
  const clientRows = d.clients.map(c => `<tr>
    <td>${esc(c.name)}</td>
    <td class="r tabnum">${fmtCOP(c.gross)}</td>
    <td class="r tabnum">${fmtCOP(c.net)}</td>
    <td class="r tabnum">${fmtPct(d.ingresosNetos ? c.net / d.ingresosNetos : 0)}</td>
  </tr>`).join('');
  const costRows = [
    ...s.team.map(t => ({ n: `${t.name} · ${t.role}`, v: t.pay * s.global.factorPrestacional })),
    { n: `Suscripciones (${s.licenses.length})`, v: d.suscripciones },
  ].map(x => `<tr><td>${esc(x.n)}</td><td class="r tabnum">${fmtCOP(x.v)}</td><td class="r tabnum">${fmtPct(d.ingresosNetos ? x.v / d.ingresosNetos : 0)}</td></tr>`).join('');

  const beChip = d.selfFinances ? `<span class="chip chip--ok"><span class="cdot"></span>Por encima del equilibrio</span>` : `<span class="chip chip--warn"><span class="cdot"></span>Por debajo</span>`;

  el.innerHTML = head('02', 'Empresa', 'P&L recurrente mes a mes, sin el proyecto único. Tu punto de equilibrio y el avance hacia la meta de facturación.') + `
  <div class="grid g-4">
    <div class="card kpi"><span class="klabel">Ingresos netos / mes</span><span class="kval">${fmtCOP(d.ingresosNetos)}</span><span class="ksub">${d.nClients} clientes recurrentes</span></div>
    <div class="card kpi"><span class="klabel">Costos operativos</span><span class="kval">${fmtCOP(d.opex)}</span><span class="ksub">Equipo ${fmtShort(d.nomina)} + herramientas ${fmtShort(d.suscripciones)}</span></div>
    <div class="card kpi"><span class="klabel">Resultado tras tu salario</span><span class="kval" style="color:${d.resultOperativo >= 0 ? 'var(--sage)' : 'var(--rust)'}">${fmtCOP(d.resultOperativo)}</span><span class="ksub">${beChip}</span></div>
    <div class="card kpi"><span class="klabel">Margen operativo</span><span class="kval">${fmtPct(d.margen)}</span><span class="ksub">Sobre ingresos netos</span></div>
  </div>

  <div class="grid g-2 mt-16">
    <div class="card"><div class="card-h"><h3>Clientes recurrentes</h3><span class="eyebrow">Ingresos</span></div>
      <table class="tbl"><thead><tr><th>Cliente</th><th class="r">Bruto</th><th class="r">Neto (caja)</th><th class="r">% caja</th></tr></thead>
      <tbody>${clientRows}<tr class="total"><td>Total neto</td><td class="r tabnum">${fmtCOP(d.facturacionBruta)}</td><td class="r tabnum">${fmtCOP(d.ingresosNetos)}</td><td class="r">100%</td></tr></tbody></table>
    </div>
    <div class="card"><div class="card-h"><h3>Estructura de costos</h3><span class="eyebrow">Egresos</span></div>
      <table class="tbl"><thead><tr><th>Concepto</th><th class="r">Mensual</th><th class="r">% ingreso</th></tr></thead>
      <tbody>${costRows}
      <tr><td>Tu salario CEO</td><td class="r tabnum">${fmtCOP(d.ceoSalary)}</td><td class="r tabnum">${fmtPct(d.ingresosNetos ? d.ceoSalary / d.ingresosNetos : 0)}</td></tr>
      <tr class="total"><td>Total con salario</td><td class="r tabnum">${fmtCOP(d.opex + d.ceoSalary)}</td><td class="r tabnum">${fmtPct(d.ingresosNetos ? (d.opex + d.ceoSalary) / d.ingresosNetos : 0)}</td></tr></tbody></table>
    </div>
  </div>

  <div class="grid g-12 mt-16">
    <div class="card"><div class="card-h"><h3>Punto de equilibrio</h3><span class="eyebrow">Break-even</span></div>
      <div id="chart-be"></div>
      <div class="legend"><div class="li"><span class="sw" style="background:#004643"></span>Tus ingresos netos</div><div class="li"><span class="sw" style="background:#C9883A"></span>Equilibrio (con tu salario)</div></div>
      <div class="grid g-2 mt-16">
        <div class="insight"><div class="il">Equilibrio sin tu salario</div><div class="iv">${fmtShort(d.breakEvenNoCEO)}</div><div class="id">Para cubrir solo la operación</div></div>
        <div class="insight"><div class="il">Equilibrio con tu salario</div><div class="iv">${fmtShort(d.breakEvenCEO)}</div><div class="id">${d.avgNet ? `${d.clientsToBE.toFixed(1)} clientes promedio (${fmtShort(d.avgNet)} c/u)` : 'sin clientes de referencia para estimar'}</div></div>
      </div>
      <p class="card-note">Hoy facturás ${fmtCOP(d.ingresosNetos)} netos. ${d.selfFinances ? `Estás <b>${fmtCOP(d.ingresosNetos - d.breakEvenCEO)} por encima</b> del equilibrio con salario.` : `Te faltan <b>${fmtCOP(d.breakEvenCEO - d.ingresosNetos)}</b> para llegar al equilibrio con salario.`}</p>
    </div>
    <div class="card"><div class="card-h"><h3>Composición</h3></div><div id="chart-cost"></div></div>
  </div>

  <div class="card mt-16"><div class="card-h"><h3>Facturación 2026 · real vs meta</h3><span class="eyebrow">Run-rate ${fmtPct(d.metaProgress)} de meta</span></div>
    <div id="chart-fact"></div>
    <div class="grid g-3 mt-16">
      <div class="insight"><div class="il">Facturado real 2026</div><div class="iv">${fmtShort(d.realized)}</div><div class="id">${fmtPct(d.realizedPct)} de la meta</div></div>
      <div class="insight"><div class="il">Run-rate proyectado</div><div class="iv">${fmtShort(d.runRate)}</div><div class="id">Recurrente ×12 + proyecto único${d.oneOffsTotal ? ' + únicos' : ''}</div></div>
      <div class="insight"><div class="il">Meta 2026</div><div class="iv">${fmtShort(s.global.billingGoal)}</div><div class="id">Brecha ${fmtShort(s.global.billingGoal - d.runRate)}</div></div>
    </div>
  </div>

  <div class="card mt-16"><div class="card-h"><h3>Ingresos únicos · esporádicos</h3><span class="eyebrow">Proyectos puntuales</span></div>
    ${oneOffTable(s, d)}
  </div>`;

  barChart($('#chart-be'), { labels: ['Ingresos netos'], values: [d.ingresosNetos], color: '#004643', refLine: d.breakEvenCEO, refLabel: 'Equilibrio', fmt: fmtShort, h: 200 });
  donut($('#chart-cost'), { segments: [
    { label: 'Nómina equipo', value: d.nomina, color: '#004643' },
    { label: 'Herramientas', value: d.suscripciones, color: '#C9883A' },
    { label: 'Tu salario', value: d.ceoSalary, color: '#2D7D6F' },
    { label: 'Excedente', value: Math.max(0, d.resultOperativo), color: '#DFB37E' },
  ], centerTop: fmtPct(d.margen), centerBot: 'margen' });
  barChart($('#chart-fact'), { labels: MONTHS2026, values: s.billing2026.real, color: '#2D7D6F', refLine: s.global.billingGoal / 12, refLabel: 'Meta/mes', fmt: fmtShort, h: 240 });
}

function renderPersonal() {
  const d = D, s = S;
  const el = $('#view-personal');
  const expRows = d.expRows.slice().sort((a, b) => b.monthly - a.monthly).map(e => {
    const share = d.ingresosPersonales ? e.monthly / d.ingresosPersonales : 0;
    const flag = share < 0.05 ? 'g' : share < 0.15 ? 'a' : 'r';
    const cat = CATS[e.category] || CATS.otro;
    return `<tr>
      <td><span class="flag ${flag}"></span> ${esc(e.name)}</td>
      <td><span class="cat" style="color:${cat.color}">${cat.label}</span></td>
      <td class="r tabnum">${fmtCOP(e.monthly)}</td>
      <td class="r tabnum">${fmtPct(share, 1)}</td>
    </tr>`;
  }).join('');
  const incRows = [
    `<tr><td>Salario CEO</td><td class="r tabnum">${fmtCOP(d.ceoSalary)}</td></tr>`,
    ...s.personalIncome.map(i => `<tr><td>${esc(i.name)}${i.currency === 'USD' ? ` (${i.amount} USD)` : ''}</td><td class="r tabnum">${fmtCOP(cop(i.amount, i.currency, d.trm))}</td></tr>`),
  ].join('');
  const segs = Object.keys(d.catTotals).filter(k => d.catTotals[k] > 0).map(k => ({ label: CATS[k].label, value: d.catTotals[k], color: CATS[k].color }));

  el.innerHTML = head('03', 'Personal', 'Tu presupuesto personal: ¿tu salario CEO cubre tu vida? Cada gasto muestra qué porcentaje de tu ingreso consume y un semáforo de impacto.') + `
  <div class="grid g-4">
    <div class="card kpi"><span class="klabel">Ingresos personales</span><span class="kval">${fmtCOP(d.ingresosPersonales)}</span><span class="ksub">Salario + trading</span></div>
    <div class="card kpi"><span class="klabel">Gastos personales</span><span class="kval">${fmtCOP(d.gastosPersonales)}</span><span class="ksub">${s.personalExpenses.length} conceptos mensualizados</span></div>
    <div class="card kpi"><span class="klabel">Resultado mensual</span><span class="kval" style="color:${d.resultPersonal >= 0 ? 'var(--sage)' : 'var(--rust)'}">${fmtCOP(d.resultPersonal)}</span><span class="ksub">${d.resultPersonal >= 0 ? 'Superávit' : 'Déficit a financiar con ahorros'}</span></div>
    <div class="card kpi--dark kpi"><span class="klabel">Runway personal</span><span class="kval">${d.deficit > 0 ? fmtMonths(d.runwayMonths) : '∞'}</span><span class="ksub">Ahorros ${fmtCOP(d.ahorros)}</span></div>
  </div>

  <div class="grid g-12 mt-16">
    <div class="card"><div class="card-h"><h3>Gastos · impacto por concepto</h3><span class="eyebrow">% de tu ingreso</span></div>
      <table class="tbl"><thead><tr><th>Concepto</th><th>Categoría</th><th class="r">Mensual</th><th class="r">% ingreso</th></tr></thead>
      <tbody>${expRows}<tr class="total"><td>Total</td><td></td><td class="r tabnum">${fmtCOP(d.gastosPersonales)}</td><td class="r tabnum">${fmtPct(d.ingresosPersonales ? d.gastosPersonales / d.ingresosPersonales : 0)}</td></tr></tbody></table>
      <p class="card-note"><span class="flag g"></span> &lt;5% &nbsp; <span class="flag a"></span> 5–15% &nbsp; <span class="flag r"></span> &gt;15% del ingreso. Editá montos en <b>Datos · Editar</b>.</p>
    </div>
    <div class="card"><div class="card-h"><h3>¿En qué se va la plata?</h3></div><div id="chart-pers"></div>
      <div class="card"><div class="card-h"><h3 style="font-size:13px">Ingresos</h3></div><table class="tbl"><tbody>${incRows}<tr class="total"><td>Total</td><td class="r tabnum">${fmtCOP(d.ingresosPersonales)}</td></tr></tbody></table></div>
    </div>
  </div>

  <div class="callout callout--ochre mt-16"><span class="ci">◎</span><div class="ct"><b>Para que tu salario cubra tu vida</b> debe subir de ${fmtShort(d.ceoSalary)} a <b>${fmtShort(d.salaryToCoverLife)}</b>/mes. Para que la empresa lo aguante sin perder el equilibrio, el ingreso recurrente neto debe crecer <b>${fmtCOP(d.recurringNetGrowthNeeded)}/mes</b> — un cliente tamaño F&M, o un producto de ingreso recurrente.</div></div>`;

  donut($('#chart-pers'), { segments: segs, centerTop: fmtShort(d.gastosPersonales), centerBot: '/ mes' });
}

function renderSalud() {
  const d = D;
  const el = $('#view-salud');
  el.innerHTML = head('04', 'Salud financiera', 'Tu scoring de salud — empresa y bolsillo — calculado sobre 5 dimensiones cada uno. Cada gasto o cliente que edités mueve la aguja en vivo. Así sabés cómo estás con cada decisión.') + `
  <div class="grid g-2">
    <div class="card pad-lg"><div class="card-h"><span class="eyebrow">Empresa</span></div>
      ${gaugeBlock('Nola Labs', d.companyHealth.score)}
      <div class="divider"></div>${dimsList(d.companyHealth.dims)}
    </div>
    <div class="card pad-lg"><div class="card-h"><span class="eyebrow">Personal</span></div>
      ${gaugeBlock('Mateo', d.personalHealth.score)}
      <div class="divider"></div>${dimsList(d.personalHealth.dims)}
    </div>
  </div>
  <div class="card mt-16"><div class="card-h"><h3>Impacto de cada gasto en tu score personal</h3><span class="eyebrow">Cada peso cuenta</span></div>
    <table class="tbl"><thead><tr><th>Gasto</th><th>Categoría</th><th class="r">Mensual</th><th class="r">% ingreso</th><th>Impacto</th></tr></thead><tbody>
    ${d.expRows.slice().sort((a, b) => b.monthly - a.monthly).map(e => {
      const share = d.ingresosPersonales ? e.monthly / d.ingresosPersonales : 0;
      const flag = share < 0.05 ? 'g' : share < 0.15 ? 'a' : 'r';
      const lab = flag === 'g' ? 'Bajo' : flag === 'a' ? 'Medio' : 'Alto';
      return `<tr><td>${esc(e.name)}</td><td><span class="cat">${(CATS[e.category] || CATS.otro).label}</span></td><td class="r tabnum">${fmtCOP(e.monthly)}</td><td class="r tabnum">${fmtPct(share, 1)}</td><td><span class="flag ${flag}"></span> ${lab}</td></tr>`;
    }).join('')}
    </tbody></table>
  </div>`;
}

function projResultsHTML(d, s, p) {
  return `<div class="card"><div class="card-h"><h3>Caja proyectada · 12 meses</h3><span class="eyebrow">jun-26 → may-27</span></div>
      <div id="chart-proj"></div>
      <div class="legend"><div class="li"><span class="sw" style="background:#004643"></span>Caja empresa (con capital)</div><div class="li"><span class="sw" style="background:#2D7D6F"></span>Caja empresa operativa</div><div class="li"><span class="sw" style="background:#B85C38"></span>Caja personal</div></div>
    </div>
    <div class="grid g-3 mt-16">
      <div class="insight"><div class="il">Runway personal</div><div class="iv">${p.runwayEnd ? 'Mes ' + p.runwayEnd : 'No se agota'}</div><div class="id">${p.runwayEnd ? `Se agota en ${esc(p.months[p.runwayEnd - 1])}` : 'Tu caja personal aguanta los 12 meses'}</div></div>
      <div class="insight"><div class="il">Caja empresa a 12m</div><div class="iv">${fmtShort(p.arrET[11])}</div><div class="id">Operativa + proyecto${s.skandia.phase2On ? ' + Fase 2' : ''}</div></div>
      <div class="insight"><div class="il">Salario máx. sostenible</div><div class="iv">${fmtShort(p.maxSalary)}</div><div class="id">Con los clientes del escenario</div></div>
    </div>
    <div class="card mt-16"><div class="card-h"><h3>Detalle mensual</h3></div>
      <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Mes</th><th class="r">Caja empresa</th><th class="r">Caja personal</th><th class="r">Capital</th></tr></thead>
      <tbody>${p.months.map((m, i) => `<tr><td>${esc(m)}</td><td class="r tabnum">${fmtShort(p.arrET[i])}</td><td class="r tabnum" style="color:${p.arrP[i] < 0 ? 'var(--rust)' : 'inherit'}">${fmtShort(p.arrP[i])}</td><td class="r tabnum">${p.arrCapital[i] ? fmtShort(p.arrCapital[i]) : '—'}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
}
function drawProjChart(p) {
  lineChart($('#chart-proj'), { labels: p.months, series: [
    { name: 'Caja empresa (total)', color: '#004643', data: p.arrET, fill: true },
    { name: 'Caja empresa operativa', color: '#2D7D6F', data: p.arrE, dash: true },
    { name: 'Caja personal', color: '#B85C38', data: p.arrP, fill: true },
  ], h: 300 });
}
// Actualiza solo resultados + etiquetas, SIN reconstruir los controles (para no romper el arrastre del slider)
function reProj() {
  D = compute(S); S.meta.updatedAt = Date.now(); saveLocal(); queueCloudSave(); updateHeader();
  const p = D.proj, set = (id, v) => { const e = $('#' + id); if (e) e.textContent = v; };
  set('cvalSalary', fmtShort(p.projSalary));
  set('cvalP2val', fmtShort(S.skandia.phase2Value));
  set('cvalP2mes', 'Mes ' + S.skandia.phase2Month);
  const hs = $('#hintSalary'); if (hs) hs.textContent = `Para cubrir tu vida: ${fmtShort(D.salaryToCoverLife)}. La empresa hoy aguanta hasta ${fmtShort(p.maxSalary)}.`;
  const sm = $('#p2Summary'); if (sm) sm.textContent = `${fmtShort(S.skandia.phase2Value)} · entra en mes ${S.skandia.phase2Month}`;
  const pc = $('#phase2Cfg'); if (pc) pc.hidden = !S.skandia.phase2On;
  const r = $('#projResults'); if (r) { r.innerHTML = projResultsHTML(D, S, p); drawProjChart(p); }
}
function renderProyecciones() {
  const d = D, s = S, p = d.proj;
  const el = $('#view-proyecciones');
  const newClientRows = (s.projection.newClients || []).map(c => `<div class="switchrow" data-cid="${c.id}">
    <div><div class="sn">${esc(c.name || 'Cliente nuevo')}</div><div class="sm">${fmtShort(c.net)} neto · desde mes ${c.startMonth}</div></div>
    <button class="iconbtn" data-delclient="${c.id}">✕</button></div>`).join('') || `<p class="hint">Sin clientes nuevos en el escenario. Agregá uno para ver el efecto.</p>`;
  const teamToggles = s.team.map(t => `<label class="toggle" style="display:flex;justify-content:space-between;width:100%;margin:6px 0">
    <span class="tl">${esc(t.name)} · ${fmtShort(t.pay)}</span>
    <span style="display:flex;align-items:center"><input type="checkbox" data-projinc="${t.id}" ${t.projInclude !== false ? 'checked' : ''}><span class="tr"></span></span></label>`).join('');

  el.innerHTML = head('05', 'Proyecciones', 'Mové las palancas y mirá cómo cambian tu caja y tu runway a 12 meses. Crecer clientes, prender el proyecto Fase 2, subir tu salario, contratar o soltar gente.') + `
  <div class="grid g-21">
    <div class="card"><div class="card-h"><h3>Palancas</h3><span class="eyebrow">Escenario</span></div>

      <div class="ctrl"><div class="ctrl-h"><label>Tu salario CEO (proyección)</label><span class="cval" id="cvalSalary">${fmtShort(p.projSalary)}</span></div>
        <input type="range" id="rngSalary" min="2000000" max="8000000" step="100000" value="${p.projSalary}">
        <p class="hint" id="hintSalary">Para cubrir tu vida: ${fmtShort(d.salaryToCoverLife)}. La empresa hoy aguanta hasta ${fmtShort(p.maxSalary)}.</p>
      </div>
      <div class="divider"></div>

      <div class="switchrow"><div><div class="sn">Proyecto Fase 2</div><div class="sm" id="p2Summary">${fmtShort(s.skandia.phase2Value)} · entra en mes ${s.skandia.phase2Month}</div></div>
        <label class="toggle"><input type="checkbox" id="tglPhase2" ${s.skandia.phase2On ? 'checked' : ''}><span class="tr"></span></label></div>
      <div id="phase2Cfg" ${s.skandia.phase2On ? '' : 'hidden'}>
        <div class="ctrl mt-8"><div class="ctrl-h"><label>Valor Fase 2</label><span class="cval" id="cvalP2val">${fmtShort(s.skandia.phase2Value)}</span></div>
          <input type="range" id="rngP2val" min="40000000" max="120000000" step="5000000" value="${s.skandia.phase2Value}"></div>
        <div class="ctrl"><div class="ctrl-h"><label>Mes de entrada</label><span class="cval" id="cvalP2mes">Mes ${s.skandia.phase2Month}</span></div>
          <input type="range" id="rngP2mes" min="1" max="12" step="1" value="${s.skandia.phase2Month}"></div>
      </div>
      <div class="divider"></div>

      <div class="ctrl-h"><label>Crecer clientes</label></div>
      <div id="newClientList">${newClientRows}</div>
      <button class="btn btn--ghost btn--sm mt-8" id="addNewClient">+ Cliente al escenario</button>
      <div class="divider"></div>

      <div class="ctrl-h"><label>Equipo en la proyección</label></div>
      <p class="hint">Desactivá a alguien para simular soltarlo.</p>
      ${teamToggles}
    </div>

    <div id="projResults">${projResultsHTML(d, s, p)}</div>
  </div>`;

  drawProjChart(p);
  bindProjections();
}

/* ========================================================= EDITOR */
function repeatField(label, value, path, opts = {}) {
  const type = opts.type || 'number';
  const attrs = [opts.step ? `step="${opts.step}"` : '', opts.min != null ? `min="${opts.min}"` : '', opts.max != null ? `max="${opts.max}"` : ''].join(' ');
  return `<div class="field-inline"><label>${esc(label)}</label><input class="input" type="${type}" value="${esc(value)}" data-edit="${path}" ${attrs}></div>`;
}
function renderEditor() {
  const s = S;
  const el = $('#view-editor');
  const g = s.global;
  el.innerHTML = head('—', 'Datos · Editar', 'Todo lo editable en un solo lugar. Cambiá un número y el tablero entero recalcula al instante. Las cifras vienen de tu Excel (jun-2026).') + `
  <div class="editor-sec card"><div class="card-h"><h3>Parámetros globales</h3></div>
    <div class="grid g-4">
      ${repeatField('TRM (COP/USD)', g.trm, 'global.trm')}
      ${repeatField('Salario CEO sostenible', g.ceoSalary, 'global.ceoSalary')}
      ${repeatField('Top-up del proyecto al salario', g.ceoTopupSkandia, 'global.ceoTopupSkandia')}
      ${repeatField('Factor prestacional', g.factorPrestacional, 'global.factorPrestacional', { step: '0.01' })}
      ${repeatField('Reserva objetivo (meses)', g.reserveMonths, 'global.reserveMonths')}
      ${repeatField('Meta facturación 2026', g.billingGoal, 'global.billingGoal')}
    </div>
    <div class="hint">Factor prestacional: 1.00 si son contratistas; ~1.45 si son empleados con contrato laboral.</div>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Saldos reales hoy · tus dos cuentas</h3><span class="eyebrow">Cuentas separadas</span></div>
    <div class="grid g-2">
      ${repeatField('Caja EMPRESA disponible hoy', s.liquidity.cajaEmpresaHoy, 'liquidity.cajaEmpresaHoy')}
      ${repeatField('Ahorros PERSONALES hoy', s.liquidity.ahorrosPersonalesHoy, 'liquidity.ahorrosPersonalesHoy')}
    </div>
    ${s.liquidity.cajaEmpresaHoy === 0 ? `<div class="warnbox">⚠ Completá el saldo real de la cuenta de la empresa hoy — afecta tu reserva y tu score.</div>` : ''}
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Equipo en nómina · ${s.team.length}</h3><span class="eyebrow">Empleados</span></div>
    <div id="ed-team"></div>
    <button class="btn btn--ghost btn--sm row-add" data-add="team">+ Agregar persona</button>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Licencias y herramientas · ${s.licenses.length}</h3><span class="eyebrow">Suscripciones</span></div>
    <div id="ed-lic"></div>
    <button class="btn btn--ghost btn--sm row-add" data-add="licenses">+ Agregar licencia</button>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Clientes recurrentes · ${s.clients.length}</h3><span class="eyebrow">Facturación</span></div>
    <div id="ed-cli"></div>
    <button class="btn btn--ghost btn--sm row-add" data-add="clients">+ Agregar cliente</button>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Ingresos personales</h3></div>
    <div id="ed-inc"></div>
    <button class="btn btn--ghost btn--sm row-add" data-add="personalIncome">+ Agregar ingreso</button>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Gastos personales · ${s.personalExpenses.length}</h3></div>
    <div id="ed-exp"></div>
    <button class="btn btn--ghost btn--sm row-add" data-add="personalExpenses">+ Agregar gasto</button>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Proyecto único · capital</h3></div>
    <div class="grid g-4">
      ${repeatField('Facturación total', s.skandia.total, 'skandia.total')}
      ${repeatField('Retención (%)', s.skandia.retencionPct, 'skandia.retencionPct', { step: '0.01' })}
      ${repeatField('Duración (semanas)', s.skandia.weeks, 'skandia.weeks')}
      ${repeatField('Mes de cobro (1=jun-26 … 12=may-27)', s.skandia.mesCobro, 'skandia.mesCobro', { min: 1, max: 12 })}
    </div>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Ingresos únicos · esporádicos · ${(s.oneOffs || []).length}</h3><span class="eyebrow">Proyectos puntuales</span></div>
    <div id="ed-oneoffs"></div>
    <button class="btn btn--ghost btn--sm row-add" data-add="oneOffs">+ Agregar ingreso único</button>
    <div class="hint">Trabajos puntuales o esporádicos (ej. un dashboard para un cliente unipersonal). Los <b>esperados</b> entran a tu caja proyectada en su mes; los <b>recibidos</b> quedan como registro y suman a tu facturación anual.</div>
  </div>

  <div class="editor-sec card"><div class="card-h"><h3>Seguimiento facturación 2026 (bruto real)</h3></div>
    <div class="grid g-4" id="ed-bill"></div>
  </div>

  <div class="flex gap-12 wrap mt-16">
    <button class="btn btn--signature" id="edExport">Exportar respaldo (.json)</button>
    <button class="btn btn--ghost" id="edImport">Importar respaldo</button>
    <input type="file" id="edFile" accept="application/json" hidden>
    <button class="btn btn--danger" id="edReset">Restablecer a cifras del Excel</button>
  </div>`;

  // dynamic lists
  $('#ed-team').innerHTML = s.team.map(t => `<div class="repeat-row" style="grid-template-columns:1.4fr 1.4fr 1fr auto" data-row="team" data-id="${t.id}">
    ${repeatField('Nombre', t.name, '', { type: 'text' }).replace('data-edit=""', `data-list="team" data-id="${t.id}" data-field="name"`)}
    ${repeatField('Rol', t.role, '', { type: 'text' }).replace('data-edit=""', `data-list="team" data-id="${t.id}" data-field="role"`)}
    ${repeatField('Pago mensual', t.pay, '').replace('data-edit=""', `data-list="team" data-id="${t.id}" data-field="pay"`)}
    <button class="iconbtn" data-del="team" data-id="${t.id}" title="Quitar">✕</button></div>`).join('');

  $('#ed-lic').innerHTML = s.licenses.map(l => `<div class="repeat-row" style="grid-template-columns:1.6fr 1fr .8fr .8fr auto" data-row="licenses" data-id="${l.id}">
    ${repeatField('Nombre', l.name, '', { type: 'text' }).replace('data-edit=""', `data-list="licenses" data-id="${l.id}" data-field="name"`)}
    ${repeatField('Costo unitario', l.unit, '').replace('data-edit=""', `data-list="licenses" data-id="${l.id}" data-field="unit"`)}
    <div class="field-inline"><label>Moneda</label><select data-list="licenses" data-id="${l.id}" data-field="currency"><option ${l.currency === 'COP' ? 'selected' : ''}>COP</option><option ${l.currency === 'USD' ? 'selected' : ''}>USD</option></select></div>
    ${repeatField('Cantidad', l.qty, '').replace('data-edit=""', `data-list="licenses" data-id="${l.id}" data-field="qty"`)}
    <button class="iconbtn" data-del="licenses" data-id="${l.id}">✕</button></div>`).join('');

  $('#ed-cli').innerHTML = s.clients.map(c => `<div class="repeat-row" style="grid-template-columns:1.6fr 1fr 1fr auto" data-row="clients" data-id="${c.id}">
    ${repeatField('Cliente', c.name, '', { type: 'text' }).replace('data-edit=""', `data-list="clients" data-id="${c.id}" data-field="name"`)}
    ${repeatField('Bruto / mes', c.gross, '').replace('data-edit=""', `data-list="clients" data-id="${c.id}" data-field="gross"`)}
    ${repeatField('Neto (caja)', c.net, '').replace('data-edit=""', `data-list="clients" data-id="${c.id}" data-field="net"`)}
    <button class="iconbtn" data-del="clients" data-id="${c.id}">✕</button></div>`).join('');

  $('#ed-inc').innerHTML = s.personalIncome.map(i => `<div class="repeat-row" style="grid-template-columns:1.6fr 1fr .8fr auto" data-row="personalIncome" data-id="${i.id}">
    ${repeatField('Concepto', i.name, '', { type: 'text' }).replace('data-edit=""', `data-list="personalIncome" data-id="${i.id}" data-field="name"`)}
    ${repeatField('Monto', i.amount, '', { step: '0.01' }).replace('data-edit=""', `data-list="personalIncome" data-id="${i.id}" data-field="amount"`)}
    <div class="field-inline"><label>Moneda</label><select data-list="personalIncome" data-id="${i.id}" data-field="currency"><option ${i.currency === 'COP' ? 'selected' : ''}>COP</option><option ${i.currency === 'USD' ? 'selected' : ''}>USD</option></select></div>
    <button class="iconbtn" data-del="personalIncome" data-id="${i.id}">✕</button></div>`).join('');

  $('#ed-exp').innerHTML = s.personalExpenses.map(e => `<div class="repeat-row" style="grid-template-columns:1.4fr .9fr .7fr 1fr 1fr auto" data-row="personalExpenses" data-id="${e.id}">
    ${repeatField('Concepto', e.name, '', { type: 'text' }).replace('data-edit=""', `data-list="personalExpenses" data-id="${e.id}" data-field="name"`)}
    ${repeatField('Monto', e.amount, '', { step: '0.01' }).replace('data-edit=""', `data-list="personalExpenses" data-id="${e.id}" data-field="amount"`)}
    <div class="field-inline"><label>Moneda</label><select data-list="personalExpenses" data-id="${e.id}" data-field="currency"><option ${e.currency === 'COP' ? 'selected' : ''}>COP</option><option ${e.currency === 'USD' ? 'selected' : ''}>USD</option></select></div>
    <div class="field-inline"><label>Periodo</label><select data-list="personalExpenses" data-id="${e.id}" data-field="period"><option value="monthly" ${e.period === 'monthly' ? 'selected' : ''}>Mensual</option><option value="quarterly" ${e.period === 'quarterly' ? 'selected' : ''}>Trimestral</option><option value="annual" ${e.period === 'annual' ? 'selected' : ''}>Anual</option></select></div>
    <div class="field-inline"><label>Categoría</label><select data-list="personalExpenses" data-id="${e.id}" data-field="category">${Object.keys(CATS).map(k => `<option value="${k}" ${e.category === k ? 'selected' : ''}>${CATS[k].label}</option>`).join('')}</select></div>
    <button class="iconbtn" data-del="personalExpenses" data-id="${e.id}">✕</button></div>`).join('');

  $('#ed-oneoffs').innerHTML = (s.oneOffs || []).map(o => `<div class="repeat-row" style="grid-template-columns:1.3fr 1.4fr 1fr 1.1fr 1fr auto" data-row="oneOffs" data-id="${o.id}">
    ${repeatField('Cliente', o.client, '', { type: 'text' }).replace('data-edit=""', `data-list="oneOffs" data-id="${o.id}" data-field="client"`)}
    ${repeatField('Proyecto', o.name, '', { type: 'text' }).replace('data-edit=""', `data-list="oneOffs" data-id="${o.id}" data-field="name"`)}
    ${repeatField('Monto', o.amount, '').replace('data-edit=""', `data-list="oneOffs" data-id="${o.id}" data-field="amount"`)}
    <div class="field-inline"><label>Mes</label><select data-list="oneOffs" data-id="${o.id}" data-field="month">${MONTHS12.map((m, i) => `<option value="${i + 1}" ${Number(o.month) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="field-inline"><label>Estado</label><select data-list="oneOffs" data-id="${o.id}" data-field="received"><option value="no" ${!o.received ? 'selected' : ''}>Esperado</option><option value="si" ${o.received ? 'selected' : ''}>Recibido</option></select></div>
    <button class="iconbtn" data-del="oneOffs" data-id="${o.id}">✕</button></div>`).join('');

  $('#ed-bill').innerHTML = MONTHS2026.map((m, i) => `<div class="field-inline"><label>${m}</label><input class="input" type="number" value="${s.billing2026.real[i]}" data-bill="${i}"></div>`).join('');

  bindEditor();
}

/* ========================================================= AJUSTES / NUBE */
function renderAjustes() {
  const el = $('#view-ajustes');
  const cfg = loadCloudCfg();
  const connected = cloud.client && cloud.user;
  el.innerHTML = head('—', 'Nube · Ajustes', 'Conectá el tablero a la nube para editar en vivo desde el celular y el computador con login real. Mientras tanto, todo se guarda en este dispositivo.') + `
  <div class="grid g-2">
    <div class="card"><div class="card-h"><h3>Estado de sincronización</h3><span class="chip ${connected ? 'chip--ok' : 'chip--info'}"><span class="cdot"></span>${connected ? 'Nube conectada' : 'Local (este dispositivo)'}</span></div>
      <p class="card-note">${connected ? `Sesión: <b>${esc(cloud.user.email)}</b>. Los cambios se guardan y sincronizan en vivo entre tus dispositivos.` : 'Hoy tus datos viven solo en este navegador. Configurá Supabase abajo para activar la nube y el login real.'}</p>
      <div class="flex gap-12 wrap mt-16">
        <button class="btn btn--primary" id="ajSaveNow">Guardar ahora</button>
        ${connected ? `<button class="btn btn--ghost" id="ajCloudLogout">Cerrar sesión nube</button>` : ''}
      </div>
    </div>
    <div class="card"><div class="card-h"><h3>Respaldo</h3></div>
      <p class="card-note">Exportá o importá todos tus datos como archivo. Útil como copia de seguridad o para mover entre dispositivos sin nube.</p>
      <div class="flex gap-12 wrap mt-16">
        <button class="btn btn--signature" id="ajExport">Exportar (.json)</button>
        <button class="btn btn--ghost" id="ajImport">Importar</button>
        <input type="file" id="ajFile" accept="application/json" hidden>
      </div>
    </div>
  </div>

  <div class="card mt-16"><div class="card-h"><h3>Conexión a la nube (Supabase)</h3><span class="eyebrow">Login real · ${ACCESS_KEY ? 'clave Nola$2026' : ''}</span></div>
    <p class="card-note mb-16">Pegá la URL y la <i>anon key</i> de tu proyecto Supabase (gratis). Con esto, el tablero usa login real con tu correo y la clave <b>Nola$2026</b>, y sincroniza en vivo. La guía paso a paso está en <b>README.md</b> y el SQL en <b>supabase-setup.sql</b>.</p>
    <div class="grid g-2">
      <div class="field"><label>Project URL</label><input class="input" type="text" id="cfgUrl" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url || '')}"></div>
      <div class="field"><label>Anon public key</label><input class="input" type="text" id="cfgKey" placeholder="eyJhbGci..." value="${esc(cfg.anonKey || '')}"></div>
    </div>
    <div class="flex gap-12 wrap mt-8">
      <button class="btn btn--primary" id="cfgSave">Guardar conexión</button>
      ${cfg.url ? `<button class="btn btn--danger" id="cfgClear">Quitar conexión</button>` : ''}
    </div>
    <div class="warnbox mt-16">La <i>anon key</i> es pública por diseño: la seguridad real la da el RLS de Supabase (cada usuario solo ve su fila). Nunca pegues aquí la <i>service_role key</i>.</div>
  </div>

  <div class="card mt-16"><div class="card-h"><h3>Seguridad de la clave</h3></div>
    <p class="card-note">En modo <b>local</b>, <b>Nola$2026</b> es un candado que evita miradas casuales, pero no es seguridad real (alguien técnico con el archivo podría saltarlo). En modo <b>nube</b>, <b>Nola$2026</b> es tu contraseña de login real y tus datos quedan protegidos por autenticación. Para datos financieros reales en la nube, usá el modo nube.</p>
  </div>`;
  bindAjustes();
}

/* ========================================================= NAV + RENDER LOOP */
let S = null, D = null, current = 'resumen';
const VIEWS = { resumen: renderResumen, empresa: renderEmpresa, personal: renderPersonal, salud: renderSalud, proyecciones: renderProyecciones, editor: renderEditor, ajustes: renderAjustes };

let chartTimer = null;
function re(opts = {}) {
  D = compute(S);
  S.meta.updatedAt = Date.now();
  saveLocal();
  if (!opts.noCloud) queueCloudSave();
  updateHeader();
  if (!opts.keepEditor || current !== 'editor') {
    (VIEWS[current] || renderResumen)();
  }
}
function go(view) {
  current = view;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  (VIEWS[view] || renderResumen)();
  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function updateHeader() {
  const t = S.meta.updatedAt ? new Date(S.meta.updatedAt) : null;
  $('#saveLabel').textContent = t ? 'Guardado ' + t.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
}

/* ========================================================= BINDINGS */
function bindProjections() {
  // los sliders actualizan solo resultados (reProj), sin reconstruir el control que se arrastra
  const onSlide = (id, fn) => { const e = $('#' + id); if (e) e.addEventListener('input', () => { fn(+e.value); reProj(); }); };
  onSlide('rngSalary', v => S.projection.salaryScenario = v);
  onSlide('rngP2val', v => S.skandia.phase2Value = v);
  onSlide('rngP2mes', v => S.skandia.phase2Month = v);
  const tg = $('#tglPhase2'); if (tg) tg.addEventListener('change', () => { S.skandia.phase2On = tg.checked; reProj(); });
  $$('[data-projinc]').forEach(c => c.addEventListener('change', () => {
    const t = S.team.find(x => x.id === c.dataset.projinc); if (t) t.projInclude = c.checked; re();
  }));
  const add = $('#addNewClient'); if (add) add.addEventListener('click', () => {
    S.projection.newClients.push({ id: uid(), name: 'Cliente nuevo', net: 3000000, gross: 3500000, startMonth: 2 }); re();
  });
  $$('[data-delclient]').forEach(b => b.addEventListener('click', () => {
    S.projection.newClients = S.projection.newClients.filter(c => c.id !== b.dataset.delclient); re();
  }));
}

function bindEditor() {
  const el = $('#view-editor');
  // simple paths
  el.querySelectorAll('[data-edit]').forEach(inp => inp.addEventListener('input', () => {
    const v = inp.type === 'number' ? parseFloat(inp.value) || 0 : inp.value;
    setPath(S, inp.dataset.edit, v); reEditor();
  }));
  // list fields
  el.querySelectorAll('[data-list]').forEach(inp => {
    const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const list = S[inp.dataset.list]; const item = list.find(x => x.id === inp.dataset.id);
      if (!item) return;
      const f = inp.dataset.field;
      if (inp.type === 'checkbox') item[f] = inp.checked;
      else if (f === 'received') item[f] = (inp.value === 'si');
      else if (f === 'month') item[f] = parseInt(inp.value, 10) || 1;
      else item[f] = (inp.type === 'number') ? (parseFloat(inp.value) || 0) : inp.value;
      reEditor();
    });
  });
  // billing
  el.querySelectorAll('[data-bill]').forEach(inp => inp.addEventListener('input', () => {
    S.billing2026.real[+inp.dataset.bill] = parseFloat(inp.value) || 0; reEditor();
  }));
  // add
  el.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { addItem(b.dataset.add); renderEditor(); re({ keepEditor: false }); }));
  // delete
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const list = b.dataset.del; S[list] = S[list].filter(x => x.id !== b.dataset.id); renderEditor(); re();
  }));
  // backup
  $('#edExport').addEventListener('click', exportJSON);
  $('#edImport').addEventListener('click', () => $('#edFile').click());
  $('#edFile').addEventListener('change', importJSON);
  $('#edReset').addEventListener('click', () => { if (confirm('¿Restablecer todos los datos a las cifras originales del Excel?')) { S = defaultState(); renderEditor(); re(); toast('Datos restablecidos', 'ok'); } });
}
// recompute without rebuilding the editor DOM (so inputs keep focus)
function reEditor() { D = compute(S); S.meta.updatedAt = Date.now(); saveLocal(); queueCloudSave(); updateHeader(); }

function addItem(list) {
  const m = {
    team: { id: uid(), name: 'Nueva persona', role: 'Rol', pay: 1000000, projInclude: true },
    licenses: { id: uid(), name: 'Nueva licencia', unit: 50000, currency: 'COP', qty: 1 },
    clients: { id: uid(), name: 'Nuevo cliente', gross: 3500000, net: 3000000, recurring: true },
    personalIncome: { id: uid(), name: 'Nuevo ingreso', amount: 0, currency: 'COP' },
    personalExpenses: { id: uid(), name: 'Nuevo gasto', amount: 0, currency: 'COP', period: 'monthly', category: 'variable' },
    oneOffs: { id: uid(), client: 'Cliente', name: 'Proyecto puntual', amount: 0, month: 2, received: false },
  }[list];
  if (m) S[list].push(m);
}

function bindAjustes() {
  $('#ajSaveNow').addEventListener('click', async () => { saveLocal(); if (cloud.client && cloud.user) { await saveCloud(); } toast('Guardado', 'ok'); });
  $('#ajExport').addEventListener('click', exportJSON);
  $('#ajImport').addEventListener('click', () => $('#ajFile').click());
  $('#ajFile').addEventListener('change', importJSON);
  const cs = $('#cfgSave'); if (cs) cs.addEventListener('click', () => {
    const url = $('#cfgUrl').value.trim(), key = $('#cfgKey').value.trim();
    if (!url || !key) { toast('Pegá URL y anon key', 'err'); return; }
    saveCloudCfg({ url, anonKey: key });
    toast('Conexión guardada. Salí y volvé a entrar para login en la nube.', 'ok');
    renderAjustes();
  });
  const cc = $('#cfgClear'); if (cc) cc.addEventListener('click', () => { localStorage.removeItem(LS_CLOUD); toast('Conexión quitada', 'ok'); renderAjustes(); });
  const cl = $('#ajCloudLogout'); if (cl) cl.addEventListener('click', async () => { if (cloud.client) await cloud.client.auth.signOut(); location.reload(); });
}

/* ========================================================= PERSISTENCIA LOCAL */
function saveLocal() { try { localStorage.setItem(LS_STATE, JSON.stringify(S)); } catch (e) {} }
function loadLocal() { try { const r = localStorage.getItem(LS_STATE); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function migrate(st) {
  const def = defaultState();
  if (!st || typeof st !== 'object') st = {};
  st = Object.assign({}, def, st);
  st.global = Object.assign({}, def.global, st.global);
  st.skandia = Object.assign({}, def.skandia, st.skandia);
  st.liquidity = Object.assign({}, def.liquidity, st.liquidity);
  st.projection = Object.assign({}, def.projection, st.projection);
  st.meta = Object.assign({}, def.meta, st.meta);
  if (!st.billing2026 || !Array.isArray(st.billing2026.real)) st.billing2026 = { real: def.billing2026.real.slice() };
  // listas: garantizar array, descartar items no-objeto, y backfill de id (para que toda fila sea editable)
  ['team', 'licenses', 'clients', 'personalIncome', 'personalExpenses', 'oneOffs'].forEach(k => {
    if (!Array.isArray(st[k])) { st[k] = def[k] ? def[k].slice() : []; return; }
    st[k] = st[k].filter(x => x && typeof x === 'object');
    st[k].forEach(x => { if (x.id == null) x.id = uid(); });
  });
  // ingresos únicos: normalizar 'received' a booleano y 'month' a 1..12
  st.oneOffs.forEach(o => {
    o.received = o.received === true || o.received === 'si' || o.received === 'true';
    o.month = clamp(Math.round(Number(o.month) || 1), 1, 12);
  });
  ['newClients', 'newHires'].forEach(k => {
    if (!Array.isArray(st.projection[k])) st.projection[k] = [];
    else { st.projection[k] = st.projection[k].filter(x => x && typeof x === 'object'); st.projection[k].forEach(x => { if (x.id == null) x.id = uid(); }); }
  });
  st.team.forEach(t => { if (t.projInclude === undefined) t.projInclude = true; });
  return st;
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'nola-tablero-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  toast('Respaldo exportado', 'ok');
}
function importJSON(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try { S = migrate(JSON.parse(rd.result)); re(); go(current); toast('Datos importados', 'ok'); } catch (e) { toast('Archivo inválido', 'err'); } };
  rd.readAsText(f); ev.target.value = '';
}

/* ========================================================= NUBE (Supabase) */
const cloud = { client: null, user: null, saveTimer: null, applying: false, ready: false };
// Conexión a la nube de Nola Labs ya configurada (la anon key es pública por diseño; la seguridad la da el RLS).
const DEFAULT_CLOUD = {
  url: 'https://baqevhsyawugvekqbwsm.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcWV2aHN5YXd1Z3Zla3Fid3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDU3NTIsImV4cCI6MjA5ODQyMTc1Mn0.td_VHz332hqV9l0Rxij7D3qGC1tM2oe1obrOaOFXnzw',
};
function loadCloudCfg() { try { return JSON.parse(localStorage.getItem(LS_CLOUD)) || DEFAULT_CLOUD; } catch (e) { return DEFAULT_CLOUD; } }
function saveCloudCfg(c) { localStorage.setItem(LS_CLOUD, JSON.stringify(c)); }

async function initSupabase() {
  const cfg = loadCloudCfg();
  if (!cfg.url || !cfg.anonKey) return false;
  try {
    const { createClient } = await import(SUPABASE_CDN);
    cloud.client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await cloud.client.auth.getSession();
    if (data && data.session) cloud.user = data.session.user;
    return true;
  } catch (e) { console.warn('Supabase no disponible:', e); cloud.client = null; return false; }
}
// Sin auto-registro al fallar el login: mostramos el error real. El alta es una acción explícita (create=true).
async function cloudSignIn(email, password, create) {
  if (create) {
    const { data, error } = await cloud.client.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('Cuenta creada. Revisá tu correo para confirmar y volvé a entrar.');
    cloud.user = data.user; return;
  }
  const { data, error } = await cloud.client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Correo o contraseña incorrectos.');
  cloud.user = data.user;
}
// Distingue "no hay fila" (data:null) de "falló la lectura" (ok:false) para no sobrescribir la nube por un blip.
async function loadCloudState() {
  const { data, error } = await cloud.client.from('tableros').select('data').eq('owner', cloud.user.id).maybeSingle();
  if (error) { console.warn('loadCloudState', error); return { ok: false }; }
  return { ok: true, data: data ? data.data : null };
}
async function saveCloud() {
  if (!cloud.client || !cloud.user || !cloud.ready) return;
  const payload = { owner: cloud.user.id, data: S, updated_at: new Date().toISOString() };
  const { error } = await cloud.client.from('tableros').upsert(payload, { onConflict: 'owner' });
  if (error) console.warn('saveCloud', error);
}
function queueCloudSave() {
  if (!cloud.client || !cloud.user || !cloud.ready || cloud.applying) return;
  clearTimeout(cloud.saveTimer);
  cloud.saveTimer = setTimeout(saveCloud, 900);
}
// Carga el estado de la nube (o siembra si está vacía). Solo escribe si la lectura tuvo éxito.
async function enterCloud() {
  const res = await loadCloudState();
  if (!res.ok) {
    cloud.ready = false;  // lectura falló: NO escribir, entrar en modo local seguro
    toast('No se pudo leer la nube; entrando en modo local seguro. Reintentá más tarde.', 'err');
    unlock(); return;
  }
  cloud.ready = true;     // lectura ok: ya es seguro escribir
  if (res.data) S = migrate(res.data);
  else await saveCloud(); // primera vez: sembrar la nube con el estado actual
  subscribeRealtime();
  unlock();
}
function subscribeRealtime() {
  if (!cloud.client || !cloud.user) return;
  cloud.client.channel('tablero-' + cloud.user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tableros', filter: 'owner=eq.' + cloud.user.id }, payload => {
      const incoming = payload.new && payload.new.data;
      if (!incoming) return;
      let next;
      try { next = migrate(incoming); } catch (e) { console.warn('realtime migrate', e); return; }
      if (stableStr(next) === stableStr(S)) return;  // eco propio o sin cambios reales (jsonb reordena llaves)
      // no destruir un input que el usuario está editando (perdería foco y lo escrito)
      const ae = document.activeElement;
      const editing = ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && ae.closest('.main');
      cloud.applying = true;
      try {
        S = next; D = compute(S); saveLocal(); updateHeader();
        if (!editing) (VIEWS[current] || renderResumen)();
      } catch (e) { console.warn('realtime apply', e); }
      finally { cloud.applying = false; }
      if (!editing) toast('Actualizado desde otro dispositivo', 'ok');
    }).subscribe();
}

/* ========================================================= LOCK / ARRANQUE */
function setCloudIndicator() {
  const on = cloud.client && cloud.user;
  $('#cloudDot').className = 'tb-dot ' + (on ? 'on' : 'off');
  $('#cloudLabel').textContent = on ? 'Nube' : 'Local';
}
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + kind;
  setTimeout(() => t.className = '', 2400);
}
function unlock() {
  $('#lock').style.display = 'none';
  $('#app').classList.add('show');
  setCloudIndicator();
  re({ noCloud: true });
  go('resumen');
}

async function bootLock() {
  const cfg = loadCloudCfg();
  const cloudReady = await initSupabase();
  const lockSub = $('#lockSub'), keyLabel = $('#keyLabel'), emailField = $('#emailField'), lockMode = $('#lockMode');

  if (cloudReady) {
    // modo nube: login real
    emailField.hidden = false;
    if ($('#signupRow')) $('#signupRow').hidden = false;
    keyLabel.textContent = 'Contraseña';
    lockSub.innerHTML = 'Login en la nube · sincroniza tus dispositivos';
    lockMode.innerHTML = 'Modo nube activo. Usá tu correo y la clave <b>Nola$2026</b>.';
    if (cloud.user) { await enterCloud(); return; }  // sesión ya activa
  } else {
    lockMode.innerHTML = 'Modo local. <a id="goCloudHint">¿Cómo activar la nube?</a>';
  }

  $('#lockForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#lockErr'); err.textContent = '';
    const key = $('#lockKey').value;
    const btn = $('#lockBtn');
    if (cloudReady) {
      const email = $('#lockEmail').value.trim();
      const create = $('#signupChk') && $('#signupChk').checked;
      if (!email) { err.textContent = 'Escribí tu correo'; return; }
      btn.textContent = create ? 'Creando…' : 'Entrando…'; btn.disabled = true;
      try {
        await cloudSignIn(email, key, create);
        await enterCloud();
      } catch (e) {
        err.textContent = e.message || 'No se pudo entrar'; btn.textContent = 'Entrar'; btn.disabled = false;
      }
    } else {
      if (key === ACCESS_KEY) { unlock(); }
      else { err.textContent = 'Clave incorrecta'; $('#lockKey').value = ''; }
    }
  });
  document.addEventListener('click', e => { if (e.target && e.target.id === 'goCloudHint') { toast('Entrá con Nola$2026 y andá a “Nube · Ajustes”.', ''); } });
}

/* ========================================================= EVENTOS GLOBALES */
function openSidebar() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }

function initShell() {
  $('#nav').addEventListener('click', e => { const b = e.target.closest('.nav-item'); if (b) go(b.dataset.view); });
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
  $('#menuBtn').addEventListener('click', openSidebar);
  $('#scrim').addEventListener('click', closeSidebar);
  $('#logoutBtn').addEventListener('click', async () => {
    if (cloud.client && cloud.user) { await cloud.client.auth.signOut(); location.reload(); }
    else { location.reload(); }
  });
  window.addEventListener('beforeunload', saveLocal);
}

async function main() {
  S = migrate(loadLocal() || defaultState());
  initShell();
  await bootLock();
}
document.addEventListener('DOMContentLoaded', main);
