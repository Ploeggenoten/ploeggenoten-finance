// ═══ CALC: alle afgeleide financiële logica ═══

const instOf = pid => D.installments.filter(i => i.placement_id === pid)
  .sort((a, b) => a.termijn_nr - b.termijn_nr);

function vervaldatum(inst, p) {
  const basis = inst.factuurdatum || inst.geplande_datum;
  return basis ? addDays(basis, Number(p?.betaaltermijn_dgn) || 14) : null;
}

// aggregaten per plaatsing
function placementStats(p) {
  const ins = instOf(p.id);
  const sum = f => ins.filter(f).reduce((t, i) => t + Number(i.bedrag_excl), 0);
  const gefact = sum(i => i.status === 'gefactureerd' || i.status === 'betaald');
  const betaald = sum(i => i.status === 'betaald');
  const open = sum(i => i.status === 'gefactureerd');
  const nog = sum(i => i.status === 'te_factureren');
  const vervallen = sum(i => i.status === 'vervallen');
  const nActief = ins.filter(i => i.status !== 'vervallen').length;
  const nGefact = ins.filter(i => i.status === 'gefactureerd' || i.status === 'betaald').length;
  const next = ins.find(i => i.status === 'te_factureren');
  let status = 'Nog niets gefactureerd', kleur = 'gray';
  if (nGefact > 0 && nog > 0) { status = 'Deels gefactureerd'; kleur = 'blue'; }
  else if (nGefact > 0 && nog === 0) { status = 'Volledig gefactureerd'; kleur = 'green'; }
  if (p.gestopt_op) { status += ' · gestopt'; kleur = vervallen > 0 ? 'red' : kleur; }
  return { ins, gefact, betaald, open, nog, vervallen, nActief, nGefact, next, status, kleur };
}

// garantie: loopt hij nog, en moet er vervangen worden?
function garantie(p) {
  const start = p.contract_datum;
  if (!p.garantie_mnd || !start) return { actief: false, tot: null, vervangingNodig: false };
  const tot = addMonths(start, p.garantie_mnd);
  const actief = !p.gestopt_op && todayISO() <= tot;
  const vervangingNodig = !!p.gestopt_op && p.gestopt_op <= tot && !p.vervangen_door;
  return { actief, tot, vervangingNodig };
}

// welke termijnen zouden moeten vervallen na een stop?
function stopImpact(p) {
  if (!p.gestopt_op) return [];
  const grens = addMonths(p.gestopt_op, Number(S('stop_achterstand_mnd', 1)));
  return instOf(p.id).filter(i =>
    i.status === 'te_factureren' && i.geplande_datum && i.geplande_datum > grens);
}

// ── pijplijn-inbox ─────────────────────────────────────────────
function inboxCandidates() {
  const linked = new Set(D.placements.map(p => p.pipeline_candidate_id).filter(Boolean));
  const dismissed = new Set(D.dismissed.map(d => d.candidate_id));
  // naam-match als vangnet: klantnamen verschillen tussen bord en finance
  // ("Henri" vs "Henri B.V"), dus we matchen op kandidaatnaam alleen
  const byName = new Set(D.placements.map(p => (p.kandidaat || '').trim().toLowerCase()).filter(Boolean));
  return D.candidates.filter(c =>
    (PLACED_FASES.includes(c.fase) || c.geplaatst_op) &&
    c.fase !== 'Afgevallen' &&
    (c.type || '') !== 'Detachering' &&          // flex loopt via Pronkert, niet via W&S-facturatie
    !(c.vervangt || '') &&                        // garantievervangers zijn geen nieuwe fee
    !linked.has(c.id) && !dismissed.has(c.id) &&
    !byName.has((c.naam || '').trim().toLowerCase()));
}

// gestopt op het bord, maar nog niet in finance verwerkt
function stopSignalen() {
  const out = [];
  for (const p of D.placements) {
    if (p.gestopt_op || !p.pipeline_candidate_id) continue;
    const c = D.candidates.find(c => c.id === p.pipeline_candidate_id);
    if (c && c.gestopt_op) out.push({ p, c });
  }
  return out;
}

