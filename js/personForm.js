// js/personForm.js
export function openPersonForm(ctx) {
  const { api, store, rerender } = ctx;
  const modal = document.getElementById('modalContent');
  const overlay = document.getElementById('overlay');
  const formStyle = "display:block; margin-bottom:14px;";
  const inputStyle = "width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:9px 11px; font-family:'Poppins', sans-serif; font-size:13px; margin-top:4px; color:var(--text);";

  modal.innerHTML = `
    <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
    <h3>Add team member</h3>
    <form id="personForm">
      <label style="${formStyle}">Name
        <input name="name" required placeholder="e.g. Marc — Zona Nord" style="${inputStyle}">
      </label>
      <div id="personFormError" class="live-status error" style="display:none; margin-bottom:10px;"></div>
      <button type="submit" class="chip">Save</button>
      <button type="button" id="personFormCancel" class="chip" style="margin-left:8px;">Cancel</button>
    </form>
  `;

  overlay.classList.add('open');
  function close() {
    overlay.classList.remove('open');
    overlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onKeydown);
  }
  function onOverlayClick(e) {
    if (e.target === overlay) close();
  }
  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onKeydown);
  document.getElementById('modalCloseBtn').addEventListener('click', close);
  document.getElementById('personFormCancel').addEventListener('click', close);
  document.getElementById('personForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errorEl = document.getElementById('personFormError');
    errorEl.style.display = 'none';
    const name = form.name.value.trim();
    if (!name) {
      errorEl.textContent = 'Enter a name.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api.createLocation({ name, type: 'person' });
      close();
      await store.refresh();
      await rerender();
    } catch (err) {
      errorEl.textContent = 'Could not save: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
