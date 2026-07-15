// ═══ VIEW: Instellingen ═══

function renderInstellingen(root) {
  const velden = [
    { key: 'btw_pct', lbl: 'Btw-percentage', type: 'pct' },
    { key: 'vpb_pct', lbl: 'Vpb-reservering (% van winst)', type: 'pct' },
    { key: 'voorbelasting_pm', lbl: 'Geschatte voorbelasting p/m (btw-aftrek op kosten)', type: 'eur' },
    { key: 'mgmt_fee_pm', lbl: 'Management fee p/m (kosten)', type: 'eur' },
    { key: 'mgmt_uitkering_pm', lbl: 'Werkelijke uitkering TVE p/m (cash)', type: 'eur' },
    { key: 'default_betaaltermijn', lbl: 'Standaard betaaltermijn (dagen)', type: 'int' },
    { key: 'waarschuwing_dgn', lbl: 'Waarschuwingsvenster facturatie (dagen vooruit)', type: 'int' },
    { key: 'stop_achterstand_mnd', lbl: 'Termijnen behouden na stop (maanden)', type: 'int' },
    { key: 'scenario_omzet_pm', lbl: 'Standaard scenario: nieuwe omzet p/m (excl. btw)', type: 'eur' },
    { key: 'target_omzet_pm', lbl: 'Omzet-target per maand (leeg = geen)', type: 'eur' },
  ];
  const rows = velden.map(v => {
    const val = S(v.key);
    const shown = v.type === 'pct' ? (val != null ? val * 100 : '') : (val ?? '');
    return `<div class="pot"><span>${esc(v.lbl)}</span>
      <input type="number" step="any" data-skey="${v.key}" data-stype="${v.type}" value="${shown}" style="width:130px;text-align:right"></div>`;
  }).join('');

  const lening = D.loans[0];

  root.innerHTML = `
    <h1>Instellingen</h1>
    <div class="grid cols-2 mt">
      <div class="panel"><h2>⚙️ Parameters</h2>${rows}
        <div class="modal-foot"><button class="btn primary" id="setSave">Opslaan</button></div>
        <p class="muted">Percentages als getal (21 = 21%).</p></div>
      <div>
        <div class="panel mb"><h2>🏛 Lening</h2>
          ${lening ? `<div class="form-grid">
            <div class="span2"><label>Naam</label><input id="l_naam" value="${esc(lening.naam)}"></div>
            <div><label>Hoofdsom</label><input id="l_som" type="number" value="${lening.hoofdsom}"></div>
            <div><label>Rente %</label><input id="l_rente" type="number" step="0.1" value="${lening.rente_pct}"></div>
            <div><label>Startdatum</label><input id="l_start" type="date" value="${esc(lening.start_datum || '')}"></div>
            <div><label>Deadline</label><input id="l_dead" type="date" value="${esc(lening.deadline || '')}"></div>
          </div>
          <div class="modal-foot"><button class="btn primary" id="lSave">Opslaan</button></div>` : '<div class="empty">Geen lening.</div>'}
        </div>
        <div class="panel mb"><h2>📧 Dagelijkse e-mail digest</h2>
          <p class="muted">Fase 2: elke ochtend een mail met je acties van vandaag. Hiervoor zetten we een Supabase Edge Function + e-maildienst op — vraag Claude wanneer je zover bent.</p></div>
        <div class="panel"><h2>ℹ️ Over</h2>
          <p class="muted">Ploeggenoten Finance · planningslaag naast Yuki.<br>
          Data: eigen Supabase (afgeschermd, alleen ${esc(OWNER_EMAIL)}).<br>
          Pijplijnkoppeling: <a href="https://ploeggenotenpipeline.netlify.app" target="_blank">pijplijnbord</a> — fase "Contract getekend" → inbox hier.</p></div>
      </div>
    </div>`;

  $('#setSave').onclick = async () => {
    for (const inp of $$('[data-skey]')) {
      const raw = inp.value.trim();
      let val = raw === '' ? null : Number(raw);
      if (inp.dataset.stype === 'pct' && val != null) val = val / 100;
      await saveSetting(inp.dataset.skey, val);
    }
    toast('Instellingen opgeslagen ✓'); rerender();
  };
  $('#lSave') && ($('#lSave').onclick = async () => {
    await dbWrite('fin_loans', t => t.update({
      naam: $('#l_naam').value, hoofdsom: Number($('#l_som').value || 0), rente_pct: Number($('#l_rente').value || 0),
      start_datum: $('#l_start').value || null, deadline: $('#l_dead').value || null,
    }).eq('id', lening.id));
    await reload('fin_loans', 'loans', 'id');
    toast('Lening opgeslagen ✓'); rerender();
  });
}
