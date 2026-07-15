// js/transfers.js
import { escapeHtml } from './schools.js';

export function renderTransferForm(container, ctx) {
  const { api, location, materialName, itemIds, destinations, onChange } = ctx;

  const checkboxesHtml = itemIds.map(id => `
    <label style="display:block; font-size:12.5px; margin:2px 0;">
      <input type="checkbox" class="transfer-item-cb" value="${escapeHtml(id)}"> ${escapeHtml(id)}
    </label>
  `).join('');

  const destOptionsHtml = destinations.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');

  container.innerHTML = `
    <div class="manifest-title">Transfer ${escapeHtml(materialName)}</div>
    ${checkboxesHtml}
    <label style="display:block; margin-top:10px;">Destination
      <select name="destination" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
        ${destOptionsHtml}
      </select>
    </label>
    <label style="display:block; margin-top:10px;">Note (optional)
      <input name="note" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
    </label>
    <div id="transferError" class="live-status error" style="display:none; margin-top:8px;"></div>
    <button type="button" id="transferSubmitBtn" class="chip" style="margin-top:10px;" disabled>Transfer</button>
    <button type="button" id="transferCancelBtn" class="chip" style="margin-top:10px; margin-left:8px;">Cancel</button>
  `;

  const submitBtn = container.querySelector('#transferSubmitBtn');
  const errorEl = container.querySelector('#transferError');
  const destSelect = container.querySelector('select[name="destination"]');
  const noteInput = container.querySelector('input[name="note"]');

  function updateSubmitState() {
    const checkedCount = container.querySelectorAll('.transfer-item-cb:checked').length;
    submitBtn.disabled = checkedCount === 0;
  }

  container.querySelectorAll('.transfer-item-cb').forEach(cb => {
    cb.addEventListener('change', updateSubmitState);
  });

  container.querySelector('#transferCancelBtn').addEventListener('click', () => {
    container.innerHTML = '';
  });

  submitBtn.addEventListener('click', async () => {
    const checked = Array.from(container.querySelectorAll('.transfer-item-cb:checked')).map(cb => cb.value);
    if (checked.length === 0) return;
    errorEl.style.display = 'none';
    try {
      await api.performTransfer(checked, location.id, destSelect.value, noteInput.value.trim() || null, null);
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not transfer: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
