export function createStore(api) {
  let locations = [];
  let materials = [];
  let items = [];
  let requests = [];
  let movements = [];
  let profiles = [];

  async function refresh() {
    [locations, materials, items, requests, movements, profiles] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
      api.listRequests(),
      api.listMovements(),
      api.listProfiles(),
    ]);
  }

  function clear() {
    locations = [];
    materials = [];
    items = [];
    requests = [];
    movements = [];
    profiles = [];
  }

  function getLocations() { return locations; }
  function getMaterials() { return materials; }
  function getItems() { return items; }
  function getRequests() { return requests; }
  function getMovements() { return movements; }
  function getProfiles() { return profiles; }

  function computeLocationView(loc) {
    const materialsById = new Map(materials.map(m => [m.id, m]));
    const locItems = items.filter(i => i.current_location_id === loc.id && !i.retired);
    const byMaterial = new Map();
    locItems.forEach(i => {
      const mat = materialsById.get(i.material_id);
      const name = mat ? mat.name : 'Unknown material';
      if (!byMaterial.has(name)) byMaterial.set(name, []);
      byMaterial.get(name).push(i.id);
    });
    const locMaterials = Array.from(byMaterial.entries()).map(([name, ids]) => ({ name, ids, count: ids.length }));
    return {
      id: loc.id,
      name: loc.name,
      type: loc.type,
      tier: loc.tier,
      students: loc.students,
      notes: loc.notes,
      ownerProfileId: loc.owner_profile_id || null,
      materials: locMaterials,
      totalUnits: locItems.length,
    };
  }

  function computeSchools() {
    return locations.filter(l => l.type === 'school').map(computeLocationView);
  }

  function computeWarehouses() {
    return locations.filter(l => l.type === 'warehouse')
      .map(computeLocationView)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function computeTeam() {
    const profilesById = new Map(profiles.map(p => [p.id, p]));
    return locations.filter(l => l.type === 'person')
      .map(l => {
        const view = computeLocationView(l);
        const owner = profilesById.get(l.owner_profile_id);
        return { ...view, ownerEmail: owner ? owner.email : null };
      })
      .sort((a, b) => (a.ownerEmail || a.name).localeCompare(b.ownerEmail || b.name));
  }

  function findLocationView(id) {
    const loc = locations.find(l => l.id === id);
    return loc ? computeLocationView(loc) : null;
  }

  return {
    refresh, clear,
    getLocations, getMaterials, getItems, getRequests, getMovements, getProfiles,
    computeSchools, computeWarehouses, computeTeam, findLocationView,
  };
}
