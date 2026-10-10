"use strict";
const { randomUUID } = require("node:crypto");
const KEY = "groupRoomsBackend";
const copy = value => structuredClone(value);

// One plugin process owns this document. Settings has no host-side CAS API;
// the queue implements CAS for the portable core within that process.
function createStorage(pi) {
  let serial = Promise.resolve();
  const locked = action => {
    const work = serial.then(action); serial = work.catch(() => {}); return work;
  };
  async function document() {
    const settings = await pi.plugin.getSettings();
    const value = settings[KEY] ?? { version: 1, revision: 0, state: null, secretKeys: [], preferences: {}, workers: {}, submissions: {}, local: { label: "", address: "" } };
    if (value.version !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.secretKeys)) throw new Error("Invalid room storage");
    const doc = copy(value);
    // A document written before this machine remembered its own label and address
    // simply has no `local`; defaulting it here keeps every existing room intact.
    doc.local ??= { label: "", address: "" };
    for (const preferences of Object.values(doc.preferences)) {
      // Upgrade the old combined selection/configuration shape on next save.
      preferences.configurations ??= copy(preferences.targets ?? []);
    }
    return doc;
  }
  async function readSecret(keys) {
    if (!keys.length) return null;
    const chunks = await Promise.all(keys.map(key => pi.secrets.get(key)));
    if (chunks.some(chunk => chunk === null)) throw new Error("Room secrets missing");
    return JSON.parse(Buffer.from(chunks.join(""), "base64").toString("utf8"));
  }
  return {
    read: () => locked(document),
    update: action => locked(async () => {
      const doc = await document(); const result = await action(doc);
      await pi.plugin.setSettings({ [KEY]: doc }); return result;
    }),
    core: {
      load: () => locked(async () => {
        const doc = await document(), privateState = await readSecret(doc.secretKeys);
        const state = doc.state;
        for (const room of state?.rooms ?? []) {
          if (!privateState?.rooms?.[room.id]) throw new Error("Room membership secrets missing");
          room.credentials = privateState.rooms[room.id].credentials;
          room.tickets = privateState.rooms[room.id].tickets;
        }
        return { revision: doc.revision, state, secret: privateState?.core ?? null };
      }),
      save: input => locked(async () => {
        const doc = await document();
        if (doc.revision !== input.expectedRevision) throw Object.assign(new Error("Room storage revision conflict"), { code: "CONFLICT" });
        const state = copy(input.state), previous = await readSecret(doc.secretKeys);
        const privateState = { core: input.secret ?? previous?.core ?? null, rooms: {} };
        for (const room of state.rooms ?? []) {
          privateState.rooms[room.id] = { credentials: room.credentials, tickets: room.tickets };
          room.credentials = {}; room.tickets = [];
        }
        const encoded = Buffer.from(JSON.stringify(privateState)).toString("base64");
        const prefix = `group-rooms.${randomUUID()}`, keys = [];
        try {
          for (let offset = 0; offset < encoded.length; offset += 48000) {
            const key = `${prefix}.${keys.length}`; keys.push(key);
            await pi.secrets.set(key, encoded.slice(offset, offset + 48000));
          }
          await pi.plugin.setSettings({ [KEY]: { ...doc, revision: doc.revision + 1, state, secretKeys: keys } });
        } catch (error) {
          // Keep both generations if the settings acknowledgement was lost.
          // Deleting either could destroy the committed identity.
          throw error;
        }
        await Promise.allSettled(doc.secretKeys.map(key => pi.secrets.delete(key)));
        return { revision: doc.revision + 1 };
      }),
    },
  };
}
module.exports = { createStorage, KEY };