// ── actielijst (reminders) ─────────────────────────────────────
function acties() {
  const t = todayISO(), warnDgn = Number(S('waarschuwing_dgn', 21));
  const list = [];
  for (const p of D.placements) {
    if (p.concept) {
      // eerst fee bevestigen; factureer-acties wachten tot dan
      list.push({ soort: 'concept', urg: 2, p, txt: `Nieuwe plaatsing ${p.id} automatisch aangemaakt — fee geschat op ${eur(p.fee_excl)}, bevestig of pas aan` });
      continue;
    }
    const st = placementStats(p);
    for (const i of st.ins) {
      if (i.status === 'te_factureren' && i.geplande_datum) {
        const dd = daysBetween(t, i.geplande_datum);
        if (dd < 0) list.push({ soort: 'factureren', urg: 2, p, i, txt: `Factuurdatum ${fmtD(i.geplande_datum)} GEMIST (${-dd} dgn)` });
        else if (dd === 0) list.push({ soort: 'factureren', urg: 2, p, i, txt: 'Vandaag factureren' });
        else if (dd <= warnDgn) list.push({ soort: 'factureren', urg: 1, p, i, txt: `Factureren over ${dd} dgn (${fmtD(i.geplande_datum)})` });
      }
      if (i.status === 'gefactureerd') {
        const vv = vervaldatum(i, p);
        const late = vv ? daysBetween(vv, t) : 0;
        if (late > 0) list.push({ soort: 'te_laat', urg: 2, p, i, txt: `Betaling ${late} dgn te laat (vervallen ${fmtD(vv)})` });
      }
    }
    const g = garantie(p);
    if (g.vervangingNodig) list.push({ soort: 'vervanging', urg: 2, p, txt: `Vervanging leveren — gestopt ${fmtD(p.gestopt_op)} binnen garantie` });
    const si = stopImpact(p);
    if (si.length) list.push({ soort: 'stop', urg: 1, p, txt: `${si.length} termijn(en) laten vervallen na stop (${eur(si.reduce((s, i) => s + +i.bedrag_excl, 0))})` });
  }
  for (const c of inboxCandidates())
    list.push({ soort: 'afronden', urg: 1, c, txt: `${c.naam} (${c.klant || '?'}) — plaatsing afronden` });
  for (const { p, c } of stopSignalen())
    list.push({ soort: 'stop_signaal', urg: 2, p, c, txt: `${p.kandidaat} staat op het bord als gestopt (${fmtD(c.gestopt_op)}) — verwerken` });
  const saldo = D.saldi[0];
  if (!saldo || daysBetween(saldo.datum, t) > 14)
    list.push({ soort: 'saldo', urg: 1, txt: saldo ? `Banksaldo ${daysBetween(saldo.datum, t)} dgn oud — werk bij` : 'Vul je banksaldo in' });
  // Yuki zegt: deze facturen staan niet meer open → waarschijnlijk betaald
  for (const s of yukiBetaaldSuggesties())
    list.push({ soort: 'yuki_betaald', urg: 1, p: s.p, i: s.i,
      txt: `Yuki toont geen open post meer voor ${s.p.kandidaat} t${s.i.termijn_nr} (${eur(s.i.bedrag_excl)}) — betaald?` });
  // flex-bewaking: vorige week (ma t/m zo voorbij) nog niet ingevuld?
  if (D.flex.length) {
    const dag = (new Date(t + 'T12:00:00').getDay() + 6) % 7;      // ma=0
    const maDezeWeek = addDays(t, -dag);
    const maVorigeWeek = addDays(maDezeWeek, -7);
    if (!D.flex.some(w => w.week === maVorigeWeek))
      list.push({ soort: 'flex', urg: 1, txt: `Flex-week van ${fmtD(maVorigeWeek)} nog niet ingevuld (Pronkert)` });
  }
  return list.sort((a, b) => b.urg - a.urg);
}

// ── flex-plaatsingen: marge per uur/week + overname-waarde ─────
// marge/uur = (klantfactor − inkoopfactor) × uurloon
function flexAfspraakVoor(klant) {
  const nk = normKlant(klant);
  return D.flexAfspr.find(a => normKlant(a.klant).startsWith(nk.slice(0, 6)) || nk.startsWith(normKlant(a.klant).slice(0, 6)));
}

function flexPlBerekening(fp) {
  const afspr = flexAfspraakVoor(fp.klant);
  const klantfactor = Number(fp.klantfactor) || (afspr ? Number(afspr.factor) : null);
  const inkoop = Number(fp.inkoop_factor) || (afspr ? Number(afspr.inkoop_factor) : Number(S('flex_inkoop_factor', 1.8)));
  const overnameUren = fp.overname_uren != null ? Number(fp.overname_uren) : (afspr ? Number(afspr.overname_uren) : null);
  const uurloon = Number(fp.uurloon) || null;
  const urenPw = Number(fp.uren_pw) || 40;
  const compleet = klantfactor && uurloon;
  const margePerUur = compleet ? (klantfactor - inkoop) * uurloon : null;
  const gewerkteUren = fp.gewerkte_uren != null ? Number(fp.gewerkte_uren) : null;
  return {
    klantfactor, inkoop, uurloon, urenPw, overnameUren, compleet, margePerUur, gewerkteUren,
    margePerWeek: compleet ? margePerUur * urenPw : null,
    margePerMaand: compleet ? margePerUur * urenPw * 52 / 12 : null,
    // totale marge tot de kosteloze overname (het bedrag dat je "verdient" vóór de klant gratis mag overnemen)
    overnameWaarde: compleet && overnameUren ? margePerUur * overnameUren : null,
    // werkelijk verdiend = marge/uur × gewerkte uren (leidend zodra ingevuld)
    verdiend: compleet && gewerkteUren != null ? margePerUur * gewerkteUren : null,
  };
}

