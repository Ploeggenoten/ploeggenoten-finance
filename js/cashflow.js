// ═══ VIEW: Cashflow — banksaldo, projectie, scenario's, CSV-import ═══

let scenarioState = null;

function openSaldoModal() {
  openModal(`
    <div class="modal-head"><h2>Banksaldo bijwerken</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div><label>Datum</label><input id="s_datum" type="date" value="${todayISO()}"></div>
      <div class="span2"><label>Saldo (€)</label><input id="s_saldo" type="number" step="0.01" placeholder="bijv. 42350"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="s_save">Opslaan</button></div>`, { narrow: true });
  $('#s_save').onclick = async () => {
    const saldo = Number($('#s_saldo').value);
    if (isNaN(saldo)) return toast('Vul een bedrag in', true);
    await dbWrite('fin_bank_saldo', t => t.upsert({ datum: $('#s_datum').value, saldo }, { onConflict: 'datum' }));
    await reload('fin_bank_saldo', 'saldi', 'datum', false);
    closeModal(); toast('Saldo bijgewerkt ✓'); rerender();
  };
}

// ── bank-CSV import (ING / Rabobank / generiek) ────────────────
function parseBankCsv(text) {
  const delim = (text.match(/;/g) || []).length > (text.match(/,/g) || []).length ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const parse = l => {
    const out = []; let cur = '', inQ = false;
    for (const ch of l) {
      if (ch === '"') inQ = !inQ;
      else if (ch === delim && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const head = parse(lines[0]).map(h => h.toLowerCase());
  const idx = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const iDatum = idx('datum', 'date'), iBedrag = idx('bedrag', 'amount', 'transactiebedrag'),
        iOms = idx('omschrijving', 'mededeling', 'description', 'naam / omschrijving'),
        iNaam = idx('naam', 'tegenpartij', 'counterparty'), iAfBij = idx('af bij', 'debit/credit');
  if (iDatum < 0 || iBedrag < 0) return { error: 'Kolommen "datum" en "bedrag" niet gevonden in de CSV.' };
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = parse(line);
    let rawD = (c[iDatum] || '').replaceAll('"', '');
    let datum = null;
    if (/^\d{8}$/.test(rawD)) datum = `${rawD.slice(0,4)}-${rawD.slice(4,6)}-${rawD.slice(6)}`;          // ING: 20260715
    else if (/^\d{4}-\d{2}-\d{2}/.test(rawD)) datum = rawD.slice(0, 10);                                  // ISO
    else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(rawD)) {                                                  // 15-07-2026
      const [d, m, y] = rawD.split(/[-/]/); datum = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if (!datum) continue;
    let bedrag = Number((c[iBedrag] || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.\-+]/g, ''));
    if (isNaN(bedrag)) continue;
    if (iAfBij >= 0 && /af/i.test(c[iAfBij])) bedrag = -Math.abs(bedrag);
    const omschrijving = (c[iOms] || '').slice(0, 200);
    const tegenpartij = iNaam >= 0 ? (c[iNaam] || '').slice(0, 100) : '';
    rows.push({ datum, bedrag, omschrijving, tegenpartij, hash: `${datum}|${bedrag}|${omschrijving.slice(0, 40)}` });
  }
  return { rows };
}

function openCsvImport() {
  openModal(`
    <div class="modal-head"><h2>Bank-CSV importeren</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <p class="muted mb">Exporteer transacties uit je bank als CSV (ING, Rabobank of generiek) en kies het bestand. Dubbele regels worden automatisch overgeslagen.</p>
    <input type="file" id="csvFile" accept=".csv,text/csv">
    <div id="csvPreview" class="mt"></div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Sluiten</button>
    <button class="btn primary" id="csvGo" disabled>Importeren</button></div>`);
  let parsed = null;
  $('#csvFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    parsed = parseBankCsv(await f.text());
    if (parsed.error) { $('#csvPreview').innerHTML = `<div class="tag red">${esc(parsed.error)}</div>`; return; }
    const inTot = parsed.rows.filter(r => r.bedrag > 0).reduce((s, r) => s + r.bedrag, 0);
    const uitTot = parsed.rows.filter(r => r.bedrag < 0).reduce((s, r) => s + r.bedrag, 0);
    $('#csvPreview').innerHTML = `<p><b>${parsed.rows.length}</b> transacties gevonden · in ${eur(inTot)} · uit ${eur(uitTot)}</p>`;
    $('#csvGo').disabled = !parsed.rows.length;
  };
  $('#csvGo').onclick = async () => {
    const { error, count } = await sb.from('fin_bank_tx')
      .upsert(parsed.rows, { onConflict: 'hash', ignoreDuplicates: true, count: 'exact' });
    if (error) return toast('Import mislukt: ' + error.message, true);
    await reload('fin_bank_tx', 'tx', 'datum', false);
    closeModal(); toast(`Geïmporteerd ✓ (${count ?? parsed.rows.length} nieuw)`); rerender();
  };
}

// dynamische delen (KPI's, grafiek, maandtabel) — apart zodat de
// scenario-schuiven alleen dít herbouwen en niet zichzelf (anders breekt het slepen)
function cfDynHtml(sc) {
  const proj = projectie(12, sc);
  const saldo = D.saldi[0];
  const pot = potjes();
  const ti = targetInfo();
  const bp = ti.board;
  const tgt = ti.aantalTarget;
  const gemFee = proj.gemFee;
  const behoud = proj.blijfkans;
  const pf = pipelineForecast();
  const m0 = monthKey(todayISO());

  // ── drie vooruitblik-scenario's (zelfde blijfkans/aflossing, ander tempo) ──
  const base = { aflossenAan: sc.aflossenAan, blijfkans: sc.blijfkans, flexFactor: sc.flexFactor };
  const marge = sc.tegenvallerMarge ?? 2;
  const down = Math.max(0, tgt - marge);
  const sTarget   = projectie(12, { ...base, bron: 'target',   plaatsingenPm: tgt });
  const sVerwacht = projectie(12, { ...base, bron: 'pijplijn', plaatsingenPm: tgt });
  const sDown     = projectie(12, { ...base, bron: 'target',   plaatsingenPm: down });
  const omzetPm = n => n * gemFee * behoud;

  const scen = (icon, titel, sub, p, accent) => `
    <div class="kpi" style="border-top:3px solid ${accent}">
      <div class="lbl">${icon} ${titel}</div>
      <div class="val" style="color:${p.eind < 0 ? 'var(--red)' : 'inherit'}">${eur(p.eind)}</div>
      <div class="sub">${sub}<br>laagste ${eur(p.laagste.saldo)} · ${esc(p.laagste.label || '')}</div>
    </div>`;

  const verschil = sTarget.eind - sDown.eind;
  const headline = `
   <div class="grid cols-3 mb">
     ${scen('🎯', 'Op target', `${tgt}/mnd → ${eur(omzetPm(tgt))} omzet p/m`, sTarget, 'var(--green)')}
     ${scen('📊', 'Verwacht · pijplijn', `~${pf.verwachtAantal.toFixed(1)} plaatsingen gewogen in beeld`, sVerwacht, 'var(--accent)')}
     ${scen('⚠️', 'Tegenvaller', `${down}/mnd → ${eur(omzetPm(down))} omzet p/m`, sDown, 'var(--amber)')}
   </div>
   <div class="panel mb" style="border-left:4px solid var(--amber)">
     <b>Wat sturen op plaatsingen oplevert.</b> Elke plaatsing méér per maand ≈ <b>${eur(gemFee)}</b> omzet
     (${eur(omzetPm(1))} na blijfkans), die ~6–8 weken later in je cash landt.
     Het verschil tussen <b>${tgt}/mnd</b> en <b>${down}/mnd</b> is over 12 mnd
     <b style="color:${verschil >= 0 ? 'var(--green)' : 'var(--red)'}">${eur(verschil)}</b> eindsaldo.
   </div>`;

  // ── deze maand: bord-correspondentie + concrete impact ──
  const left = Math.max(0, tgt - bp.netto);
  const cashMaand2 = fmtMaand(addMonths(m0, 2));
  const kpiRow = `
   <div class="grid cols-4 mb">
     <div class="kpi ${bp.netto >= tgt ? 'good' : ''}"><div class="lbl">Deze maand · target bord</div>
       <div class="val">${bp.netto} / ${tgt}</div>
       <div class="sub">${bp.ws} W&amp;S · ${bp.flex} flex${bp.onb ? ` · ${bp.onb} ?` : ''}${bp.stopM ? ` · −${bp.stopM} gestopt` : ''}</div></div>
     <div class="kpi"><div class="lbl">Startsaldo${saldo ? ' · ' + fmtD(saldo.datum) : ''}</div><div class="val">${saldo ? eur(saldo.saldo) : '—'}</div>
       <div class="sub">vrij na potjes ${saldo ? eur(saldo.saldo - pot.btwPot - pot.vpbPot) : '—'}</div></div>
     <div class="kpi ${proj.laagste.saldo < 0 ? 'bad' : proj.laagste.saldo < 10000 ? 'warn' : 'good'}">
       <div class="lbl">Laagste punt (dit scenario)</div><div class="val">${eur(proj.laagste.saldo)}</div><div class="sub">${esc(proj.laagste.label || '')}</div></div>
     <div class="kpi"><div class="lbl">Runway zónder nieuwe W&S</div><div class="val">${proj.runway >= 12 ? '12+' : proj.runway} mnd</div><div class="sub">factuurschema + flex − kosten</div></div>
   </div>
   <div class="panel mb">${left > 0
      ? `<div class="pot"><span>📍 Nog <b>${left}</b> plaatsing${left === 1 ? '' : 'en'} te gaan deze maand. Haal je die niet, dan mis je ~<b>${eur(left * gemFee)}</b> omzet — zichtbaar in je cash rond <b>${cashMaand2}</b>.</span></div>`
      : `<div class="pot"><span>✓ Target deze maand gehaald: <b>${bp.netto}/${tgt}</b> netto plaatsingen (gelijk aan het bord).</span></div>`}
      <div class="pot"><span>🔄 Blijfkans <b>${Math.round(behoud * 100)}%</b> (historisch: ${D.placements.filter(p => p.gestopt_op).length} van ${D.placements.length} plaatsingen gestopt). Van elke <b>${tgt}</b> plaatsingen reken ik op ~<b>${(tgt * behoud).toFixed(1)}</b> die blijven.</span></div></div>`;

  const chart = lineChart(proj.rows.map(r => r.label), [
    { label: 'Banksaldo (huidig scenario)', color: 'var(--accent)', values: proj.rows.map(r => r.saldo) },
    { label: 'Op target', color: 'var(--green)', values: sTarget.rows.map(r => r.saldo) },
    { label: 'Tegenvaller', color: 'var(--amber)', values: sDown.rows.map(r => r.saldo) },
  ], { height: 260 });

  return headline + kpiRow + `<div class="panel mb"><h2>📈 Saldo-projectie — huidig scenario vs. target vs. tegenvaller</h2>${chart}</div>`;
}

function cfTabelHtml(sc) {
  const proj = projectie(12, sc);
  const rows = proj.rows.map(r => `<tr>
    <td>${esc(r.label)}</td>
    <td class="num">${eur(r.inFact)}</td><td class="num" style="color:var(--purple)">${r.inFlex ? eur(r.inFlex) : '—'}</td><td class="num muted">${eur(r.inScenario)}</td>
    <td class="num">${eur(r.uitKosten)}</td><td class="num">${r.uitBtw ? eur(r.uitBtw) : '—'}</td><td class="num">${r.uitLening ? eur(r.uitLening) : '—'}</td>
    <td class="num"><b style="color:${r.saldo < 0 ? 'var(--red)' : r.saldo < 10000 ? 'var(--amber)' : 'var(--green)'}">${eur(r.saldo)}</b></td></tr>`).join('');
  return `<h2>Maandtabel</h2><table>
      <tr><th>Maand</th><th class="num">In: facturen</th><th class="num">In: flex</th><th class="num">In: scenario</th><th class="num">Uit: kosten</th><th class="num">Btw-afdracht</th><th class="num">Aflossing</th><th class="num">Saldo</th></tr>
      ${rows}</table>
      <p class="muted mt">Facturen incl. btw, op verwachte betaaldatum (geplande factuurdatum + betaaltermijn). Te late betalingen: aanname binnen 2 weken. Btw-afdracht per kwartaal, minus geschatte voorbelasting (${eur(S('voorbelasting_pm', 0))}/mnd — instelbaar).</p>`;
}

// ── hoofdview ──────────────────────────────────────────────────
function renderCashflow(root) {
  const tgt0 = targetInfo().aantalTarget;
  const behoud0 = 1 - (kpis().stopPct || 0);
  const sc = scenarioState || (scenarioState = {
    bron: 'pijplijn', plaatsingenPm: tgt0, blijfkans: behoud0, tegenvallerMarge: 2,
    omzetPm: Number(S('scenario_omzet_pm', 25000)), omzetDipPct: 0, extraHirePm: 0, extraHireVanaf: 2, aflossenAan: true, flexFactor: 1,
  });
  if (sc.plaatsingenPm == null) sc.plaatsingenPm = tgt0;
  if (sc.blijfkans == null) sc.blijfkans = behoud0;
  if (sc.tegenvallerMarge == null) sc.tegenvallerMarge = 2;
  const pf = pipelineForecast();
  const proj = projectie(12, sc);
  const lening = D.loans[0];
  const afgelost = D.loanPayments.filter(lp => !lp.gepland).reduce((s, l) => s + +l.bedrag, 0);
  const maandOpts = proj.rows.map((r, i) => `<option value="${i}" ${i === sc.extraHireVanaf ? 'selected' : ''}>${esc(r.label)}</option>`).join('');

  // pijplijn per plaatsmaand → aantallen (verwacht = som van kansen)
  const plMaanden = Object.keys(pf.perMaandPlaatsMaand).sort();
  const plChips = plMaanden.map(mk => `<span class="tag gray">${fmtMaand(mk)}: <b>${pf.perMaandPlaatsMaand[mk].toFixed(1)}</b></span>`).join(' ');
  const behoefte = sc.plaatsingenPm;   // per maand nodig voor target

  root.innerHTML = `
    <div class="spread mb"><h1>Cashflow & toekomst</h1>
      <div class="row">
        <button class="btn" id="cfCsv">📄 Bank-CSV importeren</button>
        <button class="btn primary" id="cfSaldo">🏦 Saldo bijwerken</button>
      </div></div>

    <div id="cfDyn">${cfDynHtml(sc)}</div>

    <div class="grid cols-2 mb">
      <div class="panel"><h2>🎛 Wat-als knoppen <span class="muted">— denk in plaatsingen</span></h2>
        <div class="slider-row"><span>Nieuwe omzet baseer op</span>
          <select id="sc_bron"><option value="pijplijn" ${sc.bron === 'pijplijn' ? 'selected' : ''}>Gewogen pijplijn → daarna target-tempo</option>
          <option value="target" ${sc.bron === 'target' ? 'selected' : ''}>Vast tempo: X plaatsingen/mnd</option>
          <option value="vast" ${sc.bron === 'vast' ? 'selected' : ''}>Vast €-bedrag p/m</option></select><span></span></div>
        <div class="slider-row"><span>Tempo (plaatsingen p/m)</span>
          <input type="range" id="sc_pl" min="0" max="15" step="1" value="${sc.plaatsingenPm}"><b id="scv_pl">${sc.plaatsingenPm} → ${eur(sc.plaatsingenPm * proj.gemFee)}</b></div>
        <div class="slider-row"><span>Blijfkans (blijven na plaatsing)</span>
          <input type="range" id="sc_blijf" min="0" max="100" step="5" value="${Math.round(sc.blijfkans * 100)}"><b id="scv_blijf">${Math.round(sc.blijfkans * 100)}%</b></div>
        <div class="slider-row"><span>Tegenvaller: onder target</span>
          <input type="range" id="sc_marge" min="1" max="6" step="1" value="${sc.tegenvallerMarge}"><b id="scv_marge">−${sc.tegenvallerMarge}/mnd → ${Math.max(0, tgt0 - sc.tegenvallerMarge)}</b></div>
        <div class="slider-row"><span>Vast €-bedrag p/m <span class="muted">(alleen bij "vast")</span></span>
          <input type="range" id="sc_omzet" min="0" max="60000" step="1000" value="${sc.omzetPm}"><b id="scv_omzet">${eur(sc.omzetPm)}</b></div>
        <div class="slider-row"><span>Omzet valt extra terug met</span>
          <input type="range" id="sc_dip" min="0" max="100" step="5" value="${sc.omzetDipPct * 100}"><b id="scv_dip">${Math.round(sc.omzetDipPct * 100)}%</b></div>
        <div class="slider-row"><span>Flex-marge (t.o.v. run-rate)</span>
          <input type="range" id="sc_flex" min="0" max="300" step="10" value="${sc.flexFactor * 100}"><b id="scv_flex">${Math.round(sc.flexFactor * 100)}%</b></div>
        <div class="slider-row"><span>Extra hire (kosten p/m)</span>
          <input type="range" id="sc_hire" min="0" max="8000" step="250" value="${sc.extraHirePm}"><b id="scv_hire">${eur(sc.extraHirePm)}</b></div>
        <div class="slider-row"><span>Hire start in</span>
          <select id="sc_hireVanaf">${maandOpts}</select><span></span></div>
        <div class="slider-row"><span>Geplande aflossingen meenemen</span>
          <input type="checkbox" id="sc_afl" ${sc.aflossenAan ? 'checked' : ''} style="width:auto;justify-self:start"><span></span></div>
        <p class="muted">Wat-als (tijdelijk). Tempo × gem. fee (${eur(proj.gemFee)}) × blijfkans = nieuwe omzet per maand. Fase-kansen stel je in bij Instellingen.</p>
      </div>
      <div class="panel"><h2>🏛 Lening ${lening ? '· ' + esc(lening.naam) : ''}</h2>
        ${lening ? `
        <div class="pot"><span>Hoofdsom</span><b>${eur(lening.hoofdsom)}</b></div>
        <div class="pot"><span>Rente</span><b>${lening.rente_pct}%</b></div>
        <div class="pot"><span>Afgelost</span><b>${eur(afgelost)}</b></div>
        <div class="pot"><span>Nog open</span><b>${eur(lening.hoofdsom - afgelost)}</b></div>
        <div class="pot"><span>Deadline</span><b>${fmtD(lening.deadline)}</b></div>
        ${D.loanPayments.filter(l => l.gepland).map(l => `<div class="pot"><span>Gepland: ${fmtD(l.datum)}</span><b>${eur(l.bedrag)} <button class="btn small" data-lp="${l.id}">Betaald ✓</button></b></div>`).join('')}
        ` : '<div class="empty">Geen lening geregistreerd.</div>'}
      </div>
    </div>

    <div class="panel mb"><div class="spread mb"><h2>🔮 Wat zit er in de pijplijn <span class="muted">— live van het bord</span></h2>
      <span class="muted">gewogen <b>${pf.verwachtAantal.toFixed(1)}</b> plaatsingen · <b>${eur(pf.totaal)}</b> excl. btw</span></div>
      ${pf.rows.length ? `
      <div class="mb">Verwachte plaatsingen per maand (gewogen koppen): ${plChips || '—'}
        <p class="muted mt">Om <b>${behoefte}</b> plaatsing${behoefte === 1 ? '' : 'en'} per maand te halen, moet de pijplijn dat tempo blijven voeden. Nu staat er gewogen <b>${pf.verwachtAantal.toFixed(1)}</b> op de rol voor de komende ~2 maanden — ${pf.verwachtAantal >= behoefte ? '<b style="color:var(--green)">genoeg om het tempo vast te houden</b>' : `<b style="color:var(--amber)">${(behoefte - pf.verwachtAantal).toFixed(1)} te weinig</b> — er moet bovenaan de funnel bij`}.</p></div>
      <div class="table-wrap"><table>
      <tr><th>Kandidaat</th><th>Klant</th><th>Fase</th><th class="num">Kans</th><th class="num">Fee (gem.)</th><th class="num">Gewogen</th><th>Cash verwacht</th></tr>
      ${pf.rows.map(r => `<tr><td>${esc(r.c.naam)}</td><td>${esc(r.c.klant || '')}</td><td>${tag(r.c.fase, r.kans >= .5 ? 'green' : r.kans >= .25 ? 'amber' : 'gray')}</td>
        <td class="num">${Math.round(r.kans * 100)}%</td><td class="num">${eur(r.fee)}</td><td class="num"><b>${eur(r.gewogen)}</b></td><td>${fmtMaand(r.cashMaand)}</td></tr>`).join('')}
      </table></div>
      <p class="muted mt">Kans per fase (instelbaar): voorselectie 10% · gesprek 20% · meeloopdag 50% · contract ondertekenen 80%. Gewogen = kans × gem. fee. Na de bord-horizon rekent de projectie met het target-tempo.</p>`
      : '<div class="empty">Geen actieve kandidaten in de W&S-funnel op het bord.</div>'}</div>

    <div class="panel table-wrap" id="cfTabel">${cfTabelHtml(sc)}</div>`;

  // schuiven: alleen de dynamische delen verversen, niet de schuiven zelf
  const upd = () => {
    $('#cfDyn').innerHTML = cfDynHtml(sc);
    $('#cfTabel').innerHTML = cfTabelHtml(sc);
    $('#scv_pl').textContent = `${sc.plaatsingenPm} → ${eur(sc.plaatsingenPm * proj.gemFee)}`;
    $('#scv_blijf').textContent = Math.round(sc.blijfkans * 100) + '%';
    $('#scv_marge').textContent = `−${sc.tegenvallerMarge}/mnd → ${Math.max(0, tgt0 - sc.tegenvallerMarge)}`;
    $('#scv_omzet').textContent = eur(sc.omzetPm);
    $('#scv_dip').textContent = Math.round(sc.omzetDipPct * 100) + '%';
    $('#scv_flex').textContent = Math.round(sc.flexFactor * 100) + '%';
    $('#scv_hire').textContent = eur(sc.extraHirePm);
  };
  $('#sc_bron').onchange = e => { sc.bron = e.target.value; upd(); };
  $('#sc_pl').oninput = e => { sc.plaatsingenPm = +e.target.value; upd(); };
  $('#sc_blijf').oninput = e => { sc.blijfkans = +e.target.value / 100; upd(); };
  $('#sc_marge').oninput = e => { sc.tegenvallerMarge = +e.target.value; upd(); };
  $('#sc_omzet').oninput = e => { sc.omzetPm = +e.target.value; upd(); };
  $('#sc_dip').oninput = e => { sc.omzetDipPct = +e.target.value / 100; upd(); };
  $('#sc_flex').oninput = e => { sc.flexFactor = +e.target.value / 100; upd(); };
  $('#sc_hire').oninput = e => { sc.extraHirePm = +e.target.value; upd(); };
  $('#sc_hireVanaf').onchange = e => { sc.extraHireVanaf = +e.target.value; upd(); };
  $('#sc_afl').onchange = e => { sc.aflossenAan = e.target.checked; upd(); };
  $('#cfSaldo').onclick = openSaldoModal;
  $('#cfCsv').onclick = openCsvImport;
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-lp]');
    if (!b) return;
    await dbWrite('fin_loan_payments', t => t.update({ gepland: false, datum: todayISO() }).eq('id', +b.dataset.lp));
    await reload('fin_loan_payments', 'loanPayments', 'datum');
    toast('Aflossing geregistreerd ✓'); rerender();
  });
}
