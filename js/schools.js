// js/schools.js
import { openSchoolForm } from './schoolForm.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const state = { tier: 'ALL', query: '' };

function schoolMatchesFilters(s) {
  if (state.tier !== 'ALL' && s.tier !== state.tier) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    if (!s.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function renderSchools(container, ctx) {
  const { store, isAdmin, navigate } = ctx;
  const schools = store.computeSchools();
  const t1 = schools.filter(s => s.tier === 'Tier1').length;
  const t2 = schools.filter(s => s.tier === 'Tier2').length;

  container.innerHTML = `
    <section>
      <div class="section-head">
        <h2>School manifest</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          ${isAdmin ? '<button id="addSchoolBtn" class="chip">+ Add school</button>' : ''}
          <div class="tag" id="resultCount">0 schools</div>
        </div>
      </div>
      <div style="max-width:340px; margin-bottom:16px; background:var(--card); border:1px solid var(--line);">
        <input id="searchInput" type="text" placeholder="Search school name…" aria-label="Search schools"
          style="width:100%; border:none; background:none; padding:8px 12px; font-family:'IBM Plex Mono', monospace; font-size:14px; color:var(--ink);">
      </div>
      <div class="filterbar" id="tierFilterBar"></div>
      <div class="grid" id="schoolGrid"></div>
      <div class="empty-note" id="emptyNote" style="display:none;"></div>
    </section>
  `;

  const searchInput = container.querySelector('#searchInput');
  searchInput.value = state.query;
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderGrid();
  });

  const tierFilterBar = container.querySelector('#tierFilterBar');
  function renderTierFilterBar() {
    const chips = [
      { key: 'ALL', label: 'All schools', n: schools.length },
      { key: 'Tier1', label: 'Tier 1', n: t1 },
      { key: 'Tier2', label: 'Tier 2', n: t2 },
    ];
    tierFilterBar.innerHTML = '';
    chips.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.tier === c.key ? ' active' : '');
      btn.innerHTML = `${c.label} <span class="n">${c.n}</span>`;
      btn.addEventListener('click', () => { state.tier = c.key; renderTierFilterBar(); renderGrid(); });
      tierFilterBar.appendChild(btn);
    });
  }

  const grid = container.querySelector('#schoolGrid');
  const emptyNote = container.querySelector('#emptyNote');
  function renderGrid() {
    const list = schools.filter(schoolMatchesFilters);
    container.querySelector('#resultCount').textContent = `${list.length} school${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    if (schools.length === 0) {
      emptyNote.style.display = 'block';
      emptyNote.textContent = isAdmin
        ? 'No schools yet. Click "+ Add school" above to add the first one.'
        : 'No schools recorded yet.';
      return;
    }
    emptyNote.style.display = list.length ? 'none' : 'block';
    emptyNote.textContent = 'No schools match this filter. Try clearing the search.';
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
      card.addEventListener('click', () => navigate(`#/locations/${s.id}`));
      grid.appendChild(card);
    });
  }

  renderTierFilterBar();
  renderGrid();

  if (isAdmin) {
    container.querySelector('#addSchoolBtn').addEventListener('click', () => {
      openSchoolForm(null, ctx);
    });
  }
}
