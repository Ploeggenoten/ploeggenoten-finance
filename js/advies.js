// ═══ ADVIES-ENGINE: denkt als een financieel adviseur in recruitment ═══
// Elke regel is een heuristiek met drempels zoals een branche-adviseur die hanteert.
// Categorieën: gevaar | kans | sterkte. urg: 3 = direct aandacht, 1 = goed om te weten.

function adviesEngine() {
  const items = [];
  const t = todayISO(), mk = monthKey(t), mnd = +t.slice(5, 7);
  const k = kpis(), con = concentratie(), pot = potjes(), fx = flexStats();
  const proj = projectie(12, { flexFactor: 1 });
  const vaste = budgetVoorMaand(mk);
  const saldo = D.saldi[0] ? +D.saldi[0].saldo : 0;
  const vrij = saldo - pot.btwPot - pot.vpbPot;
  const add = (cat, urg, titel, cijfer, tekst, actie) => items.push({ cat, urg, titel, cijfer, tekst, actie });

  // maanden sinds eerste contract (voor run-rates)
  const eerste = D.placements.map(p => p.contract_datum).filter(Boolean).sort()[0];
  const mndActief = eerste ? Math.max(1, (daysBetween(eerste, t) / 30.4)) : 1;
  const plPm = D.placements.length / mndActief;
  const gemFee = k.gemFee || (D.placements.length ? D.placements.reduce((s, p) => s + +(p.fee_excl || 0), 0) / D.placements.length : 0);
  const breakEvenPl = gemFee ? vaste / gemFee : null;
  const flexDekking = vaste ? fx.maandRunRate / vaste : 0;

  // ── GEVAREN ──────────────────────────────────────────────────
  const buffer = vaste ? vrij / vaste : 0;
  if (buffer < 3) add('gevaar', 3, 'Cashbuffer onder de branchenorm', buffer.toFixed(1) + ' mnd',
    `Vrij besteedbaar (na btw/Vpb-potjes) is ${eur(vrij)} — dat dekt ${buffer.toFixed(1)} maand vaste lasten (${eur(vaste)}/m). Adviseurs hanteren voor W&S-bureaus minimaal 3, liever 6 maanden: omzet is eenmalig en valt in vakantieperiodes stil.`,
    `Bouw de buffer naar minimaal ${eur(vaste * 3)}. Stel grote uitgaven en extra aflossingen uit tot je daar zit.`);

  const btwRow = proj.rows.find(r => r.uitBtw > 0);
  if (btwRow && btwRow.uitBtw > Math.max(5000, saldo * .15))
    add('gevaar', btwRow.uitBtw > vrij * .5 ? 3 : 2, 'Btw-klap in aantocht', eur(btwRow.uitBtw) + ' · ' + btwRow.label,
      `In ${btwRow.label} moet er ${eur(btwRow.uitBtw)} btw worden afgedragen. Dit is geen winst maar doorgeefgeld — toch verdampt hier menig bureau zijn "buffer" aan.`,
      `Zet het btw-potje (${eur(pot.btwPot)} en groeiend) apart, bijv. op een spaarrekening, en raak het niet aan.`);

  if (con.top1 && con.top1.aandeel > .25) {
    const nogTeFact = D.placements.filter(p => p.klant === con.top1.klant)
      .reduce((s, p) => s + placementStats(p).nog + placementStats(p).open, 0);
    add('gevaar', con.top1.aandeel > .35 ? 3 : 2, 'Klantconcentratie te hoog', pct(con.top1.aandeel) + ' bij ' + con.top1.klant,
      `${con.top1.klant} is ${pct(con.top1.aandeel)} van je pijplijn (norm: geen klant boven 25–30%). Er staat daar nog ${eur(nogTeFact)} open of te factureren. Eén vacaturestop of conflict raakt je direct — en het maakt je onaantrekkelijk bij financiering.`,
      `Maak spreiding een target: de volgende ${Math.ceil(D.placements.length * .3)} plaatsingen bij andere klanten. Gebruik de goede naam bij ${con.top1.klant} als referentie voor soortgelijke bedrijven.`);
    if (con.top3 > .7) add('gevaar', 2, 'Top-3 klanten dragen bijna alles', pct(con.top3),
      `Je drie grootste klanten zijn samen ${pct(con.top3)} van de pijplijn.`,
      `Richt acquisitie op minimaal 2 nieuwe logo's per kwartaal.`);
  }

  const teLaat = acties().filter(a => a.soort === 'te_laat');
  if (teLaat.length) {
    const bedrag = teLaat.reduce((s, a) => s + +(a.i?.bedrag_excl || 0), 0);
    add('gevaar', 2, 'Betalingen lopen achter', `${teLaat.length}× · ${eur(bedrag)}`,
      `${teLaat.length} facturen (${eur(bedrag)} excl. btw) zijn over de vervaldatum. In recruitment went een klant snel aan te laat betalen — en jij financiert het.`,
      `Vast belritme: dag 1 na vervallen een vriendelijke mail, dag 7 bellen. Overweeg bij nieuwe klanten 50% bij tekenen.`);
  }

  if (k.stopPct > .2) add('gevaar', 2, 'Hoog uitvalpercentage kandidaten', pct(k.stopPct) + ' gestopt',
    `${pct(k.stopPct)} van je plaatsingen stopt — je verloor al ${eur(k.vervallen)} aan vervallen termijnen. In productie/logistiek valt het meeste uit in de eerste 30 dagen.`,
    `Bel kandidaat én klant standaard na dag 3, 14 en 30. Kleine moeite, en het beschermt je gespreide termijnen — juist die maken uitval duur.`);

  const kw3 = proj.rows.slice(0, 3);
  const dekking3m = kw3.reduce((s, r) => s + r.inFact + r.inFlex, 0) / Math.max(1, kw3.reduce((s, r) => s + r.uitTot, 0));
  if (dekking3m < 1) add('gevaar', 2, 'Komende 3 maanden niet gedekt zonder nieuwe deals', Math.round(dekking3m * 100) + '% gedekt',
    `Het bestaande factuurschema + flex dekt ${Math.round(dekking3m * 100)}% van de verwachte uitgaven de komende 3 maanden. Zonder nieuwe plaatsingen teer je in op je buffer.`,
    `Plan het aantal deals dat het gat dicht: bij een gemiddelde fee van ${eur(gemFee)} is dat er ${Math.ceil((kw3.reduce((s, r) => s + r.uitTot, 0) - kw3.reduce((s, r) => s + r.inFact + r.inFlex, 0)) / Math.max(1, gemFee))} in dit kwartaal.`);

  const rcTve = D.loans.find(l => /tve/i.test(l.naam));
  if (rcTve) {
    const feePm = Number(S('mgmt_fee_pm', 0)), uitkPm = Number(S('mgmt_uitkering_pm', 0));
    const afbouwPm = uitkPm - feePm;
    if (afbouwPm > 0) {
      const mndKlaar = Math.ceil(rcTve.hoofdsom / afbouwPm);
      add('sterkte', 1, 'RC-schuld aan TVE wordt netjes afgebouwd', eur(rcTve.hoofdsom),
        `Je keert ${eur(uitkPm)}/m uit terwijl de fee ${eur(feePm)}/m is — het verschil (${eur(afbouwPm)}/m) lost de rekening-courant af. In dit tempo is de RC over ±${mndKlaar} maanden weg.`, null);
    } else {
      add('gevaar', 1, 'Rekening-courant TVE loopt op', eur(rcTve.hoofdsom) + '+',
        `Je management fee (${eur(feePm)}/m) wordt niet (volledig) uitbetaald en stapelt op in RC. Fiscaal kan een oplopende RC-DGA door de Belastingdienst als (verkapte) uitdeling worden gezien.`,
        `Bespreek met je boekhouder: periodiek uitkeren, verrekenen, of een RC-overeenkomst met rente vastleggen.`);
    }
  }

  if (mnd === 6 || mnd === 7) add('gevaar', 1, 'Zomerdip W&S komt eraan', 'jul–aug',
    `Beslissers zijn op vakantie: deals die nu niet rond zijn schuiven zes weken door. Klassieke valkuil: in september pas weer zaaien en in oktober-november omzetgat.`,
    `Vul de pijplijn nú voor september; plan interviews vóór de vakanties. Flex loopt wél door — extra reden die tak te voeden.`);
  if (mnd === 10 || mnd === 11) add('gevaar', 1, 'December-effect', 'nov–dec',
    `Budgetten zijn op en niemand start vlak voor de feestdagen; januari is juist piekmaand (nieuwe budgetten, jobswitch-golf).`,
    `Verkoop nu startdata in januari en zorg dat facturatie vóór de jaarwisseling de deur uit is.`);

  if (fx.maandRunRate === 0)
    add('gevaar', 2, 'Alle omzet is eenmalig', '0% recurring',
      `Zonder flex-inkomsten begint elke maand op nul: W&S-fees zijn eenmalig. Dat maakt je kwetsbaar voor een stille maand.`,
      `Bouw de flexpoot via Pronkert uit — elke flexkracht is wekelijkse marge die je vaste lasten draagt. Vul de weekbedragen in op het Flex-tabblad zodra ze binnenkomen.`);

  // bewaking: klopt de app-administratie met de boekhouding (Yuki)?
  const bw = yukiBewaking();
  if (bw && Math.abs(bw.verschil) > 750) {
    const richting = bw.verschil > 0
      ? `De app verwacht ${eur(bw.appOpenIncl)} aan openstaande facturen (incl. btw), maar Yuki's debiteuren staan op ${eur(bw.yukiDeb)}. Mogelijk is een factuur al betaald (vink af — zie acties) of is een geplande factuur nooit in Yuki gezet.`
      : `Yuki's debiteuren (${eur(bw.yukiDeb)}) zijn hóger dan wat de app verwacht (${eur(bw.appOpenIncl)}). Er staat dus omzet in de boekhouding die de app niet kent — bijv. een flex-factuur aan Pronkert of een losse factuur buiten het plaatsingenschema.`;
    add('gevaar', 2, 'App en boekhouding lopen uiteen', eur(Math.abs(bw.verschil)) + ' verschil', richting,
      `Loop de open posten na; de betaald-suggesties op Vandaag lossen het meestal al op.`);
  }

  // target van het bord: hoe sta je ervoor deze maand?
  const tgt = targetInfo();
  if (tgt.aantalTarget) {
    const gap = tgt.aantalTarget - tgt.plaatsingen;
    const laatsteDag = addMonths(monthKey(t), 1);
    const dagenOver = daysBetween(t, laatsteDag);
    if (gap > 0 && dagenOver <= 12) add('gevaar', 2, 'Maandtarget onder druk', `${tgt.plaatsingen}/${tgt.aantalTarget} · nog ${dagenOver} dgn`,
      `Het bord-target is ${tgt.aantalTarget} plaatsingen deze maand; je staat op ${tgt.plaatsingen}. Het gat van ${gap} plaatsing(en) ≈ ${eur(gap * gemFee)} omzet.`,
      `Kijk in de gewogen pijplijn (Cashflow) wie het dichtst bij zit en geef die deals voorrang.`);
    else if (gap <= 0) add('sterkte', 1, 'Maandtarget gehaald', `${tgt.plaatsingen}/${tgt.aantalTarget}`,
      `Target van het bord is binnen — alles erbij is bonus.`, null);
  }

  // kanaalafhankelijkheid (bron van het bord)
  const kanalen = kanaalStats();
  const kTot = kanalen.reduce((s, k2) => s + k2.omzet, 0);
  if (kanalen.length && kTot > 0) {
    const top = kanalen[0];
    if (top.bron !== 'Onbekend' && top.omzet / kTot > .6)
      add('gevaar', 1, 'Werving leunt zwaar op één kanaal', `${esc(top.bron)} · ${pct(top.omzet / kTot)}`,
        `${top.bron} is goed voor ${pct(top.omzet / kTot)} van je plaatsingsomzet. Als dat kanaal duurder wordt of dichtgaat (algoritme, beleid), raakt dat direct je dealflow.`,
        `Houd een tweede kanaal warm (referrals zijn gratis: vraag elke geplaatste kandidaat en tevreden klant om één naam).`);
  }

  // ── KANSEN ───────────────────────────────────────────────────
  if (buffer > 6) {
    const overschot = vrij - vaste * 6;
    const moeder = D.loans.find(l => /moeder/i.test(l.naam));
    const opties = [];
    if (moeder) opties.push(`de lening van je moeder (deels) aflossen bespaart ${moeder.rente_pct}% = ${eur((moeder.hoofdsom) * moeder.rente_pct / 100)}/jaar aan rente`);
    opties.push(`een extra recruiter (±${eur(4300)}/m) is al rendabel bij ${(4300 / Math.max(1, gemFee)).toFixed(1)} plaatsing per maand`);
    opties.push(`advertentiebudget opschalen (zie kans hieronder)`);
    add('kans', 2, 'Overtollige cash aan het werk zetten', eur(overschot) + ' boven norm',
      `Je zit ${eur(overschot)} boven de 6-maands buffernorm. Geld op de betaalrekening rendeert niet.`,
      `Opties: ${opties.join('; ')}.`);
  }

  const mktBudget = D.budget.find(b => /marketing|verkoop/i.test(b.categorie));
  if (mktBudget && plPm > 0) {
    const cpp = +mktBudget.bedrag_pm / plPm;
    if (cpp < gemFee * .3) add('kans', 2, 'Marketing rendeert — overweeg opschalen', `${eur(cpp)} per plaatsing`,
      `Je geeft ±${eur(mktBudget.bedrag_pm)}/m uit aan marketing en doet ${plPm.toFixed(1)} plaatsingen/m → ${eur(cpp)} per plaatsing, tegen een gemiddelde fee van ${eur(gemFee)}. Een verhouding onder de 30% is ruimte om te schalen.`,
      `Test +50% advertentiebudget voor één kwartaal en meet of de cost-per-placement onder ${eur(gemFee * .3)} blijft.`);
  }

  // cash naar voren halen: hoeveel van 'nog te factureren' zit verder dan 60 dagen weg?
  const ver = D.installments.filter(i => i.status === 'te_factureren' && i.geplande_datum && daysBetween(t, i.geplande_datum) > 60)
    .reduce((s, i) => s + +i.bedrag_excl, 0);
  if (ver > k.nogTeFactureren * .4 && ver > 5000)
    add('kans', 2, 'Veel omzet zit ver in de toekomst', eur(ver) + ' > 60 dgn',
      `${eur(ver)} van je ${eur(k.nogTeFactureren)} nog te factureren staat meer dan 2 maanden weg (gespreide termijnen). Jij financiert feitelijk je klanten.`,
      `Nieuwe deals: 50% bij tekenen, rest gespreid. Bestaande spreidingen: bied 3% korting bij ineens voldoen — vaak goedkoper dan je eigen wachttijd.`);

  if (gemFee && gemFee < 8000) add('kans', 2, 'Gemiddelde fee onder benchmark', eur(gemFee),
    `Voor productie/logistiek is 20–25% van het bruto jaarsalaris (±€38–45k) gangbaar: €7.600–11.000 per plaatsing. Jij zit op ${eur(gemFee)}.`,
    `Verhoog je tarief bij nieuwe klanten; onderbouw met schaarste en je garantieregeling.`);

  if (fx.maandRunRate > 0 && flexDekking < 1) {
    const perKracht = fx.laatste?.flexkrachten ? fx.avg4 / fx.laatste.flexkrachten : null;
    add('kans', 2, 'Flex kan je vaste lasten dragen', pct(flexDekking) + ' gedekt',
      `Flex levert nu ${eur(fx.maandRunRate)}/m (run-rate) — dat dekt ${pct(flexDekking)} van je vaste lasten (${eur(vaste)}).${perKracht ? ` Gemiddeld is dat ${eur(perKracht)}/week per flexkracht.` : ''}`,
      `${perKracht ? `Met ±${Math.ceil((vaste - fx.maandRunRate) / (perKracht * 52 / 12))} extra flexkrachten` : 'Met meer flexkrachten'} draaien je vaste lasten volledig op recurring marge — dan is elke W&S-fee pure winst.`);
  }

  const perKlant = {};
  D.placements.forEach(p => perKlant[p.klant] = (perKlant[p.klant] || 0) + 1);
  const repeat = Object.values(perKlant).filter(n => n > 1).length;
  const totKlant = Object.keys(perKlant).length;
  if (totKlant >= 4 && repeat / totKlant >= .4)
    add('kans', 1, 'Sterke herhaalklanten — verzilver dat', `${repeat}/${totKlant} klanten`,
      `${repeat} van je ${totKlant} klanten plaatste meer dan eens. Terugkerende klanten zijn je goedkoopste omzet.`,
      `Bied je top-klanten een raamafspraak: vast tarief of staffelkorting in ruil voor exclusiviteit of een volumecommitment.`);

  // ── STERKTES ─────────────────────────────────────────────────
  if (pot.omzetYtd > 0) {
    const marge = pot.winstYtd / Math.max(1, pot.omzetYtd);
    if (marge > .35) add('sterkte', 1, 'Uitstekende winstmarge', pct(marge),
      `Winst-indicatie ${eur(pot.winstYtd)} op ${eur(pot.omzetYtd)} omzet. Boven de 35% is voor een W&S-bureau zeer gezond (veel bureaus blijven onder 20%).`, null);
  }
  if (buffer >= 3 && buffer <= 6) add('sterkte', 1, 'Gezonde cashbuffer', buffer.toFixed(1) + ' mnd vaste lasten', `Vrij besteedbaar dekt ${buffer.toFixed(1)} maanden — netjes binnen de 3–6-norm.`, null);
  if (k.dso != null && k.dso <= 21) add('sterkte', 1, 'Klanten betalen vlot', k.dso + ' dgn DSO', `Gemiddelde betaalduur van ${k.dso} dagen is uitstekend (branche zit vaak op 40+).`, null);
  if (gemFee >= 8000) add('sterkte', 1, 'Fee-niveau op/boven benchmark', eur(gemFee) + ' gem.', `Je gemiddelde fee zit in de bovenkant van de markt voor productie & logistiek.`, null);
  if (fx.maandRunRate > 0 && flexDekking >= 1) add('sterkte', 2, 'Vaste lasten volledig gedekt door flex', pct(flexDekking),
    `Je flex-marge (${eur(fx.maandRunRate)}/m) dekt al je vaste lasten. Elke W&S-fee is daarmee winst — een luxepositie.`, null);
  if (k.stopPct <= .1 && D.placements.length >= 10) add('sterkte', 1, 'Lage uitval', pct(k.stopPct), `Je kandidaten blijven zitten — dat zegt iets over je matching én het beschermt je gespreide termijnen.`, null);

  // ── UITVAL-INTELLIGENTIE (bord: afval_type / stop_door / categorieën) ──
  {
    const cds = D.candidates || [];
    const d90 = addDays(t, -90);
    const afg = cds.filter(c => c.fase === 'Afgevallen' && !(c.vervangt || ''));
    const oa = afg.filter(c => c.afval_type === 'offer_afgewezen');
    const oa90 = oa.filter(c => (c.since || '') >= d90);
    // offer-acceptatie: iedereen die In de wacht/Offer/ondertekenen of verder kwam
    const offerFases = ['In de wacht', 'Offer', 'Contract ondertekenen', 'Contract getekend', 'Gestart'];
    const inHist = (c, fases) => fases.includes(c.fase) || (Array.isArray(c.historie) && c.historie.some(h => fases.includes(h && h.fase))) || !!c.geplaatst_op;
    const offers = cds.filter(c => !(c.vervangt || '') && inHist(c, offerFases));
    const acc = offers.filter(c => c.geplaatst_op || ['Contract getekend', 'Gestart', 'Gestopt'].includes(c.fase)).length;
    const accPct = offers.length >= 5 ? acc / offers.length : null;
    if (accPct != null && accPct < .6)
      add('gevaar', 2, 'Offer-acceptatie te laag', pct(accPct),
        `Van je ${offers.length} kandidaten die het offer-stadium bereikten, tekende maar ${acc}. Elk afgewezen offer is een volledig doorlopen traject (~5 weken + ${eur(gemFee * (1 - k.stopPct))} misgelopen netto-fee).`,
        `Open 🗂 Uitval op het bord en kijk naar de redenen — daar staat waar de deal stukloopt.`);
    // dominante afwijs-reden
    const perReden = {};
    oa90.forEach(c => { const r = c.afval_categorie || '?'; perReden[r] = (perReden[r] || 0) + 1; });
    const topR = Object.entries(perReden).sort((a, b) => b[1] - a[1])[0];
    if (topR && topR[1] >= 2 && topR[0] === 'Salaris te laag')
      add('kans', 2, 'Offers stranden op salaris', `${topR[1]}× in 90 dgn`,
        `Kandidaten wijzen het aanbod af omdat het loon tegenvalt. Dat is laat in het traject — het duurste moment om erachter te komen.`,
        `Bespreek de loonbandbreedte al vóór de meeloopdag, en toets bij de klant of er rek zit vóór je een offer laat doen.`);
    else if (topR && topR[1] >= 2)
      add('kans', 1, 'Terugkerende offer-afwijsreden', `${topR[0]} · ${topR[1]}× in 90 dgn`,
        `Meerdere offers strandden om dezelfde reden ("${topR[0]}").`,
        `Maak dit onderdeel van het tweede gesprek, zodat het niet pas bij het offer opduikt.`);
    // vroege stops (≤30 dgn na start)
    const stops = cds.filter(c => c.fase === 'Gestopt' && c.gestopt_op && (c.start || c.geplaatst_op));
    const vroeg = stops.filter(c => daysBetween(c.start || c.geplaatst_op, c.gestopt_op) <= 30);
    if (vroeg.length >= 2)
      add('gevaar', 2, 'Uitval in de eerste 30 dagen', `${vroeg.length} van ${stops.length} stops`,
        `Stoppen kort na de start is de duurste uitval: garantie, vervanging en een klant die twijfelt. Redenen: ${[...new Set(vroeg.map(c => c.stop_categorie).filter(Boolean))].join(', ') || 'nog niet vastgelegd'}.`,
        `Houd het nazorg-ritme (dag 3/14/30 op het bord) strak — elke voorkomen stop is ~${eur(gemFee)} + vervangingswerk.`);
    // zelfde klant beëindigt vaker
    const perKlantStop = {};
    stops.filter(c => c.stop_door === 'klant').forEach(c => { const kl = c.klant || '?'; perKlantStop[kl] = (perKlantStop[kl] || 0) + 1; });
    const topK = Object.entries(perKlantStop).sort((a, b) => b[1] - a[1])[0];
    if (topK && topK[1] >= 2)
      add('gevaar', 2, 'Klant beëindigt herhaaldelijk', `${topK[0]} · ${topK[1]}×`,
        `${topK[0]} zette meerdere keren het contract stop. Óf de matching past niet bij deze klant, óf er speelt iets bij de klant zelf.`,
        `Plan een gesprek: wat verwacht ${topK[0]} precies? Scherp het profiel aan vóór je de volgende kandidaat voorstelt.`);
    // recyclebare pool
    const rec = cds.filter(c => ['Afgevallen', 'Gestopt'].includes(c.fase) && c.recyclebaar === true);
    if (rec.length >= 3)
      add('kans', 2, 'Recyclebare kandidaten wachten', `${rec.length} in de pool`,
        `Er staan ${rec.length} kandidaten klaar die je eerder goedkeurde (o.a. offer-afwijzers — volledig gekwalificeerd). Heraanbieden bij een andere klant is sneller én goedkoper dan nieuwe instroom werven.`,
        `Open 🗂 Uitval op het bord en loop de ♻-lijst na: wie past bij een openstaande vacature?`);
  }

  return items.sort((a, b) => b.urg - a.urg);
}

