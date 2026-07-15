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

// ── hoofdview ──────────────────────────────────────────────────
function renderCashflow(root) {
  const sc = scenarioState || (scenarioState = {
    omzetPm: Number(S('scenario_omzet_pm', 25000)), omzetDipPct: 0, extraHirePm: 0, extraHireVanaf: 2, aflossenAan: true,
  });
  const proj = projectie(12, sc);
  const saldo = D.saldi[0];
  const pot = potjes();
  const lening = D.loans[0];
  const afgelost = D.loanPayments.filter(lp => !lp.gepland).reduce((s, l) => s + +l.bedrag, 0);

  const chart = lineChart(proj.rows.map(r => r.label), [
    { label: 'Banksaldo (scenario)', color: 'var(--accent)', values: proj.rows.map(r => r.saldo) },
    { label: 'Vrij besteedbaar (na potjes)', color: 'var(--green)', values: proj.rows.map(r => r.saldo - pot.btwPot - pot.vpbPot) },
  ], { height: 260 });

  const tabel = proj.rows.map(r => `<tr>
    <td>${esc(r.label)}</td>
    <td class="num">${eur(r.inFact)}</td><td class="num muted">${eur(r.inScenario)}</td>
    <td class="num">${eur(r.uitKosten)}</td><td class="num">${r.uitBtw ? eur(r.uitBtw) : '—'}</td><td class="num">${r.uitLening ? eur(r.uitLening) : '—'}</td>
    <td class="num"><b style="color:${r.saldo < 0 ? 'var(--red)' : r.saldo < 10000 ? 'var(--amber)' : 'var(--green)'}">${eur(r.saldo)}</b></td></tr>`).join('');

  const maandOpts = proj.rows.map((r, i) => `<option value="${i}" ${i === sc.extraHireVanaf ? 'selected' : ''}>${esc(r.label)}</option>`).join('');

  root.innerHTML = `
    <div class="spread mb"><h1>Cashflow & toekomst</h1>
      <div class="row">
        <button class="btn" id="cfCsv">📄 Bank-CSV importeren</button>
        <button class="btn primary" id="cfSaldo">🏦 Saldo bijwerken</button>
      </div></div>

    <div class="grid cols-4 mb">
      <div class="kpi"><div class="lbl">Startsaldo${saldo ? ' · ' + fmtD(saldo.datum) : ''}</div><div class="val">${saldo ? eur(saldo.saldo) : '—'}</div></div>
      <div class="kpi ${proj.laagste.saldo < 0 ? 'bad' : proj.laagste.saldo < 10000 ? 'warn' : 'good'}">
        <div class="lbl">Laagste punt (12 mnd)</div><div class="val">${eur(proj.laagste.saldo)}</div><div class="sub">${esc(proj.laagste.label || '')}</div></div>
      <div class="kpi"><div class="lbl">Runway zónder nieuwe omzet</div><div class="val">${proj.runway >= 12 ? '12+' : proj.runway} mnd</div><div class="sub">op huidig factuurschema</div></div>
      <div class="kpi"><div class="lbl">Eindsaldo over 12 mnd</div><div class="val">${eur(proj.rows[proj.rows.length - 1].saldo)}</div><div class="sub">in dit scenario</div></div>
    </div>

    <div class="panel mb"><h2>📈 Saldo-projectie</h2>${chart}</div>

    <div class="grid cols-2 mb">
      <div class="panel"><h2>🎛 Scenario-knoppen</h2>
        <div class="slider-row"><span>Nieuwe omzet p/m</span>
          <input type="range" id="sc_omzet" min="0" max="60000" step="1000" value="${sc.omzetPm}"><b>${eur(sc.omzetPm)}</b></div>
        <div class="slider-row"><span>Omzet valt terug met</span>
          <input type="range" id="sc_dip" min="0" max="100" step="5" value="${sc.omzetDipPct * 100}"><b>${Math.round(sc.omzetDipPct * 100)}%</b></div>
        <div class="slider-row"><span>Extra hire (kosten p/m)</span>
          <input type="range" id="sc_hire" min="0" max="8000" step="250" value="${sc.extraHirePm}"><b>${eur(sc.extraHirePm)}</b></div>
        <div class="slider-row"><span>Hire start in</span>
          <select id="sc_hireVanaf">${maandOpts}</select><span></span></div>
        <div class="slider-row"><span>Geplande aflossingen meenemen</span>
          <input type="checkbox" id="sc_afl" ${sc.aflossenAan ? 'checked' : ''} style="width:auto;justify-self:start"><span></span></div>
        <p class="muted">Deze knoppen zijn tijdelijk (wat-als). Het standaard omzet-scenario stel je in bij Instellingen.</p>
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

    <div class="panel table-wrap"><h2>Maandtabel</h2><table>
      <tr><th>Maand</th><th class="num">In: facturen</th><th class="num">In: scenario</th><th class="num">Uit: kosten</th><th class="num">Btw-afdracht</th><th class="num">Aflossing</th><th class="num">Saldo</th></tr>
      ${tabel}</table>
      <p class="muted mt">Facturen incl. btw, op verwachte betaaldatum (geplande factuurdatum + betaaltermijn). Te late betalingen: aanname binnen 2 weken. Btw-afdracht per kwartaal, minus geschatte voorbelasting (${eur(S('voorbelasting_pm', 0))}/mnd — instelbaar).</p>
    </div>`;

  const upd = () => { rerender(); };
  $('#sc_omzet').oninput = e => { sc.omzetPm = +e.target.value; upd(); };
  $('#sc_dip').oninput = e => { sc.omzetDipPct = +e.target.value / 100; upd(); };
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
