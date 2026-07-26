// ═══ VIEW: Facturatie — volledig termijnschema, filterbaar ═══

let factFilter = { status: 'actueel', klant: '' };

// te betalen inkoopfacturen — live uit Yuki (fin_yuki_open, soort=crediteur)
function crediteurenHtml() {
  const sync = S('yuki_synced_at');
  const cred = (D.yukiOpen || []).filter(r => r.soort === 'crediteur' && Math.abs(+r.open_bedrag) > 0.005);
  if (!cred.length) return `<div class="panel mb"><h2>💳 Te betalen — inkoopfacturen <span class="muted">— live uit Yuki</span></h2>
    <div class="empty">Geen openstaande inkoopfacturen in Yuki${sync ? ` (laatst gesynct ${fmtD(sync.slice(0, 10))})` : ''}.</div></div>`;
  const t = todayISO();
  const rows = [...cred].sort((a, b) => String(a.vervaldatum || '9999').localeCompare(String(b.vervaldatum || '9999')));
  const totaal = rows.reduce((s, r) => s + +r.open_bedrag, 0);
  const teLaat = rows.filter(r => r.vervaldatum && r.vervaldatum < t && +r.open_bedrag > 0);
  const teLaatBed = teLaat.reduce((s, r) => s + +r.open_bedrag, 0);
  return `<div class="panel mb"><div class="spread mb"><h2>💳 Te betalen — inkoopfacturen <span class="muted">— live uit Yuki</span></h2>
      <span class="muted">${rows.length} facturen · totaal <b>${eur(totaal)}</b>${teLaat.length ? ` · <span style="color:var(--red)">${teLaat.length} over vervaldatum (${eur(teLaatBed)})</span>` : ''}</span></div>
    <div class="table-wrap"><table>
      <tr><th>Leverancier</th><th>Omschrijving</th><th>Vervaldatum</th><th class="num">Open bedrag</th></tr>
      ${rows.map(r => { const laat = r.vervaldatum && r.vervaldatum < t && +r.open_bedrag > 0;
        return `<tr><td><b>${esc(r.contact || '—')}</b></td><td class="muted">${esc((r.omschrijving || '').slice(0, 52))}</td>
        <td>${r.vervaldatum ? fmtD(r.vervaldatum) : '—'} ${laat ? tag('te laat', 'red') : ''}</td>
        <td class="num"><b>${eur(r.open_bedrag)}</b></td></tr>`; }).join('')}
      <tr><td colspan="3" class="right"><b>Totaal open</b></td><td class="num"><b>${eur(totaal)}</b></td></tr>
    </table></div>
    <p class="muted mt" style="font-size:12px">Rechtstreeks uit Yuki (OutstandingCreditorItems)${sync ? `, laatst gesynct ${fmtD(sync.slice(0, 10))}` : ''}. Puur inzicht — betalen doe je in je bank/Yuki. Een negatief bedrag = creditfactuur (leverancier moet jóu nog).</p></div>`;
}

