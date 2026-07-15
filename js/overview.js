// js/overview.js
import { escapeHtml } from './schools.js';

export function renderOverview(container, ctx) {
  const { store, navigate } = ctx;
  const schools = store.computeSchools();
  const warehouses = store.computeWarehouses();

  const totalUnits = schools.reduce((a, s) => a + s.totalUnits, 0);
  const matSet = new Set();
  schools.forEach(s => s.materials.forEach(m => matSet.add(m.name)));

  const totals = {};
  schools.forEach(s => s.materials.forEach(m => {
    totals[m.name] = (totals[m.name] || 0) + m.count;
  }));
  const totalsSorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = totalsSorted.length ? totalsSorted[0][1] : 1;

  const t1 = schools.filter(s => s.tier === 'Tier1').length;
  const t2 = schools.filter(s => s.tier === 'Tier2').length;
  const other = schools.length - t1 - t2;

  container.innerHTML = `
    <div class="hero">
      <div class="hero-eyebrow">Material deployment · Course 26–27 prep</div>
      <h1>Where every kit, robot and box currently lives — school by school.</h1>
      <div class="stamps">
        <div class="stamp"><div class="num">${schools.length}</div><div class="lbl">Schools tracked</div></div>
        <div class="stamp"><div class="num">${totalUnits}</div><div class="lbl">Units deployed</div></div>
        <div class="stamp"><div class="num">${matSet.size}</div><div class="lbl">Material lines</div></div>
      </div>
    </div>

    <section>
      <div class="section-head">
        <h2>Material distribution</h2>
        <div class="tag">units in the field, by material line</div>
      </div>
      <div id="chartArea"></div>
    </section>

    <section>
      <div class="section-head">
        <h2>Tier split</h2>
        <div class="tag">school priority tier</div>
      </div>
      <div id="tierSplit"></div>
    </section>

    <section>
      <div class="section-head">
        <h2>Warehouses</h2>
        <div class="tag">central unassigned stock</div>
      </div>
      <div class="grid" id="warehouseGrid"></div>
    </section>
  `;

  const chartArea = container.querySelector('#chartArea');
  if (totalsSorted.length === 0) {
    chartArea.innerHTML = '<div class="empty-note">No material recorded across schools yet.</div>';
  } else {
    totalsSorted.forEach(([name, count]) => {
      const row = document.createElement('div');
      row.className = 'chart-row';
      const nameEsc = escapeHtml(name);
      row.innerHTML = `
        <div class="mname" title="${nameEsc}">${nameEsc}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max * 100).toFixed(1)}%"></div></div>
        <div class="count">${count}</div>
      `;
      chartArea.appendChild(row);
    });
  }

  const tierSplit = container.querySelector('#tierSplit');
  if (schools.length === 0) {
    tierSplit.innerHTML = '<div class="tier-block"><div class="desc">No schools yet.</div></div>';
  } else {
    tierSplit.innerHTML = `
      <div class="tier-block">
        <div class="tt"><span class="dot t1"></span><strong>Tier 1</strong></div>
        <div class="big">${t1}</div>
        <div class="desc">schools · ${(t1 / schools.length * 100).toFixed(0)}% of total</div>
      </div>
      <div class="tier-block">
        <div class="tt"><span class="dot t2"></span><strong>Tier 2</strong></div>
        <div class="big">${t2}</div>
        <div class="desc">schools · ${(t2 / schools.length * 100).toFixed(0)}% of total</div>
      </div>
      ${other > 0 ? `<div class="tier-block"><div class="tt"><strong>Unclassified</strong></div><div class="big">${other}</div><div class="desc">tier not recorded</div></div>` : ''}
    `;
  }

  const warehouseGrid = container.querySelector('#warehouseGrid');
  if (warehouses.length === 0) {
    warehouseGrid.innerHTML = '<div class="empty-note">No warehouse locations found — check that the migration/schema seeded them.</div>';
  } else {
    warehouseGrid.innerHTML = '';
    warehouses.forEach(wh => {
      const card = document.createElement('div');
      card.className = 'card';
      const chipsHtml = wh.materials.slice(0, 6).map(m => `<span class="matchip">${escapeHtml(m.name)} ×${m.count}</span>`).join('');
      const moreHtml = wh.materials.length > 6 ? `<span class="matchip more">+${wh.materials.length - 6} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <div class="tierbadge" style="color:var(--slate);">WAREHOUSE</div>
        <div class="cname">${escapeHtml(wh.name)}</div>
        <div class="metaline">${wh.totalUnits} units in stock · ${wh.materials.length} material line${wh.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => navigate(`#/locations/${wh.id}`));
      warehouseGrid.appendChild(card);
    });
  }
}
