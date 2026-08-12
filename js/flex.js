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
      <div class="row"><button class="btn" id="fxPdf">📄 Margefactuur (PDF)</button>
      <button class="btn primary" id="fxNieuw">+ Week invoeren</button></div></div>

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

    <div class="panel mb"><h2>📈 Wekelijkse marge ${uitlegChip('f_marge')}</h2>${chart}</div>

    ${flexPlaatsingenPanel()}

    ${flexFactorPanel()}

    ${flexWeekKrachtPanel()}

    <div class="panel"><h2>Laatste weken (uitbetaald door Pronkert)</h2>
      <div class="table-wrap"><table>
      <tr><th>Week</th><th class="num">Marge excl. btw</th><th class="num">Flexkrachten</th><th>Notitie</th><th></th></tr>
      ${rows || '<tr><td colspan="5" class="empty">Nog geen weken ingevoerd. Zodra de eerste uitbetaling van Pronkert binnen is: invoeren maar.</td></tr>'}
      </table></div>
      <p class="muted mt">Deze weken komen uit de margefacturen van Pronkert: de weekroutine leest ze maandag
        zelf uit de mail, en met 📄 kun je er zelf een inlezen. Bedragen worden telkens opnieuw berekend uit de
        bewaarde factuurregels, dus een factuur twee keer inlezen verandert niets. Alain wordt per 4 weken
        gefactureerd, dus recente weken kunnen tijdelijk lager lijken tot die factuur binnen is. De cashflow
        rekent met het gemiddelde van de laatste 4 weken.</p></div>`;

  $('#fxNieuw').onclick = () => openFlexModal();
  $('#fxPdf').onclick = () => openFlexPdfImport();
  $('#fpNieuw') && ($('#fpNieuw').onclick = () => openFlexPlModal());
  root.addEventListener('click', e => {
    const ed = e.target.closest('[data-fedit]');
    if (ed) return openFlexModal(D.flex.find(w => w.id === +ed.dataset.fedit));
    const del = e.target.closest('[data-fdel]');
    if (del) return (async () => {
      if (!confirm('Deze week verwijderen?')) return;
      await dbWrite('fin_flex_weken', t => t.delete().eq('id', +del.dataset.fdel));
      await reload('fin_flex_weken', 'flex', 'week'); rerender();
    })();
    const pe = e.target.closest('[data-fpedit]');
    if (pe) return openFlexPlModal(D.flexPl.find(f => f.id === +pe.dataset.fpedit));
    const ps = e.target.closest('[data-fpstop]');
    if (ps) return openFlexStopModal(D.flexPl.find(f => f.id === +ps.dataset.fpstop));
    const pd = e.target.closest('[data-fpdel]');
    if (pd) return (async () => {
      if (!confirm('Deze flex-plaatsing verwijderen?')) return;
      await dbWrite('fin_flex_plaatsingen', t => t.delete().eq('id', +pd.dataset.fpdel));
      await reload('fin_flex_plaatsingen', 'flexPl', 'id'); rerender();
    })();
  });
}

// ── flex-plaatsingen (marge-motor) ─────────────────────────────
function flexPlRij(r, afgerond = false) {
  const f = r.f;
  const tags = [];
  if (f.concept) tags.push(tag('✨ vul aan', 'amber'));
  else if (!r.compleet) tags.push(tag('uurloon/factor mist', 'gray'));
  return `<tr>
    <td><b>${esc(f.kandidaat)}</b><br><span class="muted">${esc(f.klant)}${afgerond && f.gestopt_op ? ' · gestopt ' + fmtD(f.gestopt_op) : ''}</span> ${tags.join(' ')}</td>
    <td class="num">${r.uurloon ? eur2(r.uurloon) : '—'}</td>
    <td class="num">${r.klantfactor ? r.klantfactor.toFixed(2) : '—'} <span class="muted">− ${r.inkoop.toFixed(2)}</span></td>
    <td class="num">${r.margePerUur != null ? eur2(r.margePerUur) : '—'}</td>
    ${afgerond
      ? `<td class="num">${r.gewerkteUren != null ? r.gewerkteUren + ' u' : '<span class="muted">uren?</span>'}</td>
         <td class="num">${r.verdiend != null ? `<b style="color:var(--green)">${eur(r.verdiend)}</b>${r.margeWerkelijk != null ? ' <span class="muted" title="werkelijke marge uit de Pronkert-facturen">✓</span>' : ''}` : '—'}</td>`
      : `<td class="num">${r.gewerkteUren != null ? `${r.gewerkteUren} u${r.verdiend != null ? ` · <b style="color:var(--green)">${eur(r.verdiend)}</b>${r.margeWerkelijk != null ? ' <span class="muted" title="werkelijke marge uit de Pronkert-facturen">✓</span>' : ''}` : ''}` : '<span class="muted">—</span>'}</td>
         <td class="num">${r.resterendUren != null ? `<b>nog ${Math.round(r.resterendUren)} u</b>${r.overnameWaarde != null ? `<br><span class="muted">waarde ${eur(r.overnameWaarde)}</span>` : ''}` : (r.overnameWaarde != null ? `<b>${eur(r.overnameWaarde)}</b>` : '<span class="muted">overname-uren? ✎</span>')}</td>`}
    <td class="right"><button class="btn small ghost" data-fpedit="${f.id}">✎</button>
      ${afgerond ? '' : `<button class="btn small ghost" data-fpstop="${f.id}" title="Gestopt">⏹</button>`}
      <button class="btn small ghost" data-fpdel="${f.id}">✕</button></td></tr>`;
}

function flexPlaatsingenPanel() {
  const st = flexPlStats();
  const actiefRows = st.rows.map(r => flexPlRij(r, false)).join('');
  const afgerondRows = st.gestoptRows.map(r => flexPlRij(r, true)).join('');
  return `<div class="panel mb"><div class="spread mb"><h2>👷 Flexkrachten via Pronkert ${uitlegChip('f_krachten')}</h2>
      <button class="btn primary small" id="fpNieuw">+ Flexkracht</button></div>
    <div class="grid cols-4 mb">
      <div class="kpi"><div class="lbl">Actief lopend</div><div class="val">${st.nActief}</div><div class="sub">${st.nConcept ? st.nConcept + ' nog aan te vullen' : 'via Pronkert'}</div></div>
      <div class="kpi good"><div class="lbl">Verwachte marge p/m</div><div class="val">${eur(st.margePerMaand)}</div><div class="sub">op contracturen</div></div>
      <div class="kpi"><div class="lbl">Overname-potentieel</div><div class="val">${eur(st.overnamePotentieel)}</div><div class="sub">tot kosteloze overname</div></div>
      <div class="kpi good"><div class="lbl">Verdiend over gewerkte uren</div><div class="val">${eur(st.verdiendTotaal)}</div><div class="sub">${st.nGestopt ? 'incl. ' + eur(st.verdiendAfgerond) + ' afgerond' : 'werkelijk gemaakt'}</div></div>
    </div>
    <h3>Actief lopend</h3>
    <div class="table-wrap"><table>
    <tr><th>Flexkracht</th><th class="num">Uurloon</th><th class="num">Factor</th><th class="num">Marge/uur</th><th class="num">Gewerkt · verdiend</th><th class="num">Tot kosteloze overname</th><th></th></tr>
    ${actiefRows || '<tr><td colspan="7" class="empty">Geen actieve flexkrachten. Ze verschijnen automatisch vanuit het bord (Contract getekend, type Flex).</td></tr>'}
    </table></div>
    ${st.nGestopt ? `<h3 class="mt">Afgerond / gestopt — verdiende marge</h3>
    <div class="table-wrap"><table>
    <tr><th>Flexkracht</th><th class="num">Uurloon</th><th class="num">Factor</th><th class="num">Marge/uur</th><th class="num">Gewerkte uren</th><th class="num">Verdiend</th><th></th></tr>
    ${afgerondRows}</table></div>` : ''}
    <p class="muted mt">Marge/uur = (klantfactor − inkoopfactor Pronkert) × uurloon. <b>Verdiend</b> = de werkelijke marge uit de Pronkert-facturen (✓, incl. overwerk/toeslagen) of anders marge/uur × gewerkte uren. <b>Tot kosteloze overname</b> = afgesproken overname-uren − gewerkte uren; staat er "overname-uren? ✎", vul dan de afspraak in. Uren en marge worden automatisch bijgewerkt via de margefactuur-import (📄).</p></div>`;
}

function openFlexStopModal(fp) {
  const b = flexPlBerekening(fp);
  // schat gewerkte uren op basis van startdatum als er nog niets is ingevuld
  const wkn = fp.start ? Math.max(0, daysBetween(fp.start, todayISO()) / 7) : 0;
  const schatUren = Math.round(wkn * (Number(fp.uren_pw) || 40));
  openModal(`
    <div class="modal-head"><h2>Flexkracht stoppen · ${esc(fp.kandidaat)}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div><label>Gestopt op</label><input id="fs_datum" type="date" value="${todayISO()}"></div>
      <div><label>Totaal gewerkte uren</label><input id="fs_uren" type="number" step="1" value="${fp.gewerkte_uren ?? schatUren}"></div>
    </div>
    <div id="fs_preview" class="note"></div>
    <p class="muted">De verdiende marge = marge/uur × gewerkte uren. Dit blijft geteld als gemaakt geld, maar de flexkracht verdwijnt uit "actief lopend".</p>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="fs_ok">Stoppen & vastleggen</button></div>`, { narrow: true });
  const prev = () => {
    const u = Number($('#fs_uren').value || 0);
    $('#fs_preview').innerHTML = b.margePerUur != null
      ? `${eur2(b.margePerUur)}/uur × ${u} uur = verdiend <b style="color:var(--green)">${eur(b.margePerUur * u)}</b>`
      : 'Vul eerst uurloon + factor in (via ✎) om de verdiende marge te zien.';
  };
  $('#fs_uren').addEventListener('input', prev); prev();
  $('#fs_ok').onclick = async () => {
    await dbWrite('fin_flex_plaatsingen', t => t.update({
      gestopt_op: $('#fs_datum').value, gewerkte_uren: $('#fs_uren').value ? Number($('#fs_uren').value) : null,
    }).eq('id', fp.id));
    await reload('fin_flex_plaatsingen', 'flexPl', 'id');
    closeModal(); toast('Flexkracht afgerond ✓'); rerender();
  };
}

function openFlexPlModal(fp = null) {
  const klanten = [...new Set([...D.flexAfspr.map(a => a.klant), ...D.flexPl.map(f => f.klant), ...D.clients.map(c => c.naam)])].sort();
  const afspr = fp ? flexAfspraakVoor(fp.klant) : null;
  openModal(`
    <div class="modal-head"><h2>${fp ? 'Flexkracht bewerken' : 'Nieuwe flexkracht'}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div><label>Naam</label><input id="fp_naam" value="${esc(fp?.kandidaat || '')}"></div>
      <div><label>Klant</label><input id="fp_klant" list="fpKlant" value="${esc(fp?.klant || '')}">
        <datalist id="fpKlant">${klanten.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
      <div><label>Bruto uurloon (€)</label><input id="fp_uurloon" type="number" step="0.01" value="${fp?.uurloon ?? ''}"></div>
      <div><label>Klantfactor</label><input id="fp_factor" type="number" step="0.01" value="${fp?.klantfactor ?? ''}" placeholder="${afspr ? afspr.factor : 'bijv. 2.45'}"></div>
      <div><label>Inkoopfactor Pronkert</label><input id="fp_inkoop" type="number" step="0.01" value="${fp?.inkoop_factor ?? ''}" placeholder="${S('flex_inkoop_factor', 1.8)}"></div>
      <div><label>Uren per week</label><input id="fp_uren" type="number" step="1" value="${fp?.uren_pw ?? 40}"></div>
      <div><label>Kosteloze overname na (uren)</label><input id="fp_overname" type="number" step="1" value="${fp?.overname_uren ?? ''}" placeholder="${afspr?.overname_uren ?? 'bijv. 1200'}"></div>
      <div><label>Startdatum</label><input id="fp_start" type="date" value="${esc(fp?.start || todayISO())}"></div>
      <div><label>Gewerkte uren tot nu (optioneel)</label><input id="fp_gewerkt" type="number" step="1" value="${fp?.gewerkte_uren ?? ''}"></div>
    </div>
    <div id="fp_preview" class="note"></div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="fp_save">Opslaan</button></div>`);

  const preview = () => {
    const dummy = {
      klant: $('#fp_klant').value, uurloon: $('#fp_uurloon').value, klantfactor: $('#fp_factor').value,
      inkoop_factor: $('#fp_inkoop').value, uren_pw: $('#fp_uren').value, overname_uren: $('#fp_overname').value,
    };
    const b = flexPlBerekening(dummy);
    $('#fp_preview').innerHTML = b.compleet
      ? `Marge/uur = (${b.klantfactor.toFixed(2)} − ${b.inkoop.toFixed(2)}) × ${eur2(b.uurloon)} = <b>${eur2(b.margePerUur)}</b> · per maand ~<b>${eur(b.margePerMaand)}</b>${b.overnameWaarde ? ` · tot overname (${b.overnameUren} u): <b>${eur(b.overnameWaarde)}</b>` : ''}`
      : 'Vul uurloon én klantfactor in om de marge te zien.';
  };
  ['fp_klant', 'fp_uurloon', 'fp_factor', 'fp_inkoop', 'fp_uren', 'fp_overname'].forEach(id => $('#' + id).addEventListener('input', preview));
  preview();

  $('#fp_save').onclick = async () => {
    const row = {
      kandidaat: $('#fp_naam').value.trim(), klant: $('#fp_klant').value.trim(),
      uurloon: $('#fp_uurloon').value ? Number($('#fp_uurloon').value) : null,
      klantfactor: $('#fp_factor').value ? Number($('#fp_factor').value) : null,
      inkoop_factor: $('#fp_inkoop').value ? Number($('#fp_inkoop').value) : null,
      overname_uren: $('#fp_overname').value ? Number($('#fp_overname').value) : null,
      uren_pw: Number($('#fp_uren').value || 40), start: $('#fp_start').value || null, concept: false,
      gewerkte_uren: $('#fp_gewerkt').value ? Number($('#fp_gewerkt').value) : null,
    };
    if (!row.kandidaat || !row.klant) return toast('Naam en klant zijn verplicht', true);
    await dbWrite('fin_flex_plaatsingen', t => fp ? t.update(row).eq('id', fp.id) : t.insert(row));
    await reload('fin_flex_plaatsingen', 'flexPl', 'id');
    closeModal(); toast('Flexkracht opgeslagen ✓'); rerender();
  };
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

// ── margefactuur-PDF van Pronkert importeren ───────────────────
// Wekelijkse creditfactuur: per flexkracht per dag de marge; onderaan totaal excl. btw.
function maandagVanIsoWeek(jaar, week) {
  const j4 = new Date(Date.UTC(jaar, 0, 4));
  const dow = (j4.getUTCDay() + 6) % 7;                   // ma=0
  const ma1 = new Date(j4); ma1.setUTCDate(j4.getUTCDate() - dow + (week - 1) * 7);
  return ma1.toISOString().slice(0, 10);
}

let _pdfjsPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror = () => rej(new Error('pdf.js laden mislukt (offline?)'));
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

async function pdfTekst(arrayBuffer) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: arrayBuffer }).promise;
  let tekst = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    tekst += tc.items.map(x => x.str).join(' ') + '\n';
  }
  return tekst;
}

// De oude client-side parser (parseMargeFactuur) is op 10 aug 2026 verwijderd.
// Het lezen gebeurt nu op één plek: de Edge Function. Twee lezers naast elkaar
// gaan onherroepelijk uit elkaar lopen, en dan verschilt wat je op het scherm
// ziet van wat er in de database staat.

// koppel een factuur-flexkracht aan een fin_flex_plaatsingen-rij (roepnaam of achternaam)
function matchFlexPl(k) {
  const lc = s => (s || '').toLowerCase();
  const achternaam = lc(k.naam).split(' ').pop();
  return D.flexPl.find(f => {
    const kand = lc(f.kandidaat);
    return kand.includes(lc(k.roepnaam)) || (achternaam.length > 3 && kand.includes(achternaam));
  }) || null;
}

// ── Wat de margefacturen zeggen ────────────────────────────────
const uur2 = x => (Math.round((+x || 0) * 100) / 100).toString().replace('.', ',') + ' u';
const f4 = x => (x == null || !isFinite(x)) ? '—' : Number(x).toFixed(4).replace('.', ',');

function flexFactorPanel() {
  const lijst = flexFactoren();
  if (!lijst.length) return '';
  const inkStd = Number(S('flex_inkoop_factor', 1.8)) || 1.8;

  /* De factuur is leidend: bij elke import worden uurloon, inkoop- en
     klantfactor op de plaatsing bijgewerkt. Staat er nog een andere factor op,
     dan rekent de app vooruit met een ander getal dan Pronkert factureert. */
  const afwijkers = lijst.filter(k => {
    const pl = matchFlexPl({ naam: k.naam, roepnaam: k.naam });
    const opPl = pl && pl.inkoop_factor != null ? Number(pl.inkoop_factor) : inkStd;
    return k.inkoopfactor && Math.abs(k.inkoopfactor - opPl) > 0.005;
  });

  const rows = lijst.map(k => `<tr>
    <td><b>${esc(k.naam)}</b><div class="muted">${esc(k.functie || k.klant || '')}${k.regnr ? ' · reg. ' + esc(k.regnr) : ''}</div></td>
    <td class="num">${eur2(k.uurloon)}</td>
    <td class="num"><b>${f4(k.inkoopfactor)}×</b><div class="muted">${eur2(k.inkooptarief)}/uur</div></td>
    <td class="num"><b>${f4(k.klantfactor)}×</b><div class="muted">${eur2(k.klanttarief)}/uur</div></td>
    <td class="num"><b>${f4(k.margefactor)}×</b></td>
    <td class="num">${eur2(k.margePerUur)}</td>
    <td class="num">${k.margePct == null ? '—' : pct(k.margePct)}</td>
    <td class="num">${uur2(k.uren)}</td>
    <td class="num"><b>${eur(k.marge)}</b><div class="muted">van ${eur(k.klantomzet)} omzet</div></td></tr>`).join('');

  return `<div class="panel mb"><h2>🔍 Tariefopbouw per flexkracht — van de margefactuur</h2>
    ${afwijkers.length ? `<div class="tag amber mb">De plaatsing rekent nog met een andere inkoopfactor dan de factuur:
      ${afwijkers.map(k => `${esc(k.naam)} → Pronkert factureert <b>${f4(k.inkoopfactor)}×</b>`).join(' · ')}.
      Bij de eerstvolgende import wordt dat gelijkgetrokken — de factuur is leidend.</div>` : ''}
    <div class="table-wrap"><table>
      <tr><th>Flexkracht</th><th class="num">Uurloon</th><th class="num">Inkoop Pronkert</th>
        <th class="num">Klant betaalt</th><th class="num">Marge-factor</th><th class="num">Marge/uur</th>
        <th class="num">Marge %</th><th class="num">Uren</th><th class="num">Verdiend</th></tr>
      ${rows}
    </table></div>
    <p class="muted mt">Inkoop = uurloon × factor van Pronkert. Klant betaalt = het tarief op dezelfde regel.
      Marge-factor = klantfactor − inkoopfactor; × het uurloon geeft de marge per uur. Factoren komen uit de
      laatste week met normale uren — overwerk en eindejaarsuitkering/atv lopen op een eigen factor, maar
      tellen wel mee in het bedrag en het percentage.</p></div>`;
}

function flexWeekKrachtPanel() {
  const pwk = flexPerWeekKracht(13);
  if (!pwk.rijen.length) return '';
  const cel = c => c ? `<b>${eur(c.marge)}</b><div class="muted">${uur2(c.uren)}</div>` : '<span class="muted">—</span>';
  const somK = s => pwk.rijen.reduce((a, w) => {
    const c = w.per.get(s); return { m: a.m + (c ? c.marge : 0), u: a.u + (c ? c.uren : 0) };
  }, { m: 0, u: 0 });
  return `<div class="panel mb"><h2>📅 Per week en per persoon</h2>
    <div class="table-wrap"><table>
      <tr><th>Week</th>${pwk.kolommen.map(k => `<th class="num">${esc(k.naam)}</th>`).join('')}
        <th class="num">Totaal</th><th class="num">Uren</th></tr>
      ${pwk.rijen.map(w => `<tr><td><b>${fmtD(w.week)}</b></td>
        ${pwk.kolommen.map(k => `<td class="num">${cel(w.per.get(k.sleutel))}</td>`).join('')}
        <td class="num"><b>${eur(w.bedrag)}</b></td>
        <td class="num">${uur2(w.uren)}</td></tr>`).join('')}
      <tr><td><b>Totaal ${pwk.rijen.length} ${pwk.rijen.length === 1 ? 'week' : 'weken'}</b></td>
        ${pwk.kolommen.map(k => { const s = somK(k.sleutel);
          return `<td class="num"><b>${eur(s.m)}</b><div class="muted">${uur2(s.u)}</div></td>`; }).join('')}
        <td class="num"><b>${eur(pwk.rijen.reduce((a, w) => a + w.bedrag, 0))}</b></td>
        <td class="num">${uur2(pwk.rijen.reduce((a, w) => a + w.uren, 0))}</td></tr>
    </table></div>
    <p class="muted mt">Rechtstreeks uit de margefacturen van Pronkert. Uren zijn gewerkte uren —
      eindejaarsuitkering en atv leveren wel marge op, maar geen uren.</p></div>`;
}

// De Edge Function die het schrijfwerk doet. Heet in Supabase `dynamic-worker`
// (naam die het dashboard zelf verzon bij deploy-via-editor); de code staat in
// het CRM onder supabase/functions/pronkert-marge/.
async function margeFunctie(body) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('geen actieve sessie — log opnieuw in');
  const r = await fetch(SUPABASE_URL + '/functions/v1/dynamic-worker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
    body: JSON.stringify(body)
  });
  const uit = await r.json().catch(() => ({}));
  if (r.status === 404 || r.status === 503) throw Object.assign(new Error('nog niet gedeployed'), { setup: true });
  if (!r.ok) {
    const reden = typeof uit.error === 'string' ? uit.error : (uit.error && uit.error.message) || '';
    throw new Error(reden || ('de functie gaf status ' + r.status));
  }
  return uit;
}

function openFlexPdfImport() {
  openModal(`
    <div class="modal-head"><h2>📄 Margefactuur importeren</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <p class="muted mb">Kies de wekelijkse marge-factuur (PDF) van Pronkert. Je ziet eerst wat eruit komt;
      opslaan doe je daarna zelf. Dezelfde factuur twee keer inlezen kan geen kwaad — de cijfers worden
      opnieuw berekend, niet opgeteld. Normaal doet de weekroutine dit maandag vanzelf.</p>
    <input type="file" id="fxpdfFile" accept=".pdf,application/pdf">
    <div id="fxpdfPrev" class="mt"></div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Sluiten</button>
    <button class="btn primary" id="fxpdfGo" disabled>Importeren</button></div>`);
  let tekst = null;
  /* De tekstlaag van de PDF gaat naar de Edge Function; die leest hem én doet
     het schrijfwerk. Zo kan dit scherm nooit iets anders tonen dan wat er wordt
     opgeslagen, en telt niets dubbel: weekbedrag, gewerkte uren en verdiende
     marge worden afgeleid uit de bewaarde factuurregels, nooit opgeteld bij een
     vorige stand. (Vóór 10 aug 2026 telde deze knop uren erbij op — dat botst
     met de nieuwe berekening en is daarom weg.) */
  const melding = (kl, t) => { $('#fxpdfPrev').innerHTML = `<div class="tag ${kl}">${esc(t)}</div>`; };
  const nietGedeployed = () => melding('amber',
    'De functie dynamic-worker staat niet in Supabase. Zie SETUP-PRONKERT.md in het CRM.');

  $('#fxpdfFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#fxpdfPrev').innerHTML = '<span class="muted">Lezen…</span>';
    $('#fxpdfGo').disabled = true;
    try {
      tekst = await pdfTekst(await f.arrayBuffer());
    } catch (err) { melding('red', 'PDF lezen mislukt: ' + err.message); return; }
    try {
      const uit = await margeFunctie({ tekst, droog: true });
      if (uit.waarschuwing) { tekst = null; return melding('red', uit.waarschuwing); }
      const weken = uit.weken || [];
      if (!weken.length) { tekst = null; return melding('red', 'Geen factuurregels herkend — is dit de margefactuur van Pronkert?'); }
      $('#fxpdfPrev').innerHTML = `
        <div class="pot"><span>Factuur</span><b>${esc(uit.factuur || '—')}${uit.factuurdatum ? ' · ' + fmtD(uit.factuurdatum) : ''}</b></div>
        <div class="pot"><span>Totaal marge excl. btw</span><b>${eur2(uit.totaal)}</b></div>
        <div class="pot"><span>Regels</span><b>${uit.aantal_regels || 0}</b></div>
        ${weken.map(w => `<div class="mt"><b>Week ${esc(String(w.weeknr))}</b> <span class="muted">(ma ${fmtD(w.week)})</span>
          — <b>${eur2(w.bedrag)}</b> <span class="muted">over ${uur2(w.uren)}ur</span>
          ${(w.krachten || []).map(k => `<div class="pot"><span>· ${esc(k.roepnaam || k.naam)} — ${uur2(k.uren)}ur</span>
            <b>${eur2(k.marge)}${k.marge_per_uur != null ? ` <span class="muted">(${eur2(k.marge_per_uur)}/uur · inkoop ${f4(k.inkoopfactor)}× · klant ${f4(k.klantfactor)}×)</span>` : ''}</b></div>`).join('')}
        </div>`).join('')}
        <p class="muted mt">De optelling van de regels komt exact uit op het factuurtotaal.</p>`;
      $('#fxpdfGo').disabled = false;
    } catch (err) {
      tekst = null;
      if (err.setup) nietGedeployed(); else melding('red', 'Lezen mislukt: ' + err.message);
    }
  };

  $('#fxpdfGo').onclick = async () => {
    if (!tekst) return;
    $('#fxpdfGo').disabled = true;
    try {
      const uit = await margeFunctie({ tekst });
      if (uit.waarschuwing) { $('#fxpdfGo').disabled = false; return melding('red', uit.waarschuwing); }
      await reload('fin_flex_weken', 'flex', 'week');
      await reload('fin_flex_plaatsingen', 'flexPl', 'id');
      await reload('fin_flex_regels', 'flexRegels', 'week');
      const n = (uit.weken || []).length, onb = (uit.onbekend || []).length;
      closeModal();
      toast(`${n} ${n === 1 ? 'week' : 'weken'} bijgewerkt ✓${onb ? ` · ${onb} flexkracht${onb === 1 ? '' : 'en'} nog niet gekoppeld` : ''}`);
      rerender();
    } catch (err) {
      $('#fxpdfGo').disabled = false;
      if (err.setup) nietGedeployed(); else toast('Importeren mislukt: ' + err.message, true);
    }
  };
}
