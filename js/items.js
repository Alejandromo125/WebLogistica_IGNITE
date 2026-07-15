// js/items.js
import { escapeHtml } from './schools.js';
import { renderTransferForm } from './transfers.js';

export function renderItemsSection(container, ctx) {
  const { api, location, materials, items, isAdmin, onChange, allLocations } = ctx;
  const locItems = items.filter(i => i.current_location_id === location.id && !i.retired);
  const byMaterial = new Map();
  locItems.forEach(i => {
    const mat = materials.find(m => m.id === i.material_id);
    const name = mat ? mat.name : 'Unknown material';
    if (!byMaterial.has(name)) byMaterial.set(name, []);
    byMaterial.get(name).push(i);
  });

  const manifestHtml = Array.from(byMaterial.entries()).map(([name, itemsForMaterial]) => `
    <div class="manifest-line">
      <div class="mn">
        ${escapeHtml(name)}
        ${isAdmin ? `<button type="button" class="transfer-material-btn" data-material="${escapeHtml(name)}" style="margin-left:8px; border:1px solid var(--line); background:none; cursor:pointer; font-family:inherit; font-size:11px; padding:1px 6px;">Transfer</button>` : ''}
      </div>
      <div class="ids">
        ${itemsForMaterial.map(i => {
          const idEsc = escapeHtml(i.id);
          return `<span>${idEsc}${isAdmin ? ` <button type="button" class="retire-item-btn" data-item="${idEsc}" style="border:none; background:none; color:var(--rust); cursor:pointer; font-family:inherit;" title="Retire ${idEsc}">✕</button>` : ''}</span>`;
        }).join(', ')}
      </div>
      <div class="transfer-form-area" data-material="${escapeHtml(name)}"></div>
    </div>
  `).join('') || '<div class="manifest-line"><div class="mn">No material currently recorded</div></div>';

  container.innerHTML = `
    ${manifestHtml}
    ${isAdmin ? `
      <form id="addItemForm" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <label style="flex:1; min-width:140px;">Unit ID
          <input name="itemId" required style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
        </label>
        <label style="flex:1; min-width:160px;">Material
          <input name="materialName" required list="materialOptions" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
          <datalist id="materialOptions">
            ${materials.map(m => `<option value="${escapeHtml(m.name)}">`).join('')}
          </datalist>
        </label>
        <button type="submit" class="chip">+ Add item</button>
      </form>
      <div id="itemFormError" class="live-status error" style="display:none; margin-top:8px;"></div>
    ` : ''}
  `;

  if (!isAdmin) return;

  container.querySelectorAll('.retire-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.item;
      if (!confirm(`Retire item ${itemId}? It will be removed from this manifest.`)) return;
      try {
        await api.updateItem(itemId, { retired: true });
        await onChange();
      } catch (err) {
        alert('Could not retire item: ' + err.message);
      }
    });
  });

  container.querySelectorAll('.transfer-material-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.material;
      const area = container.querySelector(`.transfer-form-area[data-material="${CSS.escape(name)}"]`);
      if (area.innerHTML) {
        area.innerHTML = '';
        return;
      }
      const idsForMaterial = byMaterial.get(name).map(i => i.id);
      renderTransferForm(area, {
        api,
        location,
        materialName: name,
        itemIds: idsForMaterial,
        destinations: ctx.allLocations.filter(l => l.id !== location.id),
        onChange,
      });
    });
  });

  const form = container.querySelector('#addItemForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = container.querySelector('#itemFormError');
    errorEl.style.display = 'none';
    const itemId = form.itemId.value.trim();
    const materialName = form.materialName.value.trim();
    if (!itemId || !materialName) return;
    try {
      let material = materials.find(m => m.name.toLowerCase() === materialName.toLowerCase());
      if (!material) {
        material = await api.createMaterial(materialName);
      }
      await api.createItem({ id: itemId, material_id: material.id, current_location_id: location.id });
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not add item: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
