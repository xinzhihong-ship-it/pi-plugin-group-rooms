"use strict";
// Leaving a room and joining again must not duplicate its transcript.
//
// A guest's `leave` records the room in the core's `departed` list so a rejoin
// keeps this machine's session and history. The rejoined room is a fresh object
// whose `appended` list is empty, so the core re-flushes the whole message
// window into that same session. The host's `appendManaged` is keyed by
// `externalId`, so an identical re-append is a no-op and the transcript shows
// each message once — that is the contract this pins.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createBackend } = require("../lib/backend.cjs");
const { fixture, until, model } = require("./fixtures.cjs");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sharedRoom(backend, name = "Rejoin room") {
  return backend.call("group-rooms.create", { name, projectPath: "/fixture", label: "Alice", address: "127.0.0.1", bindAddress: "127.0.0.1" });
}
async function approveAll(backend, roomId) {
  const state = await backend.call("group-rooms.snapshot", { roomId });
  for (const member of state.members) if (member.agentStatus === "pending") await backend.call("group-rooms.approve", { roomId, memberId: member.id, approved: true });
  return state;
}
// Every append this machine was asked to make, grouped by the host's externalId.
const appended = f => f.appends.reduce((counts, row) => { counts[row.externalId] = (counts[row.externalId] ?? 0) + 1; return counts; }, {});

test("a guest that leaves and rejoins does not duplicate its transcript", async t => {
  const host = fixture(), guest = fixture();
  const a = createBackend(host.api), b = createBackend(guest.api);
  await a.load(); await b.load();
  t.after(async () => { await b.stop(); await a.stop(); });

  const created = await sharedRoom(a, "Rejoin room");
  const first = await b.call("group-rooms.join", { invitation: created.invitation, label: "Bob", projectPath: "/guest-local" });
  await until(() => guest.doc().state.rooms.length === 1);
  await approveAll(a, created.roomId);

  // The host writes a message that every member's transcript carries.
  host.api.onPrompt = async session => { host.event(session, { type: "agent_end" }); host.terminal(session); };
  const messageId = randomUUID();
  await a.submit({ sessionId: created.sessionId, messageId, content: "@Bob hello" });
  await until(() => host.appends.some(row => row.externalId === messageId));
  await until(() => guest.appends.some(row => row.externalId === messageId));
  const beforeLeave = appended(guest)[messageId];
  assert.equal(beforeLeave, 1, "the message is appended once before leaving");

  // Bob leaves and joins again.
  await b.call("group-rooms.leave", { roomId: first.roomId });
  await until(() => guest.doc().state.rooms.length === 0);
  await sleep(100);
  const fresh = await a.call("group-rooms.invite", { roomId: created.roomId, address: "127.0.0.1" });
  const again = await b.call("group-rooms.join", { invitation: fresh.invitation, label: "Bob", projectPath: "/guest-local" });
  await until(() => guest.doc().state.rooms.length === 1);

  // The rejoined room re-flushes the window into the same session. The host must
  // treat that as the same message, not a second one.
  await sleep(300);
  const counts = appended(guest);
  assert.equal(counts[messageId], 1, "the rejoin re-flushed the message but the host appended it once");
  const persisted = guest.appends.filter(row => row.externalId === messageId);
  for (const row of persisted) assert.equal(row.sessionId, first.sessionId, "the rejoin kept the same local session");
  assert.equal(again.sessionId, first.sessionId, "a rejoin reuses the remembered session");

  // The members list must not grow a second row for the same person. Leaving
  // removes the member; rejoining adds exactly one new row for the new id.
  const labels = members => members.map(m => m.label).sort();
  const hostView = await a.call("group-rooms.snapshot", { roomId: created.roomId });
  const guestView = await b.call("group-rooms.snapshot", { roomId: again.roomId });
  assert.deepEqual(labels(hostView.members), ["Alice", "Bob"], `host members: ${JSON.stringify(hostView.members.map(m => `${m.label}:${m.id.slice(0, 6)}`))}`);
  assert.deepEqual(labels(guestView.members), ["Alice", "Bob"], `guest members: ${JSON.stringify(guestView.members.map(m => `${m.label}:${m.id.slice(0, 6)}`))}`);
  assert.equal(hostView.members.filter(m => m.label === "Bob").length, 1, "the host keeps one Bob row");
  assert.equal(guestView.members.filter(m => m.label === "Bob").length, 1, "the guest sees one Bob row");
  assert.equal(guestView.members.find(m => m.id === guestView.selfMemberId)?.label, "Bob", "the guest's own row is the new Bob");
});
