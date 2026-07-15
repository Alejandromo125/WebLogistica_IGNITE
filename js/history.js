// js/history.js
import { escapeHtml } from './schools.js';

export function renderHistorySection(container, ctx) {
  const { location, movements, items, materials, locations } = ctx;

  if (movements.length === 0) {
    container.innerHTML = '<div class="empty-note">No movements recorded for this location yet.</div>';
    return;
  }

  const itemsById = new Map(items.map(i => [i.id, i]));
  const materialsById = new Map(materials.map(m => [m.id, m]));
  const locationsById = new Map(locations.map(l => [l.id, l]));

  function materialName(itemId) {
    const item = itemsById.get(itemId);
    const material = item ? materialsById.get(item.material_id) : null;
    return material ? material.name : 'Unknown material';
  }

  function locationName(id) {
    const loc = locationsById.get(id);
    return loc ? loc.name : 'Unknown location';
  }

  container.innerHTML = movements.map(mv => {
    const incoming = mv.to_location_id === location.id;
    const counterpartId = incoming ? mv.from_location_id : mv.to_location_id;
    const preposition = incoming ? 'from' : 'to';
    const directionLabel = incoming ? '↓ In' : '↑ Out';
    const verb = mv.request_id ? 'approved by' : 'moved by';
    const moverEmail = mv.mover ? mv.mover.email : 'unknown';
    const dateStr = new Date(mv.moved_at).toLocaleDateString();
    return `
      <div class="card">
        <div class="cname">${directionLabel} — ${escapeHtml(materialName(mv.item_id))} ${escapeHtml(mv.item_id)} ${preposition} ${escapeHtml(locationName(counterpartId))}</div>
        <div class="metaline">${escapeHtml(verb)} ${escapeHtml(moverEmail)} · ${dateStr}${mv.request_id ? ' · via request' : ''}</div>
        ${mv.note ? `<div class="metaline">Note: ${escapeHtml(mv.note)}</div>` : ''}
      </div>
    `;
  }).join('');
}
