"use strict";
// A guest that rejoins after its link dropped must not leave a ghost row.
//
// A machine only leaves cleanly while its link is up. If the guest's app was
// relaunched and its stored room was lost (reinstall, cleared data, a crash
// before the leave landed), the guest later joins again with a fresh invitation
// and a new credential — but its old row is still on the host, offline, because
// the dropped connection never sent `leave`. The join used to add a second row
// for the same name, and nothing ever retired the first: the members list grew
// one ghost per rejoin, on both machines, because a guest's view *is* the host's
// snapshot. The fix retires every offline row carrying the joining name (a name
// is one computer's identity here) together with its credential, and marks its
// still-`running` runs `unknown`.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRoomNetworkService } = require(process.env.GROOMS_CORE || "../lib/network.cjs");
const model = { key: "ghost/model", providerId: "ghost", modelId: "model", label: "Ghost", thinkingLevels: ["off", "high"], contextWindow: 1, isDefault: true };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, tries = 400) { for (let i = 0; i < tries; i++) { if (await predicate()) return true; await sleep(25); } return false; }

// One machine whose room state survives a `stop`/`start`, the way the plugin's
// store survives an app restart. A fresh instance models a reinstall: no saved
// room, so it cannot resume and must rejoin.
function machine(name) {
  let state = { version: 1, machineId: `${name}-machine`, rooms: [] }, secret = null, revision = 0;
  const deps = {
    store: {
      load: async () => ({ revision, state: structuredClone(state), secret }),
      save: async input => {
        if (input.expectedRevision !== revision) throw Object.assign(new Error("conflict"), { code: "CONFLICT" });
        state = structuredClone(input.state); secret = input.secret ?? secret; revision += 1;
        return { revision };
      },
    },
    appendMessage: async () => {}, createSession: async () => `${name}-session`,
    readMessages: async () => [], listModels: async () => [model],
    executeRun: async () => ({ status: "completed" }), stopRun: async () => {},
    emitEvent: async () => {}, changed: () => {},
    readAttachment: async () => { throw Object.assign(new Error("attachment blob is not stored on this machine"), { code: "NOT_FOUND" }); },
    beginAttachment: async () => ({ uploadId: "u" }), writeAttachment: async () => ({}),
    commitAttachment: async () => ({ ref: `attachments/${"0".repeat(64)}`, size: 0 }),
  };
  return { name, service: createRoomNetworkService(deps) };
}

test("a guest that rejoins after its link dropped does not leave a ghost member row", async t => {
  const host = machine("host"), guest = machine("guest");
  const port = 40300 + (process.pid % 20000);
  await host.service.start({ port, bindAddress: "127.0.0.1" });
  t.after(async () => { await host.service.stop(true); });

  const shared = await host.service.shareRoom({ roomId: "r", sessionId: "hs", name: "P", projectPath: "/h", label: "Alice", address: `wss://127.0.0.1:${port}` });
  const joined = await guest.service.joinRoom({ invitation: shared.invitation, label: "Bob", projectPath: "/g" });
  await guest.service.requestAgent(joined.roomId);
  let room = (await host.service.status()).rooms[0];
  const firstBob = room.members.find(m => m.label === "Bob").id;
  await host.service.approveAgent("r", firstBob, true);
  await sleep(200);

  // The guest's link drops with no clean leave: its row stays on the host,
  // offline, and its credential stays valid.
  await guest.service.stop(true);
  assert.ok(await until(async () => (await host.service.status()).rooms[0].members.find(m => m.id === firstBob)?.online === false), "the dropped guest goes offline");

  // The guest's stored room is gone (reinstall / cleared data), so it comes back
  // as a fresh machine and rejoins under the same name with a new invitation.
  const guest2 = machine("guest2");
  const fresh = await host.service.shareRoom({ roomId: "r", sessionId: "hs", name: "P", projectPath: "/h", label: "Alice", address: `wss://127.0.0.1:${port}` });
  const again = await guest2.service.joinRoom({ invitation: fresh.invitation, label: "Bob", projectPath: "/g" });
  await guest2.service.requestAgent(again.roomId);
  t.after(async () => { await guest2.service.stop(true); });
  assert.ok(await until(async () => (await host.service.status()).rooms[0].members.some(m => m.label === "Bob" && m.online === true)), "the rejoined guest is online");

  const hostView = (await host.service.status()).rooms[0];
  const guestView = (await guest2.service.status()).rooms[0];
  assert.equal(hostView.members.length, 2, `host keeps one row per computer: ${JSON.stringify(hostView.members.map(m => `${m.label}:${m.id.slice(0, 6)}`))}`);
  assert.equal(hostView.members.filter(m => m.label === "Bob").length, 1, "the host does not keep a ghost Bob");
  assert.equal(hostView.members.some(m => m.id === firstBob), false, "the stale credential is retired with the row");
  assert.equal(guestView.members.length, 2, "the guest's view is the host's snapshot");
  assert.equal(guestView.members.filter(m => m.label === "Bob").length, 1, "the guest sees one Bob row");
  assert.equal(guestView.members.find(m => m.id === guestView.selfMemberId)?.label, "Bob", "the guest's own row is the new one");
});
