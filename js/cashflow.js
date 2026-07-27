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
  gps: { t: '🎯 Jaardoel-GPS', h: `
    <p><b>Wat je ziet:</b> je winstdoel voor dit jaar en wat er nog moet gebeuren om het te halen — in omzet én in plaatsingen per maand. Twee horizonten: t/m 31 december en de komende 12 maanden.</p>
    <p><b>Hoe berekend:</b> nog te maken winst + resterende kosten = benodigde omzet; daar gaat de flex-run-rate vanaf; wat overblijft ÷ (gemiddelde fee × blijfkans) = benodigde plaatsingen. "Huidig tempo" = je plaatsingen dit jaar per maand.</p>
    <p><b>Hoe sturen:</b> ligt je tempo onder het nodig-tempo, dan weet je precies hoeveel plaatsingen per maand erbij moeten — of dat je aan kosten/flex moet draaien.</p>` },
  uitkeer: { t: '💰 Uitkeer-planner', h: `
    <p><b>Wat je ziet:</b> hoeveel je nu veilig kunt uitkeren (management fee extra, dividend) of extra kunt aflossen zonder in de gevarenzone te komen.</p>
    <p><b>Hoe berekend:</b> het laagste punt van je 12-maands cashprojectie, minus je veiligheidsbuffer en de Vpb-reservering. Geplande aflossingen zitten al in de projectie.</p>
    <p><b>Hoe sturen:</b> schuif "extra uitkeren" en zie direct het effect op je laagste punt. Groen = kan; rood = je zakt onder je buffer.</p>` },
  breakeven: { t: '⚖️ Break-even', h: `
    <p><b>Wat je ziet:</b> hoeveel plaatsingen per maand je nodig hebt om je kosten te dekken. Elke plaatsing daarboven is winst.</p>
    <p><b>Hoe berekend:</b> (gemiddelde maandkosten − doorlopende flex-marge) ÷ (gemiddelde fee × blijfkans). Dus flex verlaagt je break-even, want die dekt al een deel van de kosten.</p>
    <p><b>Hoe sturen:</b> zet dit naast je target. Zit je target ruim boven break-even, dan bouw je buffer op; zit je eronder, dan teer je in.</p>` },
  keten: { t: '🔗 Conversie-keten', h: `
    <p><b>Wat je ziet:</b> hoeveel voorstellen er nodig zijn voor één offer, hoeveel offers voor één plaatsing, en hoeveel plaatsingen er blijven — plus wie z'n tijd echt afmaakt (garantie voltooid).</p>
    <p><b>Hoe berekend:</b> uit je afgeronde trajecten op het bord (fase-historie + uitval-registratie). Offer-stadium = ooit In de wacht, Offer of Contract ondertekenen bereikt. Rechts wordt je jaardoel omgerekend naar benodigde offers en voorstellen per maand.</p>
    <p><b>Hoe sturen:</b> dit zijn je activiteitsdoelen: het aantal voorstellen per maand is de knop waar je als eerste aan draait. Zakt de conversie ergens, dan zie je in het Uitval-tabblad van het bord meteen waaróm (redenen per stap).</p>` },
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
  a_tarief: { t: '🏷 Tarief-adviseur', h: `
    <p><b>Wat je ziet:</b> per klant het afgesproken W&S-tarief naast je gewogen gemiddelde, en hoeveel "rek" er op jaarbasis zit als een klant naar dat gemiddelde zou gaan.</p>
    <p><b>Hoe berekend:</b> netto omzet per klant dit jaar (na vervallen termijnen), geëxtrapoleerd naar 12 maanden; rek = die jaaromzet × het tariefverschil. Gemiddelde is gewogen naar omzet.</p>
    <p><b>Hoe sturen:</b> dit is onderhandelmunitie: bij contractverlenging of een nieuwe aanvraag weet je precies welke klant onder je norm zit en wat één procentpunt waard is. "Geen tarief ✎" = vastleggen bij Instellingen.</p>` },
  winstdoor: { t: '💶 Winst-doorrekening', h: `
    <p><b>Wat je ziet:</b> van je omzetdoel stap voor stap naar wat je écht overhoudt — na kosten, na Vpb, na de lening — en wat je dan kunt uitkeren of investeren.</p>
    <p><b>Hoe berekend:</b> kosten = je laatste afgesloten maand uit Yuki × 12 (de vroege maanden zijn niet representatief door je groei; je kunt de basis handmatig overschrijven). Winst = omzet − kosten. Vpb 19% (25,8% boven €200k). Netto winst − €30k lening = vrij. Als dividend: min box 2 (24,5/31%). Btw zit er niet in — dat is doorgeefgeld.</p>
    <p><b>Hoe sturen:</b> pas het omzetdoel (GPS hierboven) of de kostenbasis aan en zie direct wat er onderaan overblijft. Klap "Hoe kom ik aan deze cijfers?" open om elke stap te controleren.</p>` },
  invest: { t: '🧮 Investeringsbeslisser', h: `
    <p><b>Wat je ziet:</b> tik een investering in (recruiter, marketing, auto, aankoop of vrij) en de app zegt of je 'm je nu kunt veroorloven — met de impact op je buffer, break-even, krapste saldo en terugverdientijd.</p>
    <p><b>Hoe berekend:</b> een eenmalige uitgave drukt je hele saldopad omlaag; een maandlast verhoogt je vaste lasten (en dus je break-even). "Verantwoord" = op je krapste punt de komende 12 maanden blijf je boven je gewenste buffer (Uitkeer-planner). Terugverdientijd = eenmalig ÷ (extra omzet − maandlast).</p>
    <p><b>Hoe sturen:</b> dit beantwoordt "wanneer kan ik investeren": groen = nu, oranje = over X maanden haalbaar. Pas de verwachte extra omzet aan naar jouw inschatting — dat bepaalt de terugverdientijd.</p>` },
  week13: { t: '📅 13-weken cashflow', h: `
    <p><b>Wat je ziet:</b> je verwachte banksaldo week voor week, 13 weken vooruit, met het krapste moment eruit gelicht.</p>
    <p><b>Hoe berekend:</b> ontvangsten = je factuurschema op de verwachte betaaldatum (factuurdatum + betaaltermijn) + flex-weekmarge. Uitgaven = vaste lasten (per week uitgesmeerd) + btw-afdrachten en aflossingen op hun echte datum. Nieuwe, nog niet-gefactureerde omzet zit er bewust NIET in — dit is je zekere kaspositie.</p>
    <p><b>Hoe sturen:</b> zo zie je vooraf of de btw-afdracht, salarissen en een trage betaler samenvallen. Plan grote uitgaven in de weken met ruimte, niet rond het dieptepunt.</p>` },
  a_belasting: { t: '🧾 Belasting & DGA', h: `
    <p><b>Wat je ziet:</b> je twee belastingsoorten strikt uit elkaar (btw = doorgeefgeld, Vpb = winstbelasting), je Vpb-reservering, een gebruikelijkloon-check en de winst-vs-uitkeren-afweging.</p>
    <p><b>Hoe berekend:</b> btw = 21% over gefactureerde omzet − voorbelasting (per kwartaal). Vpb = 19% over je jaarwinst (omzet − kosten), bepaald op 31 december — dus over het héle jaar. DGA-loon reken je zelf in (bruto/maand + startmaand); de norm is het gebruikelijk loon 2026 van €58.000.</p>
    <p><b>Belangrijk:</b> dit is een signalerings- en rekenhulp, géén belastingadvies. Tarieven veranderen jaarlijks en jouw situatie kan afwijken. Gebruik dit om de juiste vragen aan je boekhouder te stellen — de knopen hak je met hem/haar door.</p>` },
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

