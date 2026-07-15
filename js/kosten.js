// ═══ VIEW: Kosten — budget (vaste lasten) + werkelijke realisatie ═══

function renderKosten(root) {
  const t = todayISO();
  // laatste 6 maanden + huidige
  const maanden = [];
  for (let i = 5; i >= 0; i--) maanden.push(addMonths(monthKey(t), -i));

  const budgetRows = D.budget.map(b => `<tr>
    <td>${esc(b.categorie)}</td><td class="num">${eur(b.bedrag_pm)}</td>
    <td>${fmtMaand(b.vanaf_maand)}</td><td>${b.tot_maand ? fmtMaand(b.tot_maand) : 'doorlopend'}</td>
    <td class="muted">${esc(b.note || '')}</td>
    <td class="right"><button class="btn small ghost" data-beditb="${b.id}">✎</button>
    <button class="btn small ghost" data-bdel="${b.id}">✕</button></td></tr>`).join('');

  const catSet = [...new Set([...D.budget.map(b => b.categorie), ...D.actuals.map(a => a.categorie)])];
  const realRows = maanden.map(mk => {
    const bud = budgetVoorMaand(mk);
    const act = actueelVoorMaand(mk);
    const diff = act == null ? null : act - bud;
    return `<tr class="clickable" data-maand="${mk}">
      <td><b>${fmtMaand(mk)}</b></td>
      <td class="num">${eur(bud)}</td>
      <td class="num">${act == null ? '<span class="muted">nog invullen</span>' : eur(act)}</td>
      <td class="num">${diff == null ? '—' : `<b style="color:${diff > 0 ? 'var(--red)' : 'var(--green)'}">${diff > 0 ? '+' : ''}${eur(diff)}</b>`}</td></tr>`;
  }).join('');

  // maandelijkse bank in/uit uit geïmporteerde transacties
  const txPerMaand = {};
  for (const x of D.tx) {
    const k = monthKey(x.datum);
    txPerMaand[k] = txPerMaand[k] || { in: 0, uit: 0 };
    if (x.bedrag > 0) txPerMaand[k].in += +x.bedrag; else txPerMaand[k].uit += -x.bedrag;
  }
  const txRows = Object.entries(txPerMaand).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([k, v]) =>
    `<tr><td>${fmtMaand(k)}</td><td class="num" style="color:var(--green)">${eur(v.in)}</td><td class="num" style="color:var(--red)">${eur(v.uit)}</td></tr>`).join('');

  root.innerHTML = `
    <div class="spread mb"><h1>Kosten</h1>
      <button class="btn primary" id="kNieuwBudget">+ Vaste last</button></div>

    <div class="panel mb"><h2>📋 Budget — vaste maandlasten</h2>
      <div class="table-wrap"><table>
      <tr><th>Categorie</th><th class="num">€ p/m</th><th>Vanaf</th><th>Tot</th><th>Notitie</th><th></th></tr>
      ${budgetRows || '<tr><td colspan="6" class="empty">Nog geen vaste lasten</td></tr>'}</table></div></div>

    <div class="grid cols-2">
      <div class="panel"><h2>📊 Budget vs. werkelijk <span class="muted">(klik op een maand om in te vullen)</span></h2>
        <div class="table-wrap"><table>
        <tr><th>Maand</th><th class="num">Budget</th><th class="num">Werkelijk</th><th class="num">Verschil</th></tr>
        ${realRows}</table></div></div>
      <div class="panel"><h2>🏦 Bankmutaties (uit CSV-import)</h2>
        ${txRows ? `<div class="table-wrap"><table><tr><th>Maand</th><th class="num">Bij</th><th class="num">Af</th></tr>${txRows}</table></div>`
        : '<div class="empty">Nog geen transacties geïmporteerd — dat kan op de Cashflow-pagina.</div>'}</div>
    </div>`;

  $('#kNieuwBudget').onclick = () => openBudgetModal();
  root.addEventListener('click', async e => {
    const eb = e.target.closest('[data-beditb]');
    if (eb) return openBudgetModal(D.budget.find(b => b.id === +eb.dataset.beditb));
    const del = e.target.closest('[data-bdel]');
    if (del) {
      if (!confirm('Deze vaste last verwijderen?')) return;
      await dbWrite('fin_costs_budget', t2 => t2.delete().eq('id', +del.dataset.bdel));
      await reload('fin_costs_budget', 'budget', 'vanaf_maand');
      return rerender();
    }
    const tr = e.target.closest('tr[data-maand]');
    if (tr) openActualModal(tr.dataset.maand, catSet);
  });
}