function renderFacturatie(root) {
  const btw = 1 + Number(S('btw_pct', .21));
  const t = todayISO();
  const klanten = [...new Set(D.placements.map(p => p.klant))].sort();

  let items = D.installments.map(i => {
    const p = D.placements.find(x => x.id === i.placement_id);
    return p ? { i, p } : null;
  }).filter(Boolean);

  if (factFilter.klant) items = items.filter(x => x.p.klant === factFilter.klant);
  if (factFilter.status === 'actueel') items = items.filter(x => x.i.status !== 'vervallen' && x.i.status !== 'betaald');
  else if (factFilter.status !== 'alles') items = items.filter(x => x.i.status === factFilter.status);

  items.sort((a, b) => (a.i.geplande_datum || '9999').localeCompare(b.i.geplande_datum || '9999'));

  // groepeer per maand
  const groepen = {};
  for (const x of items) {
    const k = x.i.geplande_datum ? monthKey(x.i.geplande_datum) : 'zonder';
    (groepen[k] = groepen[k] || []).push(x);
  }

  const blokken = Object.entries(groepen).map(([k, xs]) => {
    const tot = xs.reduce((s, x) => s + +x.i.bedrag_excl, 0);
    const rows = xs.map(({ i, p }) => {
      const vv = vervaldatum(i, p);
      const late = i.status === 'gefactureerd' && vv && vv < t ? daysBetween(vv, t) : 0;
      const missed = i.status === 'te_factureren' && i.geplande_datum && i.geplande_datum < t;
      const stTag = { te_factureren: missed ? tag('GEMIST', 'red') : tag('te factureren', 'amber'), gefactureerd: late ? tag(late + ' dgn te laat', 'red') : tag('wacht op betaling', 'blue'), betaald: tag('betaald', 'green'), vervallen: tag('vervallen', 'gray') }[i.status];
      let act = '';
      if (i.status === 'te_factureren') act = `<button class="btn small primary" data-fact="${i.id}">Gefactureerd ✓</button>`;
      if (i.status === 'gefactureerd') act = `<button class="btn small primary" data-paid="${i.id}">Betaald ✓</button>`;
      return `<tr class="clickable ${i.status === 'vervallen' ? 'dim' : ''}" data-open="${esc(p.id)}">
        <td>${fmtD(i.geplande_datum)}</td><td><b>${esc(p.id)}</b> · t${i.termijn_nr}</td>
        <td>${esc(p.kandidaat)}</td><td>${esc(p.klant)}</td>
        <td class="num">${eur2(i.bedrag_excl)}</td><td class="num muted">${eur2(i.bedrag_excl * btw)}</td>
        <td>${stTag}</td><td class="right" onclick="event.stopPropagation()">${act}</td></tr>`;
    }).join('');
    return `<div class="panel mb"><div class="spread mb"><h2>${k === 'zonder' ? 'Zonder datum' : fmtMaand(k)}</h2>
      <span class="muted">${xs.length} termijn(en) · ${eur(tot)} excl. btw</span></div>
      <div class="table-wrap"><table>
      <tr><th>Gepland</th><th>Termijn</th><th>Kandidaat</th><th>Klant</th><th class="num">Excl.</th><th class="num">Incl.</th><th>Status</th><th></th></tr>
      ${rows}</table></div></div>`;
  }).join('');

  root.innerHTML = `
    <div class="spread mb"><h1>Facturatie</h1>
      <div class="row">
        <select id="fFilter" style="width:auto">
          <option value="actueel" ${factFilter.status === 'actueel' ? 'selected' : ''}>Actueel (open + te factureren)</option>
          <option value="te_factureren" ${factFilter.status === 'te_factureren' ? 'selected' : ''}>Te factureren</option>
          <option value="gefactureerd" ${factFilter.status === 'gefactureerd' ? 'selected' : ''}>Wacht op betaling</option>
          <option value="betaald" ${factFilter.status === 'betaald' ? 'selected' : ''}>Betaald</option>
          <option value="vervallen" ${factFilter.status === 'vervallen' ? 'selected' : ''}>Vervallen</option>
          <option value="alles" ${factFilter.status === 'alles' ? 'selected' : ''}>Alles</option>
        </select>
        <select id="fKlant" style="width:auto">
          <option value="">Alle klanten</option>
          ${klanten.map(k => `<option ${factFilter.klant === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}
        </select>
      </div></div>
    ${crediteurenHtml()}
    ${blokken || '<div class="empty">Niets gevonden met dit filter.</div>'}`;

  $('#fFilter').onchange = e => { factFilter.status = e.target.value; rerender(); };
  $('#fKlant').onchange = e => { factFilter.klant = e.target.value; rerender(); };
  root.addEventListener('click', async e => {
    const f = e.target.closest('[data-fact]');
    if (f) return markeerInstallment(D.installments.find(i => i.id === +f.dataset.fact), 'gefactureerd');
    const pd = e.target.closest('[data-paid]');
    if (pd) return markeerInstallment(D.installments.find(i => i.id === +pd.dataset.paid), 'betaald');
    const tr = e.target.closest('tr[data-open]');
    if (tr) openPlacementDetail(tr.dataset.open);
  });
}
