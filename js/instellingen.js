// ═══ VIEW: Instellingen ═══

function renderInstellingen(root) {
  const velden = [
    { key: 'btw_pct', lbl: 'Btw-percentage', type: 'pct' },
    { key: 'vpb_pct', lbl: 'Vpb-reservering (% van winst)', type: 'pct' },
    { key: 'voorbelasting_pm', lbl: 'Geschatte voorbelasting p/m (btw-aftrek op kosten)', type: 'eur' },
    { key: 'fee_pct', lbl: 'Fee-voorstel wizard (% van jaarsalaris)', type: 'pct' },
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

  const klanten = [...new Set([...D.placements.map(p => p.klant), ...D.clients.map(c => c.naam)])].sort();
  const tariefRows = D.tarieven.map(r => `<tr>
    <td>${esc(r.klant)}</td><td>${esc(r.functie || 'alle functies')}</td>
    <td class="num"><b>${Math.round(r.tarief_pct * 100)}%</b></td><td class="muted">${esc(r.note || '')}</td>
    <td class="right"><button class="btn small ghost" data-tedit="${r.id}">✎</button>
    <button class="btn small ghost" data-tdel="${r.id}">✕</button></td></tr>`).join('');

  root.innerHTML = `
    <h1>Instellingen</h1>
    <div class="panel mt mb"><div class="spread mb"><h2>💼 W&S-tarieven per klant</h2>
      <button class="btn primary small" id="tNieuw">+ Tarief</button></div>
      <div class="table-wrap"><table>
      <tr><th>Klant</th><th>Functie</th><th class="num">Tarief</th><th>Notitie</th><th></th></tr>
      ${tariefRows || '<tr><td colspan="5" class="empty">Nog geen tarieven — voeg per klant je afgesproken W&S-percentage toe. De fee wordt dan automatisch: maandloon × (1+toeslag) × 12,96 × tarief.</td></tr>'}
      </table></div>
      <p class="muted mt">Een rij zónder functie geldt als standaard voor die klant; een rij mét functie gaat vóór (bijv. "Kok" bij Starcuisine een ander percentage). Maandloon en ploegentoeslag vult je AM in op het pijplijnbord.</p></div>
    <div class="panel mb"><div class="spread mb"><h2>👷 Flex-afspraken per klant</h2>
      <button class="btn primary small" id="faNieuw">+ Flex-afspraak</button></div>
      <div class="table-wrap"><table>
      <tr><th>Klant</th><th class="num">Klantfactor</th><th class="num">Inkoopfactor</th><th class="num">Marge-factor</th><th class="num">Overname na (u)</th><th>Notitie</th><th></th></tr>
      ${D.flexAfspr.map(a => `<tr><td>${esc(a.klant)}</td><td class="num">${Number(a.factor).toFixed(2)}</td>
        <td class="num">${a.inkoop_factor ? Number(a.inkoop_factor).toFixed(2) : Number(S('flex_inkoop_factor', 1.8)).toFixed(2)}</td>
        <td class="num"><b>${(Number(a.factor) - Number(a.inkoop_factor || S('flex_inkoop_factor', 1.8))).toFixed(2)}</b></td>
        <td class="num">${a.overname_uren || '—'}</td><td class="muted">${esc(a.note || '')}</td>
        <td class="right"><button class="btn small ghost" data-faedit="${a.id}">✎</button>
        <button class="btn small ghost" data-fadel="${a.id}">✕</button></td></tr>`).join('')
        || '<tr><td colspan="7" class="empty">Nog geen flex-afspraken. Voeg per klant je factor toe (bijv. Proponent 2,45).</td></tr>'}
      </table></div>
      <p class="muted mt">Marge-factor = klantfactor − inkoopfactor Pronkert (standaard ${Number(S('flex_inkoop_factor', 1.8)).toFixed(2)}). Op het Flex-tabblad wordt hiermee per flexkracht de marge per uur en de overname-waarde berekend.</p></div>
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
        <div class="panel mb"><h2>🔄 Yuki-koppeling</h2>
          <p class="muted">Haalt automatisch (dagelijks bij openen) je banksaldo, winst en omzet uit de boekhouding.
          ${S('yuki_synced_at') ? `Laatste sync: <b>${fmtD(S('yuki_synced_at').slice(0, 10))}</b> · winst YTD ${eur(S('yuki_winst_ytd'))} · omzet YTD ${eur(S('yuki_omzet_ytd'))} · debiteuren ${eur(S('yuki_debiteuren'))}` : 'Nog niet gesynchroniseerd.'}</p>
          <button class="btn primary" id="yukiNu">Nu verversen uit Yuki</button></div>
        <div class="panel mb"><h2>📧 Dagelijkse e-mail digest</h2>
          <p class="muted">Fase 2: elke ochtend een mail met je acties van vandaag. Hiervoor zetten we een Supabase Edge Function + e-maildienst op — vraag Claude wanneer je zover bent.</p></div>
        <div class="panel"><h2>ℹ️ Over</h2>
          <p class="muted">Ploeggenoten Finance · planningslaag naast Yuki.<br>
          Data: eigen Supabase (afgeschermd, alleen ${esc(OWNER_EMAIL)}).<br>
          Pijplijnkoppeling: <a href="https://ploeggenotenpipeline.netlify.app" target="_blank">pijplijnbord</a> — fase "Contract getekend" → inbox hier.</p></div>
      </div>
    </div>`;

  $('#yukiNu').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Bezig…';
    await yukiSync(false);
  };
  $('#faNieuw').onclick = () => openFlexAfsprModal(null, klanten);
  root.addEventListener('click', async e => {
    const ed = e.target.closest('[data-faedit]');
    if (ed) return openFlexAfsprModal(D.flexAfspr.find(a => a.id === +ed.dataset.faedit), klanten);
    const del = e.target.closest('[data-fadel]');
    if (del) {
      if (!confirm('Deze flex-afspraak verwijderen?')) return;
      await dbWrite('fin_flex_afspraken', t => t.delete().eq('id', +del.dataset.fadel));
      await reload('fin_flex_afspraken', 'flexAfspr', 'klant'); rerender();
    }
  });
  $('#tNieuw').onclick = () => openTariefModal(null, klanten);
  root.addEventListener('click', async e => {
    const ed = e.target.closest('[data-tedit]');
    if (ed) return openTariefModal(D.tarieven.find(r => r.id === +ed.dataset.tedit), klanten);
    const del = e.target.closest('[data-tdel]');
    if (del) {
      if (!confirm('Dit tarief verwijderen?')) return;
      await dbWrite('fin_tarieven', t => t.delete().eq('id', +del.dataset.tdel));
      await reload('fin_tarieven', 'tarieven', 'klant');
      rerender();
    }
  });
  $('#setSave').onclick = async () => {
    for (const inp of $$('[data-skey]')) {
      const raw = inp.value.trim();
      let val = raw === '' ? null : Number(raw);
      if (inp.dataset.stype === 'pct' && val != null) val = val / 100;
      await saveSetting(inp.dataset.skey, val);
    }
    toast('Instellingen opgeslagen ✓'); rerender();
  };
  window.openFlexAfsprModal = (a, klantLijst) => {
    openModal(`
      <div class="modal-head"><h2>${a ? 'Flex-afspraak bewerken' : 'Nieuwe flex-afspraak'}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <div class="span2"><label>Klant</label><input id="fa_klant" list="faKlant" value="${esc(a?.klant || '')}">
          <datalist id="faKlant">${klantLijst.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
        <div><label>Klantfactor</label><input id="fa_factor" type="number" step="0.01" value="${a?.factor ?? ''}" placeholder="2.45"></div>
        <div><label>Inkoopfactor Pronkert</label><input id="fa_inkoop" type="number" step="0.01" value="${a?.inkoop_factor ?? ''}" placeholder="${S('flex_inkoop_factor', 1.8)}"></div>
        <div><label>Kosteloze overname na (uren)</label><input id="fa_overname" type="number" step="1" value="${a?.overname_uren ?? ''}" placeholder="1200"></div>
        <div class="span2"><label>Notitie</label><input id="fa_note" value="${esc(a?.note || '')}"></div>
      </div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
      <button class="btn primary" id="fa_save">Opslaan</button></div>`, { narrow: true });
    $('#fa_save').onclick = async () => {
      const row = {
        klant: $('#fa_klant').value.trim(), factor: Number($('#fa_factor').value),
        inkoop_factor: $('#fa_inkoop').value ? Number($('#fa_inkoop').value) : null,
        overname_uren: $('#fa_overname').value ? Number($('#fa_overname').value) : null,
        note: $('#fa_note').value.trim() || null,
      };
      if (!row.klant || !row.factor) return toast('Klant en klantfactor zijn verplicht', true);
      await dbWrite('fin_flex_afspraken', t => a ? t.update(row).eq('id', a.id) : t.insert(row));
      await reload('fin_flex_afspraken', 'flexAfspr', 'klant');
      closeModal(); toast('Flex-afspraak opgeslagen ✓'); rerender();
    };
  };

  window.openTariefModal = (r, klantLijst) => {
    openModal(`
      <div class="modal-head"><h2>${r ? 'Tarief bewerken' : 'Nieuw tarief'}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <div><label>Klant</label><input id="t_klant" list="tKlantList" value="${esc(r?.klant || '')}">
          <datalist id="tKlantList">${klantLijst.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
        <div><label>Functie (leeg = alle)</label><input id="t_functie" value="${esc(r?.functie || '')}" placeholder="bijv. Kok"></div>
        <div><label>Tarief % van jaarloon</label><input id="t_pct" type="number" step="0.5" min="1" max="50" value="${r ? Math.round(r.tarief_pct * 1000) / 10 : ''}" placeholder="bijv. 20"></div>
        <div class="span3"><label>Notitie (bijv. verwijzing overeenkomst)</label><input id="t_note" value="${esc(r?.note || '')}"></div>
      </div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
      <button class="btn primary" id="t_save">Opslaan</button></div>`, { narrow: true });
    $('#t_save').onclick = async () => {
      const row = {
        klant: $('#t_klant').value.trim(), functie: $('#t_functie').value.trim() || null,
        tarief_pct: Number($('#t_pct').value) / 100, note: $('#t_note').value.trim() || null,
      };
      if (!row.klant || !row.tarief_pct) return toast('Klant en tarief zijn verplicht', true);
      await dbWrite('fin_tarieven', t => r ? t.update(row).eq('id', r.id) : t.insert(row));
      await reload('fin_tarieven', 'tarieven', 'klant');
      closeModal(); toast('Tarief opgeslagen ✓'); rerender();
    };
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
