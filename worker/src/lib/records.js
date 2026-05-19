/**
 * Generic KV list/get/put/delete helpers for data records.
 * All records carry owner + visibility per D4.
 */

function uuid() {
  return crypto.randomUUID();
}

export async function listRecords(kv, prefix) {
  const list = await kv.list({ prefix });
  const records = await Promise.all(
    list.keys.map(async ({ name }) => {
      const raw = await kv.get(name);
      return raw ? JSON.parse(raw) : null;
    })
  );
  return records.filter(Boolean);
}

export async function getRecord(kv, key) {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function putRecord(kv, key, data) {
  await kv.put(key, JSON.stringify(data));
  return data;
}

export async function deleteRecord(kv, key) {
  await kv.delete(key);
}

export function newRecord(fields, ownerId) {
  const id = uuid();
  return {
    id,
    owner: ownerId,
    visibility: 'shared',
    createdAt: new Date().toISOString(),
    ...fields,
  };
}
