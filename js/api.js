// js/api.js
export function createApi(client) {
  async function listLocations() {
    const { data, error } = await client.from('locations').select('*').order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  async function createLocation(location) {
    const { data, error } = await client.from('locations').insert(location).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateLocation(id, changes) {
    const { data, error } = await client.from('locations').update(changes).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function listMaterials() {
    const { data, error } = await client.from('materials').select('*').order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  async function createMaterial(name) {
    const { data, error } = await client.from('materials').insert({ name }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function listItems() {
    const { data, error } = await client.from('items').select('*');
    if (error) throw new Error(error.message);
    return data;
  }

  async function createItem(item) {
    const { data, error } = await client.from('items').insert(item).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateItem(id, changes) {
    const { data, error } = await client.from('items').update(changes).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function createRequest(request) {
    const { data, error } = await client.from('requests').insert(request).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function listRequests() {
    const { data, error } = await client.from('requests').select('*, profiles(email)');
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateRequest(id, changes) {
    const { data, error } = await client.from('requests').update(changes).eq('id', id).eq('status', 'pending').select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function performTransfer(itemIds, fromLocationId, toLocationId, note, requestId) {
    const { data, error } = await client.rpc('perform_transfer', {
      item_ids: itemIds,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      note,
      request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
    createRequest, listRequests, updateRequest, performTransfer,
  };
}
