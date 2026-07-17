// ═══ VIEW: Cashflow — banksaldo, projectie, scenario's, CSV-import ═══

let scenarioState = null;

// ── klikbare uitleg per sectie (voor uitleg aan collega's) ──────
const UITLEG = {
  target: { t: '🎯 Scenario "Op target"', h: `
    <p><b>Wat je ziet:</b> waar je banksaldo over 12 maanden staat als je élke maand je target haalt.</p>
    <p><b>Hoe berekend:</b> tempo (plaatsingen p/m) × gemiddelde fee × blijfkans = nieuwe omzet per maand, bovenop je zekere factuurschema en flex, minus kosten, btw en aflossing.</p>
    <p><b>Hoe sturen:</b> dit is je doel-lijn. Zit je verwachting eronder, dan moet er bovenaan de funnel bij.</p>` },
  verwacht: { t: '📊 Scenario "Verwacht · pijplijn"', h: `
    <p><b>Wat je ziet:</b> de meest realistische lijn — gebaseerd op wie er nú in de pijplijn zit op het bord.</p>
    <p><b>Hoe berekend:</b> elke kandidaat telt mee voor zijn kans per fase (voorstel 10% … contract ondertekenen 80%) × gemiddelde fee. Na de bord-horizon (~2 mnd) valt het terug op je target-tempo.</p>
    <p><b>Hoe sturen:</b> verschilt dit veel van "op target"? Dan zegt je pijplijn dat het target nog niet gedekt is.</p>` },
  tegenvaller: { t: '⚠️ Scenario "Tegenvaller"', h: `
    <p><b>Wat je ziet:</b> wat er gebeurt als je structureel onder target presteert.</p>
    <p><b>Hoe berekend:</b> target − de marge die je met de schuif "onder target" instelt, élke maand het hele jaar.</p>
    <p><b>Hoe sturen:</b> het gat met "op target" is je risico. Het is zo groot omdat 2 minder per maand = 24 minder over een jaar.</p>` },
  impact: { t: '💡 Wat een plaatsing waard is', h: `
    <p><b>Wat je ziet:</b> wat één plaatsing meer of minder je oplevert.</p>
    <p><b>Hoe berekend:</b> gemiddelde fee × blijfkans = netto waarde per plaatsing. Die cash landt ~6–8 weken later (factuurdatum + betaaltermijn).</p>
    <p><b>Hoe sturen:</b> gebruik dit om je team te motiveren — elke extra plaatsing deze week is direct zichtbaar in het kwartaal erop.</p>` },
  dezemaand: { t: '📍 Deze maand · target bord', h: `
    <p><b>Wat je ziet:</b> netto plaatsingen deze maand vs. je target — exact zoals de teller op het pijplijnbord.</p>
    <p><b>Hoe berekend:</b> geplaatst deze maand (W&S + flex) minus wie deze maand gestopt is (geen garantievervangers). Dezelfde formule als het bord, dus de cijfers kloppen 1-op-1.</p>
    <p><b>Hoe sturen:</b> dit is je weeksturing. "Nog X te gaan" is de concrete opdracht voor het team.</p>` },
  saldo: { t: '🏦 Startsaldo & vrij besteedbaar', h: `
    <p><b>Wat je ziet:</b> je actuele banksaldo, en wat daarvan écht vrij is.</p>
    <p><b>Hoe berekend:</b> vrij = saldo − btw-potje − vpb-reservering. Werk het saldo bij met de knop of via een bank-CSV.</p>
    <p><b>Hoe sturen:</b> stuur op "vrij besteedbaar", niet op het brutosaldo — een deel is al van de fiscus.</p>` },
  laagste: { t: '📉 Laagste punt', h: `
    <p><b>Wat je ziet:</b> het diepste punt dat je saldo de komende 12 maanden bereikt in het huidige scenario.</p>
    <p><b>Hoe berekend:</b> maand voor maand in − uit; het laagste tussenpunt. Rood onder €0, oranje onder €10k.</p>
    <p><b>Hoe sturen:</b> dit is je buffer-alarm. Zakt het onder je comfortgrens, dan schuif je kosten/aflossing of zet je een tandje bij op plaatsingen.</p>` },
  runway: { t: '🛫 Runway zónder nieuwe W&S', h: `
    <p><b>Wat je ziet:</b> hoeveel maanden je vooruit kunt zónder één nieuwe W&S-plaatsing.</p>
    <p><b>Hoe berekend:</b> startsaldo + zeker factuurschema + doorlopende flex − kosten/btw/aflossing, tot je saldo 0 raakt.</p>
    <p><b>Hoe sturen:</b> je veiligheidsmarge als de acquisitie even stilvalt. 12+ = ruim, onder 3 = kwetsbaar.</p>` },
  blijfkans: { t: '🔄 Blijfkans (retentie)', h: `
    <p><b>Wat je ziet:</b> de kans dat een geplaatste kandidaat blijft (niet stopt binnen de garantieperiode).</p>
    <p><b>Hoe berekend:</b> historisch = 1 − (gestopte plaatsingen ÷ alle plaatsingen). Je kunt hem met de schuif bijstellen voor een wat-als.</p>
    <p><b>Hoe sturen:</b> een lage blijfkans vreet je omzet op via garantie en vervanging. Nazorg (check-ins dag 3/14/30) verhoogt hem — en dus je nettomarge.</p>` },
  grafiek: { t: '📈 Saldo-projectie', h: `
    <p><b>Wat je ziet:</b> je saldo-verloop over 12 maanden in drie lijnen: huidig scenario, op target en tegenvaller.</p>
    <p><b>Hoe berekend:</b> elke lijn is een aparte projectie; het startpunt is je actuele banksaldo.</p>
    <p><b>Hoe sturen:</b> in één oogopslag zie je hoever de scenario's uit elkaar lopen — dat is precies de waarde van sturen op plaatsingen.</p>` },
  knoppen: { t: '🎛 Wat-als knoppen', h: `
    <p><b>Wat je ziet:</b> schuiven om scenario's mee te maken.</p>
    <p><b>Hoe berekend:</b> tempo × gem. fee × blijfkans = nieuwe omzet; plus omzetdip, flex-marge, extra hire en aflossing. De knoppen zijn tijdelijk — ze veranderen je data niet.</p>
    <p><b>Hoe sturen:</b> speel scenario's na vóór een beslissing (een extra recruiter aannemen? een zomerdip? een extra aflossing?).</p>` },
  lening: { t: '🏛 Lening', h: `
    <p><b>Wat je ziet:</b> de stand van je lening en de geplande aflossingen.</p>
    <p><b>Hoe berekend:</b> hoofdsom − afgelost = nog open. Geplande aflossingen tellen mee in de projectie zolang "aflossingen meenemen" aan staat.</p>
    <p><b>Hoe sturen:</b> vink aflossingen aan/uit om te zien wat een extra aflossing met je saldo en runway doet.</p>` },
  pijplijn: { t: '🔮 Wat zit er in de pijplijn', h: `
    <p><b>Wat je ziet:</b> wat er nú op het bord staat, vertaald naar verwachte plaatsingen én euro's. Een kandidaat telt pas als plaatsing vanaf de fase "Contract getekend" — alles daarvoor (óók "Contract ondertekenen") is nog onzekere pijplijn.</p>
    <p><b>Hoe berekend:</b> per kandidaat kans-per-fase × gemiddelde fee = <b>bruto gewogen</b>. Daar gaat nog een verwachte uitval vanaf → <b>netto</b>. De kans per fase is vast ingesteld; de <b>uitval leert de app zelf</b> uit je eigen stops (blijfkans). De cashflow-projectie rekent met netto, zodat je nooit te rooskleurig plant.</p>
    <p><b>Hoe sturen:</b> te weinig gewogen in beeld? Dan is de boodschap "bovenaan de funnel bijvullen" — anders val je over ~2 maanden terug.</p>` },
  breakeven: { t: '⚖️ Break-even', h: `
    <p><b>Wat je ziet:</b> hoeveel plaatsingen per maand je nodig hebt om je kosten te dekken. Elke plaatsing daarboven is winst.</p>
    <p><b>Hoe berekend:</b> (gemiddelde maandkosten − doorlopende flex-marge) ÷ (gemiddelde fee × blijfkans). Dus flex verlaagt je break-even, want die dekt al een deel van de kosten.</p>
    <p><b>Hoe sturen:</b> zet dit naast je target. Zit je target ruim boven break-even, dan bouw je buffer op; zit je eronder, dan teer je in.</p>` },
  maandtabel: { t: '📋 Maandtabel', h: `
    <p><b>Wat je ziet:</b> de cijfers onder de grafiek — maand voor maand in en uit.</p>
    <p><b>Hoe berekend:</b> in = facturen (op verwachte betaaldatum) + flex + scenario-omzet; uit = kosten + btw-afdracht + aflossing.</p>
    <p><b>Hoe sturen:</b> hier zie je wélke maand krap wordt en waaróm (bijvoorbeeld een btw-kwartaal in jan/apr/jul/okt).</p>` },

  // ── Vandaag ──
  v_openstaand: { t: '🧾 Openstaand', h: `
    <p><b>Wat je ziet:</b> facturen die verstuurd zijn maar nog niet betaald (excl. btw).</p>
    <p><b>Hoe berekend:</b> som van alle termijnen met status "gefactureerd". Yuki werkt dit automatisch bij als er betaald wordt.</p>
    <p><b>Hoe sturen:</b> loopt dit op, dan is het tijd om te bellen — geld dat binnen zou moeten zijn, staat nog uit.</p>` },
  v_flex: { t: '🟢 Flex run-rate', h: `
    <p><b>Wat je ziet:</b> je doorlopende flex-marge omgerekend naar een maandbedrag.</p>
    <p><b>Hoe berekend:</b> gemiddelde van de laatste 4 weken (uitbetaald door Pronkert) × 52 ÷ 12.</p>
    <p><b>Hoe sturen:</b> dit is je vaste basisinkomen naast W&S; hoe hoger, hoe lager je break-even op plaatsingen.</p>` },
  v_acties: { t: '📌 Acties', h: `
    <p><b>Wat je ziet:</b> alles wat vandaag je aandacht vraagt: factureren, late betalers, plaatsingen afronden, stops verwerken.</p>
    <p><b>Hoe berekend:</b> automatisch uit je factuurschema, garanties en signalen van het bord. Rood = urgent.</p>
    <p><b>Hoe sturen:</b> werk deze lijst leeg — elke actie is geld dat binnenkomt of een risico dat je afdekt.</p>` },
  v_agent: { t: '🧠 Advies van je finance agent', h: `
    <p><b>Wat je ziet:</b> de belangrijkste kansen, gevaren en sterktes die de app in je cijfers ziet.</p>
    <p><b>Hoe berekend:</b> recruitment-vuistregels (buffer, klantconcentratie, stop-percentage, break-even, seizoenseffecten) toegepast op je eigen data.</p>
    <p><b>Hoe sturen:</b> begin je week hiermee; het tabblad Advies geeft de volledige lijst met onderbouwing.</p>` },
  v_potjes: { t: '💰 Belastingpotjes', h: `
    <p><b>Wat je ziet:</b> hoeveel je opzij moet zetten voor btw en vennootschapsbelasting, en je winst-indicatie.</p>
    <p><b>Hoe berekend:</b> btw = ontvangen btw dit kwartaal − voorbelasting; Vpb = % over je winst YTD (liefst verankerd op Yuki).</p>
    <p><b>Hoe sturen:</b> zie dit als geld dat niet van jou is — houd het apart zodat een aanslag nooit verrast.</p>` },
  v_risico: { t: '⚠️ Risico\'s', h: `
    <p><b>Wat je ziet:</b> je grootste afhankelijkheden: klantconcentratie, stop-percentage, vervallen omzet en betaalduur (DSO).</p>
    <p><b>Hoe berekend:</b> aandeel per klant in je omzet, gestopte plaatsingen ÷ totaal, en gemiddelde dagen factuur→betaald.</p>
    <p><b>Hoe sturen:</b> één klant boven ~35% is kwetsbaar; een hoge DSO betekent dat je op je eigen geld wacht.</p>` },

  // ── Advies ──
  a_cijfers: { t: '📐 De cijfers die een adviseur checkt', h: `
    <p><b>Wat je ziet:</b> de kern-indicatoren die een financieel adviseur in een recruitmentbureau zou nalopen.</p>
    <p><b>Hoe berekend:</b> per thema een norm (bijv. buffer 3–6 mnd kosten, cost-per-placement < 30% fee) met jouw actuele waarde ernaast.</p>
    <p><b>Hoe sturen:</b> groen = op orde, oranje/rood = aandacht. Dit is je maandelijkse APK.</p>` },
  a_kanaal: { t: '📣 Wervingskanalen', h: `
    <p><b>Wat je ziet:</b> welk kanaal (Meta, Indeed, referral…) welke omzet aan plaatsingen opleverde.</p>
    <p><b>Hoe berekend:</b> per gekoppelde bord-kandidaat het bron-veld × de netto fee van de plaatsing.</p>
    <p><b>Hoe sturen:</b> stop budget in de kanalen die plaatsingen opleveren, niet alleen sollicitanten.</p>` },
  a_team: { t: '👥 Team & snelheid', h: `
    <p><b>Wat je ziet:</b> per recruiter de voortgang van deze maand vs. een doel, plus omzet YTD en de gemiddelde time-to-fill.</p>
    <p><b>Hoe berekend:</b> "deze maand" = plaatsingen op het bord met die recruiter; het doel is standaard het maandtarget gelijk verdeeld, maar je kunt het per persoon aanpassen (het onthoudt dat).</p>
    <p><b>Hoe sturen:</b> zie in één oogopslag wie voor- of achterloopt en verdeel het werk; een korte time-to-fill = meer plaatsingen met dezelfde mensen.</p>` },
  terugblik: { t: '📅 Terugblik — hoe deden we het', h: `
    <p><b>Wat je ziet:</b> per afgelopen maand wat je vooraf verwachtte tegenover wat het echt werd — in plaatsingen én omzet.</p>
    <p><b>Hoe berekend:</b> voorspeld = je plan/target (en zodra vastgelegd, de pijplijn-forecast van dat moment, ◇). Behaald = plaatsingen op het bord. Werkelijk = gefactureerd + flex. Trefzekerheid = werkelijk ÷ voorspeld.</p>
    <p><b>Hoe sturen:</b> structureel te optimistisch of te voorzichtig? Dan weet je dat je forecast of je target moet bijstellen. De app legt vanaf nu elke maand automatisch vast wat 'ie verwachtte, dus dit wordt steeds scherper.</p>` },

  // ── Flex ──
  f_marge: { t: '📈 Wekelijkse flex-marge', h: `
    <p><b>Wat je ziet:</b> de marge die Pronkert je wekelijks uitbetaalt over de flexkrachten.</p>
    <p><b>Hoe berekend:</b> je voert per week het uitgekeerde bedrag in; de app maakt er een run-rate en trend van.</p>
    <p><b>Hoe sturen:</b> een stijgende lijn verlaagt je break-even; een dip is een vroeg signaal dat flexkrachten wegvallen.</p>` },
  f_krachten: { t: '👷 Flexkrachten via Pronkert', h: `
    <p><b>Wat je ziet:</b> je actieve flexkrachten met marge per uur en de waarde tot de kosteloze overname.</p>
    <p><b>Hoe berekend:</b> marge/uur = (klantfactor − inkoopfactor) × uurloon; overname-waarde = marge/uur × de afgesproken overname-uren.</p>
    <p><b>Hoe sturen:</b> zie per kracht wat 'ie waard is en tot wanneer; zo weet je of een vroege overname de moeite loont.</p>` },

  // ── Kosten ──
  k_budget: { t: '📋 Budget — vaste maandlasten', h: `
    <p><b>Wat je ziet:</b> je vaste terugkerende kosten per maand (loon, lease, management fee, overige).</p>
    <p><b>Hoe berekend:</b> je zet ze één keer met een ingangsmaand; de projectie gebruikt dit waar nog geen werkelijke cijfers zijn.</p>
    <p><b>Hoe sturen:</b> dit is je kostenbasis en bepaalt direct je break-even en runway.</p>` },
  k_vgl: { t: '📊 Budget vs. werkelijk', h: `
    <p><b>Wat je ziet:</b> per maand je begrote kosten naast wat het echt werd.</p>
    <p><b>Hoe berekend:</b> werkelijk vul je per maand in (of komt uit Yuki); zolang dat er niet is, telt het budget.</p>
    <p><b>Hoe sturen:</b> structureel duurder dan begroot? Dan klopt je budget niet meer — pas het aan zodat je prognose realistisch blijft.</p>` },
  k_bank: { t: '🏦 Bankmutaties', h: `
    <p><b>Wat je ziet:</b> de transacties die je via een bank-CSV importeerde.</p>
    <p><b>Hoe berekend:</b> ingelezen uit je export (ING/Rabobank/generiek); dubbele regels worden overgeslagen.</p>
    <p><b>Hoe sturen:</b> handig om je werkelijke kosten en saldo te staven tegen wat de app verwacht.</p>` },
};
function uitlegChip(key, txt = 'ℹ️ uitleg') { return `<span class="uitleg" data-uitleg="${key}">${txt}</span>`; }
function openUitleg(key) {
  const u = UITLEG[key]; if (!u) return;
  openModal(`<div class="modal-head"><h2>${esc(u.t)}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="uitleg-body">${u.h}</div>
    <div class="modal-foot"><button class="btn primary" onclick="closeModal()">Duidelijk</button></div>`, { narrow: true });
}

