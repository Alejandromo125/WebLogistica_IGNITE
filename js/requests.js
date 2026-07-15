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

function renderApproveForm(container, req, ctx) {
  const { api, locations, materials, items, onChange } = ctx;
  const material = materials.find(m => m.id === req.material_id);
  const materialName = material ? material.name : 'Unknown material';
  const requestingSchool = locations.find(l => l.id === req.location_id);
  const availableItems = items.filter(i => i.material_id === req.material_id && !i.retired && i.current_location_id !== req.location_id);
  const locationsById = new Map(locations.map(l => [l.id, l]));

  const byLocation = new Map();
  availableItems.forEach(i => {
    if (!byLocation.has(i.current_location_id)) byLocation.set(i.current_location_id, []);
    byLocation.get(i.current_location_id).push(i);
  });
  const orderedLocationIds = Array.from(byLocation.keys()).sort((a, b) => {
    const la = locationsById.get(a);
    const lb = locationsById.get(b);
    const aWh = (la && la.type === 'warehouse') ? 0 : 1;
    const bWh = (lb && lb.type === 'warehouse') ? 0 : 1;
    if (aWh !== bWh) return aWh - bWh;
    return (la ? la.name : '').localeCompare(lb ? lb.name : '');
  });

  const groupsHtml = orderedLocationIds.map(locId => {
    const loc = locationsById.get(locId);
    const locName = loc ? escapeHtml(loc.name) : 'Unknown location';
    const rows = byLocation.get(locId).map(i => `
      <label style="display:block; font-size:12.5px; margin:2px 0;">
        <input type="checkbox" class="approve-item-cb" data-item="${escapeHtml(i.id)}" data-location="${locId}">
        ${escapeHtml(i.id)}
      </label>
    `).join('');
    return `<div class="approve-group" style="margin-bottom:10px;"><div style="font-weight:600; font-size:12.5px;">${locName}</div>${rows}</div>`;
  }).join('') || '<div class="empty-note">No stock of this material anywhere — deny or wait for stock to arrive.</div>';

  container.innerHTML = `
    <div class="manifest-title">Approve: ${escapeHtml(materialName)} ×${req.quantity} for ${requestingSchool ? escapeHtml(requestingSchool.name) : 'Unknown school'}</div>
    ${groupsHtml}
    <label style="display:block; margin-top:10px;">Note (optional)
      <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
    </label>
    <div id="approveError" class="live-status error" style="display:none; margin-top:8px;"></div>
    <button type="button" id="approveSubmitBtn" class="chip" style="margin-top:10px;" disabled>Approve</button>
  `;

  const submitBtn = container.querySelector('#approveSubmitBtn');
  const errorEl = container.querySelector('#approveError');
  const noteInput = container.querySelector('input[name="note"]');

  function updateSubmitState() {
    const checked = Array.from(container.querySelectorAll('.approve-item-cb:checked'));
    const locIds = new Set(checked.map(cb => cb.dataset.location));
    errorEl.style.display = 'none';
    if (checked.length === 0) {
      submitBtn.disabled = true;
    } else if (locIds.size > 1) {
      submitBtn.disabled = true;
      errorEl.textContent = 'Select items from only one location per approval.';
      errorEl.style.display = 'block';
    } else {
      submitBtn.disabled = false;
    }
  }

  container.querySelectorAll('.approve-item-cb').forEach(cb => {
    cb.addEventListener('change', updateSubmitState);
  });
  updateSubmitState();

  submitBtn.addEventListener('click', async () => {
    const checked = Array.from(container.querySelectorAll('.approve-item-cb:checked'));
    if (checked.length === 0) return;
    const itemIds = checked.map(cb => cb.dataset.item);
    const sourceLocationId = checked[0].dataset.location;
    errorEl.style.display = 'none';
    try {
      await api.performTransfer(itemIds, sourceLocationId, req.location_id, noteInput.value.trim() || null, req.id);
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not approve: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}

export function createRequestsView({ api, onStockChange }) {
  let requests = [];
  let locations = [];
  let materials = [];
  let items = [];
  let currentUserId = null;

  function locationName(id) {
    const loc = locations.find(l => l.id === id);
    return loc ? loc.name : 'Unknown location';
  }

  function materialName(id) {
    const mat = materials.find(m => m.id === id);
    return mat ? mat.name : 'Unknown material';
  }

  function renderPendingRow(req) {
    const row = document.createElement('div');
    row.className = 'card';
    const requesterEmail = req.requester ? req.requester.email : null;
    row.innerHTML = `
      <div class="cname">${escapeHtml(materialName(req.material_id))} ×${req.quantity} — ${escapeHtml(locationName(req.location_id))}</div>
      <div class="metaline">Requested by ${escapeHtml(requesterEmail || 'unknown')} · ${new Date(req.created_at).toLocaleDateString()}</div>
      ${req.note ? `<div class="metaline">Note: ${escapeHtml(req.note)}</div>` : ''}
      <div class="approve-area" style="margin-top:10px;"></div>
      <button type="button" class="chip deny-btn" style="margin-top:10px;">Deny</button>
    `;
    renderApproveForm(row.querySelector('.approve-area'), req, {
      api, locations, materials, items,
      onChange: async () => {
        await refresh();
        await onStockChange();
      },
    });
    row.querySelector('.deny-btn').addEventListener('click', async () => {
      if (!confirm('Deny this request?')) return;
      try {
        await api.updateRequest(req.id, {
          status: 'denied',
          resolved_by: currentUserId,
          resolved_at: new Date().toISOString(),
        });
        await refresh();
      } catch (err) {
        alert('Could not deny: ' + err.message);
      }
    });
    return row;
  }

  function renderResolvedRow(req) {
    const row = document.createElement('div');
    row.className = 'card';
    const requesterEmail = req.requester ? req.requester.email : null;
    row.innerHTML = `
      <div class="cname">${escapeHtml(materialName(req.material_id))} ×${req.quantity} — ${escapeHtml(locationName(req.location_id))}</div>
      <div class="metaline">${req.status === 'approved' ? 'Approved' : 'Denied'} · requested by ${escapeHtml(requesterEmail || 'unknown')}</div>
    `;
    return row;
  }

  function renderAll() {
    const container = document.getElementById('requestsSection');
    const pending = requests.filter(r => r.status === 'pending')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const resolved = requests.filter(r => r.status !== 'pending')
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))
      .slice(0, 10);
    container.innerHTML = '';
    if (pending.length === 0) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'No pending requests.';
      container.appendChild(note);
    } else {
      pending.forEach(req => container.appendChild(renderPendingRow(req)));
    }
    if (resolved.length > 0) {
      const heading = document.createElement('div');
      heading.className = 'manifest-title';
      heading.textContent = 'Recently resolved';
      container.appendChild(heading);
      resolved.forEach(req => container.appendChild(renderResolvedRow(req)));
    }
  }

  async function refresh() {
    [requests, locations, materials, items] = await Promise.all([
      api.listRequests(),
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
    ]);
    renderAll();
  }

  async function loadAndRender(isAdminFlag, userId) {
    currentUserId = userId;
    const wrap = document.getElementById('requestsSectionWrap');
    if (!isAdminFlag) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    try {
      await refresh();
    } catch (err) {
      document.getElementById('requestsSection').innerHTML =
        `<div class="empty-note">Could not load requests: ${escapeHtml(err.message)}</div>`;
    }
  }

  function clear() {
    requests = [];
    locations = [];
    materials = [];
    items = [];
    currentUserId = null;
    document.getElementById('requestsSectionWrap').style.display = 'none';
  }

  return { loadAndRender, clear };
}
