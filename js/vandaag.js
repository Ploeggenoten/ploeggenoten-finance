// ═══ VIEW: Vandaag — actielijst, KPI's, risico's ═══

function renderVandaag(root) {
  const k = kpis(), pot = potjes(), con = concentratie();
  const saldo = D.saldi[0];
  const vrij = saldo ? Number(saldo.saldo) - pot.btwPot - pot.vpbPot : null;
  const lijst = acties();
  const proj = projectie(12);

  const fx = flexStats();
  const tgt = targetInfo();
  const kpiHtml = `
  <div class="grid cols-4">
    <div class="kpi" data-uitleg="saldo" style="cursor:pointer"><div class="lbl">Banksaldo${saldo ? ' · ' + fmtD(saldo.datum) : ''} ${uitlegChip('saldo', 'ℹ️')}</div>
      <div class="val">${saldo ? eur(saldo.saldo) : '—'}</div>
      <div class="sub">vrij besteedbaar na potjes: <b>${vrij == null ? '—' : eur(vrij)}</b></div></div>
    <div class="kpi ${k.openstaand > 0 ? 'warn' : ''}" data-uitleg="v_openstaand" style="cursor:pointer"><div class="lbl">Openstaand (gefact., niet betaald) ${uitlegChip('v_openstaand', 'ℹ️')}</div>
      <div class="val">${eur(k.openstaand)}</div><div class="sub">excl. btw</div></div>
    <div class="kpi ${tgt.aantalTarget && tgt.plaatsingen >= tgt.aantalTarget ? 'good' : ''}" data-uitleg="dezemaand" style="cursor:pointer"><div class="lbl">Deze maand${tgt.aantalTarget ? ' · target bord' : ''} ${uitlegChip('dezemaand', 'ℹ️')}</div>
      <div class="val">${tgt.aantalTarget ? `${tgt.plaatsingen} / ${tgt.aantalTarget}` : eur(k.omzetDezeMaand)}</div>
      <div class="sub">${tgt.aantalTarget
        ? `plaatsingen · gefactureerd ${eur(k.omzetDezeMaand)}${tgt.omzetTarget ? ' van ~' + eur(tgt.omzetTarget) : ''}`
        : 'gefactureerd; nog te factureren: ' + eur(k.nogTeFactureren)}</div></div>
    <div class="kpi" data-uitleg="v_flex" style="cursor:pointer"><div class="lbl">Flex (run-rate p/m) ${uitlegChip('v_flex', 'ℹ️')}</div>
      <div class="val">${fx.maandRunRate ? eur(fx.maandRunRate) : '—'}</div>
      <div class="sub">${fx.laatste ? 'laatste week ' + eur(fx.laatste.bedrag) : 'nog geen weken ingevoerd'}</div></div>
  </div>`;

  const actieHtml = lijst.length ? lijst.map((a, idx) => {
    const wie = a.p ? `${esc(a.p.kandidaat)} · ${esc(a.p.klant)}` : (a.c ? `${esc(a.c.naam)} · ${esc(a.c.klant || '')}` : 'Algemeen');
    const bedrag = a.i ? ` · ${eur(a.i.bedrag_excl)} excl. btw` : '';
    const ico = { factureren: '🧾', te_laat: '⏰', vervanging: '🔁', stop: '✂️', afronden: '📥', stop_signaal: '🛑', saldo: '🏦', flex: '🟢', concept: '✨' }[a.soort] || '•';
    let btn = '';
    if (a.soort === 'factureren') btn = `<button class="btn small primary" data-act="factureer" data-idx="${idx}">Gefactureerd ✓</button>`;
    if (a.soort === 'te_laat') btn = `<button class="btn small primary" data-act="betaald" data-idx="${idx}">Betaald ✓</button>`;
    if (a.soort === 'afronden') btn = `<button class="btn small primary" data-act="afronden" data-idx="${idx}">Afronden →</button>`;
    if (a.soort === 'stop') btn = `<button class="btn small danger" data-act="stopverwerk" data-idx="${idx}">Termijnen vervallen</button>`;
    if (a.soort === 'stop_signaal') btn = `<button class="btn small danger" data-act="stopsignaal" data-idx="${idx}">Verwerk stop</button>`;
    if (a.soort === 'saldo') btn = `<button class="btn small primary" data-act="saldo">Saldo bijwerken</button>`;
    if (a.soort === 'flex') btn = `<button class="btn small primary" data-act="flexin">Invullen →</button>`;
    if (a.soort === 'concept') btn = `<button class="btn small primary" data-act="openpl" data-pid="${esc(a.p.id)}">Controleren →</button>`;
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

  const bw = yukiBewaking();
  const potHtml = `
    <div class="pot"><span>Btw-potje dit kwartaal <span class="muted">(indicatief)</span></span><b>${eur(pot.btwPot)}</b></div>
    <div class="pot"><span>Vpb-reservering YTD (${pct(Number(S('vpb_pct', .19)))})</span><b>${eur(pot.vpbPot)}</b></div>
    <div class="pot"><span>Samen opzij te zetten</span><b>${eur(pot.btwPot + pot.vpbPot)}</b></div>
    <div class="pot"><span>Winst-indicatie YTD${S('yuki_synced_at') ? ' <span class="muted">(live uit Yuki)</span>' : ''}</span><b>${eur(pot.winstYtd)}</b></div>
    ${bw && bw.crediteuren > 0 ? `<div class="pot"><span>Nog te betalen inkoopfacturen (Yuki)</span><b>${eur(bw.crediteuren)}</b></div>` : ''}`;

  const top = adviesEngine().filter(a => a.urg >= 2).slice(0, 4);
  const iconOf = { gevaar: '🔴', kans: '🟡', sterkte: '🟢' };
  const adviesHtml = (top.length ? top.map(a =>
    `<div class="pot"><span>${iconOf[a.cat]} <b>${esc(a.titel)}</b> — ${esc(a.cijfer || '')}<br><span class="muted">${esc(a.actie || a.tekst)}</span></span></div>`).join('')
    : `<div class="pot"><span>🟢 Geen urgente signalen. Laagste saldopunt komende 12 mnd: <b>${eur(proj.laagste.saldo)}</b> (${esc(proj.laagste.label)}).</span></div>`)
    + `<div class="mt right"><button class="btn small" id="naarAdvies">Alle adviezen →</button></div>`;

  root.innerHTML = `
    <h1>Vandaag · ${fmtD(todayISO())}</h1>
    <div class="muted mb">${lijst.length} actie${lijst.length === 1 ? '' : 's'} open</div>
    ${kpiHtml}
    <div class="grid cols-2 mt">
      <div class="panel"><h2>📌 Acties ${uitlegChip('v_acties')}</h2>${actieHtml}</div>
      <div>
        <div class="panel mb"><h2>🧠 Advies van je finance agent ${uitlegChip('v_agent')}</h2>${adviesHtml}</div>
        <div class="panel mb"><h2>💰 Belastingpotjes ${uitlegChip('v_potjes')}</h2>${potHtml}</div>
        <div class="panel"><h2>⚠️ Risico's ${uitlegChip('v_risico')}</h2>${risicoHtml}</div>
      </div>
    </div>`;
  $('#naarAdvies').onclick = () => switchView('advies');

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
    if (b.dataset.act === 'flexin') return switchView('flex');
    if (b.dataset.act === 'openpl') return openPlacementDetail(b.dataset.pid);
  }, { once: false });
}
