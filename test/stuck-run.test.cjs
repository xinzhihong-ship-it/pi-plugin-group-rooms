"use strict";
// A member that comes back must be able to be messaged again.
//
// When a peer connection drops, the host records every run aimed at that member
// as `unknown` (it cannot prove the turn is dead). `admit` then refuses any new
// message to that member — "Agent already has an active or uncertain run" — and
// for a *remote* member nothing ever clears it: the local worker that could have
// settled it is gone, and the plugin's own release path only covers this
// machine's own row. A member connecting again is the one event that proves the
// old turn is dead, so the host retires that member's leftover `running`/
// `unknown` records on `resume`. The guest restarting its app — same member id,
// same credential — is exactly the real case, and before the fix it left the
// room permanently refusing to talk to that computer.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRoomNetworkService } = require(process.env.GROOMS_CORE || "../lib/network.cjs");
const model = { key: "stuck/model", providerId: "stuck", modelId: "model", label: "Stuck", thinkingLevels: ["off", "high"], contextWindow: 1, isDefault: true };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, tries = 400) {
  for (let i = 0; i < tries; i++) { if (await predicate()) return true; await sleep(25); }
  return false;
}

// One machine whose room state survives a `stop`/`start`, the way the plugin's
// store survives an app restart.
function machine(name) {
  let state = { version: 1, machineId: `${name}-machine`, rooms: [] }, secret = null, revision = 0;
  const runs = [], stopped = [];
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
    // A run that never returns on its own: the peer dropping mid-run is the real
    // way an outcome becomes unknown.
    executeRun: async request => { runs.push(request); return new Promise(() => {}); },
    stopRun: async runId => { stopped.push(runId); }, emitEvent: async () => {}, changed: () => {},
    readAttachment: async () => { throw Object.assign(new Error("attachment blob is not stored on this machine"), { code: "NOT_FOUND" }); },
    beginAttachment: async () => ({ uploadId: "u" }), writeAttachment: async () => ({}),
    commitAttachment: async () => ({ ref: `attachments/${"0".repeat(64)}`, size: 0 }),
  };
  return { name, service: createRoomNetworkService(deps), runs, stopped };
}

test("a member that comes back after a run was broken off can be messaged again", async t => {
  const host = machine("host"), guest = machine("guest");
  const port = 40100 + (process.pid % 20000);
  await host.service.start({ port, bindAddress: "127.0.0.1" });
  t.after(async () => { await guest.service.stop(true); await host.service.stop(true); });
  const shared = await host.service.shareRoom({ roomId: "r", sessionId: "hs", name: "P", projectPath: "/h", label: "Alice", address: `wss://127.0.0.1:${port}` });
  const joined = await guest.service.joinRoom({ invitation: shared.invitation, label: "Bob", projectPath: "/g" });
  await guest.service.requestAgent(joined.roomId);
  let room = (await host.service.status()).rooms[0];
  const bobId = room.members.find(m => m.label === "Bob").id;
  const approve = async id => { if (room.members.find(m => m.id === id)?.agentStatus === "pending") await host.service.approveAgent("r", id, true); };
  await approve(room.selfMemberId); await approve(bobId);
  await sleep(200);

  // One message to Bob starts a run that never settles.
  await host.service.sendMessage({ roomId: "r", id: randomUUID(), content: "@Bob first", targets: [{ targetMemberId: bobId, modelKey: model.key }] });
  assert.ok(await until(() => guest.runs.length === 1), "the guest's run started");
  room = (await host.service.status()).rooms[0];
  assert.equal(room.runs.find(r => r.targetMemberId === bobId)?.status, "running");

  // Bob's machine goes away mid-run. The host cannot prove the turn is dead, so
  // it records `unknown`, and the room refuses Bob.
  await guest.service.stop(true);
  assert.ok(await until(async () => (await host.service.status()).rooms[0].runs.find(r => r.targetMemberId === bobId)?.status === "unknown"), "the broken run is unknown");
  await assert.rejects(host.service.sendMessage({ roomId: "r", id: randomUUID(), content: "@Bob second", targets: [{ targetMemberId: bobId, modelKey: model.key }] }), /unavailable|uncertain run/, "an offline Bob with a broken run is refused");

  // Bob's app comes back: the same stored room, the same member id, a fresh
  // connection. Coming back proves the old turn is dead, so the stale record is
  // retired — without this, the run would keep the room refusing Bob forever
  // even once he is online again.
  await guest.service.start({ port: 0, bindAddress: "127.0.0.1" });
  assert.ok(await until(async () => { const r = (await host.service.status()).rooms[0]; return r.members.find(m => m.id === bobId)?.online === true && !r.runs.some(v => v.targetMemberId === bobId && ["running", "unknown"].includes(v.status)); }), "the reconnected member is online with no stale run");

  // And the room takes a message to them again.
  await host.service.sendMessage({ roomId: "r", id: randomUUID(), content: "@Bob third", targets: [{ targetMemberId: bobId, modelKey: model.key }] });
  assert.ok(await until(async () => (await host.service.status()).rooms[0].runs.some(r => r.targetMemberId === bobId && r.status === "running")), "the message to the reconnected member was admitted");
});
