// js/requests.js
import { escapeHtml } from './schools.js';

export function renderRequestSection(container, ctx) {
  const { api, location, materials, myRequests, onChange } = ctx;
  const pending = myRequests.filter(r => r.status === 'pending');

  const pendingHtml = pending.map(r => {
    const mat = materials.find(m => m.id === r.material_id);
    const name = mat ? mat.name : 'Unknown material';
    return `<div class="manifest-line"><div class="mn">${escapeHtml(name)} ×${r.quantity}</div><div class="ids">pending</div></div>`;
  }).join('');

  container.innerHTML = `
    ${pendingHtml}
    <form id="requestForm" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
      <label style="flex:1; min-width:160px;">Material
        <input name="materialName" required list="requestMaterialOptions" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
        <datalist id="requestMaterialOptions">
          ${materials.map(m => `<option value="${escapeHtml(m.name)}">`).join('')}
        </datalist>
      </label>
      <label style="min-width:90px;">Quantity
        <input name="quantity" type="number" min="1" required style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
      </label>
      <label style="flex:1; min-width:160px;">Note (optional)
        <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
      </label>
      <button type="submit" class="chip">Request materials</button>
    </form>
    <div id="requestFormError" class="live-status error" style="display:none; margin-top:8px;"></div>
  `;

  const form = container.querySelector('#requestForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = container.querySelector('#requestFormError');
    errorEl.style.display = 'none';
    const materialName = form.materialName.value.trim();
    const quantity = Number(form.quantity.value);
    const note = form.note.value.trim() || null;
    const material = materials.find(m => m.name.toLowerCase() === materialName.toLowerCase());
    if (!material) {
      errorEl.textContent = 'Pick an existing material from the list.';
      errorEl.style.display = 'block';
      return;
    }
    if (!quantity || quantity < 1) {
      errorEl.textContent = 'Quantity must be at least 1.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api.createRequest({ location_id: location.id, material_id: material.id, quantity, note });
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not submit request: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