// ── opgeslagen scenario's (prognoses voor de maandbespreking) ───
function cfSavedScenarios() { return Array.isArray(D.settings.scenarios) ? D.settings.scenarios : []; }
async function cfSaveScenario(naam) {
  const snap = { ...scenarioState };
  const arr = cfSavedScenarios().filter(s => s.naam !== naam);
  arr.push({ naam, sc: snap });
  await saveSetting('scenarios', arr);
  toast(`Scenario "${naam}" opgeslagen ✓`); rerender();
}
async function cfDeleteScenario(naam) {
  await saveSetting('scenarios', cfSavedScenarios().filter(s => s.naam !== naam));
  if (S('scenario_default') === naam) await saveSetting('scenario_default', null);
  toast('Scenario verwijderd'); rerender();
}
async function cfSetDefaultScenario(naam) {
  await saveSetting('scenario_default', naam || null);
  toast(naam ? `"${naam}" is nu je officiële prognose ★` : 'Standaard gewist'); rerender();
}
function cfLoadScenario(naam) {
  const s = cfSavedScenarios().find(x => x.naam === naam);
  if (s) { scenarioState = { ...scenarioState, ...s.sc }; rerender(); }
}
function openSaveScenario() {
  openModal(`<div class="modal-head"><h2>Scenario opslaan</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid"><div class="span2"><label>Naam</label><input id="scn_naam" placeholder="bijv. Zomerdip of Extra recruiter"></div></div>
    <p class="muted">Slaat de huidige stand van alle wat-als knoppen op. Zet 'm daarna met ★ als officiële prognose.</p>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="scn_save">Opslaan</button></div>`, { narrow: true });
  $('#scn_save').onclick = async () => { const n = $('#scn_naam').value.trim(); if (!n) return toast('Vul een naam in', true); closeModal(); await cfSaveScenario(n); };
}