// ── uitkeer-planner (DGA) ──────────────────────────────────────
let _ukExtra = 0;
function ukHtml() {
  const uk = uitkeerRuimte(_ukExtra);
  const veilig = uk.ruimte > 0;
  return `
    <div class="pot"><span>Laagste cashpunt komende 12 mnd</span><b>${eur(uk.laagste)} <span class="muted">(${esc(uk.laagsteLabel || '')})</span></b></div>
    <div class="pot"><span>Aan te houden: buffer + Vpb-pot</span><b>${eur(uk.buffer)} + ${eur(uk.vpb)}</b></div>
    <div class="pot"><span>Nu veilig uit te keren / af te lossen</span><b style="color:${veilig ? 'var(--green)' : 'var(--red)'}">${eur(uk.ruimte)}</b></div>
    <div class="slider-row"><span>Wat-als: extra uitkeren</span>
      <input type="range" id="uk_extra" min="0" max="50000" step="500" value="${_ukExtra}"><b id="ukv_extra">${eur(_ukExtra)}</b></div>
    ${_ukExtra > 0 ? `<p class="muted" style="margin:4px 0 8px">Bij ${eur(_ukExtra)} extra wordt je laagste punt <b style="color:${uk.veiligNaExtra ? 'var(--green)' : 'var(--red)'}">${eur(uk.naExtra)}</b>${uk.veiligNaExtra ? ' — dat kan.' : ' — <b>onder je buffer + Vpb-reservering, niet doen.</b>'}</p>` : ''}
    <div class="slider-row"><span>Veiligheidsbuffer</span>
      <input type="range" id="uk_buffer" min="0" max="40000" step="1000" value="${uk.buffer}"><b id="ukv_buffer">${eur(uk.buffer)}</b></div>
    <p class="muted">Ruimte = laagste projectie-saldo − buffer − Vpb-reservering. Geplande aflossingen (o.a. aan je moeder) zitten al in de projectie.</p>`;
}
function wireUitkeer() {
  const wrap = $('#ukDyn'); if (!wrap) return;
  wrap.querySelector('#uk_extra').oninput = e => { _ukExtra = +e.target.value; wrap.innerHTML = ukHtml(); wireUitkeer(); };
  wrap.querySelector('#uk_buffer').onchange = async e => { await saveSetting('cash_buffer_min', +e.target.value); wrap.innerHTML = ukHtml(); wireUitkeer(); };
  wrap.querySelector('#uk_buffer').oninput = e => { $('#ukv_buffer').textContent = eur(+e.target.value); };
}

