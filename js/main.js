// ═══ MAIN: auth + router ═══

const VIEWS = {
  vandaag: renderVandaag,
  advies: renderAdvies,
  plaatsingen: renderPlaatsingen,
  facturatie: renderFacturatie,
  flex: renderFlex,
  cashflow: renderCashflow,
  kosten: renderKosten,
  instellingen: renderInstellingen,
};
let currentView = 'vandaag';

function rerender() {
  const root = $('#viewRoot');
  const scrollY = window.scrollY;
  root.replaceWith(root.cloneNode(false));           // oude event listeners weg
  VIEWS[currentView]($('#viewRoot'));
  updateBadge();
  window.scrollTo(0, scrollY);
}

function updateBadge() {
  const n = acties().length;
  const btn = $('#nav [data-view="vandaag"]');
  btn.innerHTML = 'Vandaag' + (n ? ` <span class="badge">${n}</span>` : '');
}

function switchView(v) {
  currentView = v;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  window.scrollTo(0, 0);
  rerender();
  window.scrollTo(0, 0);
}

async function startApp() {
  $('#loginScreen').style.display = 'none';
  $('#app').style.display = '';
  $('#viewRoot').innerHTML = `<div class="empty" style="padding:60px">⏳ Cijfers laden…</div>`;
  try {
    await loadAll();
    await autoCreatePlacements();       // W&S: contract getekend → automatisch plaatsing (concept)
    await autoCreateFlexPlacements();   // Flex: contract getekend → automatisch flexkracht (concept)
    await autoStopFromBoard();          // gestopt op het bord → plaatsing automatisch naar gestopt
    $('#syncDot').classList.remove('err');
    // Yuki dagvers houden: max 1× per 20 uur, op de achtergrond
    const ts = S('yuki_synced_at');
    if (!ts || Date.now() - new Date(ts).getTime() > 20 * 3600e3) yukiSync(true);
  } catch (e) {
    $('#syncDot').classList.add('err');
    if (/relation .* does not exist|could not find the table/i.test(e.message || '')) {
      $('#viewRoot').innerHTML = `<div class="panel mt"><h2>Database nog niet klaar</h2>
        <p>De finance-tabellen bestaan nog niet. Draai eerst <b>supabase/schema.sql</b> en daarna <b>supabase/seed.sql</b> in de Supabase SQL Editor (zie README).</p>
        <div class="mt"><button class="btn primary" onclick="startApp()">Opnieuw proberen</button></div></div>`;
      return;
    }
    $('#viewRoot').innerHTML = `<div class="panel mt"><h2>Kan data niet laden</h2>
      <p class="muted">${esc(e.message || e)}</p>
      <div class="mt"><button class="btn primary" onclick="startApp()">Opnieuw proberen</button></div></div>`;
    return;
  }
  switchView('vandaag');
}

// ── Yuki-sync: dagvers saldo/winst/omzet via Edge Function ─────
async function yukiSync(stil = false) {
  try {
    const { data, error } = await sb.functions.invoke('yuki-sync');
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    // verse settings + saldi + open posten ophalen
    const { data: st } = await sb.from('fin_settings').select('*');
    if (st) D.settings = Object.fromEntries(st.map(r => [r.key, r.value]));
    await reload('fin_bank_saldo', 'saldi', 'datum', false);
    await reload('fin_yuki_open', 'yukiOpen', 'datum');
    // Yuki weet welke facturen verstuurd zijn → termijnen automatisch op 'gefactureerd'
    const nGef = await yukiGefactureerdSync();
    if (!stil) toast(`Yuki ✓ — saldo ${eur(data.saldo)} · winst YTD ${eur(data.winst)}${nGef ? ` · ${nGef} factuur(en) automatisch bijgewerkt` : ''}`);
    rerender();
  } catch (e) {
    if (!stil) toast('Yuki-sync mislukt: ' + (e.message || e), true);
  }
}

function loginFout(error) {
  const m = (error.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Onjuist e-mailadres of wachtwoord.';
  if (m.includes('email not confirmed')) return 'E-mailadres nog niet bevestigd — check je inbox.';
  if (m.includes('network') || m.includes('fetch')) return 'Geen verbinding — check je internet.';
  return 'Inloggen mislukt: ' + error.message;
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('.nav-btn');
    if (b) switchView(b.dataset.view);
  });
  $('#logoutBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };

  const doLogin = async () => {
    const btn = $('#loginBtn');
    $('#loginMsg').textContent = '';
    btn.disabled = true; btn.textContent = 'Bezig…';
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: $('#loginEmail').value.trim(), password: $('#loginPass').value,
      });
      if (error) { $('#loginMsg').textContent = loginFout(error); return; }
      if ((data.user?.email || '').toLowerCase() !== OWNER_EMAIL) {
        await sb.auth.signOut();
        $('#loginMsg').textContent = 'Dit account heeft geen toegang tot Finance.';
        return;
      }
      startApp();
    } finally {
      btn.disabled = false; btn.textContent = 'Inloggen';
    }
  };
  $('#loginBtn').onclick = doLogin;
  $('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // al ingelogd (zelfde browser als pijplijnbord)?
  const { data } = await sb.auth.getSession();
  if (data.session && (data.session.user.email || '').toLowerCase() === OWNER_EMAIL) startApp();

  // tab lang open laten staan → cijfers stilletjes verversen bij terugkomst
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if ($('#app').style.display === 'none' || !lastLoadTs) return;
    if (Date.now() - lastLoadTs < 5 * 60 * 1000) return;
    try { await loadAll(); await autoCreatePlacements(); await autoCreateFlexPlacements(); await autoStopFromBoard(); rerender(); } catch (e) { $('#syncDot').classList.add('err'); }
  });
});