function openSaldoModal() {
  openModal(`
    <div class="modal-head"><h2>Banksaldo bijwerken</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div><label>Datum</label><input id="s_datum" type="date" value="${todayISO()}"></div>
      <div class="span2"><label>Saldo (€)</label><input id="s_saldo" type="number" step="0.01" placeholder="bijv. 42350"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="s_save">Opslaan</button></div>`, { narrow: true });
  $('#s_save').onclick = async () => {
    const saldo = Number($('#s_saldo').value);
    if (isNaN(saldo)) return toast('Vul een bedrag in', true);
    await dbWrite('fin_bank_saldo', t => t.upsert({ datum: $('#s_datum').value, saldo }, { onConflict: 'datum' }));
    await reload('fin_bank_saldo', 'saldi', 'datum', false);
    closeModal(); toast('Saldo bijgewerkt ✓'); rerender();
  };
}

// ── bank-CSV import (ING / Rabobank / generiek) ────────────────
function parseBankCsv(text) {
  const delim = (text.match(/;/g) || []).length > (text.match(/,/g) || []).length ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const parse = l => {
    const out = []; let cur = '', inQ = false;
    for (const ch of l) {
      if (ch === '"') inQ = !inQ;
      else if (ch === delim && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const head = parse(lines[0]).map(h => h.toLowerCase());
  const idx = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const iDatum = idx('datum', 'date'), iBedrag = idx('bedrag', 'amount', 'transactiebedrag'),
        iOms = idx('omschrijving', 'mededeling', 'description', 'naam / omschrijving'),
        iNaam = idx('naam', 'tegenpartij', 'counterparty'), iAfBij = idx('af bij', 'debit/credit');
  if (iDatum < 0 || iBedrag < 0) return { error: 'Kolommen "datum" en "bedrag" niet gevonden in de CSV.' };
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = parse(line);
    let rawD = (c[iDatum] || '').replaceAll('"', '');
    let datum = null;
    if (/^\d{8}$/.test(rawD)) datum = `${rawD.slice(0,4)}-${rawD.slice(4,6)}-${rawD.slice(6)}`;          // ING: 20260715
    else if (/^\d{4}-\d{2}-\d{2}/.test(rawD)) datum = rawD.slice(0, 10);                                  // ISO
    else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(rawD)) {                                                  // 15-07-2026
      const [d, m, y] = rawD.split(/[-/]/); datum = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if (!datum) continue;
    let bedrag = Number((c[iBedrag] || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.\-+]/g, ''));
    if (isNaN(bedrag)) continue;
    if (iAfBij >= 0 && /af/i.test(c[iAfBij])) bedrag = -Math.abs(bedrag);
    const omschrijving = (c[iOms] || '').slice(0, 200);
    const tegenpartij = iNaam >= 0 ? (c[iNaam] || '').slice(0, 100) : '';
    rows.push({ datum, bedrag, omschrijving, tegenpartij, hash: `${datum}|${bedrag}|${omschrijving.slice(0, 40)}` });
  }
  return { rows };
}

function openCsvImport() {
  openModal(`
    <div class="modal-head"><h2>Bank-CSV importeren</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <p class="muted mb">Exporteer transacties uit je bank als CSV (ING, Rabobank of generiek) en kies het bestand. Dubbele regels worden automatisch overgeslagen.</p>
    <input type="file" id="csvFile" accept=".csv,text/csv">
    <div id="csvPreview" class="mt"></div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Sluiten</button>
    <button class="btn primary" id="csvGo" disabled>Importeren</button></div>`);
  let parsed = null;
  $('#csvFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    parsed = parseBankCsv(await f.text());
    if (parsed.error) { $('#csvPreview').innerHTML = `<div class="tag red">${esc(parsed.error)}</div>`; return; }
    const inTot = parsed.rows.filter(r => r.bedrag > 0).reduce((s, r) => s + r.bedrag, 0);
    const uitTot = parsed.rows.filter(r => r.bedrag < 0).reduce((s, r) => s + r.bedrag, 0);
    $('#csvPreview').innerHTML = `<p><b>${parsed.rows.length}</b> transacties gevonden · in ${eur(inTot)} · uit ${eur(uitTot)}</p>`;
    $('#csvGo').disabled = !parsed.rows.length;
  };
  $('#csvGo').onclick = async () => {
    const { error, count } = await sb.from('fin_bank_tx')
      .upsert(parsed.rows, { onConflict: 'hash', ignoreDuplicates: true, count: 'exact' });
    if (error) return toast('Import mislukt: ' + error.message, true);
    await reload('fin_bank_tx', 'tx', 'datum', false);
    closeModal(); toast(`Geïmporteerd ✓ (${count ?? parsed.rows.length} nieuw)`); rerender();
  };
}

// dynamische delen (KPI's, grafiek, maandtabel) — apart zodat de
// scenario-schuiven alleen dít herbouwen en niet zichzelf (anders breekt het slepen)
function cfDynHtml(sc) {
  const proj = projectie(12, sc);
  const saldo = D.saldi[0];
  const pot = potjes();
  const ti = targetInfo();
  const bp = ti.board;
  const tgt = ti.aantalTarget;
  const gemFee = proj.gemFee;
  const behoud = proj.blijfkans;
  const pf = pipelineForecast();
  const be = breakEven();
  const m0 = monthKey(todayISO());

  // ── drie vooruitblik-scenario's (zelfde blijfkans/aflossing, ander tempo) ──
  const base = { aflossenAan: sc.aflossenAan, blijfkans: sc.blijfkans, flexFactor: sc.flexFactor };
  const marge = sc.tegenvallerMarge ?? 2;
  const down = Math.max(0, tgt - marge);
  const sTarget   = projectie(12, { ...base, bron: 'target',   plaatsingenPm: tgt });
  const sVerwacht = projectie(12, { ...base, bron: 'pijplijn', plaatsingenPm: tgt });
  const sDown     = projectie(12, { ...base, bron: 'target',   plaatsingenPm: down });
  const omzetPm = n => n * gemFee * behoud;

  const scen = (icon, titel, sub, p, accent, key) => `
    <div class="kpi" data-uitleg="${key}" title="Klik voor uitleg" style="border-top:3px solid ${accent};cursor:pointer">
      <div class="lbl">${icon} ${titel} ${uitlegChip(key, 'ℹ️')}</div>
      <div class="val" style="color:${p.eind < 0 ? 'var(--red)' : 'inherit'}">${eur(p.eind)}</div>
      <div class="sub">${sub}<br>laagste ${eur(p.laagste.saldo)} · ${esc(p.laagste.label || '')}</div>
    </div>`;

  const verschil = sTarget.eind - sDown.eind;
  const headline = `
   <div class="grid cols-3 mb">
     ${scen('🎯', 'Op target', `${tgt}/mnd → ${eur(omzetPm(tgt))} omzet p/m`, sTarget, 'var(--green)', 'target')}
     ${scen('📊', 'Verwacht · pijplijn', `~${pf.verwachtAantal.toFixed(1)} plaatsingen gewogen in beeld`, sVerwacht, 'var(--accent)', 'verwacht')}
     ${scen('⚠️', 'Tegenvaller', `${down}/mnd → ${eur(omzetPm(down))} omzet p/m`, sDown, 'var(--amber)', 'tegenvaller')}
   </div>
   <div class="panel mb" style="border-left:4px solid var(--amber)">
     <b>Wat sturen op plaatsingen oplevert.</b> ${uitlegChip('impact')} Elke plaatsing méér per maand ≈ <b>${eur(gemFee)}</b> omzet
     (${eur(omzetPm(1))} na blijfkans), die ~6–8 weken later in je cash landt.
     Het verschil tussen <b>${tgt}/mnd</b> en <b>${down}/mnd</b> is over 12 mnd
     <b style="color:${verschil >= 0 ? 'var(--green)' : 'var(--red)'}">${eur(verschil)}</b> eindsaldo.
   </div>`;

  // ── deze maand: bord-correspondentie + concrete impact ──
  const left = Math.max(0, tgt - bp.netto);
  const cashMaand2 = fmtMaand(addMonths(m0, 2));
  const kpiRow = `
   <div class="grid cols-4 mb">
     <div class="kpi ${bp.netto >= tgt ? 'good' : ''}" data-uitleg="dezemaand" title="Klik voor uitleg" style="cursor:pointer"><div class="lbl">Deze maand · target bord ${uitlegChip('dezemaand', 'ℹ️')}</div>
       <div class="val">${bp.netto} / ${tgt}</div>
       <div class="sub">${bp.ws} W&amp;S · ${bp.flex} flex${bp.onb ? ` · ${bp.onb} ?` : ''}${bp.stopM ? ` · −${bp.stopM} gestopt` : ''}</div></div>
     <div class="kpi" data-uitleg="saldo" title="Klik voor uitleg" style="cursor:pointer"><div class="lbl">Startsaldo${saldo ? ' · ' + fmtD(saldo.datum) : ''} ${uitlegChip('saldo', 'ℹ️')}</div><div class="val">${saldo ? eur(saldo.saldo) : '—'}</div>
       <div class="sub">vrij na potjes ${saldo ? eur(saldo.saldo - pot.btwPot - pot.vpbPot) : '—'}</div></div>
     <div class="kpi ${proj.laagste.saldo < 0 ? 'bad' : proj.laagste.saldo < 10000 ? 'warn' : 'good'}" data-uitleg="laagste" title="Klik voor uitleg" style="cursor:pointer">
       <div class="lbl">Laagste punt (dit scenario) ${uitlegChip('laagste', 'ℹ️')}</div><div class="val">${eur(proj.laagste.saldo)}</div><div class="sub">${esc(proj.laagste.label || '')}</div></div>
     <div class="kpi" data-uitleg="runway" title="Klik voor uitleg" style="cursor:pointer"><div class="lbl">Runway zónder nieuwe W&S ${uitlegChip('runway', 'ℹ️')}</div><div class="val">${proj.runway >= 12 ? '12+' : proj.runway} mnd</div><div class="sub">factuurschema + flex − kosten</div></div>
   </div>
   <div class="panel mb">${left > 0
      ? `<div class="pot"><span>📍 Nog <b>${left}</b> plaatsing${left === 1 ? '' : 'en'} te gaan deze maand. Haal je die niet, dan mis je ~<b>${eur(left * gemFee)}</b> omzet — zichtbaar in je cash rond <b>${cashMaand2}</b>.</span></div>`
      : `<div class="pot"><span>✓ Target deze maand gehaald: <b>${bp.netto}/${tgt}</b> netto plaatsingen (gelijk aan het bord).</span></div>`}
      <div class="pot"><span>🔄 Blijfkans <b>${Math.round(behoud * 100)}%</b> (historisch: ${D.placements.filter(p => p.gestopt_op).length} van ${D.placements.length} plaatsingen gestopt). Van elke <b>${tgt}</b> plaatsingen reken ik op ~<b>${(tgt * behoud).toFixed(1)}</b> die blijven. ${uitlegChip('blijfkans')}</span></div>
      ${be.nodig != null ? `<div class="pot"><span>⚖️ Break-even: ~<b>${be.nodig.toFixed(1)}</b> plaatsing${be.nodig >= 1.5 || be.nodig < 1 ? 'en' : ''}/mnd dekken je kosten (${eur(be.kostPm)}/mnd − flex ${eur(be.flexPm)}). Boven je target van <b>${tgt}</b> hou je ~<b>${eur(Math.max(0, tgt - be.nodig) * be.perPlaatsing)}</b> netto over per maand. ${uitlegChip('breakeven')}</span></div>` : ''}</div>`;

  const chart = lineChart(proj.rows.map(r => r.label), [
    { label: 'Banksaldo (huidig scenario)', color: 'var(--accent)', values: proj.rows.map(r => r.saldo) },
    { label: 'Op target', color: 'var(--green)', values: sTarget.rows.map(r => r.saldo) },
    { label: 'Tegenvaller', color: 'var(--amber)', values: sDown.rows.map(r => r.saldo) },
  ], { height: 260 });

  return headline + kpiRow + `<div class="panel mb"><h2>📈 Saldo-projectie — huidig scenario vs. target vs. tegenvaller ${uitlegChip('grafiek')}</h2>${chart}</div>`;
}

function cfTabelHtml(sc) {
  const proj = projectie(12, sc);
  const rows = proj.rows.map(r => `<tr>
    <td>${esc(r.label)}</td>
    <td class="num">${eur(r.inFact)}</td><td class="num" style="color:var(--purple)">${r.inFlex ? eur(r.inFlex) : '—'}</td><td class="num muted">${eur(r.inScenario)}</td>
    <td class="num">${eur(r.uitKosten)}</td><td class="num">${r.uitBtw ? eur(r.uitBtw) : '—'}</td><td class="num">${r.uitLening ? eur(r.uitLening) : '—'}</td>
    <td class="num"><b style="color:${r.saldo < 0 ? 'var(--red)' : r.saldo < 10000 ? 'var(--amber)' : 'var(--green)'}">${eur(r.saldo)}</b></td></tr>`).join('');
  return `<h2>Maandtabel ${uitlegChip('maandtabel')}</h2><table>
      <tr><th>Maand</th><th class="num">In: facturen</th><th class="num">In: flex</th><th class="num">In: scenario</th><th class="num">Uit: kosten</th><th class="num">Btw-afdracht</th><th class="num">Aflossing</th><th class="num">Saldo</th></tr>
      ${rows}</table>
      <p class="muted mt">Facturen incl. btw, op verwachte betaaldatum (geplande factuurdatum + betaaltermijn). Te late betalingen: aanname binnen 2 weken. Btw-afdracht per kwartaal, minus geschatte voorbelasting (${eur(S('voorbelasting_pm', 0))}/mnd — instelbaar).</p>`;
}

// ── maand-terugblik: voorspeld (plan) vs. echt behaald ─────────
function cfTerugblikHtml() {
  const rows = maandTerugblik(6).filter(r => r.target != null || r.behaald > 0 || r.gefact > 0);
  if (!rows.length) return `<h2>📅 Terugblik — hoe deden we het ${uitlegChip('terugblik')}</h2>
    <div class="empty">Nog geen afgeronde maanden om op terug te blikken. Vanaf nu legt de app elke maand vast wat we verwachtten.</div>`;
  const body = rows.map(r => {
    const hit = r.target != null && r.behaald >= r.target;
    const treff = r.voorspeldOmzet ? r.gefact / r.voorspeldOmzet : null;
    return `<tr>
      <td>${esc(fmtMaand(r.mk + '-01'))}</td>
      <td class="num">${r.voorspeldPl != null ? r.voorspeldPl : '—'}${r.uitSnapshot ? ' <span class="muted" title="pijplijn-forecast vastgelegd">◇</span>' : ''}</td>
      <td class="num"><b style="color:${hit ? 'var(--green)' : r.target != null ? 'var(--amber)' : 'var(--txt)'}">${r.behaald}</b></td>
      <td class="num muted">${r.voorspeldOmzet != null ? eur(r.voorspeldOmzet) : '—'}</td>
      <td class="num"><b>${eur(r.gefact)}</b></td>
      <td class="num">${treff != null ? `<span style="color:${treff >= .9 ? 'var(--green)' : treff >= .6 ? 'var(--amber)' : 'var(--red)'}">${Math.round(treff * 100)}%</span>` : '—'}</td></tr>`;
  }).join('');
  return `<h2>📅 Terugblik — hoe deden we het ${uitlegChip('terugblik')}</h2>
    <table>
      <tr><th>Maand</th><th class="num">Voorspeld pl.</th><th class="num">Behaald pl.</th><th class="num">Voorspelde omzet</th><th class="num">Werkelijk gefact.</th><th class="num">Trefzekerheid</th></tr>
      ${body}
    </table>
    <p class="muted mt">Voorspeld = je plan/target voor die maand${rows.some(r => r.uitSnapshot) ? ' (◇ = vastgelegde pijplijn-forecast)' : ''}. Behaald = plaatsingen op het bord in die maand. Werkelijk = gefactureerd + flex. Trefzekerheid = werkelijk ÷ voorspelde omzet.</p>`;
}

// ── hoofdview ──────────────────────────────────────────────────
function renderCashflow(root) {
  const tgt0 = targetInfo().aantalTarget;
  const behoud0 = 1 - (kpis().stopPct || 0);
  if (!scenarioState) {
    const basis = {
      bron: 'pijplijn', plaatsingenPm: tgt0, blijfkans: behoud0, tegenvallerMarge: 2,
      omzetPm: Number(S('scenario_omzet_pm', 25000)), omzetDipPct: 0, extraHirePm: 0, extraHireVanaf: 2, aflossenAan: true, flexFactor: 1,
    };
    const def = cfSavedScenarios().find(s => s.naam === S('scenario_default'));
    scenarioState = def ? { ...basis, ...def.sc } : basis;
  }
  const sc = scenarioState;
  const saved = cfSavedScenarios();
  const defNaam = S('scenario_default');
  if (sc.plaatsingenPm == null) sc.plaatsingenPm = tgt0;
  if (sc.blijfkans == null) sc.blijfkans = behoud0;
  if (sc.tegenvallerMarge == null) sc.tegenvallerMarge = 2;
  const pf = pipelineForecast();
  const proj = projectie(12, sc);
  const lening = D.loans[0];
  const afgelost = D.loanPayments.filter(lp => !lp.gepland).reduce((s, l) => s + +l.bedrag, 0);
  const maandOpts = proj.rows.map((r, i) => `<option value="${i}" ${i === sc.extraHireVanaf ? 'selected' : ''}>${esc(r.label)}</option>`).join('');

  // pijplijn per plaatsmaand → aantallen (verwacht = som van kansen)
  const plMaanden = Object.keys(pf.perMaandPlaatsMaand).sort();
  const plChips = plMaanden.map(mk => `<span class="tag gray">${fmtMaand(mk)}: <b>${pf.perMaandPlaatsMaand[mk].toFixed(1)}</b></span>`).join(' ');
  const behoefte = sc.plaatsingenPm;   // per maand nodig voor target

  root.innerHTML = `
    <div class="spread mb"><h1>Cashflow & toekomst</h1>
      <div class="row">
        <button class="btn" id="cfCsv">📄 Bank-CSV importeren</button>
        <button class="btn primary" id="cfSaldo">🏦 Saldo bijwerken</button>
      </div></div>

    <div id="cfDyn">${cfDynHtml(sc)}</div>

    <div class="grid cols-2 mb">
      <div class="panel"><h2>🎛 Wat-als knoppen <span class="muted">— denk in plaatsingen</span> ${uitlegChip('knoppen')}</h2>
        <div class="slider-row"><span>Opgeslagen prognose${defNaam ? ` <span class="muted">★ ${esc(defNaam)}</span>` : ''}</span>
          <select id="sc_load"><option value="">— kies scenario —</option>${saved.map(s => `<option ${s.naam === defNaam ? 'selected' : ''}>${esc(s.naam)}</option>`).join('')}</select>
          <span style="display:flex;gap:4px;justify-content:flex-end"><button class="btn small" id="sc_save" title="Huidige stand opslaan">💾</button><button class="btn small" id="sc_star" title="Als officiële prognose">★</button><button class="btn small" id="sc_del" title="Verwijderen">🗑</button></span></div>
        <div class="slider-row"><span>Nieuwe omzet baseer op</span>
          <select id="sc_bron"><option value="pijplijn" ${sc.bron === 'pijplijn' ? 'selected' : ''}>Gewogen pijplijn → daarna target-tempo</option>
          <option value="target" ${sc.bron === 'target' ? 'selected' : ''}>Vast tempo: X plaatsingen/mnd</option>
          <option value="vast" ${sc.bron === 'vast' ? 'selected' : ''}>Vast €-bedrag p/m</option></select><span></span></div>
        <div class="slider-row"><span>Tempo (plaatsingen p/m)</span>
          <input type="range" id="sc_pl" min="0" max="15" step="1" value="${sc.plaatsingenPm}"><b id="scv_pl">${sc.plaatsingenPm} → ${eur(sc.plaatsingenPm * proj.gemFee)}</b></div>
        <div class="slider-row"><span>Blijfkans (blijven na plaatsing)</span>
          <input type="range" id="sc_blijf" min="0" max="100" step="5" value="${Math.round(sc.blijfkans * 100)}"><b id="scv_blijf">${Math.round(sc.blijfkans * 100)}%</b></div>
        <div class="slider-row"><span>Tegenvaller: onder target</span>
          <input type="range" id="sc_marge" min="1" max="6" step="1" value="${sc.tegenvallerMarge}"><b id="scv_marge">−${sc.tegenvallerMarge}/mnd → ${Math.max(0, tgt0 - sc.tegenvallerMarge)}</b></div>
        <div class="slider-row"><span>Vast €-bedrag p/m <span class="muted">(alleen bij "vast")</span></span>
          <input type="range" id="sc_omzet" min="0" max="60000" step="1000" value="${sc.omzetPm}"><b id="scv_omzet">${eur(sc.omzetPm)}</b></div>
        <div class="slider-row"><span>Omzet valt extra terug met</span>
          <input type="range" id="sc_dip" min="0" max="100" step="5" value="${sc.omzetDipPct * 100}"><b id="scv_dip">${Math.round(sc.omzetDipPct * 100)}%</b></div>
        <div class="slider-row"><span>Flex-marge (t.o.v. run-rate)</span>
          <input type="range" id="sc_flex" min="0" max="300" step="10" value="${sc.flexFactor * 100}"><b id="scv_flex">${Math.round(sc.flexFactor * 100)}%</b></div>
        <div class="slider-row"><span>Extra hire (kosten p/m)</span>
          <input type="range" id="sc_hire" min="0" max="8000" step="250" value="${sc.extraHirePm}"><b id="scv_hire">${eur(sc.extraHirePm)}</b></div>
        <div class="slider-row"><span>Hire start in</span>
          <select id="sc_hireVanaf">${maandOpts}</select><span></span></div>
        <div class="slider-row"><span>Geplande aflossingen meenemen</span>
          <input type="checkbox" id="sc_afl" ${sc.aflossenAan ? 'checked' : ''} style="width:auto;justify-self:start"><span></span></div>
        <p class="muted">Wat-als (tijdelijk). Tempo × gem. fee (${eur(proj.gemFee)}) × blijfkans = nieuwe omzet per maand. Fase-kansen stel je in bij Instellingen.</p>
      </div>
      <div class="panel"><h2>🏛 Lening ${lening ? '· ' + esc(lening.naam) : ''} ${uitlegChip('lening')}</h2>
        ${lening ? `
        <div class="pot"><span>Hoofdsom</span><b>${eur(lening.hoofdsom)}</b></div>
        <div class="pot"><span>Rente</span><b>${lening.rente_pct}%</b></div>
        <div class="pot"><span>Afgelost</span><b>${eur(afgelost)}</b></div>
        <div class="pot"><span>Nog open</span><b>${eur(lening.hoofdsom - afgelost)}</b></div>
        <div class="pot"><span>Deadline</span><b>${fmtD(lening.deadline)}</b></div>
        ${D.loanPayments.filter(l => l.gepland).map(l => `<div class="pot"><span>Gepland: ${fmtD(l.datum)}</span><b>${eur(l.bedrag)} <button class="btn small" data-lp="${l.id}">Betaald ✓</button></b></div>`).join('')}
        ` : '<div class="empty">Geen lening geregistreerd.</div>'}
      </div>
    </div>

    <div class="panel mb"><div class="spread mb"><h2>🔮 Wat zit er in de pijplijn <span class="muted">— live van het bord</span> ${uitlegChip('pijplijn')}</h2>
      <span class="muted">gewogen <b>${pf.verwachtAantal.toFixed(1)}</b> plaatsingen · bruto <b>${eur(pf.totaal)}</b> → netto <b style="color:var(--accent)">${eur(pf.totaalNetto)}</b> excl. btw</span></div>
      ${pf.rows.length ? `
      <div class="mb">Verwachte plaatsingen per maand (gewogen koppen): ${plChips || '—'}
        <p class="muted mt">Om <b>${behoefte}</b> plaatsing${behoefte === 1 ? '' : 'en'} per maand te halen, moet de pijplijn dat tempo blijven voeden. Nu staat er gewogen <b>${pf.verwachtAantal.toFixed(1)}</b> op de rol voor de komende ~2 maanden — ${pf.verwachtAantal >= behoefte ? '<b style="color:var(--green)">genoeg om het tempo vast te houden</b>' : `<b style="color:var(--amber)">${(behoefte - pf.verwachtAantal).toFixed(1)} te weinig</b> — er moet bovenaan de funnel bij`}.</p></div>
      <div class="table-wrap"><table>
      <tr><th>Kandidaat</th><th>Klant</th><th>Fase</th><th class="num">Kans</th><th class="num">Fee</th><th class="num">Bruto gewogen</th><th class="num">Netto (na uitval)</th><th>Cash verwacht</th></tr>
      ${pf.rows.map(r => `<tr><td>${esc(r.c.naam)}</td><td>${esc(r.c.klant || '')}</td><td>${tag(r.c.fase, r.kans >= .5 ? 'green' : r.kans >= .25 ? 'amber' : 'gray')}</td>
        <td class="num">${Math.round(r.kans * 100)}%</td><td class="num" title="${r.feeEcht ? 'echte fee: maandloon × jaarfactor × klanttarief' : 'gemiddelde fee (geen maandloon op het bord)'}">${eur(r.fee)}${r.feeEcht ? '' : ' <span class="muted">~</span>'}</td><td class="num muted">${eur(r.gewogen)}</td><td class="num"><b>${eur(r.netto)}</b></td><td>${fmtMaand(r.cashMaand)}</td></tr>`).join('')}
      </table></div>
      <p class="muted mt">Kans per fase: voorgesteld 5% · O&O 10% · 1e gesprek 20% · 2e gesprek 40% · meeloopdag 50% · in de wacht 50% · offer 65% · ondertekenen 75% <span class="muted">(Voorselectie telt niet mee)</span>. <b>Bruto</b> = kans × fee (echte fee waar het bord een maandloon heeft; <b>~</b> = gemiddelde). <b>Netto</b> = na verwachte uitval — die <b>leert de app uit je eigen stops</b> (nu blijft <b>${Math.round(pf.behoud * 100)}%</b>). De projectie rekent met netto. Een plaatsing telt pas vanaf "Contract getekend".</p>`
      : '<div class="empty">Geen actieve kandidaten in de W&S-funnel op het bord.</div>'}</div>

    <div class="panel table-wrap" id="cfTabel">${cfTabelHtml(sc)}</div>

    <div class="panel table-wrap mt">${cfTerugblikHtml()}</div>`;

  ensureForecastSnapshot();

  // schuiven: alleen de dynamische delen verversen, niet de schuiven zelf
  const upd = () => {
    $('#cfDyn').innerHTML = cfDynHtml(sc);
    $('#cfTabel').innerHTML = cfTabelHtml(sc);
    $('#scv_pl').textContent = `${sc.plaatsingenPm} → ${eur(sc.plaatsingenPm * proj.gemFee)}`;
    $('#scv_blijf').textContent = Math.round(sc.blijfkans * 100) + '%';
    $('#scv_marge').textContent = `−${sc.tegenvallerMarge}/mnd → ${Math.max(0, tgt0 - sc.tegenvallerMarge)}`;
    $('#scv_omzet').textContent = eur(sc.omzetPm);
    $('#scv_dip').textContent = Math.round(sc.omzetDipPct * 100) + '%';
    $('#scv_flex').textContent = Math.round(sc.flexFactor * 100) + '%';
    $('#scv_hire').textContent = eur(sc.extraHirePm);
  };
  $('#sc_load').onchange = e => cfLoadScenario(e.target.value);
  $('#sc_save').onclick = openSaveScenario;
  $('#sc_star').onclick = () => { const n = $('#sc_load').value; if (!n) return toast('Kies eerst een opgeslagen scenario', true); cfSetDefaultScenario(n); };
  $('#sc_del').onclick = () => { const n = $('#sc_load').value; if (!n) return toast('Kies eerst een scenario', true); cfDeleteScenario(n); };
  $('#sc_bron').onchange = e => { sc.bron = e.target.value; upd(); };
  $('#sc_pl').oninput = e => { sc.plaatsingenPm = +e.target.value; upd(); };
  $('#sc_blijf').oninput = e => { sc.blijfkans = +e.target.value / 100; upd(); };
  $('#sc_marge').oninput = e => { sc.tegenvallerMarge = +e.target.value; upd(); };
  $('#sc_omzet').oninput = e => { sc.omzetPm = +e.target.value; upd(); };
  $('#sc_dip').oninput = e => { sc.omzetDipPct = +e.target.value / 100; upd(); };
  $('#sc_flex').oninput = e => { sc.flexFactor = +e.target.value / 100; upd(); };
  $('#sc_hire').oninput = e => { sc.extraHirePm = +e.target.value; upd(); };
  $('#sc_hireVanaf').onchange = e => { sc.extraHireVanaf = +e.target.value; upd(); };
  $('#sc_afl').onchange = e => { sc.aflossenAan = e.target.checked; upd(); };
  $('#cfSaldo').onclick = openSaldoModal;
  $('#cfCsv').onclick = openCsvImport;
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-lp]');
    if (!b) return;
    await dbWrite('fin_loan_payments', t => t.update({ gepland: false, datum: todayISO() }).eq('id', +b.dataset.lp));
    await reload('fin_loan_payments', 'loanPayments', 'datum');
    toast('Aflossing geregistreerd ✓'); rerender();
  });
}