// ── conversie-keten: overzichtelijk + filterbaar per klant/recruiter ──
let _ketK = '', _ketR = '', _ketStap = '';
function ketenHtml() {
  const alleRes = D.candidates.filter(c => !isFlexType(c.type) && !(c.vervangt || '') && isResolvedCand(c));
  if (!alleRes.length) return '<div class="empty">Nog geen afgeronde trajecten op het bord.</div>';
  const klanten = [...new Set(alleRes.map(c => c.klant).filter(Boolean))].sort();
  const recs = [...new Set(alleRes.map(c => (c.rec || '').trim()).filter(Boolean))].sort();
  if (_ketK && !klanten.includes(_ketK)) _ketK = '';
  if (_ketR && !recs.includes(_ketR)) _ketR = '';
  const ck = conversieKeten({ klant: _ketK, rec: _ketR });
  const f1 = x => x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('nl-NL');
  const p = x => x == null ? '—' : Math.round(x * 100) + '%';
  const kaart = (val, lbl, sub, kleur) => `<div class="kpi ${kleur || ''}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
  const gps = (!_ketK && !_ketR) ? jaardoelGps() : null;
  const nodigPm = gps && gps.doel != null && gps.restJaar && gps.restJaar.perMnd != null ? gps.restJaar.perMnd : null;
  return `
    <div class="row mb" style="gap:10px;flex-wrap:wrap">
      <select id="ket_klant"><option value="">Alle klanten</option>${klanten.map(k => `<option ${k === _ketK ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
      <select id="ket_rec"><option value="">Alle recruiters</option>${recs.map(r => `<option ${r === _ketR ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      ${(_ketK || _ketR) ? `<span class="tag amber">gefilterd · ${ck.voorstellen} trajecten</span>` : `<span class="muted" style="align-self:center">${ck.voorstellen} afgeronde trajecten</span>`}
    </div>
    <div class="grid cols-4 mb">
      ${kaart(`${f1(ck.voorPerOffer)} <span style="font-size:.55em">→ 1</span>`, 'Voorstellen → 1 offer', `${ck.offers} van ${ck.voorstellen} halen het offer-stadium (${p(ck.pctOffer)})`)}
      ${kaart(`${f1(ck.offerPerPlaatsing)} <span style="font-size:.55em">→ 1</span>`, 'Offers → 1 plaatsing', `${ck.plaats} van ${ck.offers} tekenen (${p(ck.pctPlaats)})`)}
      ${kaart(`${ck.blijft && ck.plaats ? f1(ck.plaats / ck.blijft) : '—'} <span style="font-size:.55em">→ 1</span>`, 'Plaatsingen → 1 blijver', `${ck.blijft} van ${ck.plaats} blijven (${p(ck.pctBlijft)})`)}
      ${kaart(f1(ck.voorPerBlijver), 'Voorstellen per blijvende plaatsing', `duurzaam (tijd afgemaakt): ${ck.duurzaam} van ${ck.plaats} (${p(ck.pctDuurzaam)})`, 'good')}
    </div>
    <div class="ketrij">
      <button class="ketstap ${_ketStap === 'voorstellen' ? 'aan' : ''}" data-stap="voorstellen"><div class="kn">${ck.voorstellen}</div><div class="kl">voorgesteld<br>(in procedure)</div></button>
      <div class="ketpijl">→ ${p(ck.pctOffer)}</div>
      <button class="ketstap ${_ketStap === 'offers' ? 'aan' : ''}" data-stap="offers"><div class="kn">${ck.offers}</div><div class="kl">offer-stadium<br>bereikt</div></button>
      <div class="ketpijl">→ ${p(ck.pctPlaats)}</div>
      <button class="ketstap ${_ketStap === 'plaats' ? 'aan' : ''}" data-stap="plaats"><div class="kn">${ck.plaats}</div><div class="kl">plaatsing<br>(getekend)</div></button>
      <div class="ketpijl">→ ${p(ck.pctBlijft)}</div>
      <button class="ketstap ${_ketStap === 'blijft' ? 'aan' : ''}" data-stap="blijft"><div class="kn">${ck.blijft}</div><div class="kl">blijft<br>(niet gestopt)</div></button>
    </div>
    ${_ketStap && ck.lijsten[_ketStap] ? (() => {
      const titelMap = { voorstellen: 'Voorgesteld (in procedure genomen)', offers: 'Offer-stadium bereikt', plaats: 'Plaatsing (getekend)', blijft: 'Blijft (niet gestopt)' };
      const status = c => {
        if (c.geplaatst_op || ['Contract getekend', 'Gestart'].includes(c.fase)) {
          if (c.fase === 'Gestopt' || c.gestopt_op) return tag(`🛑 gestopt${c.stop_categorie ? ' · ' + c.stop_categorie : ''}`, 'red');
          return tag('✓ geplaatst' + (c.fase === 'Gestart' ? ' · gestart' : ''), 'green');
        }
        if (c.afval_type === 'offer_afgewezen') return tag(`💔 offer afgewezen${c.afval_categorie ? ' · ' + c.afval_categorie : ''}`, 'amber');
        return tag(`afgevallen${c.afval_categorie ? ' · ' + c.afval_categorie : ''}`, 'gray');
      };
      const rows = ck.lijsten[_ketStap].slice().sort((a, b) => (a.klant || '').localeCompare(b.klant || '') || (a.naam || '').localeCompare(b.naam || ''))
        .map(c => `<tr><td><b>${esc(c.naam)}</b></td><td>${esc(c.klant || '—')}</td><td>${esc(c.functie || '—')}</td><td>${esc((c.rec || '').trim() || '—')}</td><td>${status(c)}</td></tr>`).join('');
      return `<div class="mt table-wrap"><h3 style="margin:0 0 6px">${titelMap[_ketStap]} — ${ck.lijsten[_ketStap].length} ${_ketK || _ketR ? '(gefilterd)' : ''}</h3>
        <table><tr><th>Kandidaat</th><th>Klant</th><th>Functie</th><th>Recruiter</th><th>Uitkomst</th></tr>${rows || '<tr><td colspan="5" class="empty">Niemand in deze stap.</td></tr>'}</table></div>`;
    })() : `<p class="muted mt" style="font-size:12.5px">Klik op een stap voor de namen.</p>`}
    ${nodigPm != null ? `<p class="mt" style="font-size:14.5px">🎯 Voor je doel (<b>${f1(nodigPm)} plaatsingen/mnd</b>) betekent dit: <b>${f1(nodigPm * (ck.offerPerPlaatsing || 0))} offers</b> en <b style="color:var(--accent)">${f1(nodigPm * (ck.voorPerPlaatsing || 0))} voorstellen per maand</b>.</p>` : ''}
    <p class="muted mt">${(_ketK || _ketR) ? 'Let op: kleine aantallen per klant/recruiter geven grove percentages — kijk naar de verhouding, niet de decimalen. ' : ''}Offer-stadium = ooit In de wacht/Offer/Contract ondertekenen bereikt. Wordt scherper naarmate de fase-historie van het bord vult.</p>`;
}
function wireKeten() {
  const wrap = $('#ketDyn'); if (!wrap) return;
  const her = () => { wrap.innerHTML = ketenHtml(); wireKeten(); };
  const k = wrap.querySelector('#ket_klant'), r = wrap.querySelector('#ket_rec');
  if (k) k.onchange = e => { _ketK = e.target.value; her(); };
  if (r) r.onchange = e => { _ketR = e.target.value; her(); };
  wrap.querySelectorAll('.ketstap').forEach(b => b.onclick = () => { _ketStap = _ketStap === b.dataset.stap ? '' : b.dataset.stap; her(); });
}

// ── Investeringsbeslisser ──────────────────────────────────────
let _invest = null;
function investPreset(key) {
  const gemFee = Math.round(kpis().gemFee || 8500);
  const p = {
    recruiter: { key, eenmalig: 0, maandlast: 4300, extraOmzetPm: gemFee * 2 },
    marketing: { key, eenmalig: 0, maandlast: 3000, extraOmzetPm: gemFee },
    auto: { key, eenmalig: 0, maandlast: 800, extraOmzetPm: 0 },
    aankoop: { key, eenmalig: 10000, maandlast: 0, extraOmzetPm: 0 },
    vrij: { key, eenmalig: 0, maandlast: 0, extraOmzetPm: 0 },
  }[key];
  return p || { key: 'vrij', eenmalig: 0, maandlast: 0, extraOmzetPm: 0 };
}
function investHtml() {
  if (!_invest) _invest = investPreset('recruiter');
  const iv = _invest, chk = investeringsCheck(iv), r = chk.r;
  const presets = [['recruiter', '👤 Recruiter'], ['marketing', '📣 Marketing'], ['auto', '🚗 Auto'], ['aankoop', '🛒 Aankoop'], ['vrij', '✏️ Vrij']];
  const oordeel = chk.haalbaarNu
    ? `<span class="tag green" style="font-size:13px">✅ Verantwoord — je blijft boven je buffer</span>`
    : chk.maandenTot != null
      ? `<span class="tag amber" style="font-size:13px">⏳ Nog even wachten — haalbaar over ~${chk.maandenTot} maand${chk.maandenTot === 1 ? '' : 'en'}</span>`
      : `<span class="tag red" style="font-size:13px">⛔ Niet met je huidige cashflow</span>`;
  const advies = chk.haalbaarNu
    ? `Je hebt ~<b>${eur(r.ruimteNu)}</b> vrij bovenop je buffer (${eur(r.euroBuffer)}). Deze keuze laat je krapste punt komende 12 mnd op <b>${eur(chk.laagsteNa)}</b> — nog steeds veilig.${chk.payback != null ? ` Terugverdiend in ~<b>${chk.payback.toFixed(1)} maanden</b>.` : ''}`
    : `Deze uitgave duwt je krapste punt naar <b>${eur(chk.laagsteNa)}</b>, onder je gewenste buffer van ${eur(r.euroBuffer)} (tekort ${eur(chk.tekort)}).${chk.maandenTot != null ? ` Op je huidige vrije kasstroom (~${eur(r.netto6)}/mnd) kan het over ~<b>${chk.maandenTot} maanden</b> wél.` : ' Zet eerst je omzet/incasso op orde.'}`;
  const laatste = chk.eenmalig > 0
    ? `<div class="pot"><span>Terugverdientijd</span><b>${chk.payback != null ? chk.payback.toFixed(1) + ' mnd' : '—'}</b></div>`
    : `<div class="pot"><span>Netto bijdrage/mnd</span><b style="color:${chk.nettoPerMnd >= 0 ? 'var(--green)' : 'var(--red)'}">${chk.nettoPerMnd >= 0 ? '+' : ''}${eur(chk.nettoPerMnd)}</b></div>`;
  return `
    <div class="row mb" style="gap:6px;flex-wrap:wrap">${presets.map(([k, l]) => `<button class="btn small ${iv.key === k ? 'primary' : ''}" data-ivp="${k}">${l}</button>`).join('')}</div>
    <div class="grid cols-3 mb" style="gap:10px">
      <label class="muted" style="font-size:12px;display:block">Eenmalig €<br><input id="iv_een" type="number" min="0" step="500" value="${iv.eenmalig}" style="width:100%"></label>
      <label class="muted" style="font-size:12px;display:block">Maandlast €<br><input id="iv_mnd" type="number" min="0" step="100" value="${iv.maandlast}" style="width:100%"></label>
      <label class="muted" style="font-size:12px;display:block">Verwachte extra omzet/mnd €<br><input id="iv_omz" type="number" min="0" step="500" value="${iv.extraOmzetPm}" style="width:100%"></label>
    </div>
    <div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px">
      <div style="margin-bottom:8px">${oordeel}</div>
      <div class="grid cols-2" style="gap:2px 18px">
        <div class="pot"><span>Buffer (mnd vaste lasten)</span><b>${chk.bufferVoorMnd.toFixed(1)} → ${chk.bufferNaMnd.toFixed(1)}</b></div>
        <div class="pot"><span>Break-even</span><b>${chk.breakEvenVoor ? chk.breakEvenVoor.toFixed(1) : '—'} → ${chk.breakEvenNa ? chk.breakEvenNa.toFixed(1) : '—'} pl/mnd</b></div>
        <div class="pot"><span>Krapste saldo (12 mnd)</span><b>${eur(chk.laagsteVoor)} → ${eur(chk.laagsteNa)}</b></div>
        ${laatste}
      </div>
    </div>
    <p class="muted" style="font-size:12px">👉 ${advies}</p>`;
}
function wireInvest() {
  const wrap = $('#investDyn'); if (!wrap) return;
  const her = () => { wrap.innerHTML = investHtml(); wireInvest(); };
  wrap.querySelectorAll('[data-ivp]').forEach(b => b.onclick = () => { _invest = investPreset(b.dataset.ivp); her(); });
  const bind = (id, veld) => { const el = wrap.querySelector(id); if (el) el.oninput = e => { _invest[veld] = Math.max(0, Number(e.target.value) || 0); _invest.key = 'vrij'; wrap.querySelectorAll('[data-ivp]').forEach(b => b.classList.toggle('primary', b.dataset.ivp === 'vrij')); const chk = investHtml(); /* herbereken alleen output */ wrap.innerHTML = chk; wireInvest(); }; };
  bind('#iv_een', 'eenmalig'); bind('#iv_mnd', 'maandlast'); bind('#iv_omz', 'extraOmzetPm');
}

// ── 13-weken cashflow ──────────────────────────────────────────
function weekCashHtml() {
  const wp = weekProjectie(13), min = wp.laagste;
  const negatief = wp.weeks.some(w => w.saldo < 0);
  return `
    <div class="muted mb" style="font-size:12px">Week-voor-week je verwachte banksaldo (facturen op betaaldatum, flex, vaste lasten, btw-afdrachten, aflossingen). Krapste moment: <b>week van ${fmtD(min.start)}</b> → <b style="color:${min.saldo < 0 ? 'var(--red)' : 'var(--accent)'}">${eur(min.saldo)}</b>${negatief ? ' <span class="tag red">saldo wordt negatief!</span>' : ''}.</div>
    <div class="table-wrap"><table>
      <tr><th>Week vanaf</th><th class="num">In</th><th class="num">Uit</th><th class="num">Netto</th><th class="num">Saldo eind</th></tr>
      ${wp.weeks.map(w => `<tr ${w === min ? 'style="background:rgba(200,241,53,.08)"' : ''}><td>${fmtD(w.start)}${w === min ? ' <span class="tag amber">laagst</span>' : ''}</td>
        <td class="num">${w.in ? eur(w.in) : '—'}</td><td class="num">${w.uit ? eur(w.uit) : '—'}</td>
        <td class="num" style="color:${w.netto < 0 ? 'var(--red)' : 'var(--green)'}">${w.netto >= 0 ? '+' : ''}${eur(w.netto)}</td>
        <td class="num"><b style="color:${w.saldo < 0 ? 'var(--red)' : 'var(--txt)'}">${eur(w.saldo)}</b></td></tr>`).join('')}
    </table></div>
    <p class="muted mt" style="font-size:11px">Vaste lasten zijn per week uitgesmeerd; btw-afdrachten en aflossingen staan op hun echte datum (daar zie je de dips). Nieuwe, nog niet-gefactureerde W&S-omzet zit hier <b>niet</b> in — dit is je zekere kaspositie.</p>`;
}

// ── winst-doorrekening (transparante winst-brug) ───────────────
function winstDoorHtml() {
  const w = winstDoorrekening();
  const line = (label, bedrag, o = {}) => `<tr style="${o.sum ? 'border-top:1px solid var(--line);font-weight:700' : ''}">
    <td style="padding:6px 4px">${label}</td>
    <td class="num" style="padding:6px 4px;${o.neg ? 'color:var(--red)' : ''}${o.big ? ';font-size:18px' : ''}">${o.neg ? '−' : ''}${eur(Math.abs(bedrag))}</td></tr>`;
  return `
    <div class="grid cols-3 mb" style="gap:12px">
      <label class="muted" style="font-size:12px;display:block">Kosten/mnd (Yuki-basis) €<br>
        <input id="wd_kosten" type="number" min="0" step="500" value="${Math.round(w.basisKosten)}" style="width:100%"></label>
      <label class="muted" style="font-size:12px;display:block">+ Extra loonkosten/mnd €<br>
        <input id="wd_extraloon" type="number" min="0" step="100" value="${Math.round(w.extraLoon)}" style="width:100%"></label>
      <label class="muted" style="font-size:12px;display:block">Herinvesteren dit jaar €<br>
        <input id="wd_herinvest" type="number" min="0" step="5000" value="${Math.round(w.herinvest)}" style="width:100%"></label>
    </div>
    <div class="muted mb" style="font-size:12px">Kostenbasis: <b>${eur(w.basisKosten)}</b>${w.extraLoon > 0 ? ` + <b>${eur(w.extraLoon)}</b> extra loon = <b>${eur(w.kostenMaand)}</b>` : ''}/mnd · bron: <b>${esc(w.kostenBron)}</b> ${w.override ? `<button class="btn small ghost" id="wd_reset">↺ terug naar Yuki</button>` : ''}</div>
    <div class="table-wrap"><table style="font-size:14px">
      ${line('Omzet (doel)', w.doel)}
      ${line(`− Kosten <span class="muted">(${eur(w.kostenMaand)}/mnd × 12)</span>`, w.kostenJaar, { neg: true })}
      ${w.herinvest > 0 ? line('− Herinvesteren <span class="muted">(extra aftrekbare kosten)</span>', w.herinvest, { neg: true }) : ''}
      ${line('= Winst vóór Vpb', w.winstVoorVpb, { sum: true })}
      ${line(`− Vpb <span class="muted">(19% tot €200k, 25,8% erboven)</span>${w.vpbBesparing > 0 ? ` <span style="color:var(--green)">−${eur(w.vpbBesparing)} bespaard</span>` : ''}`, w.vpb, { neg: true })}
      ${line('= Netto winst (na Vpb)', w.nettoWinst, { sum: true })}
      ${line('− Aflossing lening moeder', w.leningAflossing, { neg: true })}
      ${line('<b>= Vrij: uitkeren of investeren</b>', w.vrij, { sum: true, big: true })}
    </table></div>
    ${w.herinvest > 0 ? `<p class="muted mt" style="font-size:12px;background:var(--limebg);border-radius:8px;padding:8px 10px">🏗 Je herinvesteert <b>${eur(w.herinvest)}</b> → dat bespaart <b style="color:var(--green)">${eur(w.vpbBesparing)}</b> Vpb, maar kost je <b>${eur(w.herinvest)}</b> cash. Netto ben je <b>${eur(w.herinvest - w.vpbBesparing)}</b> "kwijt" (in ruil voor iets voor het bedrijf). Alleen slim als je die investering tóch wilde doen.</p>` : ''}
    <div class="grid cols-2 mt" style="gap:12px">
      <div style="border:1px solid var(--line);border-radius:10px;padding:11px 13px;border-left:4px solid var(--accent)">
        <div class="muted" style="font-size:11px;text-transform:uppercase">💰 Als dividend uitkeren (box 2)</div>
        <div style="font-size:18px;font-weight:700">${eur(w.dividendNetto)} <span class="muted" style="font-size:12px;font-weight:400">netto privé</span></div>
        <div class="muted" style="font-size:11px">na box 2 ${eur(w.box2)}</div>
      </div>
      <div style="border:1px solid var(--line);border-radius:10px;padding:11px 13px">
        <div class="muted" style="font-size:11px;text-transform:uppercase">🏗 Of investeren in het bedrijf</div>
        <div style="font-size:18px;font-weight:700">${eur(w.vrij)}</div>
        <div class="muted" style="font-size:11px">volledig herinvesteren (geen box 2)</div>
      </div>
    </div>
    <p class="muted mt" style="font-size:12px">ℹ️ <b>Btw staat hier bewust niet in</b> — dat is doorgeefgeld (je int het van klanten en stort het door), het verlaagt je winst niet en is over het jaar cash-neutraal. De lening (€30k) is géén kosten maar een balanspost; hij verlaagt wél je vrije cash.</p>
    <details style="margin-top:12px">
      <summary style="cursor:pointer;font-weight:600">🔍 Hoe kom ik precies aan deze cijfers?</summary>
      <div style="font-size:13px;margin-top:8px">
        <p><b>Kostenbasis:</b> je laatste afgesloten maand (${w.laatsteMaand ? fmtMaand(w.laatsteMaand) : '—'}) uit Yuki = <b>${eur(w.kostenMaand)}</b>. De eerste maanden laat ik bewust vallen — die zijn niet representatief door je groei:</p>
        <div class="table-wrap"><table style="font-size:12px">
          <tr><th>Maand</th><th class="num">Werkelijke kosten (Yuki)</th></tr>
          ${w.actuals.map(a => `<tr><td>${fmtMaand(a.maand)}</td><td class="num">${eur(a.bedrag)}</td></tr>`).join('')}
        </table></div>
        <p style="margin-top:8px"><b>Omzet per plaatsing:</b> gemiddelde fee van je plaatsingen dit jaar = ${eur(w.gemFee)}.<br>
        <b>Uitval:</b> ${Math.round(w.stopPct * 100)}% van je plaatsingen stopt (blijfkans ${Math.round(w.blijf * 100)}%) — een gestopte verliest een deel van de fee, dus houd marge aan.<br>
        <b>Plaatsingen voor ${eur(w.doel)}:</b> (${eur(w.doel)} − ${eur(w.flexJaar)} flex) ÷ ${eur(w.gemFee)} = <b>${w.plaatsingenVoorDoel != null ? Math.round(w.plaatsingenVoorDoel) : '—'} plaatsingen/jaar</b>. Je zit op ${w.plaatsingenYtd} YTD.<br>
        <b>Vpb:</b> 19% over de winst tot €200k, 25,8% daarboven (tarief 2026).<br>
        <b>Box 2 (dividend):</b> 24,5% tot €68.843, 31% daarboven.</p>
        <p class="muted">Live nu: winst YTD <b>${eur(w.winstYtd)}</b>, banksaldo <b>${eur(w.saldoNu)}</b>. Dit blok is de <b>prognose</b> bij ${eur(w.doel)} omzet; de exacte stand op de bank per datum volgt uit de 13-weken cashflow en de saldo-projectie (die verrekenen de timing van btw, Vpb en facturen).</p>
      </div>
    </details>`;
}
function wireWinstDoor() {
  const wrap = $('#winstDoorDyn'); if (!wrap) return;
  const kn = wrap.querySelector('#wd_kosten');
  if (kn) kn.onchange = async e => { await saveSetting('kosten_pm_override', Math.max(0, Number(e.target.value) || 0)); rerender(); };
  const el = wrap.querySelector('#wd_extraloon');
  if (el) el.onchange = async e => { await saveSetting('extra_loon_pm', Math.max(0, Number(e.target.value) || 0)); rerender(); };
  const hi = wrap.querySelector('#wd_herinvest');
  if (hi) hi.onchange = async e => { await saveSetting('herinvest_jaar', Math.max(0, Number(e.target.value) || 0)); rerender(); };
  const rs = wrap.querySelector('#wd_reset');
  if (rs) rs.onclick = async () => { await saveSetting('kosten_pm_override', 0); rerender(); };
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

  const gps = jaardoelGps();
  const od = omzetDoel();
  const jaarNu = todayISO().slice(0, 4);
  const gpsBlok = (titel, b) => b ? `
    <div class="panel2box">
      <h3 style="margin:0 0 6px">${titel}</h3>
      <div class="pot"><span>Omzet nodig (excl. btw)</span><b>${eur(b.omzetNodig)}</b></div>
      <div class="pot"><span>waarvan kosten te dekken</span><b class="muted">${eur(b.kosten)}</b></div>
      <div class="pot"><span>Flex dekt (run-rate)</span><b>${eur(b.flexBij)}</b></div>
      <div class="pot"><span>W&S nodig</span><b>${eur(b.wsNodig)}</b></div>
      <div class="pot"><span>= Plaatsingen</span><b style="color:var(--accent)">${b.plaats != null ? b.plaats.toFixed(1) : '—'} <span class="muted">(${b.perMnd != null ? b.perMnd.toFixed(1) : '—'}/mnd)</span></b></div>
    </div>` : '';
  const gpsHtml = gps.doel == null ? `<div class="empty">Vul rechtsboven je winstdoel voor ${jaarNu} in — dan rekent de GPS uit wat er per maand moet gebeuren.</div>` : (() => {
    const pctDoel = Math.max(0, Math.min(1, gps.winstYtd / gps.doel));
    const opKoers = gps.restJaar.perMnd != null && gps.tempo >= gps.restJaar.perMnd;
    return `
    <div class="grid cols-4 mb">
      <div class="kpi ${gps.winstYtd >= gps.doel ? 'good' : ''}"><div class="lbl">Winst YTD</div><div class="val">${eur(gps.winstYtd)}</div><div class="sub">van ${eur(gps.doel)} doel (${Math.round(pctDoel * 100)}%)</div></div>
      <div class="kpi ${gps.teGaan <= 0 ? 'good' : ''}"><div class="lbl">Nog te gaan t/m 31 dec</div><div class="val">${gps.teGaan <= 0 ? '🎉 gehaald' : eur(gps.teGaan)}</div><div class="sub">${gps.mndRest} maanden</div></div>
      <div class="kpi"><div class="lbl">Nodig tempo</div><div class="val">${gps.restJaar.perMnd != null ? gps.restJaar.perMnd.toFixed(1) : '—'}/mnd</div><div class="sub">plaatsingen (na uitval ${Math.round(gps.blijf * 100)}%)</div></div>
      <div class="kpi ${opKoers ? 'good' : 'warn'}"><div class="lbl">Huidig tempo ${jaarNu}</div><div class="val">${gps.tempo.toFixed(1)}/mnd</div><div class="sub">${opKoers ? '✓ op koers' : `${(gps.restJaar.perMnd - gps.tempo).toFixed(1)}/mnd te weinig`}</div></div>
    </div>
    <div class="cbar mb" style="height:10px"><i style="width:${Math.round(pctDoel * 100)}%;background:${gps.winstYtd >= gps.doel ? 'var(--green)' : 'var(--accent)'};display:block;height:100%"></i></div>
    <div class="grid cols-2">
      ${gpsBlok(`📅 T/m 31 december (${gps.mndRest} mnd)`, gps.restJaar)}
      ${gpsBlok('🔄 Komende 12 maanden (zelfde doel)', gps.rolling)}
    </div>`;
  })();

  root.innerHTML = `
    <div class="spread mb"><h1>Cashflow & toekomst</h1>
      <span class="muted" style="font-size:12px">🔄 Saldo & cijfers automatisch uit Yuki${S('yuki_synced_at') ? ` · ${fmtD(S('yuki_synced_at').slice(0, 10))}` : ''}</span></div>

    <div class="panel mb"><div class="spread mb"><h2>🎯 Jaardoel-GPS ${uitlegChip('gps')}</h2>
      <span class="row" style="gap:12px;align-items:center;flex-wrap:wrap">
        <span class="row" style="gap:6px;align-items:center"><label style="margin:0">Doelomzet ${jaarNu} (€)</label>
        <input id="gps_omzet" type="number" step="10000" min="0" value="${od.doel}" style="width:110px"></span>
        <span class="row" style="gap:6px;align-items:center"><label style="margin:0">Doelwinst (€)</label>
        <input id="gps_doel" type="number" step="5000" min="0" value="${gps.doel ?? ''}" placeholder="bijv. 190000" style="width:110px"></span>
      </span></div>
      <div class="grid cols-4 mb">
        <div class="kpi"><div class="lbl">Omzet YTD ${jaarNu}</div><div class="val">${eur(od.omzetYtd)}</div><div class="sub">van ${eur(od.doel)} · ${Math.round(od.pctDoel * 100)}% · koers ~${eur(od.omzetRunRate)}</div></div>
        <div class="kpi"><div class="lbl">Winst YTD <span class="muted">(vóór Vpb)</span></div><div class="val">${eur(od.winstYtd)}</div><div class="sub">marge ${od.omzetYtd ? Math.round(od.winstYtd / od.omzetYtd * 100) : 0}%</div></div>
        <div class="kpi accent"><div class="lbl">Nodig voor ${eur(od.doel)}</div><div class="val">${od.plaatsingenNodig != null ? Math.round(od.plaatsingenNodig) : '—'} <span class="muted" style="font-size:13px">plaatsingen</span></div><div class="sub">~${od.perMnd != null ? od.perMnd.toFixed(1) : '—'}/mnd · ná ~${eur(od.flexJaar)} flex</div></div>
        <div class="kpi"><div class="lbl">Plaatsingen YTD</div><div class="val">${od.plaatsingenYtd}</div><div class="sub">dit jaar tot nu</div></div>
      </div>
      <div class="cbar mb" style="height:10px"><i style="width:${Math.round(od.pctDoel * 100)}%;background:var(--accent);display:block;height:100%"></i></div>
      <p class="muted mb" style="font-size:12px">Voor <b>${eur(od.doel)}</b> omzet heb je ~<b>${od.plaatsingenNodig != null ? Math.round(od.plaatsingenNodig) : '—'} plaatsingen</b> per jaar nodig (${od.perMnd != null ? od.perMnd.toFixed(1) : '—'}/mnd), bij je gem. fee van ${eur(od.gemFee)} en ná de flex-bijdrage. Houd wat marge aan: ~${Math.round((1 - od.blijf) * 100)}% van je plaatsingen stopt en verliest een deel van de fee.</p>
      ${gpsHtml}</div>

    <div class="panel mb"><h2>💶 Winst-doorrekening <span class="muted">— van omzet tot wat je overhoudt</span> ${uitlegChip('winstdoor')}</h2>
      <div id="winstDoorDyn">${winstDoorHtml()}</div></div>

    <div class="grid cols-2 mb">
      <div class="panel"><h2>🧮 Investeringsbeslisser <span class="muted">— kan ik dit veroorloven?</span> ${uitlegChip('invest')}</h2>
        <div id="investDyn">${investHtml()}</div></div>
      <div class="panel"><h2>📅 13-weken cashflow <span class="muted">— grip op de timing</span> ${uitlegChip('week13')}</h2>
        ${weekCashHtml()}</div>
    </div>

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
      <div>
        <div class="panel mb"><h2>💰 Uitkeer-planner ${uitlegChip('uitkeer')}</h2><div id="ukDyn">${ukHtml()}</div></div>
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

    <div class="panel mb" id="ketPanel"><h2>🔗 Conversie-keten <span class="muted">— van voorstel tot blijvende plaatsing</span> ${uitlegChip('keten')}</h2>
      <div id="ketDyn">${ketenHtml()}</div></div>

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
  $('#gps_doel').onchange = async e => { await saveSetting('doel_winst_jaar', Math.max(0, +e.target.value || 0)); toast('Doelwinst opgeslagen ✓'); rerender(); };
  $('#gps_omzet').onchange = async e => { await saveSetting('doel_omzet_jaar', Math.max(0, +e.target.value || 0)); toast('Doelomzet opgeslagen ✓'); rerender(); };
  wireUitkeer();
  wireKeten();
  wireInvest();
  wireWinstDoor();
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
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-lp]');
    if (!b) return;
    await dbWrite('fin_loan_payments', t => t.update({ gepland: false, datum: todayISO() }).eq('id', +b.dataset.lp));
    await reload('fin_loan_payments', 'loanPayments', 'datum');
    toast('Aflossing geregistreerd ✓'); rerender();
  });
}
