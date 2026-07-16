// ═══ VIEW: Plaatsingen — inbox, lijst, wizard, detail ═══

async function markeerInstallment(inst, status, datum) {
  const veld = status === 'gefactureerd' ? 'factuurdatum' : status === 'betaald' ? 'betaaldatum' : null;
  const patch = { status };
  if (veld) patch[veld] = datum || todayISO();
  if (status === 'betaald' && !inst.factuurdatum) patch.factuurdatum = inst.geplande_datum || todayISO();
  await dbWrite('fin_installments', t => t.update(patch).eq('id', inst.id));
  await reload('fin_installments', 'installments', 'geplande_datum');
  toast(`Termijn ${inst.termijn_nr} → ${status}`);
  rerender();
}

async function verwerkStop(p) {
  const impact = stopImpact(p);
  for (const i of impact)
    await dbWrite('fin_installments', t => t.update({ status: 'vervallen' }).eq('id', i.id));
  await reload('fin_installments', 'installments', 'geplande_datum');
  toast(`${impact.length} termijn(en) vervallen voor ${p.kandidaat}`);
  rerender();
}

function openStopModal(p, voorstelDatum) {
  const g = p.garantie_mnd && p.contract_datum ? addMonths(p.contract_datum, p.garantie_mnd) : null;
  openModal(`
    <div class="modal-head"><h2>Kandidaat gestopt · ${esc(p.kandidaat)}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div><label>Gestopt op</label><input type="date" id="stopDatum" value="${esc(voorstelDatum || todayISO())}"></div>
      <div class="span2"><label>Garantie</label><div style="padding-top:8px">${g ? (voorstelDatum || todayISO()) <= g ? tag('binnen garantie → vervanging leveren', 'red') : tag('buiten garantie', 'gray') : tag('geen garantie', 'gray')}</div></div>
    </div>
    <p class="muted">Termijnen ná stopdatum + ${S('stop_achterstand_mnd', 1)} maand worden op "vervallen" gezet.</p>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="stopOk">Verwerken</button></div>`, { narrow: true });
  $('#stopOk').onclick = async () => {
    const datum = $('#stopDatum').value;
    await dbWrite('fin_placements', t => t.update({ gestopt_op: datum, updated_at: new Date().toISOString() }).eq('id', p.id));
    await reload('fin_placements', 'placements', 'id');
    const p2 = D.placements.find(x => x.id === p.id);
    await verwerkStop(p2);
    closeModal();
  };
}

// ── factuurschema-presets ──────────────────────────────────────
function genSchema(preset, fee, startISO, opts = {}) {
  const rows = [];
  const n = opts.n || 1, tussen = opts.tussen || 1;
  if (preset === '1x') rows.push({ nr: 1, bedrag: fee, datum: startISO });
  else if (preset === 'nx') {
    const per = Math.round(fee / n * 100) / 100;
    for (let i = 0; i < n; i++)
      rows.push({ nr: i + 1, bedrag: i === n - 1 ? Math.round((fee - per * (n - 1)) * 100) / 100 : per, datum: addMonths(startISO, i * tussen) });
  } else if (preset === '5050') {
    const helft = Math.round(fee / 2 * 100) / 100;
    rows.push({ nr: 1, bedrag: helft, datum: startISO });
    rows.push({ nr: 2, bedrag: Math.round((fee - helft) * 100) / 100, datum: addMonths(startISO, opts.naMnd || 3) });
  }
  return rows;
}

