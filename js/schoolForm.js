// js/schoolForm.js
import { escapeHtml } from './schools.js';

export function openSchoolForm(existing, ctx) {
  const { api, store, rerender } = ctx;
  const modal = document.getElementById('modalContent');
  const overlay = document.getElementById('overlay');
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

  overlay.classList.add('open');
  function close() { overlay.classList.remove('open'); }
  document.getElementById('modalCloseBtn').addEventListener('click', close);
  document.getElementById('schoolFormCancel').addEventListener('click', close);
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
      close();
      await store.refresh();
      await rerender();
    } catch (err) {
      errorEl.textContent = 'Could not save: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
