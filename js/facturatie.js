// ═══ VIEW: Facturatie — volledig termijnschema, filterbaar ═══

let factFilter = { status: 'actueel', klant: '' };

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