// ── wizard: nieuwe plaatsing (evt. vanuit pijplijn-kandidaat) ──
function openPlacementWizard({ candidate = null, edit = null } = {}) {
  const p = edit || {};
  // fee-voorstel via de fee-motor: maandloon (bord) × (1+toeslag) × 12,96 × klanttarief
  let feeSuggestie = null, feeUitleg = null;
  if (candidate && !edit) {
    const fb = feeBerekening(candidate);
    feeSuggestie = fb.fee;
    feeUitleg = fb.uitleg;
  }
  const startSuggestie = candidate ? (candidate.start || candidate.geplaatst_op || todayISO()) : todayISO();
  const volgId = () => {
    const nums = D.placements.map(x => parseInt((x.id || '').replace(/\D/g, ''))).filter(n => !isNaN(n));
    return 'P' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
  };
  const klanten = [...new Set([...D.placements.map(x => x.klant), ...D.clients.map(c => c.naam)])].sort();
  openModal(`
    <div class="modal-head"><h2>${edit ? 'Plaatsing bewerken · ' + esc(p.id) : 'Nieuwe plaatsing'}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    ${candidate ? `<p class="muted mb">📥 Vanuit pijplijnbord: <b>${esc(candidate.naam)}</b> — ${esc(candidate.fase)}${candidate.geplaatst_op ? ' · geplaatst ' + fmtD(candidate.geplaatst_op) : ''}</p>` : ''}
    <div class="form-grid">
      <div><label>ID</label><input id="w_id" value="${esc(p.id || volgId())}" ${edit ? 'disabled' : ''}></div>
      <div><label>Klant</label><input id="w_klant" list="klantList" value="${esc(p.klant || candidate?.klant || '')}">
        <datalist id="klantList">${klanten.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
      <div><label>Kandidaat</label><input id="w_kand" value="${esc(p.kandidaat || candidate?.naam || '')}"></div>
      <div><label>Functie</label><input id="w_functie" value="${esc(p.functie || candidate?.functie || '')}"></div>
      <div><label>Totale fee excl. btw</label><input id="w_fee" type="number" step="0.01" value="${p.fee_excl ?? feeSuggestie ?? ''}">
        ${feeUitleg ? `<span class="muted" style="font-size:11px">${esc(feeUitleg)}</span>` : ''}</div>
      <div><label>Contract getekend</label><input id="w_contract" type="date" value="${esc(p.contract_datum || candidate?.geplaatst_op || todayISO())}"></div>
      <div><label>Betaaltermijn (dgn)</label><input id="w_betaal" type="number" value="${p.betaaltermijn_dgn ?? S('default_betaaltermijn', 14)}"></div>
      <div><label>Garantie (mnd)</label><input id="w_gar" type="number" value="${p.garantie_mnd ?? candidate?.garantie_mnd ?? 0}"></div>
      <div><label>Notitie</label><input id="w_note" value="${esc(p.note || '')}"></div>
    </div>
    ${edit ? '' : `
    <h3>Factuurschema</h3>
    <div class="form-grid">
      <div><label>Preset</label><select id="w_preset">
        <option value="1x">1 termijn (alles ineens)</option>
        <option value="nx">N termijnen, elke X mnd</option>
        <option value="5050">50% bij tekenen · 50% na X mnd</option>
      </select></div>
      <div><label>1e factuurdatum</label><input id="w_start" type="date" value="${esc(startSuggestie)}">
        ${candidate?.start ? `<span class="muted" style="font-size:11px">= startdatum van het bord</span>` : ''}</div>
      <div id="w_nxOpts" style="display:none"><label>Aantal × om de (mnd)</label>
        <div class="row"><input id="w_n" type="number" value="7" style="width:60px"><input id="w_tussen" type="number" value="1" style="width:60px"></div></div>
      <div id="w_5050Opts" style="display:none"><label>2e helft na (mnd)</label><input id="w_naMnd" type="number" value="3"></div>
    </div>
    <div id="w_schemaPreview" class="table-wrap"></div>`}
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="w_save">${edit ? 'Opslaan' : 'Plaatsing aanmaken'}</button></div>`);

  let schema = [];
  const preview = () => {
    if (edit) return;
    const preset = $('#w_preset').value;
    $('#w_nxOpts').style.display = preset === 'nx' ? '' : 'none';
    $('#w_5050Opts').style.display = preset === '5050' ? '' : 'none';
    schema = genSchema(preset, Number($('#w_fee').value || 0), $('#w_start').value, {
      n: Number($('#w_n')?.value || 1), tussen: Number($('#w_tussen')?.value || 1), naMnd: Number($('#w_naMnd')?.value || 3),
    });
    $('#w_schemaPreview').innerHTML = `<table><tr><th>#</th><th>Geplande datum</th><th class="num">Bedrag excl.</th><th class="num">Incl. btw</th></tr>` +
      schema.map(r => `<tr><td>${r.nr}</td><td>${fmtD(r.datum)}</td><td class="num">${eur2(r.bedrag)}</td><td class="num">${eur2(r.bedrag * (1 + Number(S('btw_pct', .21))))}</td></tr>`).join('') + '</table>';
  };
  if (!edit) {
    ['w_preset', 'w_fee', 'w_start', 'w_n', 'w_tussen', 'w_naMnd'].forEach(id => $('#' + id)?.addEventListener('input', preview));
    preview();
  }

  $('#w_save').onclick = async () => {
    const row = {
      id: $('#w_id').value.trim(), klant: $('#w_klant').value.trim(), kandidaat: $('#w_kand').value.trim(),
      functie: $('#w_functie').value.trim(), fee_excl: Number($('#w_fee').value || 0),
      contract_datum: $('#w_contract').value || null, betaaltermijn_dgn: Number($('#w_betaal').value || 14),
      garantie_mnd: Number($('#w_gar').value || 0), note: $('#w_note').value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!row.id || !row.klant) return toast('ID en klant zijn verplicht', true);
    if (!edit) {
      row.aantal_termijnen = schema.length || 1;
      row.eerste_factuurdatum = schema[0]?.datum || null;
      row.bron = candidate ? 'pipeline' : 'app';
      row.pipeline_candidate_id = candidate?.id || null;
      await dbWrite('fin_placements', t => t.insert(row));
      for (const r of schema)
        await dbWrite('fin_installments', t => t.insert({
          placement_id: row.id, termijn_nr: r.nr, bedrag_excl: r.bedrag, geplande_datum: r.datum, status: 'te_factureren',
        }));
    } else {
      await dbWrite('fin_placements', t => t.update(row).eq('id', p.id));
      // concept met aangepaste fee: automatisch gegenereerde termijnen meeschalen
      if (p.concept && row.fee_excl !== Number(p.fee_excl)) {
        const oud = instOf(p.id).filter(i => i.status === 'te_factureren');
        const per = Math.round(row.fee_excl / Math.max(1, oud.length) * 100) / 100;
        for (const i of oud)
          await dbWrite('fin_installments', t => t.update({ bedrag_excl: per }).eq('id', i.id));
      }
    }
    await Promise.all([reload('fin_placements', 'placements', 'id'), reload('fin_installments', 'installments', 'geplande_datum')]);
    closeModal(); toast(edit ? 'Opgeslagen' : `Plaatsing ${row.id} aangemaakt ✓`); rerender();
  };
}

