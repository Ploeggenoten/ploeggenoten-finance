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
  try {
    await loadAll();
    $('#syncDot').classList.remove('err');
  } catch (e) {
    $('#syncDot').classList.add('err');
    if (/relation .* does not exist|could not find the table/i.test(e.message || '')) {
      $('#viewRoot').innerHTML = `<div class="panel mt"><h2>Database nog niet klaar</h2>
        <p>De finance-tabellen bestaan nog niet. Draai eerst <b>supabase/schema.sql</b> en daarna <b>supabase/seed.sql</b> in de Supabase SQL Editor.</p></div>`;
      return;
    }
    $('#viewRoot').innerHTML = `<div class="panel mt"><h2>Kan data niet laden</h2><p class="muted">${esc(e.message || e)}</p></div>`;
    return;
  }
  switchView('vandaag');
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('.nav-btn');
    if (b) switchView(b.dataset.view);
  });
  $('#logoutBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };

  const doLogin = async () => {
    $('#loginMsg').textContent = '';
    const { data, error } = await sb.auth.signInWithPassword({
      email: $('#loginEmail').value.trim(), password: $('#loginPass').value,
    });
    if (error) { $('#loginMsg').textContent = 'Inloggen mislukt: ' + error.message; return; }
    if ((data.user?.email || '').toLowerCase() !== OWNER_EMAIL) {
      await sb.auth.signOut();
      $('#loginMsg').textContent = 'Dit account heeft geen toegang tot Finance.';
      return;
    }
    startApp();
  };
  $('#loginBtn').onclick = doLogin;
  $('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // al ingelogd (zelfde browser als pijplijnbord)?
  const { data } = await sb.auth.getSession();
  if (data.session && (data.session.user.email || '').toLowerCase() === OWNER_EMAIL) startApp();
});