function openBudgetModal(b = null) {
  openModal(`
    <div class="modal-head"><h2>${b ? 'Vaste last bewerken' : 'Nieuwe vaste last'}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="span2"><label>Categorie</label><input id="b_cat" value="${esc(b?.categorie || '')}" placeholder="bijv. Software / Marketing"></div>
      <div><label>Bedrag p/m (€)</label><input id="b_bedrag" type="number" step="0.01" value="${b?.bedrag_pm ?? ''}"></div>
      <div><label>Vanaf (maand)</label><input id="b_van" type="month" value="${(b?.vanaf_maand || todayISO()).slice(0, 7)}"></div>
      <div><label>Tot en met (leeg = doorlopend)</label><input id="b_tot" type="month" value="${b?.tot_maand ? b.tot_maand.slice(0, 7) : ''}"></div>
      <div><label>Notitie</label><input id="b_note" value="${esc(b?.note || '')}"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="b_save">Opslaan</button></div>`);
  $('#b_save').onclick = async () => {
    const row = {
      categorie: $('#b_cat').value.trim(), bedrag_pm: Number($('#b_bedrag').value || 0),
      vanaf_maand: $('#b_van').value + '-01', tot_maand: $('#b_tot').value ? $('#b_tot').value + '-01' : null,
      note: $('#b_note').value.trim() || null,
    };
    if (!row.categorie) return toast('Categorie is verplicht', true);
    await dbWrite('fin_costs_budget', t => b ? t.update(row).eq('id', b.id) : t.insert(row));
    await reload('fin_costs_budget', 'budget', 'vanaf_maand');
    closeModal(); rerender();
  };
}

function openActualModal(mk, catSet) {
  const bestaand = D.actuals.filter(a => a.maand === mk);
  const cats = [...new Set([...catSet, ...bestaand.map(a => a.categorie)])];
  const rows = cats.map((c, i) => {
    const a = bestaand.find(x => x.categorie === c);
    return `<tr><td>${esc(c)}</td><td class="num" style="width:150px">
      <input type="number" step="0.01" data-acat="${esc(c)}" value="${a ? a.bedrag : ''}" placeholder="—"></td></tr>`;
  }).join('');
  openModal(`
    <div class="modal-head"><h2>Werkelijke kosten · ${fmtMaand(mk)}</h2><button class="btn ghost small" onclick="closeModal()">✕</button></div>
    <p class="muted mb">Vul in wat er werkelijk is uitgegeven (excl. btw). Lege velden tellen niet mee; zolang álles leeg is rekent de cashflow met budget.</p>
    <div class="table-wrap"><table><tr><th>Categorie</th><th class="num">Werkelijk (€)</th></tr>${rows}
      <tr><td><input id="a_newcat" placeholder="+ nieuwe categorie"></td><td class="num" style="width:150px"><input id="a_newbedrag" type="number" step="0.01" placeholder="—"></td></tr>
    </table></div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Annuleren</button>
    <button class="btn primary" id="a_save">Opslaan</button></div>`);
  $('#a_save').onclick = async () => {
    const inputs = $$('#modalRoot [data-acat]');
    for (const inp of inputs) {
      const cat = inp.dataset.acat, val = inp.value.trim();
      const bestond = bestaand.find(x => x.categorie === cat);
      if (val === '' && bestond) await dbWrite('fin_costs_actual', t => t.delete().eq('id', bestond.id));
      else if (val !== '') await dbWrite('fin_costs_actual', t => t.upsert({ maand: mk, categorie: cat, bedrag: Number(val) }, { onConflict: 'maand,categorie' }));
    }
    const nc = $('#a_newcat').value.trim(), nb = $('#a_newbedrag').value.trim();
    if (nc && nb !== '') await dbWrite('fin_costs_actual', t => t.upsert({ maand: mk, categorie: nc, bedrag: Number(nb) }, { onConflict: 'maand,categorie' }));
    await reload('fin_costs_actual', 'actuals', 'maand');
    closeModal(); toast('Kosten opgeslagen ✓'); rerender();
  };
}