// ── detail: plaatsing + termijnen beheren ──────────────────────
function openPlacementDetail(pid) {
  const p = D.placements.find(x => x.id === pid);
  if (!p) return;
  const st = placementStats(p);
  const g = garantie(p);
  const btw = 1 + Number(S('btw_pct', .21));
  const rows = st.ins.map(i => {
    const vv = vervaldatum(i, p);
    const late = i.status === 'gefactureerd' && vv && vv < todayISO() ? daysBetween(vv, todayISO()) : 0;
    const stTag = { te_factureren: tag('te factureren', 'amber'), gefactureerd: late ? tag(late + ' dgn te laat', 'red') : tag('gefactureerd', 'blue'), betaald: tag('betaald', 'green'), vervallen: tag('vervallen', 'gray') }[i.status];
    const acts = [];
    if (i.status === 'te_factureren') acts.push(`<button class="btn small" data-iact="fact" data-iid="${i.id}">Gefactureerd ✓</button>`);
    if (i.status === 'gefactureerd') acts.push(`<button class="btn small" data-iact="paid" data-iid="${i.id}">Betaald ✓</button>`);
    if (i.status !== 'vervallen') acts.push(`<button class="btn small ghost" data-iact="edit" data-iid="${i.id}">✎</button>`);
    if (i.status !== 'betaald') acts.push(`<button class="btn small ghost" data-iact="verval" data-iid="${i.id}" title="Vervallen">✕</button>`);
    return `<tr class="${i.status === 'vervallen' ? 'dim' : ''}"><td>${i.termijn_nr}</td>
      <td>${fmtD(i.geplande_datum)}</td><td class="num">${eur2(i.bedrag_excl)}</td><td class="num">${eur2(i.bedrag_excl * btw)}</td>
      <td>${stTag}</td><td>${fmtD(i.factuurdatum)}</td><td>${fmtD(i.betaaldatum)}</td>
      <td class="right">${acts.join(' ')}</td></tr>`;
  }).join('');

  openModal(`
    <div class="modal-head"><h2>${esc(p.id)} · ${esc(p.kandidaat)} <span class="muted">— ${esc(p.klant)}</span></h2>
      <button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="row mb">
      ${p.concept ? tag('✨ CONCEPT — fee geschat, bevestig', 'amber') : ''}
      ${tag(st.status, st.kleur)}
      ${p.gestopt_op ? tag('gestopt ' + fmtD(p.gestopt_op), 'red') : ''}
      ${g.actief ? tag('garantie t/m ' + fmtD(g.tot), 'purple') : ''}
      ${g.vervangingNodig ? tag('VERVANGING LEVEREN', 'red') : ''}
      <span class="muted">${esc(p.functie)} · fee ${eur2(p.fee_excl)} excl. · betaaltermijn ${p.betaaltermijn_dgn} dgn</span>
    </div>
    <div class="grid cols-4 mb">
      <div class="kpi"><div class="lbl">Gefactureerd</div><div class="val">${eur(st.gefact)}</div></div>
      <div class="kpi good"><div class="lbl">Betaald</div><div class="val">${eur(st.betaald)}</div></div>
      <div class="kpi ${st.open ? 'warn' : ''}"><div class="lbl">Openstaand</div><div class="val">${eur(st.open)}</div></div>
      <div class="kpi"><div class="lbl">Nog te factureren</div><div class="val">${eur(st.nog)}</div></div>
    </div>
    <div class="table-wrap"><table>
      <tr><th>#</th><th>Gepland</th><th class="num">Excl. btw</th><th class="num">Incl. btw</th><th>Status</th><th>Factuurdatum</th><th>Betaald op</th><th></th></tr>
      ${rows}</table></div>
    <div class="modal-foot">
      <button class="btn small ghost" id="d_addTermijn">+ termijn</button>
      <span style="flex:1"></span>
      ${p.concept ? `<button class="btn primary" id="d_bevestig">✓ Fee klopt — bevestigen</button>` : ''}
      ${!p.gestopt_op ? `<button class="btn danger" id="d_stop">Kandidaat gestopt…</button>` : ''}
      ${g.vervangingNodig ? `<button class="btn" id="d_vervang">Vervanging geleverd…</button>` : ''}
      <button class="btn" id="d_edit">Bewerken</button>
      <button class="btn danger" id="d_del">Verwijderen</button>
    </div>`);

  $('#modalRoot').lastChild.addEventListener('click', async e => {
    const b = e.target.closest('[data-iact]');
    if (!b) return;
    const inst = D.installments.find(i => i.id === Number(b.dataset.iid));
    if (b.dataset.iact === 'fact') { await markeerInstallment(inst, 'gefactureerd'); closeModal(); openPlacementDetail(pid); }
    if (b.dataset.iact === 'paid') { await markeerInstallment(inst, 'betaald'); closeModal(); openPlacementDetail(pid); }
    if (b.dataset.iact === 'verval') {
      await dbWrite('fin_installments', t => t.update({ status: 'vervallen' }).eq('id', inst.id));
      await reload('fin_installments', 'installments', 'geplande_datum');
      closeModal(); openPlacementDetail(pid); rerender();
    }
    if (b.dataset.iact === 'edit') openInstallmentEdit(inst, pid);
  });
  $('#d_bevestig') && ($('#d_bevestig').onclick = async () => {
    await dbWrite('fin_placements', t => t.update({ concept: false, updated_at: new Date().toISOString() }).eq('id', p.id));
    await reload('fin_placements', 'placements', 'id');
    closeModal(); toast(`${p.id} bevestigd ✓ — factuurschema is actief`); rerender();
  });
  $('#d_edit').onclick = () => { closeModal(); openPlacementWizard({ edit: p }); };
  $('#d_stop') && ($('#d_stop').onclick = () => { closeModal(); openStopModal(p); });
  $('#d_vervang') && ($('#d_vervang').onclick = async () => {
    const nieuw = prompt('ID of naam van de vervangende plaatsing/kandidaat:');
    if (!nieuw) return;
    await dbWrite('fin_placements', t => t.update({ vervangen_door: nieuw }).eq('id', p.id));
    await reload('fin_placements', 'placements', 'id');
    closeModal(); toast('Vervanging geregistreerd ✓'); rerender();
  });
  $('#d_addTermijn').onclick = async () => {
    const nr = Math.max(0, ...st.ins.map(i => i.termijn_nr)) + 1;
    await dbWrite('fin_installments', t => t.insert({ placement_id: pid, termijn_nr: nr, bedrag_excl: 0, geplande_datum: todayISO(), status: 'te_factureren' }));
    await reload('fin_installments', 'installments', 'geplande_datum');
    closeModal(); openPlacementDetail(pid);
  };
  $('#d_del').onclick = async () => {
    if (!confirm(`Plaatsing ${p.id} (${p.kandidaat}) én alle termijnen verwijderen?`)) return;
    if (p.pipeline_candidate_id)   // anders maakt de app hem bij de volgende load opnieuw aan
      await dbWrite('fin_dismissed_candidates', t => t.upsert({ candidate_id: p.pipeline_candidate_id }));
    await dbWrite('fin_placements', t => t.delete().eq('id', p.id));
    await Promise.all([reload('fin_placements', 'placements', 'id'), reload('fin_installments', 'installments', 'geplande_datum'),
      reload('fin_dismissed_candidates', 'dismissed', 'candidate_id')]);
    closeModal(); toast('Verwijderd'); rerender();
  };
}

