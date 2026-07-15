// ═══ VIEW: Flex — wekelijkse marge via backoffice (Pronkert) ═══

function maandagVan(iso) {           // maandag van de week waarin iso valt
  const d = new Date(iso + 'T12:00:00');
  const dag = (d.getDay() + 6) % 7;  // ma=0
  d.setDate(d.getDate() - dag);
  return d.toISOString().slice(0, 10);
}

function renderFlex(root) {
  const fx = flexStats();
  const vaste = budgetVoorMaand(monthKey(todayISO()));
  const dekking = vaste ? fx.maandRunRate / vaste : 0;
  const wk = fx.weken.slice(-26);    // laatste half jaar in grafiek

  const chart = wk.length >= 2 ? lineChart(
    wk.map(w => fmtD(w.week)),
    [{ label: 'Marge per week', color: 'var(--purple)', values: wk.map(w => +w.bedrag) }],
    { height: 200 }) : '<div class="empty">Nog te weinig weken voor een grafiek — vul hieronder je eerste weekbedragen in.</div>';

  const rows = fx.weken.slice().reverse().slice(0, 16).map(w => `<tr>
    <td>wk ${fmtD(w.week)}</td>
    <td class="num">${eur2(w.bedrag)}</td>
    <td class="num">${w.flexkrachten ?? '—'}</td>
    <td class="muted">${esc(w.note || '')}</td>
    <td class="right"><button class="btn small ghost" data-fedit="${w.id}">✎</button>
      <button class="btn small ghost" data-fdel="${w.id}">✕</button></td></tr>`).join('');

  root.innerHTML = `
    <div class="spread mb"><h1>Flex · via Pronkert</h1>
      <button class="btn primary" id="fxNieuw">+ Week invoeren</button></div>

    <div class="grid cols-4 mb">
      <div class="kpi"><div class="lbl">Laatste week${fx.laatste ? ' · ' + fmtD(fx.laatste.week) : ''}</div>
        <div class="val">${fx.laatste ? eur(fx.laatste.bedrag) : '—'}</div>
        <div class="sub">${fx.laatste?.flexkrachten ? fx.laatste.flexkrachten + ' flexkrachten' : ''}</div></div>
      <div class="kpi"><div class="lbl">Gemiddeld (4 wkn)</div><div class="val">${eur(fx.avg4)}</div>
        <div class="sub">${fx.trendPct == null ? '' : (fx.trendPct >= 0 ? '▲ +' : '▼ ') + pct(Math.abs(fx.trendPct)) + ' vs. 4 wkn ervoor'}</div></div>
      <div class="kpi"><div class="lbl">Run-rate per maand</div><div class="val">${eur(fx.maandRunRate)}</div>
        <div class="sub">telt mee in cashflow & potjes</div></div>
      <div class="kpi ${dekking >= 1 ? 'good' : ''}"><div class="lbl">Dekking vaste lasten</div><div class="val">${pct(dekking)}</div>
        <div class="sub">recurring marge vs. ${eur(vaste)}/m</div></div>
    </div>

    <div class="panel mb"><h2>📈 Wekelijkse marge</h2>${chart}</div>

    <div class="panel"><h2>Laatste weken</h2>
      <div class="table-wrap"><table>
      <tr><th>Week</th><th class="num">Marge excl. btw</th><th class="num">Flexkrachten</th><th>Notitie</th><th></th></tr>
      ${rows || '<tr><td colspan="5" class="empty">Nog geen weken ingevoerd. Zodra de eerste uitbetaling van Pronkert binnen is: invoeren maar.</td></tr>'}
      </table></div>
      <p class="muted mt">Vul het uitgekeerde bedrag excl. btw in. De cashflow-projectie rekent met het gemiddelde van je laatste 4 weken; op Cashflow kun je met de flex-schuif spelen (groei of wegval).</p></div>`;

  $('#fxNieuw').onclick = () => openFlexModal();
  root.addEventListener('click', e => {
    const ed = e.target.closest('[data-fedit]');
    if (ed) return openFlexModal(D.flex.find(w => w.id === +ed.dataset.fedit));
    const del = e.target.closest('[data-fdel]');
    if (del) (async () => {
      if (!confirm('Deze week verwijderen?')) return;
      await dbWrite('fin_flex_weken', t => t.delete().eq('id', +del.dataset.fdel));
      await reload('fin_flex_weken', 'flex', 'week');
      rerender();
    })();
  });
}

function openFlexModal(w = null) {
  openModal(`
    <div class="modal-head"><h2>${w ? 'Week bewerken' : 'Flex-week invoeren'}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div><label>Week (kies een dag, wordt maandag)</label><input id="fx_week" type="date" value="${esc(w?.week || maandagVan(todayISO()))}"></div>
      <div><label>Uitgekeerde marge excl. btw (€)</label><input id="fx_bedrag" type="number" step="0.01" value="${w?.bedrag ?? ''}"></div>
      <div><label>Aantal flexkrachten (optioneel)</label><input id="fx_aantal" type="number" value="${w?.flexkrachten ?? ''}"></div>
      <div class="span3"><label>Notitie</label><input id="fx_note" value="${esc(w?.note || '')}"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="fx_save">Opslaan</button></div>`, { narrow: true });
  $('#fx_save').onclick = async () => {
    const bedrag = Number($('#fx_bedrag').value);
    if (isNaN(bedrag)) return toast('Vul een bedrag in', true);
    const row = {
      week: maandagVan($('#fx_week').value), bedrag,
      flexkrachten: $('#fx_aantal').value ? Number($('#fx_aantal').value) : null,
      note: $('#fx_note').value.trim() || null,
    };
    await dbWrite('fin_flex_weken', t => w ? t.update(row).eq('id', w.id) : t.upsert(row, { onConflict: 'week' }));
    await reload('fin_flex_weken', 'flex', 'week');
    closeModal(); toast('Flex-week opgeslagen ✓'); rerender();
  };
}