function flexPlStats() {
  const actief = D.flexPl.filter(f => !f.gestopt_op);
  const gestopt = D.flexPl.filter(f => f.gestopt_op);
  const rows = actief.map(f => ({ f, ...flexPlBerekening(f) }));
  const gestoptRows = gestopt.map(f => ({ f, ...flexPlBerekening(f) }));
  const compleet = rows.filter(r => r.compleet);
  return {
    rows, gestoptRows,
    nActief: actief.length, nGestopt: gestopt.length, nCompleet: compleet.length, nConcept: rows.filter(r => r.f.concept).length,
    margePerMaand: compleet.reduce((s, r) => s + r.margePerMaand, 0),
    overnamePotentieel: compleet.reduce((s, r) => s + (r.overnameWaarde || 0), 0),
    // verdiende marge over gewerkte uren (actief + afgerond) — dit is echt geld dat je hebt gemaakt
    verdiendTotaal: [...rows, ...gestoptRows].reduce((s, r) => s + (r.verdiend || 0), 0),
    verdiendAfgerond: gestoptRows.reduce((s, r) => s + (r.verdiend || 0), 0),
  };
}

// ── flex (wekelijkse marge-uitkering Pronkert) ─────────────────
function flexStats() {
  const wk = D.flex.slice().sort((a, b) => a.week.localeCompare(b.week));
  const sum = arr => arr.reduce((s, w) => s + +w.bedrag, 0);
  const last4 = wk.slice(-4), prev4 = wk.slice(-8, -4);
  const avg4 = last4.length ? sum(last4) / last4.length : 0;
  const avgPrev4 = prev4.length ? sum(prev4) / prev4.length : null;
  const trendPct = avgPrev4 ? (avg4 - avgPrev4) / avgPrev4 : null;
  const maandRunRate = avg4 * 52 / 12;
  const laatste = wk[wk.length - 1] || null;
  const ytd = sum(wk.filter(w => w.week.slice(0, 4) === todayISO().slice(0, 4)));
  return { weken: wk, laatste, avg4, avgPrev4, trendPct, maandRunRate, ytd };
}
function flexInMaand(mk) {
  return D.flex.filter(w => monthKey(w.week) === mk).reduce((s, w) => s + +w.bedrag, 0);
}

// ── automatische plaatsingen: contract getekend = plaatsing ────
// De app maakt zelf een plaatsing (concept) aan zodra een kandidaat op het
// bord "Contract getekend"/"Gestart" bereikt; Tjeerd bevestigt alleen de fee.
const normKlant = s => (s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/bv$/, '');

function klantDefaults(bordKlant) {
  const nk = normKlant(bordKlant);
  const historie = D.placements.filter(p => !p.concept &&
    (normKlant(p.klant).startsWith(nk.slice(0, 8)) || nk.startsWith(normKlant(p.klant).slice(0, 8))));
  const modus = arr => arr.length ? arr.sort((a, b) =>
    arr.filter(x => x === a).length - arr.filter(x => x === b).length).pop() : null;
  const fees = historie.map(p => Number(p.fee_excl)).filter(Boolean);
  return {
    sheetKlant: historie[0]?.klant || bordKlant,
    n: modus(historie.map(p => p.aantal_termijnen)) || 1,
    tussen: modus(historie.map(p => p.maanden_tussen)) || 1,
    betaal: modus(historie.map(p => p.betaaltermijn_dgn)) || Number(S('default_betaaltermijn', 14)),
    gemFee: fees.length ? fees.reduce((a, b) => a + b, 0) / fees.length : null,
  };
}

// tarief opzoeken: eerst klant+functie, dan klant-standaard (rij zonder functie)
function tariefVoor(bordKlant, functie) {
  const nk = normKlant(bordKlant);
  const rijen = D.tarieven.filter(r =>
    normKlant(r.klant).startsWith(nk.slice(0, 8)) || nk.startsWith(normKlant(r.klant).slice(0, 8)));
  if (!rijen.length) return null;
  const nf = (functie || '').toLowerCase();
  const opFunctie = rijen.find(r => r.functie && (nf.includes(r.functie.toLowerCase()) || r.functie.toLowerCase().includes(nf)) && nf);
  const standaard = rijen.find(r => !r.functie);
  const rij = opFunctie || standaard || rijen[0];
  return { pct: Number(rij.tarief_pct), rij };
}