function openInstallmentEdit(inst, pid) {
  openModal(`
    <div class="modal-head"><h2>Termijn ${inst.termijn_nr} bewerken</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div><label>Bedrag excl. btw</label><input id="ie_bedrag" type="number" step="0.01" value="${inst.bedrag_excl}"></div>
      <div><label>Geplande datum</label><input id="ie_datum" type="date" value="${esc(inst.geplande_datum || '')}"></div>
      <div><label>Status</label><select id="ie_status">
        ${['te_factureren', 'gefactureerd', 'betaald', 'vervallen'].map(s => `<option ${s === inst.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Factuurdatum</label><input id="ie_fact" type="date" value="${esc(inst.factuurdatum || '')}"></div>
      <div><label>Betaaldatum</label><input id="ie_paid" type="date" value="${esc(inst.betaaldatum || '')}"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="ie_save">Opslaan</button></div>`, { narrow: true });
  $('#ie_save').onclick = async () => {
    await dbWrite('fin_installments', t => t.update({
      bedrag_excl: Number($('#ie_bedrag').value || 0), geplande_datum: $('#ie_datum').value || null,
      status: $('#ie_status').value, factuurdatum: $('#ie_fact').value || null, betaaldatum: $('#ie_paid').value || null,
    }).eq('id', inst.id));
    await reload('fin_installments', 'installments', 'geplande_datum');
    closeModal(); openPlacementDetail(pid); rerender();
  };
}

// ── hoofdview ──────────────────────────────────────────────────
function renderPlaatsingen(root) {
  const inbox = inboxCandidates();
  const inboxHtml = inbox.length ? `
    <div class="panel mb"><h2>📥 Vanuit het pijplijnbord — plaatsing afronden</h2>
    ${inbox.map(c => `<div class="actie warn"><div class="ico">👤</div>
      <div class="body"><b>${esc(c.naam)} · ${esc(c.klant || '?')}</b>
      <span>${esc(c.functie || '')} · ${esc(c.fase)}${c.geplaatst_op ? ' · geplaatst ' + fmtD(c.geplaatst_op) : ''}</span></div>
      <button class="btn small primary" data-cand="${esc(c.id)}">Afronden →</button>
      <button class="btn small ghost" data-dismiss="${esc(c.id)}" title="Niet factureren">✕</button></div>`).join('')}
    </div>` : '';

  const rows = D.placements.slice().sort((a, b) => (b.contract_datum || '').localeCompare(a.contract_datum || '')).map(p => {
    const st = placementStats(p);
    const g = garantie(p);
    return `<tr class="clickable" data-pid="${esc(p.id)}">
      <td><b>${esc(p.id)}</b></td><td>${esc(p.klant)}</td><td>${esc(p.kandidaat)}<br><span class="muted">${esc(p.functie)}</span></td>
      <td>${fmtD(p.contract_datum)}</td>
      <td class="num">${eur(p.fee_excl)}</td>
      <td>${st.nGefact} van ${st.nActief}</td>
      <td class="num">${eur(st.betaald)}</td>
      <td class="num">${st.open ? `<b style="color:var(--amber)">${eur(st.open)}</b>` : '—'}</td>
      <td class="num">${st.nog ? eur(st.nog) : '—'}</td>
      <td>${p.concept ? tag('✨ concept', 'amber') + ' ' : ''}${tag(st.status, st.kleur)}${g.vervangingNodig ? ' ' + tag('vervangen!', 'red') : g.actief ? ' ' + tag('garantie', 'purple') : ''}</td></tr>`;
  }).join('');

  root.innerHTML = `
    <div class="spread mb"><h1>Plaatsingen</h1>
      <button class="btn primary" id="plNieuw">+ Nieuwe plaatsing</button></div>
    ${inboxHtml}
    <div class="panel table-wrap"><table>
      <tr><th>ID</th><th>Klant</th><th>Kandidaat</th><th>Contract</th><th class="num">Fee excl.</th><th>Stand</th><th class="num">Betaald</th><th class="num">Open</th><th class="num">Nog te fact.</th><th>Status</th></tr>
      ${rows || '<tr><td colspan="10" class="empty">Nog geen plaatsingen</td></tr>'}</table></div>`;

  $('#plNieuw').onclick = () => openPlacementWizard({});
  root.addEventListener('click', async e => {
    const cand = e.target.closest('[data-cand]');
    if (cand) return openPlacementWizard({ candidate: D.candidates.find(c => c.id === cand.dataset.cand) });
    const dis = e.target.closest('[data-dismiss]');
    if (dis) {
      await dbWrite('fin_dismissed_candidates', t => t.upsert({ candidate_id: dis.dataset.dismiss }));
      await reload('fin_dismissed_candidates', 'dismissed', 'candidate_id');
      return rerender();
    }
    const tr = e.target.closest('tr[data-pid]');
    if (tr) openPlacementDetail(tr.dataset.pid);
  });
}
