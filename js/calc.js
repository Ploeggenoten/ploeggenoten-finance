// ═══ CALC: alle afgeleide financiële logica ═══

const instOf = pid => D.installments.filter(i => i.placement_id === pid)
  .sort((a, b) => a.termijn_nr - b.termijn_nr);

// flex = detachering (oud label); accepteer beide zodat resterende data niet lekt
const isFlexType = t => { const x = (t || '').toLowerCase(); return x === 'flex' || x === 'detachering'; };

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
    // Plaatsing PAS aanmaken als de kandidaat NU op "Contract getekend"/"Gestart" staat.
    // (Of terecht daarna gestopt.) Een verouderde geplaatst_op bij een teruggezette
    // kandidaat (bijv. terug naar Offer) telt NIET — anders ontstaan spookplaatsingen.
    (PLACED_FASES.includes(c.fase) || (c.geplaatst_op && c.fase === 'Gestopt')) &&
    !isFlexType(c.type) &&                        // flex loopt via Pronkert, niet via W&S-facturatie
    !(c.vervangt || '') &&                        // garantievervangers zijn geen nieuwe fee
    !linked.has(c.id) && !dismissed.has(c.id) &&
    // naam-vangnet tegen dubbels — behalve bij een herstart (♻): dat is bewust een nieuw traject
    // van dezelfde persoon (bijv. gestopt bij klant A, heraangeboden bij klant B) = nieuwe fee
    (c.herstart_van ? true : !byName.has((c.naam || '').trim().toLowerCase())));
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
      list.push({ soort: 'concept', urg: 2, p, txt: `Nieuwe plaatsing ${p.id} vanaf het bord — fee geschat op ${eur(p.fee_excl)}. Bevestig de fee én kies het factuurschema (bv. 50% bij tekenen / 50% na X mnd)` });
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
    // teruggezet op het bord (vóór getekend) maar al gefactureerd → niet auto-verwijderd, hand nodig
    if (p.pipeline_candidate_id) {
      const cc = D.candidates.find(x => x.id === p.pipeline_candidate_id);
      const st2 = placementStats(p);
      if (cc && !['Contract getekend', 'Gestart', 'Gestopt'].includes(cc.fase) && (st2.gefact > 0 || st2.betaald > 0))
        list.push({ soort: 'terug', urg: 2, p, txt: `${p.kandidaat} staat op het bord terug op "${cc.fase}" (niet meer getekend), maar er is al gefactureerd — controleer` });
    }
  }
  for (const c of inboxCandidates())
    list.push({ soort: 'afronden', urg: 1, c, txt: `${c.naam} (${c.klant || '?'}) — plaatsing afronden` });
  for (const { p, c } of stopSignalen())
    list.push({ soort: 'stop_signaal', urg: 2, p, c, txt: `${p.kandidaat} staat op het bord als gestopt (${fmtD(c.gestopt_op)}) — verwerken` });
  const saldo = D.saldi[0];
  if (!saldo || daysBetween(saldo.datum, t) > 14)
    list.push({ soort: 'saldo', urg: 1, txt: saldo ? `Banksaldo ${daysBetween(saldo.datum, t)} dgn oud — werk bij` : 'Vul je banksaldo in' });
  // (gefactureerd/betaald worden automatisch uit Yuki bijgewerkt tijdens de sync)
  // flex-bewaking: te lang geen marge geïmporteerd? (Sven wekelijks; Alain per 4 weken gefactureerd,
  // dus een gat van 1-2 weken is normaal — pas na 3 weken stilte waarschuwen)
  if (D.flex.length) {
    const laatste = D.flex.reduce((a, w) => w.week > a ? w.week : a, '');
    const dgn = laatste ? daysBetween(laatste, t) : 999;
    if (dgn > 21)
      list.push({ soort: 'flex', urg: 1, txt: `Al ${Math.floor(dgn / 7)} weken geen flex-marge geïmporteerd — check de Pronkert-facturen (📄 op de Flex-tab)` });
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
  // werkelijke marge uit de Pronkert-facturen (incl. overwerk/toeslagen) — leidend boven het model
  const margeWerkelijk = fp.marge_werkelijk != null ? Number(fp.marge_werkelijk) : null;
  return {
    klantfactor, inkoop, uurloon, urenPw, overnameUren, compleet, margePerUur, gewerkteUren, margeWerkelijk,
    margePerWeek: compleet ? margePerUur * urenPw : null,
    margePerMaand: compleet ? margePerUur * urenPw * 52 / 12 : null,
    // totale marge tot de kosteloze overname (het bedrag dat je "verdient" vóór de klant gratis mag overnemen)
    overnameWaarde: compleet && overnameUren ? margePerUur * overnameUren : null,
    // nog te gaan tot de kosteloze overname
    resterendUren: overnameUren && gewerkteUren != null ? Math.max(0, overnameUren - gewerkteUren) : null,
    // verdiend: échte factuurmarge waar bekend, anders marge/uur × gewerkte uren
    verdiend: margeWerkelijk != null ? margeWerkelijk : (compleet && gewerkteUren != null ? margePerUur * gewerkteUren : null),
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

// totaal jaarsalaris uit de bord-componenten. VT default 8% (zat voorheen impliciet in jaarfactor 12,96
// = 12 × 1,08 — dus zonder ingevulde componenten is de uitkomst identiek aan de oude berekening).
// VT rekent over loon incl. ploegentoeslag; eindejaarsuitkering en overig over het kale jaarloon.
function jaarSalaris(c, loon) {
  const ploeg = Number(c.toeslag_pct || 0);
  const vt = (c.vt_pct == null || c.vt_pct === '') ? 8 : Number(c.vt_pct);
  const eju = Number(c.eju_pct || 0), overig = Number(c.overig_pct || 0);
  const jr = loon * 12;
  return jr * (1 + ploeg / 100) * (1 + vt / 100) + jr * eju / 100 + jr * overig / 100;
}
function salarisUitleg(c, loon) {
  const d = [`€${loon} ×12`];
  if (Number(c.toeslag_pct)) d.push(`+${c.toeslag_pct}% ploeg`);
  d.push(`+${(c.vt_pct == null || c.vt_pct === '') ? 8 : c.vt_pct}% VT`);
  if (Number(c.eju_pct)) d.push(`+${c.eju_pct}% EJU`);
  if (Number(c.overig_pct)) d.push(`+${c.overig_pct}% overig`);
  return d.join(' ');
}

// fee-berekening: totaal jaarsalaris (alle componenten van het bord) × klanttarief
function feeBerekening(c) {
  const tarief = tariefVoor(c.klant, c.functie);
  const loonNote = (c.note || '').match(/\b([2-6]\d{3})\b/);
  const loon = Number(c.maandloon) || (loonNote ? Number(loonNote[1]) : null);
  if (loon && tarief) {
    const js = jaarSalaris(c, loon);
    const fee = Math.round(js * tarief.pct);
    return { fee, zeker: true, uitleg: `${salarisUitleg(c, loon)} = jaarsalaris €${Math.round(js)} × ${Math.round(tarief.pct * 100)}% (${tarief.rij.klant}${tarief.rij.functie ? ' · ' + tarief.rij.functie : ''}) = €${fee}` };
  }
  if (loon) {
    const js = jaarSalaris(c, loon);
    const fee = Math.round(js * Number(S('fee_pct', 0.22)));
    return { fee, zeker: false, uitleg: `Geen tarief bekend voor ${c.klant} — geschat: jaarsalaris €${Math.round(js)} × ${Math.round(Number(S('fee_pct', 0.22)) * 100)}%. Vul het tarief in bij Instellingen!` };
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
    // klant-afspraak (Instellingen → tarieven) gaat vóór het historische patroon:
    // bv. 50/50-regeling = 2 termijnen met 3 maanden ertussen
    const tr = tariefVoor(c.klant, c.functie);
    const n = (tr && tr.rij && Number(tr.rij.aantal_termijnen)) || kd.n;
    const tussen = (tr && tr.rij && Number(tr.rij.maanden_tussen)) || kd.tussen;
    const row = {
      id: volgendPlaatsingId(), klant: kd.sheetKlant, kandidaat: c.naam, functie: c.functie || '',
      fee_excl: fb.fee, contract_datum: c.geplaatst_op || todayISO(), eerste_factuurdatum: start,
      aantal_termijnen: n, maanden_tussen: tussen, betaaltermijn_dgn: kd.betaal,
      garantie_mnd: Number(c.garantie_mnd || 0), pipeline_candidate_id: c.id,
      bron: 'pipeline', concept: true,
      note: fb.uitleg + (c.herstart_van ? ' · ♻ herstart (eerder traject apart geregistreerd)' : ''),
    };
    const fee = fb.fee;
    try {
      await dbWrite('fin_placements', t => t.insert(row));
      const schema = genSchema(n > 1 ? 'nx' : '1x', fee, start, { n, tussen });
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

// flex-kandidaten (type Flex) die NU actief geplaatst zijn → flex-plaatsing
async function autoCreateFlexPlacements() {
  const linked = new Set(D.flexPl.map(f => f.pipeline_candidate_id).filter(Boolean));
  const dismissed = new Set(D.dismissed.map(d => d.candidate_id));
  const byName = new Set(D.flexPl.map(f => (f.kandidaat || '').trim().toLowerCase()));
  const nieuw = D.candidates.filter(c =>
    isFlexType(c.type) &&
    PLACED_FASES.includes(c.fase) &&           // alléén nu-actieve fases (Contract getekend/Gestart), niet historisch geplaatst-en-gestopt
    !c.gestopt_op &&                           // al gestopt op het bord? niet als actieve flexkracht aanmaken
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

// als een gekoppelde kandidaat op het bord gestopt is → plaatsing automatisch naar gestopt
async function autoStopFromBoard() {
  const bordGestopt = id => {
    const c = D.candidates.find(x => x.id === id);
    return c && c.gestopt_op ? c.gestopt_op : null;
  };
  let n = 0;
  for (const p of D.placements) {
    if (p.gestopt_op || !p.pipeline_candidate_id) continue;
    const d = bordGestopt(p.pipeline_candidate_id);
    if (!d) continue;
    await dbWrite('fin_placements', t => t.update({ gestopt_op: d, updated_at: new Date().toISOString() }).eq('id', p.id));
    n++;
  }
  for (const f of D.flexPl) {
    if (f.gestopt_op || !f.pipeline_candidate_id) continue;
    const d = bordGestopt(f.pipeline_candidate_id);
    if (!d) continue;
    await dbWrite('fin_flex_plaatsingen', t => t.update({ gestopt_op: d }).eq('id', f.id));
    n++;
  }
  if (n) {
    await Promise.all([reload('fin_placements', 'placements', 'id'), reload('fin_flex_plaatsingen', 'flexPl', 'id')]);
    // W&S: gestopte termijnen na stop+marge laten vervallen
    for (const p of D.placements) if (p.gestopt_op) for (const i of stopImpact(p))
      await dbWrite('fin_installments', t => t.update({ status: 'vervallen' }).eq('id', i.id));
    await reload('fin_installments', 'installments', 'geplande_datum');
    toast(`${n} plaatsing(en) automatisch naar gestopt (bord)`);
  }
  return n;
}

// Kandidaat is op het bord teruggezet vóór "Contract getekend" (bijv. per ongeluk
// getekend en weer naar Offer/gesprek) → de plaatsing hoort niet te bestaan en gaat terug.
// Alleen veilig als er nog niets gefactureerd is; anders komt het als actie (zie acties()).
async function autoReverseFromBoard() {
  const geldig = ['Contract getekend', 'Gestart', 'Gestopt'];   // Gestopt = terecht geplaatst-en-gestopt, blijft staan
  let n = 0;
  for (const p of D.placements) {
    if (!p.pipeline_candidate_id) continue;
    const c = D.candidates.find(x => x.id === p.pipeline_candidate_id);
    if (!c || geldig.includes(c.fase)) continue;
    const st = placementStats(p);
    if (st.gefact > 0 || st.betaald > 0) continue;              // al gefactureerd → niet stil verwijderen
    await dbWrite('fin_installments', t => t.delete().eq('placement_id', p.id));
    await dbWrite('fin_placements', t => t.delete().eq('id', p.id));
    n++;
  }
  if (n) {
    await Promise.all([reload('fin_placements', 'placements', 'id'), reload('fin_installments', 'installments', 'geplande_datum')]);
    toast(`${n} plaatsing(en) teruggedraaid — staat op het bord niet meer op "Contract getekend"`);
  }
  return n;
}

// ── gewogen pijplijn-forecast ──────────────────────────────────
// Kans per bordfase dat het een plaatsing wordt (instelbaar via setting 'fase_kansen')
const FASE_KANSEN_DEFAULT = {
  // Voorselectie telt bewust NIET mee (te vroeg om te wegen)
  'Voorgesteld': .05,
  'O&O sessie': .10,             // niet expliciet opgegeven — geïnterpoleerd tussen voorgesteld en 1e gesprek
  'Eerste gesprek': .20, 'Tweede gesprek': .40, 'Meeloopdag': .50,
  'In de wacht': .50,            // goede kandidaten, wachten op startmoment/contractruimte
  'Offer': .65,                  // niet expliciet opgegeven — geïnterpoleerd tussen in-de-wacht en ondertekenen
  'Contract ondertekenen': .75,  // pijplijn; een plaatsing telt pas vanaf "Contract getekend"
};
// verwachte weken tot plaatsing per fase (voor timing van de cash)
const FASE_LEAD_WKN = {
  'Voorgesteld': 8, 'Voorselectie': 8, 'O&O sessie': 6,
  'Eerste gesprek': 6, 'Tweede gesprek': 5, 'Meeloopdag': 4,
  'In de wacht': 8,              // zonder startdatum: ruime aanname; mét startdatum telt die
  'Offer': 3, 'Contract ondertekenen': 2,
};

// ── fase-kansen kalibreren op de ECHTE doorstroom (bord-historie) ──
// De volgorde van de funnel; index bepaalt "hoe ver een kandidaat kwam".
// LET OP: "In de wacht" staat vóór "Offer" (logische volgorde: eerst parkeren, dan aanbod).
const FUNNEL = ['Voorselectie', 'Voorgesteld', 'O&O sessie', 'Eerste gesprek', 'Tweede gesprek',
  'Meeloopdag', 'In de wacht', 'Offer', 'Contract ondertekenen', 'Contract getekend', 'Gestart'];
// Een plaatsing telt PAS vanaf "Contract getekend" — alles daarvoor (óók "Contract ondertekenen") is nog pijplijn.
const PLAATSING_IDX = FUNNEL.indexOf('Contract getekend');

function furthestIdx(c) {
  let idx = FUNNEL.indexOf(c.fase);
  if (Array.isArray(c.historie)) for (const h of c.historie) { const i = FUNNEL.indexOf(h && h.fase); if (i > idx) idx = i; }
  if (c.geplaatst_op && idx < PLAATSING_IDX) idx = PLAATSING_IDX;
  return idx;
}
const isResolvedCand = c => ['Contract getekend', 'Gestart', 'Afgevallen', 'Gestopt'].includes(c.fase) || !!c.geplaatst_op;
const reachedPlacement = c => !!c.geplaatst_op || furthestIdx(c) >= PLAATSING_IDX;

// per fase: welk deel van wie die fase ooit bereikte, werd uiteindelijk een plaatsing?
// Alleen betrouwbaar als een groot deel van de afgeronde kandidaten fase-historie heeft
// (anders vallen vroege afvallers uit de noemer en worden de kansen véél te hoog).
function faseConversie(minN = 15) {
  const kans = {}, meta = {};
  const resolved = D.candidates.filter(c => !isFlexType(c.type) && !(c.vervangt || '') && isResolvedCand(c));
  const metHist = resolved.filter(c => Array.isArray(c.historie) && c.historie.length > 0);
  const coverage = resolved.length ? metHist.length / resolved.length : 0;
  if (coverage < 0.6) return { kans, meta, coverage };   // te weinig historie → gebruik de standaardkansen
  // alleen kandidaten met bekend pad (historie of daadwerkelijk geplaatst) tellen mee
  const usable = resolved.filter(c => (Array.isArray(c.historie) && c.historie.length > 0) || c.geplaatst_op);
  for (const fase of Object.keys(FASE_KANSEN_DEFAULT)) {
    const p = FUNNEL.indexOf(fase); if (p < 0) continue;
    const bereikt = usable.filter(c => furthestIdx(c) >= p);
    if (bereikt.length >= minN) {
      const geplaatst = bereikt.filter(reachedPlacement).length;
      kans[fase] = geplaatst / bereikt.length;
      meta[fase] = { n: bereikt.length, geplaatst };
    }
  }
  return { kans, meta, coverage };
}

// ── break-even: hoeveel plaatsingen/maand dekken je kosten? ─────
function breakEven() {
  const gemFee = kpis().gemFee || 8500;
  const behoud = 1 - (kpis().stopPct || 0);
  const m0 = monthKey(todayISO());
  let kost = 0, n = 0;
  for (let i = 0; i < 12; i++) { const k = addMonths(m0, i); kost += (actueelVoorMaand(k) ?? budgetVoorMaand(k)); n++; }
  const kostPm = n ? kost / n : 0;
  const flexPm = flexStats().maandRunRate;
  const perPlaatsing = gemFee * behoud;                 // netto W&S-omzet per plaatsing (excl. btw)
  const nodig = perPlaatsing > 0 ? Math.max(0, (kostPm - flexPm) / perPlaatsing) : null;
  return { kostPm, flexPm, perPlaatsing, gemFee, behoud, nodig };
}

// ── conversie-keten: voorstel → offer → plaatsing → blijver ─────
// Gebaseerd op afgeronde trajecten (bord): hoeveel heb je er van elk nodig?
function conversieKeten(filter = {}) {
  let resolved = D.candidates.filter(c => !isFlexType(c.type) && !(c.vervangt || '') && isResolvedCand(c));
  if (filter.klant) resolved = resolved.filter(c => c.klant === filter.klant);
  if (filter.rec) resolved = resolved.filter(c => (c.rec || '').trim() === filter.rec);
  const idxO = FUNNEL.indexOf('In de wacht');           // offer-stadium = In de wacht/Offer/ondertekenen of verder
  const voorstellen = resolved.length;                  // in procedure genomen (voorgesteld)
  const offers = resolved.filter(c => furthestIdx(c) >= idxO || c.afval_type === 'offer_afgewezen' || reachedPlacement(c)).length;
  const geplaatst = resolved.filter(reachedPlacement);
  const plaats = geplaatst.length;
  const blijft = geplaatst.filter(c => !c.gestopt_op).length;
  // duurzaam = niet gestopt, óf pas gestopt ná de garantieperiode (fee volledig verdiend)
  const duurzaam = geplaatst.filter(c => {
    if (!c.gestopt_op) return true;
    const ref = c.start || c.geplaatst_op, g = Number(c.garantie_mnd) || 0;
    return !!(ref && g && c.gestopt_op > addMonths(ref, g));
  }).length;
  const r = (a, b) => b > 0 ? a / b : null;
  const isOffer = c => furthestIdx(c) >= idxO || c.afval_type === 'offer_afgewezen' || reachedPlacement(c);
  return { voorstellen, offers, plaats, blijft, duurzaam,
    voorPerOffer: r(voorstellen, offers), offerPerPlaatsing: r(offers, plaats),
    voorPerPlaatsing: r(voorstellen, plaats), voorPerBlijver: r(voorstellen, blijft),
    pctOffer: r(offers, voorstellen), pctPlaats: r(plaats, offers), pctBlijft: r(blijft, plaats), pctDuurzaam: r(duurzaam, plaats),
    // namenlijsten voor drill-down
    lijsten: {
      voorstellen: resolved,
      offers: resolved.filter(isOffer),
      plaats: geplaatst,
      blijft: geplaatst.filter(c => !c.gestopt_op),
    } };
}

// ── jaardoel-GPS: van winstdoel terug naar benodigde plaatsingen ──
function jaardoelGps() {
  const doel = Number(S('doel_winst_jaar', 0)) || null;
  const pot = potjes();
  const k = kpis();
  const gemFee = k.gemFee || 8500;
  const blijf = 1 - (k.stopPct || 0);
  const flexPm = flexStats().maandRunRate;
  const t = todayISO(), m = +t.slice(5, 7);
  const mndRest = 12 - m + 1;                          // incl. lopende maand
  const kostenOver = n => { let s = 0; for (let i = 0; i < n; i++) { const mk = addMonths(monthKey(t), i); s += actueelVoorMaand(mk) ?? budgetVoorMaand(mk); } return s; };
  const maak = (nMnd, teGaanWinst) => {
    const kosten = kostenOver(nMnd);
    const omzetNodig = Math.max(0, teGaanWinst) + kosten;
    const flexBij = flexPm * nMnd;
    const wsNodig = Math.max(0, omzetNodig - flexBij);
    const perPlaatsing = gemFee * blijf;
    const plaats = perPlaatsing > 0 ? wsNodig / perPlaatsing : null;
    return { nMnd, kosten, omzetNodig, flexBij, wsNodig, plaats, perMnd: plaats != null ? plaats / nMnd : null };
  };
  const restJaar = doel != null ? maak(mndRest, doel - pot.winstYtd) : null;
  const rolling = doel != null ? maak(12, doel) : null;   // zelfde doel, maar over de komende 12 mnd
  const verstreken = Math.max(0.5, m - 1 + (+t.slice(8, 10)) / 30);
  const tempo = k.plaatsingenYtd / verstreken;            // huidig tempo (plaatsingen/mnd dit jaar)
  return { doel, winstYtd: pot.winstYtd, teGaan: doel != null ? doel - pot.winstYtd : null,
    restJaar, rolling, tempo, gemFee, blijf, flexPm, mndRest };
}

// ── uitkeer-planner (DGA): wat kan er veilig naar privé/aflossing ──
function uitkeerRuimte(extra = 0) {
  const proj = projectie(12);
  const buffer = Number(S('cash_buffer_min', 10000));
  const vpb = potjes().vpbPot;
  const laagste = proj.laagste.saldo;
  const ruimte = Math.max(0, laagste - buffer - vpb);
  return { laagste, laagsteLabel: proj.laagste.label, buffer, vpb, ruimte,
    naExtra: laagste - extra, veiligNaExtra: laagste - extra >= buffer + vpb };
}

// ── tarief-adviseur: wat levert elke klant echt op, en waar zit rek ──
function tariefAdvies() {
  const t = todayISO(), y = t.slice(0, 4);
  const verstrekenMnd = Math.max(1, +t.slice(5, 7) - 1 + (+t.slice(8, 10)) / 30);
  const per = {};
  for (const p of D.placements) {
    if ((p.contract_datum || '').slice(0, 4) !== y) continue;
    const st = placementStats(p);
    const k = per[p.klant] = per[p.klant] || { klant: p.klant, n: 0, netto: 0, gestopt: 0 };
    k.n++; k.netto += Number(p.fee_excl || 0) - st.vervallen;
    if (p.gestopt_op) k.gestopt++;
  }
  const rows = Object.values(per).map(k => {
    const tr = tariefVoor(k.klant, '');
    return { ...k, pct: tr ? tr.pct : null, jaarNetto: k.netto * 12 / verstrekenMnd };
  });
  const met = rows.filter(r => r.pct && r.netto > 0);
  const totNetto = met.reduce((s, r) => s + r.netto, 0) || 1;
  const bench = met.length ? met.reduce((s, r) => s + r.pct * r.netto, 0) / totNetto : null;
  rows.forEach(r => {
    r.bench = bench;
    // wat levert +verschil-naar-benchmark op, op jaarbasis bij gelijk volume?
    r.potentie = (r.pct && bench && r.pct < bench - 0.002) ? r.jaarNetto * (bench - r.pct) / r.pct : 0;
  });
  return { rows: rows.sort((a, b) => b.potentie - a.potentie || b.netto - a.netto), bench };
}

function pipelineForecast() {
  // Fase-kansen zijn vast (door Tjeerd ingesteld); alleen de UITVAL (blijfkans) leert de app zelf.
  const kansen = Object.assign({}, FASE_KANSEN_DEFAULT, S('fase_kansen', {}) || {});
  const fee = kpis().gemFee || 8500;
  const behoud = 1 - (kpis().stopPct || 0);                   // blijfkans: geleerd uit je eigen stops (uitval)
  const t = todayISO();
  const linked = new Set(D.placements.map(p => p.pipeline_candidate_id).filter(Boolean));
  const rows = D.candidates.filter(c =>
    kansen[c.fase] > 0 && !isFlexType(c.type) &&
    !(c.vervangt || '') && !linked.has(c.id))
    .map(c => {
      const kans = kansen[c.fase];
      // plaatsing verwacht op bord-startdatum, anders fase-afhankelijke doorlooptijd
      const plaatsing = (c.start && c.start > t) ? c.start : addDays(t, (FASE_LEAD_WKN[c.fase] || 6) * 7);
      const cash = monthKey(addDays(plaatsing, 30));   // factuur + betaaltermijn ≈ 1 mnd later
      // fee: échte berekening (maandloon × jaarfactor × klanttarief) waar het bord een loon heeft, anders gemiddelde
      const fb = c.maandloon ? feeBerekening(c) : null;
      const cFee = fb ? fb.fee : fee;
      // bruto = kans × fee (kans dat 'ie een plaatsing wordt); netto = óók na verwachte uitval
      return { c, kans, fee: cFee, feeEcht: !!fb, gewogen: cFee * kans, netto: cFee * kans * behoud, plaatsing, cashMaand: cash };
    })
    .sort((a, b) => b.kans - a.kans);
  const totaal = rows.reduce((s, r) => s + r.gewogen, 0);
  const totaalNetto = rows.reduce((s, r) => s + r.netto, 0);
  const perMaand = {}, perMaandAantal = {}, perMaandPlaatsMaand = {};
  for (const r of rows) {
    perMaand[r.cashMaand] = (perMaand[r.cashMaand] || 0) + r.gewogen;
    perMaandAantal[r.cashMaand] = (perMaandAantal[r.cashMaand] || 0) + r.kans;
    const pm = monthKey(r.plaatsing);                        // maand van de plaatsing zelf (niet de cash)
    perMaandPlaatsMaand[pm] = (perMaandPlaatsMaand[pm] || 0) + r.kans;
  }
  // verwacht aantal plaatsingen = som van de kansen (gewogen koppen)
  const verwachtAantal = rows.reduce((s, r) => s + r.kans, 0);
  return { rows, totaal, totaalNetto, behoud, perMaand, perMaandAantal, perMaandPlaatsMaand, verwachtAantal };
}

// ── plaatsingen exact zoals het bord ze telt ───────────────────
// Bron van waarheid = het bord: kandidaten met geplaatstOp in de maand
// (W&S + Flex), minus wie deze maand gestopt is (geen garantievervangers).
// Zo correspondeert de finance-telling 1-op-1 met de teller op het bord.
function boardPlaatsingen(mk) {                             // mk = 'YYYY-MM'
  const grossM = D.candidates.filter(c => (c.geplaatst_op || '').slice(0, 7) === mk);
  const ws = grossM.filter(c => c.type === 'W&S').length;
  const flex = grossM.filter(c => isFlexType(c.type)).length;
  const onb = grossM.length - ws - flex;
  const stopM = D.candidates.filter(c => c.fase === 'Gestopt' &&
    (c.gestopt_op || '').slice(0, 7) === mk && c.geplaatst_op && !(c.vervangt || '')).length;
  return { gross: grossM.length, ws, flex, onb, stopM, netto: grossM.length - stopM };
}

// het maandtarget zoals op het bord: specifieke maand, anders '__default', anders 8
function boardTarget(mk) {
  const specifiek = D.targets.find(x => x.maand === mk);
  const standaard = D.targets.find(x => x.maand === '__default');
  return specifiek ? Number(specifiek.aantal) : standaard ? Number(standaard.aantal) : 8;
}

// ── targets van het pijplijnbord ───────────────────────────────
function targetInfo() {
  const mk = todayISO().slice(0, 7);                       // '2026-07'
  const bp = boardPlaatsingen(mk);
  const aantalTarget = boardTarget(mk);
  const gemFee = kpis().gemFee || 8500;
  const omzetTarget = S('target_omzet_pm') || (aantalTarget ? aantalTarget * gemFee : null);
  return { aantalTarget, plaatsingen: bp.netto, board: bp, gemFee, omzetTarget, maand: mk };
}

// ── target per recruiter (deze maand) ──────────────────────────
function recruiterVoortgang() {
  const mk = todayISO().slice(0, 7);
  const tgt = targetInfo().aantalTarget;
  const per = {}, actief = new Set();
  for (const c of D.candidates) {
    const rec = ((c.rec || '').trim()) || 'Samen';
    if (!['Afgevallen', 'Gestopt'].includes(c.fase)) actief.add(rec);
    if ((c.geplaatst_op || '').slice(0, 7) === mk && !(c.vervangt || '')) per[rec] = (per[rec] || 0) + 1;
  }
  const recs = [...new Set([...Object.keys(per), ...actief])].filter(r => r && r !== 'Samen');
  if (!recs.length) recs.push(...Object.keys(per));
  const overrides = S('recruiter_targets', {}) || {};
  const nRec = recs.length || 1;
  const rows = recs.map(rec => {
    const gedaan = per[rec] || 0;
    const doel = overrides[rec] != null ? Number(overrides[rec]) : (tgt ? Math.round(tgt / nRec) : 0);
    return { rec, gedaan, doel, gelijkVerdeeld: overrides[rec] == null };
  }).sort((a, b) => b.gedaan - a.gedaan || a.rec.localeCompare(b.rec));
  return { rows, tgt, maand: mk, somDoel: rows.reduce((s, r) => s + r.doel, 0) };
}

// ── maand-terugblik: voorspeld (plan) vs. echt behaald ─────────
function maandTerugblik(n = 6) {
  const gemFee = kpis().gemFee || 8500;
  const snaps = D.settings.forecast_snapshots || {};
  const m0 = monthKey(todayISO());
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const mk = addMonths(m0, -i).slice(0, 7);
    const trow = D.targets.find(x => x.maand === mk);
    const target = trow ? Number(trow.aantal) : null;
    const behaald = D.candidates.filter(c => (c.geplaatst_op || '').slice(0, 7) === mk && !(c.vervangt || '')).length;
    const gefact = D.installments.filter(x => (x.factuurdatum || '').slice(0, 7) === mk && (x.status === 'gefactureerd' || x.status === 'betaald')).reduce((s, x) => s + +x.bedrag_excl, 0)
      + D.flex.filter(w => (w.week || '').slice(0, 7) === mk).reduce((s, w) => s + +w.bedrag, 0);
    const snap = snaps[mk];
    const voorspeldPl = snap && snap.vpl != null ? snap.vpl : target;      // pijplijn-forecast indien vastgelegd, anders plan
    const voorspeldOmzet = snap && snap.vp != null ? snap.vp : (target != null ? target * gemFee : null);
    rows.push({ mk, target, behaald, gefact, voorspeldPl, voorspeldOmzet, uitSnapshot: !!snap });
  }
  return rows;
}

// legt aan het begin van de maand vast wat we verwachtten (voor latere terugblik)
async function ensureForecastSnapshot() {
  try {
    if (!D.settings) return;
    const mk = todayISO().slice(0, 7);
    const snaps = { ...(D.settings.forecast_snapshots || {}) };
    if (snaps[mk]) return;
    const gemFee = kpis().gemFee || 8500;
    const ti = targetInfo();
    snaps[mk] = { tgt: ti.aantalTarget, vpl: +pipelineForecast().verwachtAantal.toFixed(1), vp: Math.round((ti.aantalTarget || 0) * gemFee) };
    await saveSetting('forecast_snapshots', snaps);
  } catch (e) { /* auth/offline: volgende keer */ }
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

// factuur verdween uit Yuki's open posten → automatisch op "betaald"
// Veiligheid: alleen als Yuki daadwerkelijk open posten teruggaf (anders is "leeg" dubbelzinnig)
// en de termijn minstens 5 dagen geleden is gefactureerd.
async function yukiBetaaldSync() {
  const debOpen = D.yukiOpen.filter(r => r.soort === 'debiteur');
  if (!S('yuki_synced_at') || !debOpen.length) return 0;
  const btw = 1 + Number(S('btw_pct', .21));
  let n = 0;
  for (const p of D.placements) {
    if (p.concept) continue;
    const voornaam = (p.kandidaat || '').toLowerCase().split(' ')[0];
    const achternaam = (p.kandidaat || '').toLowerCase().split(' ').slice(-1)[0];
    for (const i of instOf(p.id)) {
      if (i.status !== 'gefactureerd' || !i.factuurdatum) continue;
      if (daysBetween(i.factuurdatum, todayISO()) < 5) continue;   // te vers
      const inclBtw = +i.bedrag_excl * btw;
      const nogOpen = debOpen.some(r => {
        const oms = (r.omschrijving || '').toLowerCase();
        const naamHit = (voornaam && oms.includes(voornaam)) || (achternaam.length > 3 && oms.includes(achternaam));
        const bedragHit = Math.abs(+r.open_bedrag - inclBtw) < 2 || Math.abs(+r.origineel_bedrag - inclBtw) < 2;
        const tm = oms.match(/(\d+)\s*(?:\/|van)\s*(\d+)/);
        if (naamHit && tm) return Number(tm[1]) === i.termijn_nr;   // exacte termijn nog open
        return naamHit && bedragHit;
      });
      if (!nogOpen) {
        await dbWrite('fin_installments', t => t.update({ status: 'betaald', betaaldatum: S('yuki_synced_at', todayISO()).slice(0, 10) }).eq('id', i.id));
        n++;
      }
    }
  }
  if (n) await reload('fin_installments', 'installments', 'geplande_datum');
  return n;
}

// Yuki toont een verstuurde factuur → zet de bijbehorende termijn automatisch op "gefactureerd"
// Strikte match (voornaam in omschrijving + bedrag incl btw ±€2) zodat er nooit verkeerd wordt gemarkeerd.
async function yukiGefactureerdSync() {
  const debOpen = D.yukiOpen.filter(r => r.soort === 'debiteur' && +r.open_bedrag > 0);
  if (!debOpen.length) return 0;
  const btw = 1 + Number(S('btw_pct', .21));
  const gebruikt = new Set();          // elke Yuki-factuur matcht maar één termijn
  let n = 0;
  for (const p of D.placements) {
    if (p.concept) continue;
    const voornaam = (p.kandidaat || '').toLowerCase().split(' ')[0];
    const achternaam = (p.kandidaat || '').toLowerCase().split(' ').slice(-1)[0];
    for (const i of instOf(p.id)) {
      if (i.status !== 'te_factureren') continue;
      const inclBtw = +i.bedrag_excl * btw;
      const match = debOpen.find(r => {
        if (gebruikt.has(r.id)) return false;
        const oms = (r.omschrijving || '').toLowerCase();
        const naamHit = (voornaam && oms.includes(voornaam)) || (achternaam.length > 3 && oms.includes(achternaam));
        if (!naamHit) return false;
        const bedragHit = Math.abs(+r.origineel_bedrag - inclBtw) < 2 || Math.abs(+r.open_bedrag - inclBtw) < 2;
        // termijnnummer uit omschrijving ("2/7" of "2 van 7"): moet exact kloppen als het er staat
        const tm = oms.match(/(\d+)\s*(?:\/|van)\s*(\d+)/);
        if (tm) return Number(tm[1]) === i.termijn_nr;
        return bedragHit;         // geen termijnnummer → val terug op bedrag (uniek genoeg bij 1 termijn)
      });
      if (match) {
        gebruikt.add(match.id);
        await dbWrite('fin_installments', t => t.update({ status: 'gefactureerd', factuurdatum: match.datum || todayISO() }).eq('id', i.id));
        n++;
      }
    }
  }
  if (n) await reload('fin_installments', 'installments', 'geplande_datum');
  return n;
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
  const k0 = kpis();
  const gemFee = k0.gemFee || Number(S('scenario_gem_fee', 8500));
  const behoudDefault = 1 - (k0.stopPct || 0);            // historische blijfkans
  const sc = Object.assign({
    bron: 'pijplijn',                                 // 'pijplijn' = gewogen forecast bord; 'target' = X plaatsingen/mnd; 'vast' = vlak €-bedrag
    plaatsingenPm: boardTarget(todayISO().slice(0, 7)), // target-tempo (koppen per maand)
    omzetPm: Number(S('scenario_omzet_pm', 25000)),
    blijfkans: behoudDefault,                          // kans dat een plaatsing blijft (geen stop binnen garantie)
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
  const blijf = Math.max(0, Math.min(1, sc.blijfkans));
  const targetPm = sc.plaatsingenPm * gemFee * blijf;      // target-tempo in euro's, na verwachte uitval
  if (sc.bron === 'pijplijn' && D.candidates.length) {
    // gewogen forecast uit het bord: kans × fee per kandidaat, in de verwachte cash-maand.
    // Weeg óók de blijfkans mee (kans dat een geplaatste toch weer stopt binnen garantie).
    // Ná de bord-horizon (kandidaten kijken ~2 mnd vooruit) valt terug op het target-tempo.
    const pf = pipelineForecast();
    const horizon = Object.keys(pf.perMaand).sort().pop() || m0;
    keys.forEach((k, i) => {
      if (pf.perMaand[k]) put(k, 'inScenario', pf.perMaand[k] * blijf * (1 - sc.omzetDipPct) * (1 + btwPct));
      else if (k > horizon && i >= 1) put(k, 'inScenario', targetPm * (1 - sc.omzetDipPct) * (1 + btwPct));
    });
  } else if (sc.bron === 'target') {
    // "als we elke maand X plaatsingen halen": vlak tempo vanaf volgende maand
    keys.forEach((k, i) => { if (i >= 1) put(k, 'inScenario', targetPm * (1 - sc.omzetDipPct) * (1 + btwPct)); });
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
  const eind = rows[rows.length - 1].saldo;
  return { rows, start, eind, laagste, negatief, runway, scenario: sc, gemFee, blijfkans: blijf, behoudDefault };
}