// fee-berekening: maandloon × (1+toeslag) × jaarfactor (12,96) × klanttarief
function feeBerekening(c) {
  const jf = Number(S('jaarfactor', 12.96));
  const tarief = tariefVoor(c.klant, c.functie);
  const loonNote = (c.note || '').match(/\b([2-6]\d{3})\b/);
  const loon = Number(c.maandloon) || (loonNote ? Number(loonNote[1]) : null);
  const toeslag = Number(c.toeslag_pct || 0) / 100;
  if (loon && tarief) {
    const fee = Math.round(loon * (1 + toeslag) * jf * tarief.pct);
    return { fee, zeker: true, uitleg: `€${loon}${toeslag ? ` × ${(1 + toeslag).toFixed(2).replace('.', ',')} (toeslag)` : ''} × ${String(jf).replace('.', ',')} × ${Math.round(tarief.pct * 100)}% (${tarief.rij.klant}${tarief.rij.functie ? ' · ' + tarief.rij.functie : ''}) = €${fee}` };
  }
  if (loon) {
    const fee = Math.round(loon * (1 + toeslag) * 12 * Number(S('fee_pct', 0.22)));
    return { fee, zeker: false, uitleg: `Geen tarief bekend voor ${c.klant} — geschat: €${loon} × 12 × ${Math.round(Number(S('fee_pct', 0.22)) * 100)}%. Vul het tarief in bij Instellingen!` };
  }
  const kd = klantDefaults(c.klant);
  const fee = Math.round(kd.gemFee || kpis().gemFee || 8500);
  return { fee, zeker: false, uitleg: 'Geen maandloon bekend (bord) — fee geschat op klant/gemiddelde. Bevestig!' };
}