// kerncijfers zoals een adviseur ze op een A4 zet
function adviseurCijfers() {
  const t = todayISO(), k = kpis(), con = concentratie(), pot = potjes(), fx = flexStats();
  const proj = projectie(12, { flexFactor: 1 });
  const vaste = budgetVoorMaand(monthKey(t));
  const saldo = D.saldi[0] ? +D.saldi[0].saldo : 0;
  const vrij = saldo - pot.btwPot - pot.vpbPot;
  const eerste = D.placements.map(p => p.contract_datum).filter(Boolean).sort()[0];
  const mndActief = eerste ? Math.max(1, daysBetween(eerste, t) / 30.4) : 1;
  return [
    ['Vaste lasten p/m', eur(vaste), 'incl. fee & lonen (budget)'],
    ['Break-even', (vaste / Math.max(1, k.gemFee)).toFixed(1) + ' plaatsingen/m', `bij gem. fee ${eur(k.gemFee)}`],
    ['Run-rate', (D.placements.length / mndActief).toFixed(1) + ' plaatsingen/m', `${D.placements.length} sinds ${fmtD(eerste)}`],
    ['Cashbuffer', (vaste ? (vrij / vaste).toFixed(1) : '—') + ' mnd', `vrij besteedbaar ${eur(vrij)} / norm 3–6 mnd`],
    ['Runway (zonder nieuwe W&S)', (proj.runway >= 12 ? '12+' : proj.runway) + ' mnd', 'factuurschema + flex − kosten'],
    ['DSO', k.dso == null ? '—' : k.dso + ' dgn', 'gem. dagen factuur → betaald'],
    ['Uitval', pct(k.stopPct), `${eur(k.vervallen)} vervallen omzet`],
    ['Grootste klant', con.top1 ? pct(con.top1.aandeel) : '—', con.top1 ? con.top1.klant + ' (norm < 25–30%)' : ''],
    ['Flex-dekkingsgraad', vaste ? pct(fx.maandRunRate / vaste) : '—', `${eur(fx.maandRunRate)}/m recurring vs vaste lasten`],
    ['Btw + Vpb opzij te zetten', eur(pot.btwPot + pot.vpbPot), 'zit nog "verstopt" in je banksaldo'],
  ];
}

