// ═══ CALC: alle afgeleide financiële logica ═══

const instOf = pid => D.installments.filter(i => i.placement_id === pid)
  .sort((a, b) => a.termijn_nr - b.termijn_nr);

function vervaldatum(inst, p) {
  const basis = inst.factuurdatum || inst.geplande_datum;
  return basis ? addDays(basis, p ? p.betaaltermijn_dgn : 14) : null;
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
  const byNameClient = new Set(D.placements.map(p =>
    (p.kandidaat + '|' + p.klant).toLowerCase()));
  return D.candidates.filter(c =>
    (PLACED_FASES.includes(c.fase) || c.geplaatst_op) &&
    !linked.has(c.id) && !dismissed.has(c.id) &&
    !byNameClient.has(((c.naam || '') + '|' + (c.klant || '')).toLowerCase()));
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
  return list.sort((a, b) => b.urg - a.urg);
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
  return rows.length ? rows.reduce((s, a) => s + +a.bedrag, 0) : null;
}

// ── belastingpotjes (indicatief, factuurstelsel) ───────────────
function potjes() {
  const t = todayISO(), y = +t.slice(0, 4), q = Math.floor((+t.slice(5, 7) - 1) / 3);
  const qStart = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  const btwPct = Number(S('btw_pct', .21));
  const inQ = D.installments.filter(i => i.factuurdatum && i.factuurdatum >= qStart && i.factuurdatum <= t
    && (i.status === 'gefactureerd' || i.status === 'betaald'));
  const btwOntvangen = inQ.reduce((s, i) => s + +i.bedrag_excl * btwPct, 0);
  const mndInQ = (+t.slice(5, 7) - 1) % 3 + 1;
  const voorbelasting = Number(S('voorbelasting_pm', 0)) * mndInQ;
  const btwPot = Math.max(0, btwOntvangen - voorbelasting);
  // Vpb: 19% (instelbaar) over winst YTD = gefactureerde omzet − kosten.
  // Als er een Yuki-anker is (werkelijke winst per rapportdatum) rekenen we vanaf dáár verder.
  const ankerWinst = Number(S('yuki_winst_ytd', 0) || 0);
  const ankerDatum = S('yuki_winst_datum', null);
  const start = ankerDatum && ankerDatum.slice(0, 4) === String(y) ? ankerDatum : `${y}-01-01`;
  const basisWinst = start === ankerDatum ? ankerWinst : 0;
  const omzetYtd = basisWinst + D.installments.filter(i => i.factuurdatum && i.factuurdatum > start
    && (i.status === 'gefactureerd' || i.status === 'betaald')).reduce((s, i) => s + +i.bedrag_excl, 0);
  let kostenYtd = 0;
  for (let m = 0; m < 12; m++) {
    const mk = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    if (mk > monthKey(t)) break;
    if (mk <= monthKey(start)) continue;   // maanden t/m het anker zitten al in de ankerwinst
    kostenYtd += actueelVoorMaand(mk) ?? budgetVoorMaand(mk);
  }
  const winstYtd = omzetYtd - kostenYtd;
  const vpbPot = Math.max(0, winstYtd * Number(S('vpb_pct', .19)));
  return { btwPot, btwOntvangen, voorbelasting, vpbPot, winstYtd, omzetYtd, kostenYtd };
}

// ── cashflow-projectie ─────────────────────────────────────────
// scenario = { omzetPm, omzetDipPct, extraHirePm, extraHireVanaf, aflossenAan }
function projectie(maanden = 12, scenario = {}) {
  const sc = Object.assign({
    omzetPm: Number(S('scenario_omzet_pm', 25000)),
    omzetDipPct: 0, extraHirePm: 0, extraHireVanaf: 1, aflossenAan: true,
  }, scenario);
  const t = todayISO();
  const btwPct = Number(S('btw_pct', .21));
  const start = D.saldi[0] ? Number(D.saldi[0].saldo) : 0;
  const m0 = monthKey(t);
  const keys = [], labels = [];
  for (let i = 0; i < maanden; i++) { const k = addMonths(m0, i); keys.push(k); labels.push(fmtMaand(k)); }
  const bucket = Object.fromEntries(keys.map(k => [k, { inFact: 0, inScenario: 0, uitKosten: 0, uitBtw: 0, uitLening: 0 }]));
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
  // 2. scenario: nieuwe omzet (facturen volgen ~1 mnd later, incl. btw)
  const omzet = sc.omzetPm * (1 - sc.omzetDipPct);
  keys.forEach((k, i) => { if (i >= 1) put(k, 'inScenario', omzet * (1 + btwPct)); });
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
      if (b) btwQ += (b.inFact + b.inScenario) * btwPct / (1 + btwPct);
      else {
        // vóór projectiestart: btw over werkelijk gefactureerd in die maand
        const fact = D.installments.filter(x => x.factuurdatum && monthKey(x.factuurdatum) === pk
          && (x.status === 'gefactureerd' || x.status === 'betaald')).reduce((s, x) => s + +x.bedrag_excl, 0);
        btwQ += fact * btwPct;
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
    const inTot = b.inFact + b.inScenario;
    const uitTot = b.uitKosten + b.uitBtw + b.uitLening;
    saldo += inTot - uitTot;
    return { key: k, label: labels[i], ...b, inTot, uitTot, saldo };
  });
  const laagste = rows.reduce((a, r) => r.saldo < a.saldo ? r : a, { saldo: Infinity });
  const negatief = rows.find(r => r.saldo < 0);
  // runway zonder nieuwe omzet: hoeveel maanden dekt huidig saldo + zeker factuurschema de kosten
  let rSaldo = start, runway = 0;
  for (const k of keys) {
    const b = bucket[k];
    rSaldo += b.inFact - (b.uitKosten + b.uitBtw + b.uitLening);
    if (rSaldo < 0) break;
    runway++;
  }
  return { rows, start, laagste, negatief, runway, scenario: sc };
}