function volgendPlaatsingId() {
  const nums = D.placements.map(x => parseInt((x.id || '').replace(/\D/g, ''))).filter(n => !isNaN(n));
  return 'P' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

async function autoCreatePlacements() {
  const nieuw = inboxCandidates();
  let gemaakt = 0;
  for (const c of nieuw) {
    const kd = klantDefaults(c.klant);
    const fb = feeBerekening(c);
    const start = c.start || c.geplaatst_op || todayISO();
    const row = {
      id: volgendPlaatsingId(), klant: kd.sheetKlant, kandidaat: c.naam, functie: c.functie || '',
      fee_excl: fb.fee, contract_datum: c.geplaatst_op || todayISO(), eerste_factuurdatum: start,
      aantal_termijnen: kd.n, maanden_tussen: kd.tussen, betaaltermijn_dgn: kd.betaal,
      garantie_mnd: Number(c.garantie_mnd || 0), pipeline_candidate_id: c.id,
      bron: 'pipeline', concept: true,
      note: fb.uitleg,
    };
    const fee = fb.fee;
    try {
      await dbWrite('fin_placements', t => t.insert(row));
      const schema = genSchema(kd.n > 1 ? 'nx' : '1x', fee, start, { n: kd.n, tussen: kd.tussen });
      for (const r of schema)
        await dbWrite('fin_installments', t => t.insert({
          placement_id: row.id, termijn_nr: r.nr, bedrag_excl: r.bedrag, geplande_datum: r.datum, status: 'te_factureren',
        }));
      gemaakt++;
    } catch (e) { /* volgende poging bij volgende load */ }
  }
  if (gemaakt) {
    await Promise.all([reload('fin_placements', 'placements', 'id'), reload('fin_installments', 'installments', 'geplande_datum')]);
    toast(`${gemaakt} nieuwe plaatsing(en) automatisch aangemaakt vanaf het bord — bevestig de fee`);
  }
  return gemaakt;
}

// flex-kandidaten (type Flex) die contract-getekend zijn → flex-plaatsing
async function autoCreateFlexPlacements() {
  const linked = new Set(D.flexPl.map(f => f.pipeline_candidate_id).filter(Boolean));
  const dismissed = new Set(D.dismissed.map(d => d.candidate_id));
  const byName = new Set(D.flexPl.map(f => (f.kandidaat || '').trim().toLowerCase()));
  const nieuw = D.candidates.filter(c =>
    (c.type || '') === 'Flex' &&
    (PLACED_FASES.includes(c.fase) || c.geplaatst_op) && c.fase !== 'Afgevallen' &&
    !linked.has(c.id) && !dismissed.has(c.id) && !byName.has((c.naam || '').trim().toLowerCase()));
  let gemaakt = 0;
  for (const c of nieuw) {
    const afspr = flexAfspraakVoor(c.klant);
    const row = {
      pipeline_candidate_id: c.id, kandidaat: c.naam, klant: c.klant,
      klantfactor: afspr ? Number(afspr.factor) : null,
      inkoop_factor: afspr ? Number(afspr.inkoop_factor) : Number(S('flex_inkoop_factor', 1.8)),
      overname_uren: afspr ? afspr.overname_uren : null,
      uren_pw: 40, start: c.start || c.geplaatst_op || todayISO(), concept: true,
      note: 'Automatisch van bord — vul uurloon' + (afspr ? '' : ' + klantfactor') + ' in',
    };
    try { await dbWrite('fin_flex_plaatsingen', t => t.insert(row)); gemaakt++; } catch (e) { /* volgende keer */ }
  }
  if (gemaakt) { await reload('fin_flex_plaatsingen', 'flexPl', 'id'); toast(`${gemaakt} nieuwe flexkracht(en) van het bord — vul de uren/marge aan`); }
  return gemaakt;
}

// ── gewogen pijplijn-forecast ──────────────────────────────────
// Kans per bordfase dat het een plaatsing wordt (instelbaar via setting 'fase_kansen')
const FASE_KANSEN_DEFAULT = {
  'Voorgesteld': .10, 'Voorselectie': .10, 'O&O sessie': .25,
  'Eerste gesprek': .20, 'Tweede gesprek': .35, 'Meeloopdag': .50,
  'In de wacht': .60,            // goede kandidaten, wachten op startmoment/contractruimte
  'Contract ondertekenen': .80,
};
// verwachte weken tot plaatsing per fase (voor timing van de cash)
const FASE_LEAD_WKN = {
  'Voorgesteld': 8, 'Voorselectie': 8, 'O&O sessie': 6,
  'Eerste gesprek': 6, 'Tweede gesprek': 5, 'Meeloopdag': 4,
  'In de wacht': 8,              // zonder startdatum: ruime aanname; mét startdatum telt die
  'Contract ondertekenen': 2,
};

function pipelineForecast() {
  const kansen = Object.assign({}, FASE_KANSEN_DEFAULT, S('fase_kansen', {}) || {});
  const fee = kpis().gemFee || 8500;
  const t = todayISO();
  const linked = new Set(D.placements.map(p => p.pipeline_candidate_id).filter(Boolean));
  const rows = D.candidates.filter(c =>
    kansen[c.fase] > 0 && (c.type || '') !== 'Detachering' &&
    !(c.vervangt || '') && !linked.has(c.id))
    .map(c => {
      const kans = kansen[c.fase];
      // plaatsing verwacht op bord-startdatum, anders fase-afhankelijke doorlooptijd
      const plaatsing = (c.start && c.start > t) ? c.start : addDays(t, (FASE_LEAD_WKN[c.fase] || 6) * 7);
      const cash = monthKey(addDays(plaatsing, 30));   // factuur + betaaltermijn ≈ 1 mnd later
      return { c, kans, fee, gewogen: fee * kans, plaatsing, cashMaand: cash };
    })
    .sort((a, b) => b.kans - a.kans);
  const totaal = rows.reduce((s, r) => s + r.gewogen, 0);
  const perMaand = {};
  for (const r of rows) perMaand[r.cashMaand] = (perMaand[r.cashMaand] || 0) + r.gewogen;
  return { rows, totaal, perMaand };
}

// ── targets van het pijplijnbord ───────────────────────────────
function targetInfo() {
  const mk = todayISO().slice(0, 7);                       // '2026-07'
  const row = D.targets.find(x => x.maand === mk);
  const aantalTarget = row ? Number(row.aantal) : null;
  const plaatsingen = D.placements.filter(p => (p.contract_datum || '').slice(0, 7) === mk).length;
  const gemFee = kpis().gemFee || 8500;
  const omzetTarget = S('target_omzet_pm') || (aantalTarget ? aantalTarget * gemFee : null);
  return { aantalTarget, plaatsingen, omzetTarget, maand: mk };
}

// ── wervingskanalen & team (via gekoppelde bord-kandidaten) ────
function kanaalStats() {
  const per = {};
  for (const p of D.placements) {
    const c = D.candidates.find(x => x.id === p.pipeline_candidate_id);
    const bron = (c?.bron || 'Onbekend').trim() || 'Onbekend';
    const st = placementStats(p);
    per[bron] = per[bron] || { n: 0, omzet: 0 };
    per[bron].n++;
    per[bron].omzet += Number(p.fee_excl || 0) - st.vervallen;
  }
  return Object.entries(per).map(([bron, v]) => ({ bron, ...v }))
    .sort((a, b) => b.omzet - a.omzet);
}

function teamStats() {
  const per = {};
  let ttfSom = 0, ttfN = 0;
  for (const p of D.placements) {
    const c = D.candidates.find(x => x.id === p.pipeline_candidate_id);
    if (!c) continue;
    const rec = (c.rec || 'Samen').trim() || 'Samen';
    per[rec] = per[rec] || { n: 0, omzet: 0 };
    per[rec].n++;
    per[rec].omzet += Number(p.fee_excl || 0) - placementStats(p).vervallen;
    if (c.since && c.geplaatst_op && c.geplaatst_op > c.since) {
      ttfSom += daysBetween(c.since, c.geplaatst_op); ttfN++;
    }
  }
  return {
    recruiters: Object.entries(per).map(([rec, v]) => ({ rec, ...v })).sort((a, b) => b.omzet - a.omzet),
    timeToFill: ttfN ? Math.round(ttfSom / ttfN) : null,
  };
}

// ── KPI's & risico's ───────────────────────────────────────────
function kpis() {
  const t = todayISO(), mk = monthKey(t);
  const all = D.installments;
  const sum = f => all.filter(f).reduce((s, i) => s + +i.bedrag_excl, 0);
  const feeTot = D.placements.reduce((s, p) => s + Number(p.fee_excl || 0), 0);
  const omzetDezeMaand = sum(i => (i.factuurdatum || '').slice(0, 7) === mk.slice(0, 7) && (i.status === 'gefactureerd' || i.status === 'betaald'));
  // DSO: gem. dagen factuur→betaald (alleen waar beide datums bekend)
  const paidKnown = all.filter(i => i.status === 'betaald' && i.factuurdatum && i.betaaldatum);
  const dso = paidKnown.length ? Math.round(paidKnown.reduce((s, i) => s + daysBetween(i.factuurdatum, i.betaaldatum), 0) / paidKnown.length) : null;
  const plYtd = D.placements.filter(p => (p.contract_datum || '').slice(0, 4) === t.slice(0, 4));
  const gemFee = plYtd.length ? plYtd.reduce((s, p) => s + +(p.fee_excl || 0), 0) / plYtd.length : 0;
  const gestopt = D.placements.filter(p => p.gestopt_op).length;
  return {
    feeTot,
    nogTeFactureren: sum(i => i.status === 'te_factureren'),
    openstaand: sum(i => i.status === 'gefactureerd'),
    vervallen: sum(i => i.status === 'vervallen'),
    omzetDezeMaand, dso,
    plaatsingenYtd: plYtd.length, gemFee,
    stopPct: D.placements.length ? gestopt / D.placements.length : 0,
  };
}

// volledig overzicht per klant (voor het Plaatsingen-scherm)
function perKlantStats() {
  const per = {};
  for (const p of D.placements) {
    const st = placementStats(p);
    const k = per[p.klant] = per[p.klant] || { klant: p.klant, n: 0, fee: 0, gefact: 0, betaald: 0, open: 0, nog: 0, vervallen: 0, gestopt: 0 };
    k.n++; k.fee += Number(p.fee_excl || 0);
    k.gefact += st.gefact; k.betaald += st.betaald; k.open += st.open;
    k.nog += st.nog; k.vervallen += st.vervallen;
    if (p.gestopt_op) k.gestopt++;
  }
  const rows = Object.values(per).map(k => ({ ...k, netto: k.fee - k.vervallen }));
  const totNetto = rows.reduce((s, r) => s + r.netto, 0) || 1;
  // winst-indicatie: bedrijfsbrede marge (liefst live uit Yuki) toegerekend naar omzet-aandeel
  const marge = Number(S('yuki_omzet_ytd', 0)) > 0
    ? Number(S('yuki_winst_ytd', 0)) / Number(S('yuki_omzet_ytd', 1)) : null;
  rows.forEach(r => { r.aandeel = r.netto / totNetto; r.winstIndicatie = marge != null ? r.netto * marge : null; });
  return rows.sort((a, b) => b.netto - a.netto);
}

function concentratie() {
  const per = {};
  for (const p of D.placements) {
    const st = placementStats(p);
    const eff = Number(p.fee_excl || 0) - st.vervallen;
    per[p.klant] = (per[p.klant] || 0) + eff;
  }
  const tot = Object.values(per).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(per).map(([klant, bedrag]) => ({ klant, bedrag, aandeel: bedrag / tot }))
    .sort((a, b) => b.bedrag - a.bedrag);
  return { rows, top1: rows[0], top3: rows.slice(0, 3).reduce((s, r) => s + r.aandeel, 0) };
}

// ── kosten per maand (budget of werkelijk) ─────────────────────
function budgetVoorMaand(mk) {
  return D.budget.filter(b => b.vanaf_maand <= mk && (!b.tot_maand || b.tot_maand >= mk))
    .reduce((s, b) => s + +b.bedrag_pm, 0);
}
function actueelVoorMaand(mk) {
  const rows = D.actuals.filter(a => a.maand === mk);
  // de Yuki-sync schrijft één totaalregel per afgesloten maand — die is dan leidend
  const yuki = rows.find(a => a.categorie === 'Werkelijk totaal (Yuki)');
  if (yuki) return Number(yuki.bedrag);
  return rows.length ? rows.reduce((s, a) => s + +a.bedrag, 0) : null;
}

// ── Yuki open posten: betaald-suggesties + bewaking ────────────
function yukiBetaaldSuggesties() {
  const debOpen = D.yukiOpen.filter(r => r.soort === 'debiteur');
  if (!S('yuki_synced_at') || !D.yukiOpen.length) return [];   // pas suggesties doen als er ooit gesynct is
  const uit = [];
  for (const p of D.placements) {
    if (p.concept) continue;
    for (const i of instOf(p.id)) {
      if (i.status !== 'gefactureerd' || !i.factuurdatum) continue;
      if (daysBetween(i.factuurdatum, todayISO()) < 5) continue;   // te vers om conclusies te trekken
      const naam = (p.kandidaat || '').toLowerCase().split(' ')[0];
      const inclBtw = +i.bedrag_excl * (1 + Number(S('btw_pct', .21)));
      const nogOpen = debOpen.some(r =>
        (naam && (r.omschrijving || '').toLowerCase().includes(naam)) ||
        Math.abs(+r.open_bedrag - inclBtw) < 1 || Math.abs(+r.origineel_bedrag - inclBtw) < 1);
      if (!nogOpen) uit.push({ p, i });
    }
  }
  return uit;
}

function yukiBewaking() {
  const gesynct = S('yuki_synced_at');
  if (!gesynct) return null;
  const appOpenIncl = D.installments.filter(i => i.status === 'gefactureerd')
    .reduce((s, i) => s + +i.bedrag_excl * (1 + Number(S('btw_pct', .21))), 0);
  const yukiDeb = Number(S('yuki_debiteuren', 0));
  return { appOpenIncl, yukiDeb, verschil: appOpenIncl - yukiDeb,
    crediteuren: Number(S('yuki_crediteuren_open', 0)) };
}

// ── belastingpotjes (indicatief, factuurstelsel) ───────────────
function potjes() {
  const t = todayISO(), y = +t.slice(0, 4), q = Math.floor((+t.slice(5, 7) - 1) / 3);
  const qStart = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  const btwPct = Number(S('btw_pct', .21));
  const inQ = D.installments.filter(i => i.factuurdatum && i.factuurdatum >= qStart && i.factuurdatum <= t
    && (i.status === 'gefactureerd' || i.status === 'betaald'));
  const flexQ = D.flex.filter(w => w.week >= qStart && w.week <= t).reduce((s, w) => s + +w.bedrag, 0);
  const btwOntvangen = inQ.reduce((s, i) => s + +i.bedrag_excl * btwPct, 0) + flexQ * btwPct;
  const mndInQ = (+t.slice(5, 7) - 1) % 3 + 1;
  const voorbelasting = Number(S('voorbelasting_pm', 0)) * mndInQ;
  const btwPot = Math.max(0, btwOntvangen - voorbelasting);
  // Vpb: 19% (instelbaar) over winst YTD = gefactureerde omzet − kosten.
  // Als er een Yuki-anker is (werkelijke winst per rapportdatum) rekenen we vanaf dáár verder.
  const ankerWinst = Number(S('yuki_winst_ytd', 0) || 0);
  const ankerDatum = S('yuki_winst_datum', null);
  const start = ankerDatum && ankerDatum.slice(0, 4) === String(y) ? ankerDatum : `${y}-01-01`;
  const basisWinst = start === ankerDatum ? ankerWinst : 0;
  const omzetYtd = basisWinst
    + D.installments.filter(i => i.factuurdatum && i.factuurdatum > start
      && (i.status === 'gefactureerd' || i.status === 'betaald')).reduce((s, i) => s + +i.bedrag_excl, 0)
    + D.flex.filter(w => w.week > start && w.week.slice(0, 4) === String(y)).reduce((s, w) => s + +w.bedrag, 0);
  // het deel van de TVE-uitkering boven de fee is RC-aflossing (balans), géén kosten
  const rcAfbouwPm = Math.max(0, Number(S('mgmt_uitkering_pm', 0)) - Number(S('mgmt_fee_pm', 0)));
  let kostenYtd = 0;
  for (let m = 0; m < 12; m++) {
    const mk = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    if (mk > monthKey(t)) break;
    if (mk <= monthKey(start)) continue;   // maanden t/m het anker zitten al in de ankerwinst
    kostenYtd += (actueelVoorMaand(mk) ?? budgetVoorMaand(mk)) - rcAfbouwPm;
  }
  const winstYtd = omzetYtd - kostenYtd;
  const vpbPot = Math.max(0, winstYtd * Number(S('vpb_pct', .19)));
  return { btwPot, btwOntvangen, voorbelasting, vpbPot, winstYtd, omzetYtd, kostenYtd };
}

// ── cashflow-projectie ─────────────────────────────────────────
// scenario = { omzetPm, omzetDipPct, extraHirePm, extraHireVanaf, aflossenAan }
function projectie(maanden = 12, scenario = {}) {
  const sc = Object.assign({
    bron: 'pijplijn',                                 // 'pijplijn' = gewogen forecast van het bord; 'vast' = vlak bedrag
    omzetPm: Number(S('scenario_omzet_pm', 25000)),
    omzetDipPct: 0, extraHirePm: 0, extraHireVanaf: 1, aflossenAan: true,
    flexFactor: 1,                                    // 1 = flex blijft op run-rate; 2 = verdubbelt; 0 = valt weg
  }, scenario);
  const t = todayISO();
  const btwPct = Number(S('btw_pct', .21));
  const start = D.saldi[0] ? Number(D.saldi[0].saldo) : 0;
  const m0 = monthKey(t);
  const keys = [], labels = [];
  for (let i = 0; i < maanden; i++) { const k = addMonths(m0, i); keys.push(k); labels.push(fmtMaand(k)); }
  const bucket = Object.fromEntries(keys.map(k => [k, { inFact: 0, inScenario: 0, inFlex: 0, uitKosten: 0, uitBtw: 0, uitLening: 0 }]));
  const put = (k, f, v) => { if (bucket[k]) bucket[k][f] += v; else if (k < m0 && f.startsWith('in')) bucket[m0][f] += v; };

  // 1. verwachte ontvangsten uit het echte factuurschema (incl. btw)
  for (const p of D.placements) {
    for (const i of instOf(p.id)) {
      if (i.status === 'te_factureren' && i.geplande_datum) {
        put(monthKey(addDays(i.geplande_datum, p.betaaltermijn_dgn)), 'inFact', +i.bedrag_excl * (1 + btwPct));
      } else if (i.status === 'gefactureerd') {
        const vv = vervaldatum(i, p) || t;
        put(monthKey(vv < t ? addDays(t, 14) : vv), 'inFact', +i.bedrag_excl * (1 + btwPct)); // te laat → aanname: binnen 2 wkn
      }
    }
  }
  // 2. scenario: nieuwe W&S-omzet (facturen volgen ~1 mnd later, incl. btw)
  if (sc.bron === 'pijplijn' && D.candidates.length) {
    // gewogen forecast uit het bord: kans × fee per kandidaat, in de verwachte cash-maand.
    // Ná de bord-horizon (kandidaten kijken ~2 mnd vooruit) valt terug op het vlakke scenario.
    const pf = pipelineForecast();
    const horizon = Object.keys(pf.perMaand).sort().pop() || m0;
    keys.forEach((k, i) => {
      if (pf.perMaand[k]) put(k, 'inScenario', pf.perMaand[k] * (1 - sc.omzetDipPct) * (1 + btwPct));
      else if (k > horizon && i >= 1) put(k, 'inScenario', sc.omzetPm * (1 - sc.omzetDipPct) * (1 + btwPct));
    });
  } else {
    const omzet = sc.omzetPm * (1 - sc.omzetDipPct);
    keys.forEach((k, i) => { if (i >= 1) put(k, 'inScenario', omzet * (1 + btwPct)); });
  }
  // 2b. flex: doorlopende weekmarge (run-rate laatste 4 weken × factor, incl. btw)
  const flexPm = flexStats().maandRunRate * sc.flexFactor;
  keys.forEach(k => put(k, 'inFlex', flexPm * (1 + btwPct)));
  // 3. kosten: werkelijk waar bekend, anders budget (+ evt. extra hire)
  keys.forEach((k, i) => {
    let kost = actueelVoorMaand(k) ?? budgetVoorMaand(k);
    if (i >= sc.extraHireVanaf) kost += sc.extraHirePm;
    put(k, 'uitKosten', kost);
  });
  // 4. btw-afdracht: in jan/apr/jul/okt de btw van het vorige kwartaal
  const voorb = Number(S('voorbelasting_pm', 0));
  keys.forEach(k => {
    const m = +k.slice(5, 7);
    if (![1, 4, 7, 10].includes(m)) return;
    let btwQ = 0;
    for (let j = 3; j >= 1; j--) {
      const pk = addMonths(k, -j), b = bucket[pk];
      if (b) btwQ += (b.inFact + b.inScenario + b.inFlex) * btwPct / (1 + btwPct);
      else {
        // vóór projectiestart: btw over werkelijk gefactureerd + flex in die maand
        const fact = D.installments.filter(x => x.factuurdatum && monthKey(x.factuurdatum) === pk
          && (x.status === 'gefactureerd' || x.status === 'betaald')).reduce((s, x) => s + +x.bedrag_excl, 0);
        btwQ += (fact + flexInMaand(pk)) * btwPct;
      }
    }
    put(k, 'uitBtw', Math.max(0, btwQ - voorb * 3));
  });
  // 5. geplande aflossingen
  if (sc.aflossenAan) for (const lp of D.loanPayments) {
    if (lp.gepland && lp.datum >= t) put(monthKey(lp.datum), 'uitLening', +lp.bedrag);
  }

  let saldo = start;
  const rows = keys.map((k, i) => {
    const b = bucket[k];
    const inTot = b.inFact + b.inScenario + b.inFlex;
    const uitTot = b.uitKosten + b.uitBtw + b.uitLening;
    saldo += inTot - uitTot;
    return { key: k, label: labels[i], ...b, inTot, uitTot, saldo };
  });
  const laagste = rows.reduce((a, r) => r.saldo < a.saldo ? r : a, { saldo: Infinity });
  const negatief = rows.find(r => r.saldo < 0);
  // runway zonder nieuwe W&S-omzet: saldo + zeker factuurschema + doorlopende flex vs. kosten
  let rSaldo = start, runway = 0;
  for (const k of keys) {
    const b = bucket[k];
    rSaldo += b.inFact + b.inFlex - (b.uitKosten + b.uitBtw + b.uitLening);
    if (rSaldo < 0) break;
    runway++;
  }
  return { rows, start, laagste, negatief, runway, scenario: sc };
}
