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
      const dgnTot = i.status === 'gefactureerd' && vv ? daysBetween(t, vv) : null;
      const stTag = { te_factureren: missed ? tag('GEMIST', 'red') : tag('te factureren', 'amber'), gefactureerd: late ? tag(late + ' dgn te laat', 'red') : dgnTot != null && dgnTot <= 7 ? tag(`vervalt over ${dgnTot} dgn`, 'amber') : tag('wacht op betaling', 'blue'), betaald: tag('betaald', 'green'), vervallen: tag('vervallen', 'gray') }[i.status];
      let act = '';
      if (i.status === 'te_factureren') act = `<button class="btn small primary" data-fact="${i.id}">Gefactureerd ✓</button>`;
      if (i.status === 'gefactureerd') act = `<button class="btn small primary" data-paid="${i.id}">Betaald ✓</button>`;
      return `<tr class="clickable ${i.status === 'vervallen' ? 'dim' : ''}" data-open="${esc(p.id)}">
        <td>${fmtD(i.geplande_datum)}</td><td><b>${esc(p.id)}</b> · t${i.termijn_nr}</td>
        <td>${esc(p.kandidaat)}</td><td>${esc(p.klant)}</td>
        <td class="num">${eur2(i.bedrag_excl)}</td><td class="num muted">${eur2(i.bedrag_excl * btw)}</td>
        <td>${stTag}</td><td class="right">${act}</td></tr>`;
    }).join('');
    return `<div class="panel mb"><div class="spread mb"><h2>${k === 'zonder' ? 'Zonder datum' : fmtMaand(k)}</h2>
      <span class="muted">${xs.length} termijn(en) · ${eur(tot)} excl. btw</span></div>
      <div class="table-wrap"><table>
      <tr><th>Gepland</th><th>Termijn</th><th>Kandidaat</th><th>Klant</th><th class="num">Excl.</th><th class="num">Incl.</th><th>Status</th><th></th></tr>
      ${rows}</table></div></div>`;
  }).join('');

  // ── wacht op betaling, op vervaldatum: hier stuur je op vóórdat iets te laat is ──
  const btwF = btw;
  const openInv = D.installments.filter(i => i.status === 'gefactureerd').map(i => {
    const p = D.placements.find(x => x.id === i.placement_id);
    if (!p) return null;
    const vv = vervaldatum(i, p);
    return { i, p, vv, dgn: vv ? daysBetween(t, vv) : null };
  }).filter(Boolean).sort((a, b) => (a.vv || '9999').localeCompare(b.vv || '9999'));
  const somI = xs => xs.reduce((s, x) => s + x.i.bedrag_excl * btwF, 0);
  const teLaatI = openInv.filter(x => x.dgn != null && x.dgn < 0);
  const dezeWk = openInv.filter(x => x.dgn != null && x.dgn >= 0 && x.dgn <= 7);
  const vvTag = d => d == null ? tag('geen termijn', 'gray')
    : d < 0 ? tag(`${-d} dgn te laat`, 'red')
    : d === 0 ? tag('vervalt vandaag', 'red')
    : d <= 7 ? tag(`vervalt over ${d} dgn`, 'amber')
    : `<span class="muted">over ${d} dgn</span>`;
  const bewakingHtml = openInv.length ? `
    <div class="panel mb"><div class="spread mb"><h2>💳 Wacht op betaling <span class="muted">— op volgorde van vervaldatum</span></h2>
      <span class="muted">${teLaatI.length ? `<b style="color:var(--red,#c0392b)">${teLaatI.length} te laat (${eur(somI(teLaatI))} incl)</b> · ` : ''}${dezeWk.length ? `<b style="color:var(--amber,#a86a1a)">${dezeWk.length} vervalt ≤7 dgn (${eur(somI(dezeWk))} incl)</b> · ` : ''}totaal ${openInv.length} open · ${eur(somI(openInv))} incl. btw</span></div>
      <div class="table-wrap"><table>
      <tr><th>Vervalt</th><th>Kandidaat</th><th>Klant</th><th class="num">Incl. btw</th><th>Status</th><th></th></tr>
      ${openInv.map(({ i, p, vv, dgn }) => `<tr class="clickable" data-open="${esc(p.id)}">
        <td>${vv ? fmtD(vv) : '—'}</td><td>${esc(p.kandidaat)} <span class="muted">t${i.termijn_nr}</span></td><td>${esc(p.klant)}</td>
        <td class="num">${eur2(i.bedrag_excl * btwF)}</td><td>${vvTag(dgn)}</td>
        <td class="right"><button class="btn small primary" data-paid="${i.id}">Betaald ✓</button></td></tr>`).join('')}
      </table></div>
      <p class="muted mt" style="font-size:11px">Vervaldatum = factuurdatum + betaaltermijn van de klant. Amber = deze week bellen/herinneren vóór hij te laat wordt; rood = aanmanen. Betaald wordt ook automatisch gesuggereerd via de Yuki-koppeling.</p></div>` : '';

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
    ${bewakingHtml}
    ${blokken || '<div class="empty">Niets gevonden met dit filter.</div>'}`;

  $('#fFilter').onchange = e => { factFilter.status = e.target.value; rerender(); };
  $('#fKlant').onchange = e => { factFilter.klant = e.target.value; rerender(); };
  /* Geen stopPropagation meer op de knopcel: die hield de klik tegen vóór
     deze handler, waardoor "Gefactureerd ✓" en "Betaald ✓" in deze tab
     niets deden. De knoppen worden hieronder als eerste afgevangen, dus
     de rij-klik (detail openen) gaat er niet alsnog overheen. */
  root.addEventListener('click', async e => {
    const f = e.target.closest('[data-fact]');
    if (f) return markeerInstallment(D.installments.find(i => i.id === +f.dataset.fact), 'gefactureerd');
    const pd = e.target.closest('[data-paid]');
    if (pd) return markeerInstallment(D.installments.find(i => i.id === +pd.dataset.paid), 'betaald');
    const tr = e.target.closest('tr[data-open]');
    if (tr) openPlacementDetail(tr.dataset.open);
  });
}
