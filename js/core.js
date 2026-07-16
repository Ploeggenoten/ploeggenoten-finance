// ═══ CORE: supabase, state, helpers ═══
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const D = {            // alle data, geladen in loadAll()
  placements: [], installments: [], budget: [], actuals: [],
  saldi: [], tx: [], loans: [], loanPayments: [], settings: {},
  dismissed: [], candidates: [], clients: [], flex: [], targets: [], tarieven: [],
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ── geld & datums ──────────────────────────────────────────────
const eur = n => n == null ? '—' :
  '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eur2 = n => n == null ? '—' :
  '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = n => (n * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + '%';

const todayISO = () => new Date().toISOString().slice(0, 10);
const MND = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
function fmtD(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MND[m-1]} '${String(y).slice(2)}`;
}
function fmtMaand(iso) {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return `${MND[m-1]} '${String(y).slice(2)}`;
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonths(iso, n) {
  const [y, m, dd] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dd, last));
  return d.toISOString().slice(0, 10);
}
const monthKey = iso => iso ? iso.slice(0, 7) + '-01' : null;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

// ── settings ───────────────────────────────────────────────────
const S = (key, fallback = null) => {
  const v = D.settings[key];
  return v === undefined || v === null ? fallback : v;
};

// ── data laden ─────────────────────────────────────────────────
let lastLoadTs = 0;
async function loadAll() {
  lastLoadTs = Date.now();
  const q = (t, order) => {
    let r = sb.from(t).select('*');
    if (order) r = r.order(order.col, { ascending: order.asc !== false });
    return r;
  };
  const [pl, inst, bud, act, sal, tx, ln, lp, st, dis, fx, trf, cand, cli, tgt] = await Promise.all([
    q('fin_placements', { col: 'id' }),
    q('fin_installments', { col: 'geplande_datum' }),
    q('fin_costs_budget', { col: 'vanaf_maand' }),
    q('fin_costs_actual', { col: 'maand' }),
    q('fin_bank_saldo', { col: 'datum', asc: false }),
    q('fin_bank_tx', { col: 'datum', asc: false }),
    q('fin_loans', { col: 'id' }),
    q('fin_loan_payments', { col: 'datum' }),
    q('fin_settings'),
    q('fin_dismissed_candidates'),
    q('fin_flex_weken', { col: 'week' }),
    q('fin_tarieven', { col: 'klant' }),
    q('candidates'),
    q('clients'),
    q('targets'),
  ]);
  const bad = [pl, inst, bud, act, sal, tx, ln, lp, st, dis, fx, trf].find(r => r.error);
  if (bad) throw bad.error;
  D.placements = pl.data; D.installments = inst.data; D.budget = bud.data;
  D.actuals = act.data; D.saldi = sal.data; D.tx = tx.data;
  D.loans = ln.data; D.loanPayments = lp.data;
  D.settings = Object.fromEntries((st.data || []).map(r => [r.key, r.value]));
  D.dismissed = dis.data; D.flex = fx.data; D.tarieven = trf.data;
  D.candidates = cand.error ? [] : cand.data;   // pijplijn kan onbereikbaar zijn — app blijft werken
  D.clients = cli.error ? [] : cli.data;
  D.targets = tgt.error ? [] : tgt.data;        // plaatsings-targets van het bord ({maand:'2026-07', aantal})
}

async function saveSetting(key, value) {
  const { error } = await sb.from('fin_settings').upsert({ key, value });
  if (error) return toast('Opslaan mislukt: ' + error.message, true);
  D.settings[key] = value;
}

// generieke upsert + herladen van één tabel
async function dbWrite(table, op) {
  const { error } = await op(sb.from(table));
  if (error) { toast('Opslaan mislukt: ' + error.message, true); throw error; }
}
async function reload(table, dkey, orderCol, asc = true) {
  const { data, error } = await sb.from(table).select('*').order(orderCol, { ascending: asc });
  if (!error) D[dkey] = data;
}

// ── UI helpers ─────────────────────────────────────────────────
function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), isErr ? 6000 : 3200);
}

function openModal(html, { narrow = false } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal${narrow ? ' narrow' : ''}">${html}</div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
  $('#modalRoot').appendChild(bg);
  return bg;
}
function closeModal() {
  const r = $('#modalRoot');
  if (r.lastChild) r.removeChild(r.lastChild);
}

function tag(text, color) { return `<span class="tag ${color}">${esc(text)}</span>`; }

// eenvoudige SVG-lijngrafiek: series = [{label,color,values:[..]}], labels = [maand..]
function lineChart(labels, series, { height = 220, zeroLine = true } = {}) {
  const W = 900, H = height, padL = 58, padR = 10, padT = 12, padB = 26;
  const all = series.flatMap(s => s.values);
  let min = Math.min(0, ...all), max = Math.max(0, ...all);
  if (max === min) max = min + 1;
  const span = max - min;
  min -= span * .06; max += span * .06;
  const x = i => padL + (W - padL - padR) * (labels.length < 2 ? 0.5 : i / (labels.length - 1));
  const y = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  let g = '';
  // gridlines
  for (let t = 0; t <= 4; t++) {
    const v = min + (max - min) * t / 4, yy = y(v);
    const yLbl = Math.abs(max) >= 5000 ? Math.round(v / 1000) + 'k' : String(Math.round(v));
    g += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>` +
         `<text x="${padL - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${yLbl}</text>`;
  }
  if (zeroLine && min < 0) g += `<line x1="${padL}" y1="${y(0)}" x2="${W - padR}" y2="${y(0)}" stroke="var(--red)" stroke-dasharray="4 3" stroke-width="1"/>`;
  labels.forEach((l, i) => {
    if (labels.length > 14 && i % 2) return;
    g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(l)}</text>`;
  });
  for (const s of series) {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"/>`;
    s.values.forEach((v, i) => { g += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${s.color}"><title>${esc(labels[i])}: ${eur(v)}</title></circle>`; });
  }
  const legend = series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${g}</svg><div class="legend">${legend}</div>`;
}
