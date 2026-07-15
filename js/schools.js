// js/schools.js
import { renderItemsSection } from './items.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function createSchoolsView({ api }) {
  let locations = [];
  let materials = [];
  let items = [];
  let isAdmin = false;
  const state = { tier: 'ALL', material: null, query: '' };

  function fmt(n) { return (n === null || n === undefined || n === '') ? '—' : n; }

  function computeLocationView(loc) {
    const materialsById = new Map(materials.map(m => [m.id, m]));
    const locItems = items.filter(i => i.current_location_id === loc.id && !i.retired);
    const byMaterial = new Map();
    locItems.forEach(i => {
      const mat = materialsById.get(i.material_id);
      const name = mat ? mat.name : 'Unknown material';
      if (!byMaterial.has(name)) byMaterial.set(name, []);
      byMaterial.get(name).push(i.id);
    });
    const locMaterials = Array.from(byMaterial.entries()).map(([name, ids]) => ({ name, ids, count: ids.length }));
    return {
      id: loc.id,
      name: loc.name,
      type: loc.type,
      tier: loc.tier,
      students: loc.students,
      notes: loc.notes,
      materials: locMaterials,
      totalUnits: locItems.length,
    };
  }

  function computeSchools() {
    return locations.filter(l => l.type === 'school').map(computeLocationView);
  }

  function computeWarehouse() {
    const wh = locations.find(l => l.type === 'warehouse');
    return wh ? computeLocationView(wh) : null;
  }

  function renderStats(schools) {
    document.getElementById('statSchools').textContent = schools.length;
    document.getElementById('statUnits').textContent = schools.reduce((a, s) => a + s.totalUnits, 0);
    const matSet = new Set();
    schools.forEach(s => s.materials.forEach(m => matSet.add(m.name)));
    document.getElementById('statMaterials').textContent = matSet.size;
  }

  function materialTotals(schools) {
    const totals = {};
    schools.forEach(s => s.materials.forEach(m => {
      totals[m.name] = (totals[m.name] || 0) + m.count;
    }));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }

  function renderChart(schools) {
    const totals = materialTotals(schools);
    const max = totals.length ? totals[0][1] : 1;
    const area = document.getElementById('chartArea');
    area.innerHTML = '';
    totals.forEach(([name, count]) => {
      const row = document.createElement('div');
      row.className = 'chart-row';
      const active = state.material === name;
      const nameEsc = escapeHtml(name);
      row.innerHTML = `
        <div class="mname" title="${nameEsc}">${nameEsc}</div>
        <div class="bar-track ${active ? 'active' : ''}" data-mat="${nameEsc}">
          <div class="bar-fill" style="width:${(count / max * 100).toFixed(1)}%"></div>
        </div>
        <div class="count">${count}</div>
      `;
      row.querySelector('.bar-track').addEventListener('click', () => {
        state.material = (state.material === name) ? null : name;
        renderAll();
      });
      area.appendChild(row);
    });
  }

  function renderTierSplit(schools) {
    const wrap = document.getElementById('tierSplit');
    if (schools.length === 0) {
      wrap.innerHTML = `<div class="tier-block"><div class="desc">No schools yet${isAdmin ? ' — click "+ Add school" below to add the first one.' : '.'}</div></div>`;
      return;
    }
    const t1 = schools.filter(s => s.tier === 'Tier1').length;
    const t2 = schools.filter(s => s.tier === 'Tier2').length;
    const other = schools.length - t1 - t2;
    wrap.innerHTML = `
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

  function renderTierFilterBar(schools) {
    const t1 = schools.filter(s => s.tier === 'Tier1').length;
    const t2 = schools.filter(s => s.tier === 'Tier2').length;
    const bar = document.getElementById('tierFilterBar');
    const chips = [
      { key: 'ALL', label: 'All schools', n: schools.length },
      { key: 'Tier1', label: 'Tier 1', n: t1 },
      { key: 'Tier2', label: 'Tier 2', n: t2 },
    ];
    bar.innerHTML = '';
    chips.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.tier === c.key ? ' active' : '');
      btn.innerHTML = `${c.label} <span class="n">${c.n}</span>`;
      btn.addEventListener('click', () => { state.tier = c.key; renderAll(); });
      bar.appendChild(btn);
    });
    if (state.material) {
      const clear = document.createElement('button');
      clear.className = 'chip active';
      clear.innerHTML = `Material: ${escapeHtml(state.material)} ✕`;
      clear.addEventListener('click', () => { state.material = null; renderAll(); });
      bar.appendChild(clear);
    }
  }

  function schoolMatchesFilters(s) {
    if (state.tier !== 'ALL' && s.tier !== state.tier) return false;
    if (state.material && !s.materials.some(m => m.name === state.material)) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      if (!s.name.toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function renderGrid(schools) {
    const grid = document.getElementById('schoolGrid');
    const list = schools.filter(schoolMatchesFilters);
    document.getElementById('resultCount').textContent = `${list.length} school${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    const emptyNote = document.getElementById('emptyNote');
    if (schools.length === 0) {
      emptyNote.style.display = 'block';
      emptyNote.textContent = isAdmin
        ? 'No schools yet. Click "+ Add school" above to add the first one.'
        : 'No schools recorded yet.';
    } else {
      emptyNote.style.display = list.length ? 'none' : 'block';
      emptyNote.textContent = 'No schools match this filter. Try clearing the search or material filter.';
    }

    list.forEach(s => {
      const card = document.createElement('div');
      card.className = 'card';
      const tierClass = s.tier === 'Tier1' ? 't1' : 't2';
      const chipsHtml = s.materials.slice(0, 4).map(m => `<span class="matchip">${escapeHtml(m.name)} ×${m.count}</span>`).join('');
      const moreHtml = s.materials.length > 4 ? `<span class="matchip more">+${s.materials.length - 4} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <div class="tierbadge ${tierClass}">${s.tier || 'N/A'}</div>
        <div class="cname">${escapeHtml(s.name)}</div>
        <div class="metaline">${s.totalUnits} units · ${s.materials.length} material line${s.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => openDetailModal(s));
      grid.appendChild(card);
    });
  }

  function renderWarehouseCard() {
    const wh = computeWarehouse();
    const container = document.getElementById('warehouseCard');
    if (!wh) {
      container.innerHTML = '<div class="empty-note">Warehouse location not found — check that the schema migration seeded it.</div>';
      return;
    }
    container.innerHTML = '';
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
    card.addEventListener('click', () => openDetailModal(wh));
    container.appendChild(card);
  }

  function openDetailModal(s) {
    const modal = document.getElementById('modalContent');
    const isWarehouse = s.type === 'warehouse';
    const tierClass = s.tier === 'Tier1' ? 't1' : 't2';

    modal.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
      <h3>${escapeHtml(s.name)}</h3>
      ${isWarehouse
        ? '<div class="modal-tier" style="color:var(--slate)">Central warehouse</div>'
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'rust' : 'teal'})">${s.tier || 'Tier not recorded'}</div>`
      }
      <div class="modal-grid">
        ${isWarehouse
          ? `<div class="modal-stat"><div class="l">Units in stock</div><div class="v">${s.totalUnits}</div></div>
             <div class="modal-stat"><div class="l">Material lines</div><div class="v">${s.materials.length}</div></div>`
          : `<div class="modal-stat"><div class="l">Students</div><div class="v">${fmt(s.students)}</div></div>
             <div class="modal-stat"><div class="l">Units deployed</div><div class="v">${s.totalUnits}</div></div>`
        }
      </div>
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${s.notes ? escapeHtml(s.notes) : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    renderItemsSection(document.getElementById('itemsSection'), {
      api, location: s, materials, items, isAdmin, allLocations: locations,
      onChange: async () => {
        await refresh();
        const refreshed = isWarehouse ? computeWarehouse() : computeSchools().find(sch => sch.id === s.id);
        if (refreshed) openDetailModal(refreshed);
      },
    });
    if (!isWarehouse && isAdmin) {
      document.getElementById('editSchoolBtn').addEventListener('click', () => openSchoolForm(s));
    }
  }

  function closeModal() {
    document.getElementById('overlay').classList.remove('open');
  }

  function openSchoolForm(existing) {
    const modal = document.getElementById('modalContent');
    const formStyle = "display:block; margin-bottom:14px;";
    const inputStyle = "width:100%; border:1px solid var(--line); background:var(--card); padding:8px 10px; font-family:'IBM Plex Mono', monospace; font-size:13px; margin-top:4px;";
    modal.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
      <h3>${existing ? 'Edit school' : 'Add school'}</h3>
      <form id="schoolForm">
        <label style="${formStyle}">Name
          <input name="name" required value="${existing ? escapeHtml(existing.name) : ''}" style="${inputStyle}">
        </label>
        <label style="${formStyle}">Tier
          <select name="tier" style="${inputStyle}">
            <option value="">—</option>
            <option value="Tier1" ${existing && existing.tier === 'Tier1' ? 'selected' : ''}>Tier 1</option>
            <option value="Tier2" ${existing && existing.tier === 'Tier2' ? 'selected' : ''}>Tier 2</option>
          </select>
        </label>
        <label style="${formStyle}">Students
          <input name="students" type="number" min="0" value="${existing && existing.students !== null && existing.students !== undefined ? existing.students : ''}" style="${inputStyle}">
        </label>
        <label style="${formStyle}">Notes
          <textarea name="notes" rows="3" style="${inputStyle}">${existing && existing.notes ? escapeHtml(existing.notes) : ''}</textarea>
        </label>
        <div id="schoolFormError" class="live-status error" style="display:none; margin-bottom:10px;"></div>
        <button type="submit" class="chip">Save</button>
        <button type="button" id="schoolFormCancel" class="chip" style="margin-left:8px;">Cancel</button>
      </form>
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('schoolFormCancel').addEventListener('click', closeModal);
    document.getElementById('schoolForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errorEl = document.getElementById('schoolFormError');
      errorEl.style.display = 'none';
      const payload = {
        name: form.name.value.trim(),
        tier: form.tier.value || null,
        students: form.students.value === '' ? null : Number(form.students.value),
        notes: form.notes.value.trim() || null,
      };
      try {
        if (existing) {
          await api.updateLocation(existing.id, payload);
        } else {
          await api.createLocation({ ...payload, type: 'school' });
        }
        closeModal();
        await refresh();
      } catch (err) {
        errorEl.textContent = 'Could not save: ' + err.message;
        errorEl.style.display = 'block';
      }
    });
  }

  function renderAll() {
    const schools = computeSchools();
    renderStats(schools);
    renderChart(schools);
    renderTierSplit(schools);
    renderTierFilterBar(schools);
    renderGrid(schools);
    renderWarehouseCard();
  }

  function showLoadError(err) {
    const emptyNote = document.getElementById('emptyNote');
    emptyNote.style.display = 'block';
    emptyNote.textContent = 'Could not load schools: ' + err.message;
  }

  async function refresh() {
    [locations, materials, items] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
    ]);
    document.getElementById('addSchoolBtn').style.display = isAdmin ? '' : 'none';
    renderAll();
  }

  async function loadAndRender(adminFlag) {
    isAdmin = adminFlag;
    try {
      await refresh();
    } catch (err) {
      showLoadError(err);
    }
  }

  function clear() {
    isAdmin = false;
    locations = [];
    materials = [];
    items = [];
    document.getElementById('statSchools').textContent = '0';
    document.getElementById('statUnits').textContent = '0';
    document.getElementById('statMaterials').textContent = '0';
    document.getElementById('chartArea').innerHTML = '';
    document.getElementById('tierSplit').innerHTML = '';
    document.getElementById('tierFilterBar').innerHTML = '';
    document.getElementById('schoolGrid').innerHTML = '';
    document.getElementById('warehouseCard').innerHTML = '';
    const emptyNote = document.getElementById('emptyNote');
    emptyNote.style.display = 'block';
    emptyNote.textContent = 'Log in to view schools.';
    document.getElementById('resultCount').textContent = '0 schools';
    document.getElementById('addSchoolBtn').style.display = 'none';
  }

  document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target.id === 'overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderGrid(computeSchools());
  });
  document.getElementById('addSchoolBtn').addEventListener('click', () => openSchoolForm(null));

  return { loadAndRender, clear };
}