function renderAdvies(root) {
  const items = adviesEngine();
  const cijfers = adviseurCijfers();
  const kanalen = kanaalStats();
  const kTot = kanalen.reduce((s, k) => s + k.omzet, 0) || 1;
  const team = teamStats();
  const rv = recruiterVoortgang();
  const kanaalHtml = kanalen.length ? `<div class="table-wrap"><table>
    <tr><th>Kanaal</th><th class="num">Plaatsingen</th><th class="num">Omzet (na uitval)</th><th class="num">Aandeel</th></tr>
    ${kanalen.map(k => `<tr><td>${esc(k.bron)}</td><td class="num">${k.n}</td><td class="num">${eur(k.omzet)}</td><td class="num">${pct(k.omzet / kTot)}</td></tr>`).join('')}
    </table></div><p class="muted mt">Bron per kandidaat komt van het pijplijnbord. Leg dit naast je advertentie-uitgaven (Kosten → Marketing & verkoop) om te zien welk kanaal opschalen verdient.</p>`
    : '<div class="empty">Nog geen bronnen gekoppeld.</div>';
  const teamHtml = `
    ${rv.rows.length ? `<div class="muted" style="font-size:11px;margin-bottom:6px">🎯 Deze maand · maandtarget ${rv.tgt ?? '—'}${rv.rows.some(r => r.gelijkVerdeeld) ? ' — gelijk verdeeld, per persoon aanpasbaar' : ''}</div>
    <div class="table-wrap"><table>
    <tr><th>Recruiter</th><th class="num">Deze maand</th><th class="num">Doel</th><th>Voortgang</th></tr>
    ${rv.rows.map(r => { const p = r.doel ? Math.min(100, Math.round(r.gedaan / r.doel * 100)) : 0; const hit = r.doel && r.gedaan >= r.doel; return `<tr><td>${esc(r.rec)}</td>
      <td class="num"><b style="color:${hit ? 'var(--green)' : 'var(--txt)'}">${r.gedaan}</b></td>
      <td class="num"><input class="recdoel" data-rec="${esc(r.rec)}" type="number" min="0" value="${r.doel}" style="width:46px;text-align:right"></td>
      <td style="min-width:90px"><div class="rvbar"><i style="width:${p}%;background:${hit ? 'var(--green)' : 'var(--accent)'}"></i></div></td></tr>`; }).join('')}
    </table></div>` : ''}
    ${team.recruiters.length ? `<h3 style="margin-top:12px">Omzet YTD (na uitval)</h3><div class="table-wrap"><table>
    <tr><th>Recruiter</th><th class="num">Plaatsingen</th><th class="num">Omzet</th></tr>
    ${team.recruiters.map(r => `<tr><td>${esc(r.rec)}</td><td class="num">${r.n}</td><td class="num">${eur(r.omzet)}</td></tr>`).join('')}
    </table></div>` : '<div class="empty">Nog geen recruiters gekoppeld.</div>'}
    ${team.timeToFill != null ? `<div class="pot mt"><span>Gem. doorlooptijd bord → plaatsing</span><b>${team.timeToFill} dgn</b></div>` : ''}`;
  const iconOf = { gevaar: '🔴', kans: '🟡', sterkte: '🟢' };
  const kaart = it => `<div class="actie ${it.urg === 3 ? 'urgent' : it.urg === 2 ? 'warn' : ''}" style="align-items:flex-start">
    <div class="ico">${iconOf[it.cat]}</div>
    <div class="body">
      <b>${esc(it.titel)} <span class="tag ${it.cat === 'gevaar' ? 'red' : it.cat === 'kans' ? 'amber' : 'green'}">${esc(it.cijfer || '')}</span></b>
      <span>${esc(it.tekst)}</span>
      ${it.actie ? `<span style="color:var(--txt);display:block;margin-top:4px">👉 ${esc(it.actie)}</span>` : ''}
    </div></div>`;
  const sectie = (cat, titel) => {
    const xs = items.filter(i => i.cat === cat);
    return `<div class="panel mb"><h2>${titel} <span class="muted">(${xs.length})</span></h2>
      ${xs.map(kaart).join('') || '<div class="empty">Niets gevonden — dat is hier goed nieuws.</div>'}</div>`;
  };
  root.innerHTML = `
    <h1>Advies · je financieel adviseur</h1>
    <div class="muted mb">Live berekend uit je eigen cijfers, met branchenormen voor werving & selectie + flex. Elke kaart: wat er speelt, waarom het telt, en wat een adviseur zou doen.</div>
    <div class="panel mb"><h2>📐 De cijfers die een adviseur checkt ${uitlegChip('a_cijfers')}</h2>
      <div class="table-wrap"><table>
      ${cijfers.map(([l, v, s]) => `<tr><td>${esc(l)}</td><td class="num"><b>${esc(v)}</b></td><td class="muted">${esc(s)}</td></tr>`).join('')}
      </table></div></div>
    ${(() => {
      const ta = tariefAdvies();
      if (!ta.rows.length) return '';
      const topPot = ta.rows[0];
      return `<div class="panel mb"><h2>🏷 Tarief-adviseur <span class="muted">— wat levert elke klant echt op</span> ${uitlegChip('a_tarief')}</h2>
      <div class="table-wrap"><table>
      <tr><th>Klant</th><th class="num">Plaatsingen ${todayISO().slice(0, 4)}</th><th class="num">Netto omzet</th><th class="num">Tarief</th><th class="num">Jouw gemiddelde</th><th class="num">Rek (op jaarbasis)</th></tr>
      ${ta.rows.map(r => `<tr><td>${esc(r.klant)}${r.gestopt ? ` <span class="tag red">${r.gestopt}× gestopt</span>` : ''}</td>
        <td class="num">${r.n}</td><td class="num">${eur(r.netto)}</td>
        <td class="num">${r.pct ? `<b>${(r.pct * 100).toFixed(1)}%</b>` : '<span class="tag amber">geen tarief ✎</span>'}</td>
        <td class="num muted">${ta.bench ? (ta.bench * 100).toFixed(1) + '%' : '—'}</td>
        <td class="num">${r.potentie > 500 ? `<b style="color:var(--amber)">+${eur(r.potentie)}</b>` : r.pct ? '<span class="muted">marktconform</span>' : '—'}</td></tr>`).join('')}
      </table></div>
      ${topPot && topPot.potentie > 500 ? `<p class="mt">👉 <b>${esc(topPot.klant)}</b> zit op ${(topPot.pct * 100).toFixed(1)}% waar je gewogen gemiddelde ${(ta.bench * 100).toFixed(1)}% is — naar het gemiddelde is dat <b>~${eur(topPot.potentie)} per jaar</b> bij gelijk volume. Neem het mee in het volgende contractgesprek.</p>` : '<p class="muted mt">Geen klant zit noemenswaardig onder je gemiddelde tarief — netjes.</p>'}
      </div>`;
    })()}
    ${sectie('gevaar', '🔴 Gevaren')}
    ${sectie('kans', '🟡 Kansen')}
    ${sectie('sterkte', '🟢 Sterktes')}
    <div class="grid cols-2">
      <div class="panel"><h2>📣 Wervingskanalen ${uitlegChip('a_kanaal')}</h2>${kanaalHtml}</div>
      <div class="panel"><h2>👥 Team & snelheid ${uitlegChip('a_team')}</h2>${teamHtml}</div>
    </div>`;

  root.addEventListener('change', async e => {
    const inp = e.target.closest('.recdoel');
    if (!inp) return;
    const cur = { ...(S('recruiter_targets', {}) || {}) };
    cur[inp.dataset.rec] = Math.max(0, Number(inp.value) || 0);
    await saveSetting('recruiter_targets', cur);
    toast(`Doel voor ${inp.dataset.rec} opgeslagen ✓`); rerender();
  });
}
