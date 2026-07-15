// ═══ VIEW: Vandaag — actielijst, KPI's, risico's ═══

function renderVandaag(root) {
  const k = kpis(), pot = potjes(), con = concentratie();
  const saldo = D.saldi[0];
  const vrij = saldo ? Number(saldo.saldo) - pot.btwPot - pot.vpbPot : null;
  const lijst = acties();
  const proj = projectie(12);

  const kpiHtml = `
  <div class="grid cols-4">
    <div class="kpi"><div class="lbl">Banksaldo${saldo ? ' · ' + fmtD(saldo.datum) : ''}</div>
      <div class="val">${saldo ? eur(saldo.saldo) : '—'}</div>
      <div class="sub">vrij besteedbaar na potjes: <b>${vrij == null ? '—' : eur(vrij)}</b></div></div>
    <div class="kpi ${k.openstaand > 0 ? 'warn' : ''}"><div class="lbl">Openstaand (gefact., niet betaald)</div>
      <div class="val">${eur(k.openstaand)}</div><div class="sub">excl. btw</div></div>
    <div class="kpi"><div class="lbl">Nog te factureren</div>
      <div class="val">${eur(k.nogTeFactureren)}</div><div class="sub">uit lopend factuurschema</div></div>
    <div class="kpi"><div class="lbl">Gefactureerd deze maand</div>
      <div class="val">${eur(k.omzetDezeMaand)}</div>
      <div class="sub">${S('target_omzet_pm') ? 'target ' + eur(S('target_omzet_pm')) : 'nog geen target ingesteld'}</div></div>
  </div>`;

  const actieHtml = lijst.length ? lijst.map((a, idx) => {
    const wie = a.p ? `${esc(a.p.kandidaat)} · ${esc(a.p.klant)}` : (a.c ? `${esc(a.c.naam)} · ${esc(a.c.klant || '')}` : 'Algemeen');
    const bedrag = a.i ? ` · ${eur(a.i.bedrag_excl)} excl. btw` : '';
    const ico = { factureren: '🧾', te_laat: '⏰', vervanging: '🔁', stop: '✂️', afronden: '📥', stop_signaal: '🛑', saldo: '🏦' }[a.soort] || '•';
    let btn = '';
    if (a.soort === 'factureren') btn = `<button class="btn small primary" data-act="factureer" data-idx="${idx}">Gefactureerd ✓</button>`;
    if (a.soort === 'te_laat') btn = `<button class="btn small primary" data-act="betaald" data-idx="${idx}">Betaald ✓</button>`;
    if (a.soort === 'afronden') btn = `<button class="btn small primary" data-act="afronden" data-idx="${idx}">Afronden →</button>`;
    if (a.soort === 'stop') btn = `<button class="btn small danger" data-act="stopverwerk" data-idx="${idx}">Termijnen vervallen</button>`;
    if (a.soort === 'stop_signaal') btn = `<button class="btn small danger" data-act="stopsignaal" data-idx="${idx}">Verwerk stop</button>`;
    if (a.soort === 'saldo') btn = `<button class="btn small primary" data-act="saldo">Saldo bijwerken</button>`;
    if (a.soort === 'vervanging') btn = `<button class="btn small" data-act="openpl" data-pid="${esc(a.p.id)}">Bekijk</button>`;
    return `<div class="actie ${a.urg === 2 ? 'urgent' : 'warn'}">
      <div class="ico">${ico}</div>
      <div class="body"><b>${esc(a.txt)}</b><span>${wie}${bedrag}</span></div>${btn}</div>`;
  }).join('') : `<div class="empty">🎉 Geen openstaande acties — alles is bij.</div>`;

  const risicoHtml = `
    <div class="pot"><span>Grootste klant</span><b>${con.top1 ? esc(con.top1.klant) + ' · ' + pct(con.top1.aandeel) : '—'}</b></div>
    <div class="pot"><span>Top-3 klanten</span><b>${pct(con.top3 || 0)}</b></div>
    ${con.top1 && con.top1.aandeel > .35 ? `<div class="mt">${tag('⚠ hoge afhankelijkheid van ' + con.top1.klant, 'red')}</div>` : ''}
    <div class="pot"><span>Stop-percentage plaatsingen</span><b>${pct(k.stopPct)}</b></div>
    <div class="pot"><span>Vervallen omzet (stops)</span><b>${eur(k.vervallen)}</b></div>
    <div class="pot"><span>DSO (gem. betaalduur)</span><b>${k.dso == null ? '—' : k.dso + ' dgn'}</b></div>`;

  const potHtml = `
    <div class="pot"><span>Btw-potje dit kwartaal <span class="muted">(indicatief)</span></span><b>${eur(pot.btwPot)}</b></div>
    <div class="pot"><span>Vpb-reservering YTD (${pct(Number(S('vpb_pct', .19)))})</span><b>${eur(pot.vpbPot)}</b></div>
    <div class="pot"><span>Samen opzij te zetten</span><b>${eur(pot.btwPot + pot.vpbPot)}</b></div>
    <div class="pot"><span>Winst-indicatie YTD</span><b>${eur(pot.winstYtd)}</b></div>`;

  const adviezen = [];
  if (proj.negatief) adviezen.push(`🔴 In dit scenario komt je saldo in <b>${esc(proj.negatief.label)}</b> onder nul. Kijk op Cashflow welke knop het verschil maakt.`);
  else adviezen.push(`🟢 Laagste punt komende 12 mnd: <b>${eur(proj.laagste.saldo)}</b> in ${esc(proj.laagste.label)}.`);
  adviezen.push(`Zonder nieuwe omzet houd je het <b>${proj.runway >= 12 ? '12+' : proj.runway} maanden</b> vol (runway op huidig factuurschema).`);
  if (con.top1 && con.top1.aandeel > .35) adviezen.push(`⚠ <b>${esc(con.top1.klant)}</b> is ${pct(con.top1.aandeel)} van je pijplijn — één opzegging raakt je hard. Spreiden loont.`);
  if (k.openstaand > 0) adviezen.push(`Er staat <b>${eur(k.openstaand)}</b> (excl. btw) gefactureerd open — bel na wat te laat is.`);

  root.innerHTML = `
    <h1>Vandaag · ${fmtD(todayISO())}</h1>
    <div class="muted mb">${lijst.length} actie${lijst.length === 1 ? '' : 's'} open</div>
    ${kpiHtml}
    <div class="grid cols-2 mt">
      <div class="panel"><h2>📌 Acties</h2>${actieHtml}</div>
      <div>
        <div class="panel mb"><h2>🧠 Advies van je finance agent</h2>${adviezen.map(a => `<div class="pot"><span>${a}</span></div>`).join('')}</div>
        <div class="panel mb"><h2>💰 Belastingpotjes</h2>${potHtml}</div>
        <div class="panel"><h2>⚠️ Risico's</h2>${risicoHtml}</div>
      </div>
    </div>`;

  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = lijst[Number(b.dataset.idx)];
    if (b.dataset.act === 'factureer' && a) await markeerInstallment(a.i, 'gefactureerd');
    if (b.dataset.act === 'betaald' && a) await markeerInstallment(a.i, 'betaald');
    if (b.dataset.act === 'afronden' && a) return openPlacementWizard({ candidate: a.c });
    if (b.dataset.act === 'stopverwerk' && a) await verwerkStop(a.p);
    if (b.dataset.act === 'stopsignaal' && a) return openStopModal(a.p, a.c.gestopt_op);
    if (b.dataset.act === 'saldo') return openSaldoModal();
    if (b.dataset.act === 'openpl') return openPlacementDetail(b.dataset.pid);
  }, { once: false });
}
