// js/schools.js
import { openSchoolForm } from './schoolForm.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const state = { tier: 'ALL', query: '', favOnly: false };

function schoolMatchesFilters(s, store) {
  if (state.favOnly && !store.isFavorite(s.id)) return false;
  if (!state.favOnly && state.tier !== 'ALL' && s.tier !== state.tier) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    if (!s.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function renderSchools(container, ctx) {
  const { store, isAdmin, navigate, api } = ctx;
  const schools = store.computeSchools();
  const t1 = schools.filter(s => s.tier === 'Tier1').length;
  const t2 = schools.filter(s => s.tier === 'Tier2').length;
  const favCount = schools.filter(s => store.isFavorite(s.id)).length;

  container.innerHTML = `
    <section>
      <div class="section-head">
        <h2>School manifest</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          ${isAdmin ? '<button id="addSchoolBtn" class="chip">+ Add school</button>' : ''}
          <div class="tag" id="resultCount">0 schools</div>
        </div>
      </div>
      <div style="max-width:340px; margin-bottom:16px; background:var(--surface); border-radius:10px;">
        <input id="searchInput" type="text" placeholder="Search school name…" aria-label="Search schools"
          style="width:100%; border:none; background:none; padding:10px 12px; font-family:'Poppins', sans-serif; font-size:14px; color:var(--text);">
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
      { key: 'FAVORITES', label: '★ Favourites', n: favCount },
    ];
    tierFilterBar.innerHTML = '';
    chips.forEach(c => {
      const btn = document.createElement('button');
      const active = c.key === 'FAVORITES' ? state.favOnly : (state.tier === c.key && !state.favOnly);
      btn.className = 'chip' + (active ? ' active' : '');
      btn.innerHTML = `${c.label} <span class="n">${c.n}</span>`;
      btn.addEventListener('click', () => {
        if (c.key === 'FAVORITES') {
          state.favOnly = !state.favOnly;
        } else {
          state.favOnly = false;
          state.tier = c.key;
        }
        renderTierFilterBar();
        renderGrid();
      });
      tierFilterBar.appendChild(btn);
    });
  }

  const grid = container.querySelector('#schoolGrid');
  const emptyNote = container.querySelector('#emptyNote');
  function renderGrid() {
    const list = schools.filter(s => schoolMatchesFilters(s, store));
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
    emptyNote.textContent = state.favOnly
      ? 'No favourite schools yet. Click the star on a school card to add one.'
      : 'No schools match this filter. Try clearing the search.';
    list.forEach(s => {
      const card = document.createElement('div');
      card.className = 'card';
      const tierClass = s.tier === 'Tier1' ? 't1' : 't2';
      const isFav = store.isFavorite(s.id);
      const chipsHtml = s.materials.slice(0, 4).map(m => `<span class="matchip">${escapeHtml(m.name)} ×${m.count}</span>`).join('');
      const moreHtml = s.materials.length > 4 ? `<span class="matchip more">+${s.materials.length - 4} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <button type="button" class="fav-toggle${isFav ? ' active' : ''}" aria-label="${isFav ? 'Remove from favourites' : 'Add to favourites'}" aria-pressed="${isFav}">★</button>
        <div class="tierbadge ${tierClass}">${s.tier || 'N/A'}</div>
        <div class="cname">${escapeHtml(s.name)}</div>
        <div class="metaline">${s.totalUnits} units · ${s.materials.length} material line${s.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => navigate(`#/locations/${s.id}`));
      card.querySelector('.fav-toggle').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (isFav) {
            await api.removeFavorite(s.id);
          } else {
            await api.addFavorite(s.id);
          }
          await store.refresh();
          await ctx.rerender();
        } catch (err) {
          alert('Could not update favourite: ' + err.message);
        }
      });
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
