export function createStore(api) {
  let locations = [];
  let materials = [];
  let items = [];
  let requests = [];
  let movements = [];

  async function refresh() {
    [locations, materials, items, requests, movements] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
      api.listRequests(),
      api.listMovements(),
    ]);
  }

  function clear() {
    locations = [];
    materials = [];
    items = [];
    requests = [];
    movements = [];
  }

  function getLocations() { return locations; }
  function getMaterials() { return materials; }
  function getItems() { return items; }
  function getRequests() { return requests; }
  function getMovements() { return movements; }

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
    return locations.filter(l => l.type === 'person')
      .map(computeLocationView)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function findLocationView(id) {
    const loc = locations.find(l => l.id === id);
    return loc ? computeLocationView(loc) : null;
  }

  return {
    refresh, clear,
    getLocations, getMaterials, getItems, getRequests, getMovements,
    computeSchools, computeWarehouses, computeTeam, findLocationView,
  };
}
