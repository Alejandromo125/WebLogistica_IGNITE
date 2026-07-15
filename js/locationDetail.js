// js/locationDetail.js
import { escapeHtml } from './schools.js';
import { renderItemsSection } from './items.js';
import { renderRequestSection } from './requests.js';
import { renderHistorySection } from './history.js';
import { openSchoolForm } from './schoolForm.js';

function fmt(n) { return (n === null || n === undefined || n === '') ? '—' : n; }

export function renderLocationDetail(container, ctx) {
  const { store, isAdmin, currentUserId, locationId } = ctx;
  const loc = store.findLocationView(locationId);

  if (!loc) {
    container.innerHTML = `
      <section>
        <a href="#/schools" class="back-link">← Back to schools</a>
        <div class="empty-note">Location not found. It may have been removed.</div>
      </section>
    `;
    return;
  }

  const isWarehouse = loc.type === 'warehouse';
  const tierClass = loc.tier === 'Tier1' ? 't1' : 't2';
  const backHref = isWarehouse ? '#/overview' : '#/schools';
  const backLabel = isWarehouse ? '← Back to overview' : '← Back to schools';

  container.innerHTML = `
    <section>
      <a href="${backHref}" class="back-link">${backLabel}</a>
      <h3 class="detail-title">${escapeHtml(loc.name)}</h3>
      ${isWarehouse
        ? '<div class="modal-tier" style="color:var(--slate)">Warehouse</div>'
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'rust' : 'teal'})">${loc.tier || 'Tier not recorded'}</div>`
      }
      <div class="modal-grid">
        ${isWarehouse
          ? `<div class="modal-stat"><div class="l">Units in stock</div><div class="v">${loc.totalUnits}</div></div>
             <div class="modal-stat"><div class="l">Material lines</div><div class="v">${loc.materials.length}</div></div>`
          : `<div class="modal-stat"><div class="l">Students</div><div class="v">${fmt(loc.students)}</div></div>
             <div class="modal-stat"><div class="l">Units deployed</div><div class="v">${loc.totalUnits}</div></div>`
        }
      </div>
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      <div class="manifest-title">Movement history</div>
      <div id="movementHistorySection"></div>
      ${(!isWarehouse && !isAdmin) ? `
        <div class="manifest-title">Request materials</div>
        <div id="locationRequestsSection"></div>
      ` : ''}
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${loc.notes ? escapeHtml(loc.notes) : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    </section>
  `;

  renderItemsSection(container.querySelector('#itemsSection'), {
    api: ctx.api, location: loc, materials: store.getMaterials(), items: store.getItems(),
    isAdmin, allLocations: store.getLocations(),
    onChange: async () => { await store.refresh(); await ctx.rerender(); },
  });

  const locationMovements = store.getMovements()
    .filter(mv => mv.from_location_id === loc.id || mv.to_location_id === loc.id)
    .sort((a, b) => new Date(b.moved_at) - new Date(a.moved_at));
  renderHistorySection(container.querySelector('#movementHistorySection'), {
    location: loc, movements: locationMovements, items: store.getItems(),
    materials: store.getMaterials(), locations: store.getLocations(),
  });

  if (!isWarehouse && !isAdmin) {
    const myRequests = store.getRequests().filter(r => r.location_id === loc.id && r.requested_by === currentUserId);
    renderRequestSection(container.querySelector('#locationRequestsSection'), {
      api: ctx.api, location: loc, materials: store.getMaterials(), myRequests,
      onChange: async () => { await store.refresh(); await ctx.rerender(); },
    });
  }

  if (!isWarehouse && isAdmin) {
    container.querySelector('#editSchoolBtn').addEventListener('click', () => {
      openSchoolForm(loc, ctx);
    });
  }
}
