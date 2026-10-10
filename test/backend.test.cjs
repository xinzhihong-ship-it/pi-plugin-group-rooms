"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createBackend } = require("../lib/backend.cjs");
const { createStorage } = require("../lib/storage.cjs");
const { createWorkers } = require("../lib/workers.cjs");
const { fixture, until, tick, model } = require("./fixtures.cjs");
const request = () => ({ runId: randomUUID(), roomId: randomUUID(), targetMemberId: randomUUID(), model, projectPath: "/fixture", history: [], content: "fixture prompt" });

// Creating a room is itself the consent to receive: this binds the listener
// with no prior switch, and loopback keeps the fixture off the network.
async function sharedRoom(backend, name = "Fixture room") {
  return backend.call("group-rooms.create", { name, projectPath: "/fixture", label: "Alice", address: "127.0.0.1", bindAddress: "127.0.0.1" });
}

// Creating a room approves the host's own row: this machine *is* the host, so
// making its user click 「批准助手」 on itself is exactly the self-approval they
// asked to be rid of. Every other member still waits for a host click, and a
// guest that joins and asks lands as `pending`. The helper stays for the tests
// that exercise an explicit approve, and is idempotent when the row is already
// approved.
async function approveSelf(backend, roomId) {
  const state = await backend.call("group-rooms.snapshot", { roomId });
  const self = state.members.find(member => member.id === state.selfMemberId);
  if (self?.agentStatus === "pending") await backend.call("group-rooms.approve", { roomId, memberId: state.selfMemberId, approved: true });
  return state.selfMemberId;
}

test("load is network inert and missing event SDK fails closed", async () => {
  const f = fixture(); let constructed = 0;
  const backend = createBackend(f.api, { createNetwork() { constructed++; throw new Error("Unexpected core"); } });
  await backend.load();
  const { suggestAddress, ...inert } = await backend.call("group-rooms.list");
  assert.deepEqual(inert, {
    machineId: "", rooms: [], picker: { requestId: "", pending: false, done: true, path: null, name: "", error: "" },
    // A machine that has never created or joined a room remembers nothing.
    local: { label: "", address: "" },
  });
  // The probe answers an IPv4 or an empty string — never a loopback address it
  // invented, and never a throw on a host with no usable interface.
  assert.equal(typeof suggestAddress, "string");
  assert.ok(suggestAddress === "" || /^(\d{1,3}\.){3}\d{1,3}$/.test(suggestAddress), `unexpected probe ${suggestAddress}`);
  // Activation never binds and there is no listener switch to call.
  assert.equal("listener" in inert, false);
  assert.equal(constructed, 0); assert.equal(f.shared.secrets.size, 0); assert.equal(f.calls.length, 0);
  await backend.stop(); assert.equal(f.bus.listenerCount("desktop:agentEvent"), 0);
  delete f.api.desktop.subscribeAgentEvents;
  await assert.rejects(createBackend(f.api).load(), { code: "SDK_UNAVAILABLE" });
});

test("storage CAS, secret chunking and membership credentials never enter settings", async () => {
  const f = fixture(), store = createStorage(f.api);
  const state = { rooms: [{ id: "room", credentials: { member: "PRIVATE-CREDENTIAL" }, tickets: [{ hash: "PRIVATE-TICKET", expires: 1 }] }] };
  const secret = "PRIVATE-KEY".repeat(12000);
  assert.deepEqual(await store.core.save({ expectedRevision: 0, state, secret }), { revision: 1 });
  assert.ok(f.doc().secretKeys.length > 1);
  const serialized = JSON.stringify(f.shared.settings);
  for (const privateValue of ["PRIVATE-CREDENTIAL", "PRIVATE-TICKET", "PRIVATE-KEY"]) assert.equal(serialized.includes(privateValue), false);
  const loaded = await store.core.load(); assert.deepEqual(loaded.state, state); assert.equal(loaded.secret, secret);
  const attempts = await Promise.allSettled([store.core.save({ expectedRevision: 1, state, secret }), store.core.save({ expectedRevision: 1, state, secret })]);
  assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(attempts.find(r => r.status === "rejected").reason.code, "CONFLICT");
  assert.equal(f.shared.secrets.size, f.doc().secretKeys.length);
  f.shared.secrets.delete(f.doc().secretKeys[0]); await assert.rejects(store.core.load(), /secrets missing/);
});

test("native managed send uses stable UUID, targets and accepted retry without executing again", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const state = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.selectModel", { roomId: state.id, memberId: state.selfMemberId, modelKey: model.key });
  await backend.call("group-rooms.selectThinking", { roomId: state.id, memberId: state.selfMemberId, thinkingLevel: "high" });
  f.api.onPrompt = async session => {
    f.event(session, { type: "message_end", message: { id: randomUUID(), role: "assistant", content: "fixture answer", createdAt: new Date().toISOString(), status: "complete" } });
    f.event(session, { type: "agent_end" });
    f.terminal(session);
  };
  const input = { sessionId: created.sessionId, messageId: randomUUID(), content: "@Alice run fixture" };
  assert.deepEqual(await backend.submit(input), { accepted: true });
  await until(() => f.doc().state.rooms[0].runs[0]?.status === "completed");
  assert.deepEqual(await backend.submit(input), { accepted: true });
  assert.equal(f.calls.filter(c => c.operation === "agent/prompt").length, 1);
  assert.equal(f.appends[0].externalId, input.messageId);
  assert.equal(f.appends[0].author, "🔵 Alice");
  assert.equal(f.appends[1].message.content, "fixture answer");
  const target = f.doc().submissions[`${input.sessionId}:${input.messageId}`].targets[0];
  assert.equal(target.targetMemberId, state.selfMemberId); assert.equal(target.thinkingLevel, "high");
  await assert.rejects(backend.submit({ ...input, content: "changed" }), { code: "CONFLICT" });
  await assert.rejects(backend.submit({ ...input, messageId: randomUUID(), content: "@missing hello" }), /exactly one/);
});

test("worker terminal is turnEnded only; ordered early events and session/turn filtering", async () => {
  const f = fixture(), storage = createStorage(f.api), workers = createWorkers(f.api, storage), req = request(), events = [];
  await workers.load(); let settled = false;
  f.api.onPrompt = async session => { f.event(session, { type: "message_end", message: { content: "early" } }); f.event(session, { type: "agent_end" }); };
  const done = workers.executeRun(req, async event => { await tick(); events.push(event.event.type); }).then(result => { settled = true; return result; });
  await until(() => events.length === 2);
  const session = [...f.sessions.values()][0];
  assert.equal(settled, false); assert.deepEqual(events, ["message_end", "agent_end"]);
  f.terminal(session, "completed", { turnId: "wrong" }); f.terminal(session, "completed", { sessionId: "wrong" });
  f.event(session, { type: "asktool_request", request: {} }); f.event(session, { type: "tool_permission_request", request: {} });
  await tick(); assert.equal(settled, false); assert.equal(events.length, 2);
  await workers.stopRun(req.runId); await tick(); assert.equal(settled, false);
  f.terminal(session, "aborted"); assert.deepEqual(await done, { status: "aborted" });
  await until(() => f.released()); await workers.close();
  assert.equal(f.doc().workers[req.runId].status, "aborted");
  assert.ok(f.calls.findIndex(c => c.operation === "subscribe") < f.calls.findIndex(c => c.operation === "agent/prompt"));
  const created = f.calls.find(c => c.operation === "session/create").args[0];
  assert.deepEqual([created.providerId, created.modelId], [req.model.providerId, req.model.modelId]);
  assert.equal(f.consents(), 0, "an Ask default needs no native confirmation or session deletion");
  assert.equal(f.calls.some(c => ["tool/resolvePermission", "agent/askTool/resolve"].includes(c.operation)), false);
});

test("lost prompt acknowledgement settles unknown, releases its subscription and never replays", async () => {
  const f = fixture(), storage = createStorage(f.api), workers = createWorkers(f.api, storage), req = request(); await workers.load();
  f.api.onPrompt = async () => { throw new Error("Fixture transport lost"); };
  assert.deepEqual(await workers.executeRun(req, async () => {}), { status: "unknown" });
  assert.equal(f.doc().workers[req.runId].status, "unknown");
  assert.equal(f.released(), true, "a rejected prompt must not hold one of the host's subscription slots");
  assert.ok(f.calls.some(c => c.operation === "agent/abort"));
  const session = [...f.sessions.values()][0]; f.terminal(session, "completed"); await tick();
  assert.equal(f.doc().workers[req.runId].status, "unknown");
  f.api.onPrompt = undefined;
  const malformed = request(); f.api.desktop.invoke = (original => async input => input.operation === "agent/prompt" ? { accepted: false } : original(input))(f.api.desktop.invoke);
  assert.deepEqual(await workers.executeRun(malformed, async () => {}), { status: "unknown" });
  assert.equal(f.released(), true);
  await workers.close();
  const restarted = fixture(f.shared), next = createWorkers(restarted.api, createStorage(restarted.api)); await next.load(); await next.close();
  assert.equal(restarted.calls.some(c => c.operation === "agent/prompt"), false);
});

test("graceful backend stop persists aborted receipt before stopping core and cleans subscriptions", async () => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const state = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.selectModel", { roomId: state.id, memberId: state.selfMemberId, modelKey: model.key });
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: `@${state.selfMemberId} run` });
  await until(() => f.calls.some(c => c.operation === "agent/prompt"));
  f.api.onAbort = async session => { if (session) f.terminal(session, "aborted"); };
  const before = (await backend.call("group-rooms.list")).listener;
  assert.ok(before, "creating a room arms the listener without a switch");
  await backend.stop();
  assert.equal(f.doc().state.rooms[0].runs[0].status, "aborted");
  assert.equal(f.released(), true); assert.equal(f.bus.listenerCount("desktop:turnEnded"), 0);
  // A saved host room re-arms on the next activation, rebinding the remembered
  // address so invitations shared before the restart keep working.
  const restarted = createBackend(f.api); await restarted.load();
  assert.equal((await restarted.call("group-rooms.list")).listener.port, before.port);
  assert.equal(f.doc().listenerPort, before.port);
  await restarted.stop();
});

test("pending native admission after crash is unknown and cannot replay", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); const created = await sharedRoom(backend); await backend.stop();
  const id = randomUUID(), content = "pending";
  // The journal digest now covers content and the attachment refs together, so
  // a retry that names different blobs is a different message.
  const digest = require("node:crypto").createHash("sha256").update(JSON.stringify([content, []])).digest("hex");
  f.doc().submissions[`${created.sessionId}:${id}`] = { digest, status: "pending", targets: [] };
  const restarted = createBackend(f.api); await restarted.load(); t.after(() => restarted.stop());
  await assert.rejects(restarted.submit({ sessionId: created.sessionId, messageId: id, content }), { code: "UNKNOWN_OUTCOME" });
  assert.equal(f.doc().submissions[`${created.sessionId}:${id}`].status, "unknown");
  assert.equal(f.calls.some(c => c.operation === "agent/prompt"), false);
  await assert.rejects(restarted.call("group-rooms.selectDirectory", { roomId: created.roomId }), { code: "UNSUPPORTED" });
});

test("host and guest adapters deliver native transcripts and execute only approved local guest worker", async t => {
  const host = fixture(), guest = fixture(), a = createBackend(host.api), b = createBackend(guest.api);
  await a.load(); await b.load(); t.after(async () => { await b.stop(); await a.stop(); });
  const created = await sharedRoom(a);
  const joined = await b.call("group-rooms.join", { invitation: created.invitation, label: "Bob", projectPath: "/guest-local" });
  await b.call("group-rooms.requestAgent", { roomId: joined.roomId });
  let guestState = await b.call("group-rooms.snapshot", { roomId: joined.roomId });
  await a.call("group-rooms.approve", { roomId: joined.roomId, memberId: guestState.selfMemberId, approved: true });
  await b.call("group-rooms.selectModel", { roomId: joined.roomId, memberId: guestState.selfMemberId, modelKey: model.key });
  guest.api.onPrompt = async session => {
    assert.equal(session.projectPath, "/guest-local");
    guest.event(session, { type: "message_end", message: { id: randomUUID(), role: "assistant", content: "guest fixture answer", createdAt: new Date().toISOString(), status: "complete" } });
    guest.terminal(session);
  };
  const messageId = randomUUID();
  await b.submit({ sessionId: joined.sessionId, messageId, content: "@Bob fixture" });
  await until(() => host.doc().state.rooms[0].runs[0]?.status === "completed");
  await until(() => guest.appends.some(row => row.message.content === "guest fixture answer"));
  assert.equal(host.calls.some(call => call.operation === "agent/prompt"), false);
  assert.equal(guest.calls.filter(call => call.operation === "agent/prompt").length, 1);
  assert.equal(host.appends.find(row => row.externalId === messageId).author, "🟢 Bob");
  assert.equal(host.appends.find(row => row.message.content === "guest fixture answer").externalId, guest.appends.find(row => row.message.content === "guest fixture answer").externalId);

  // A guest dials out and never binds: the host is the only receiver.
  assert.equal((await b.call("group-rooms.list")).listener, undefined, "a guest never binds a listener");
  assert.ok((await a.call("group-rooms.list")).listener, "the host keeps receiving");
  // Leaving the guest room retires the guest core, and it never held a port.
  await b.call("group-rooms.leave", { roomId: joined.roomId });
  assert.equal((await b.call("group-rooms.list")).listener, undefined);
  assert.equal((await b.call("group-rooms.list")).rooms.length, 0);
});

// The worker runs at this machine's own configured permission mode. Narrowing
// it would need `session/configure`, a dangerous operation the host re-confirms
// natively on every call — one native dialog per room message. A worker that
// never configures is the fix, so the strongest assertion is that no configure
// call and no permission read ever happens, whatever the app default is.
test("a worker never narrows permission through host-confirmed configuration", async () => {
  for (const defaultPermissionMode of ["auto", "accept-edits", "ask"]) {
    const f = fixture({ appSettings: { defaultPermissionMode } }), workers = createWorkers(f.api, createStorage(f.api)), req = request();
    await workers.load();
    f.api.onPrompt = async session => f.terminal(session);
    assert.deepEqual(await workers.executeRun(req, async () => {}), { status: "completed" });
    assert.equal(f.calls.some(c => c.operation === "session/configure"), false, `configure must not run for ${defaultPermissionMode}`);
    assert.equal(f.calls.some(c => c.operation === "session/get"), false, `the worker must not read a permission mode for ${defaultPermissionMode}`);
    const created = f.calls.find(c => c.operation === "session/create");
    assert.equal(created.args[0].permissionMode, undefined);
    assert.ok(f.calls.findIndex(c => c.operation === "session/create") < f.calls.findIndex(c => c.operation === "agent/prompt"));
    await workers.close();
  }
});

// The user's complaint was a project appearing in the sidebar that they never
// asked for. A room transcript never runs an agent, so it binds no host project
// at all; the member's own folder travels with each worker request instead.
test("a room transcript binds no host project and no workspace", async () => {
  const f = fixture(), backend = createBackend(f.api); await backend.load();
  const created = await sharedRoom(backend);
  const managed = f.calls.filter(call => call.operation === "session.createManaged");
  assert.equal(f.calls.some(call => call.operation === "project.create"), false, "a room must not create a project");
  assert.equal(managed.length, 1);
  assert.equal(managed[0].args[0].projectId, undefined, "a room session must stay unbound");
  assert.equal(managed[0].args[0].projectPath, undefined);
  assert.equal(created.roomId.length > 0, true);
  await backend.stop();
});

// Joining is this computer offering to run agents, so it publishes its catalog
// and asks for access in the same step. The host still decides: the request
// lands as `pending` until it approves, and a room with no reachable host is
// still joined.
test("joining a room asks for agent access in the same step", async t => {
  const host = fixture(), guest = fixture(), a = createBackend(host.api), b = createBackend(guest.api);
  await a.load(); await b.load(); t.after(async () => { await b.stop(); await a.stop(); });
  const created = await sharedRoom(a);
  const joined = await b.call("group-rooms.join", { invitation: created.invitation, label: "Bob", projectPath: "/guest-local" });
  // No separate requestAgent call: the join itself publishes the catalog.
  const guestMember = (await a.call("group-rooms.snapshot", { roomId: joined.roomId })).members.find(value => value.label === "Bob");
  assert.equal(guestMember.agentStatus, "pending");
  assert.equal(guestMember.models.length, 1);
  const guestState = await b.call("group-rooms.snapshot", { roomId: joined.roomId });
  assert.equal(guestState.members.find(value => value.id === guestState.selfMemberId).agentStatus, "pending");
});

// The user asked why the host has to approve itself: 「创建房间的主机为什么
// 还要批准自己 他自己就是最高权限」. So creating a room now approves the
// host's own row, and nothing else. A member that joins and asks is still a
// request the host must answer, and a guest can never approve anyone.
test("creating a room approves only the host's own row; every other member still waits", async t => {
  const host = fixture(), guest = fixture(), a = createBackend(host.api), b = createBackend(guest.api);
  await a.load(); await b.load(); t.after(async () => { await b.stop(); await a.stop(); });
  const created = await sharedRoom(a);
  const status = async backend => (await backend.call("group-rooms.snapshot", { roomId: created.roomId })).members.map(value => `${value.label}:${value.agentStatus}`);
  assert.deepEqual(await status(a), ["Alice:approved"], "the host is its own highest authority and needs no click on itself");
  const joined = await b.call("group-rooms.join", { invitation: created.invitation, label: "Bob", projectPath: "/guest-local" });
  assert.deepEqual(await status(a), ["Alice:approved", "Bob:pending"], "joining is a request the host has not answered");
  // The guest cannot approve itself, and it cannot approve the host either.
  const guestId = (await b.call("group-rooms.snapshot", { roomId: joined.roomId })).selfMemberId;
  await assert.rejects(b.call("group-rooms.approve", { roomId: joined.roomId, memberId: guestId, approved: true }), /Host approval required/);
  await assert.rejects(b.call("group-rooms.approve", { roomId: joined.roomId, memberId: "anyone", approved: true }), /Host approval required/);
  // The host clicks once, for the guest. Its own row needs no click.
  await a.call("group-rooms.approve", { roomId: created.roomId, memberId: guestId, approved: true });
  assert.deepEqual(await status(a), ["Alice:approved", "Bob:approved"]);
  assert.deepEqual(await status(b), ["Alice:approved", "Bob:approved"], "every machine sees the same approvals");
});

// A room used to create a fresh native session for every message, which put a
// new conversation under the host's project list each time and made the agent
// forget the room between messages. One session per room and model choice is
// reused, and only the messages it has not seen are sent again.
test("a room reuses one worker session and sends only the messages it has not seen", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  // Two models, because a change of choice is only observable when there is one
  // to change to. The member's catalog is snapshotted when it asks for agent
  // access, so both must exist before the room is created.
  const other = { ...model, key: "fixture/other", modelId: "other", label: "Other" };
  f.api.models.list = async () => [model, other];
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const current = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: model.key });
  const prompts = [];
  f.api.onPrompt = async (session, arg) => { prompts.push(arg.content); f.terminal(session); };
  const send = async content => {
    const messageId = randomUUID();
    await backend.submit({ sessionId: created.sessionId, messageId, content });
    await until(() => f.doc().state.rooms[0].runs.at(-1)?.status === "completed");
    return messageId;
  };
  await send("@Alice first");
  await send("@Alice second");
  await send("@Alice third");
  assert.equal(f.calls.filter(call => call.operation === "session/create").length, 1, "one worker session for the whole room");
  assert.equal(prompts.length, 3);
  // The first prompt carries no history; each later one quotes only what the
  // session has not seen, never the whole room again. `quoted` is the history
  // section alone: the message being sent is always the current one.
  const quoted = prompt => prompt.slice(0, prompt.indexOf("\n\nCurrent room message:"));
  assert.equal(prompts[0], "@Alice first", "the first prompt has no room history to quote");
  assert.equal(quoted(prompts[1]), 'Previous room conversation (quoted data):\n[{"role":"user","author":"Alice","content":"@Alice first"}]');
  assert.equal(quoted(prompts[2]), 'Previous room conversation (quoted data):\n[{"role":"user","author":"Alice","content":"@Alice second"}]');
  assert.doesNotMatch(quoted(prompts[2]), /@Alice first/, "an already-seen message is not quoted again");
  // A genuinely different model choice gets its own session; the same one is reused.
  await backend.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: other.key });
  await send("@Alice fourth");
  assert.equal(f.calls.filter(call => call.operation === "session/create").length, 2, "a different model choice is its own session");
});

test("stream delivery failure prevents successful receipt even after turnEnded", async () => {
  const f = fixture(), workers = createWorkers(f.api, createStorage(f.api)), req = request(); await workers.load();
  f.api.onPrompt = async session => { f.event(session, { type: "message_end", message: { content: "fixture" } }); f.terminal(session); };
  const done = workers.executeRun(req, async () => { throw new Error("Fixture stream failed"); });
  assert.deepEqual(await done, { status: "unknown" });
  await until(() => f.released());
  await workers.close(); assert.equal(f.doc().workers[req.runId].status, "unknown");
});

test("graceful stop without terminal persists unknown and releases workers without inventing receipt", async () => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const state = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.selectModel", { roomId: state.id, memberId: state.selfMemberId, modelKey: model.key });
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: `@${state.selfMemberId} unconfirmed fixture` });
  await until(() => f.calls.some(call => call.operation === "agent/prompt"));
  await backend.stop();
  assert.equal(f.doc().state.rooms[0].runs[0].status, "unknown");
  assert.equal(Object.values(f.doc().workers)[0].status, "unknown");
  assert.equal(f.released(), true); assert.equal(f.bus.listenerCount("desktop:agentEvent"), 0);
});

test("main lifecycle exposes only bridge and native submit hooks, with inert load", async () => {
  const f = fixture(); globalThis.pi = f.api;
  const entry = require("../main.js");
  try {
    await entry.onLoad(); assert.equal(f.shared.secrets.size, 0); assert.equal(f.calls.length, 0);
    assert.deepEqual(await entry.onPanelInvoke("group-rooms.models", {}), [{ key: model.key, providerId: model.providerId, modelId: model.modelId, label: model.label, thinkingLevels: model.thinkingLevels, contextWindow: 1 }]);
    assert.equal(await entry.onPanelInvoke("group-rooms.context", {}), null);
    const context = { sessionId: randomUUID(), managedByPlugin: "io.github.xinzhihong.group-rooms" };
    assert.deepEqual(await entry.onRendererCall("group-rooms.context", { context }), context);
    assert.deepEqual(await entry.onPanelInvoke("group-rooms.context", {}), context);
    await assert.rejects(entry.onPanelInvoke("group-rooms.context", { context: null, source: "renderer" }), { code: "FORBIDDEN" });
    assert.deepEqual(await entry.onPanelInvoke("group-rooms.context", {}), context);
    assert.deepEqual(await entry.onRendererCall("group-rooms.appearance", {}), { locale: "en", base: "dark" });
    for (const method of ["send", "submit", "prompt", "stop"]) await assert.rejects(entry.onPanelInvoke(`group-rooms.${method}`, {}), { code: "METHOD_NOT_FOUND" });
    assert.equal(await entry.onRendererCall("group-rooms.context", { context: null }), null);
    await assert.rejects(entry.onRendererCall("other.method", {}), { code: "METHOD_NOT_FOUND" });
    await entry.onUnload(); await assert.rejects(entry.onSessionSubmit({}), { code: "UNAVAILABLE" });
  } finally { await entry.onUnload(); delete globalThis.pi; }
});

test("configure persists a choice for an offline approved member and never arms a send", async t => {
  const f = fixture(), roomId = randomUUID(), sessionId = randomUUID(), memberId = randomUUID();
  const current = { id: roomId, sessionId, selfMemberId: memberId, members: [{ id: memberId, label: "Offline", online: false, agentStatus: "approved", models: [model] }] };
  const backend = createBackend(f.api, { createNetwork: () => ({ status: async () => ({ rooms: [current] }), start: async () => ({ port: 47018 }), stop: async () => {}, shareRoom: async () => ({ invitation: "fixture" }) }) });
  await backend.load(); t.after(() => backend.stop());
  // Creating a room constructs and arms the core; there is no start method.
  await backend.call("group-rooms.create", { name: "Fixture", projectPath: "/fixture", label: "Alice", address: "127.0.0.1" });
  const config = { targetMemberId: memberId, modelKey: model.key, thinkingLevel: "high" };
  const saved = await backend.call("group-rooms.configure", { roomId, memberId, modelKey: model.key, thinkingLevel: "high" });
  // A saved choice is a preference, never a recipient: `targets` stays empty
  // because only an @mention decides who runs.
  assert.deepEqual(saved.targets, []); assert.deepEqual(saved.memberConfigs, [config]);
  const view = await backend.call("group-rooms.snapshot", { roomId });
  assert.deepEqual(view.preferences.configurations, [config]); assert.deepEqual(view.preferences.memberConfigs, [config]);
  assert.deepEqual(view.preferences.targets, []);
  // The choice outlives the member going offline, and the retired bridge method
  // is gone rather than silently accepted.
  await assert.rejects(backend.call("group-rooms.selectTargets", { roomId, targets: [{ targetMemberId: memberId, modelKey: model.key }] }), { code: "METHOD_NOT_FOUND" });
  current.members[0].agentStatus = "pending";
  await assert.rejects(backend.call("group-rooms.configure", { roomId, memberId, modelKey: model.key }), /unavailable/);
  assert.equal(f.calls.some(call => call.operation === "agent/prompt"), false);
});

test("mentions revalidate approval, online state and explicit configs without paid defaults", async t => {
  const f = fixture(), roomId = randomUUID(), sessionId = randomUUID(), sent = [];
  const member = (label, agentStatus = "approved", online = true, models = [model]) => ({ id: randomUUID(), label, agentStatus, online, models });
  const local = member("Local"), offline = member("Offline", "approved", false), missing = member("Missing"), stale = member("Stale"), unavailable = member("Unavailable", "approved", true, []);
  const humans = [member("Human", "none"), member("Pending", "pending"), member("Rejected", "rejected")];
  const current = { id: roomId, sessionId, selfMemberId: local.id, members: [local, offline, missing, stale, unavailable, ...humans] };
  const backend = createBackend(f.api, { createNetwork: () => ({ status: async () => ({ rooms: [current] }), start: async () => ({ port: 47018 }), stop: async () => {}, shareRoom: async () => ({ invitation: "fixture" }), sendMessage: async args => { sent.push(args); return {}; } }) });
  await backend.load(); t.after(() => backend.stop());
  await backend.call("group-rooms.create", { name: "Fixture", projectPath: "/fixture", label: "Alice", address: "127.0.0.1" });
  const configure = value => backend.call("group-rooms.configure", { roomId, memberId: value.id, modelKey: model.key });
  for (const value of [local, offline, stale]) await configure(value);
  stale.models = [];
  const send = content => backend.submit({ sessionId, messageId: randomUUID(), content });
  // `missing` has no saved choice anywhere, so @all runs it on its own machine
  // default instead of refusing the send. Members that genuinely cannot run stay
  // out: `offline` is offline, and `stale`/`unavailable` have no catalog left.
  for (const mention of ["@all", "@所有人"]) {
    await send(`${mention} fixture`);
    assert.deepEqual(sent.at(-1).targets.map(target => target.targetMemberId), [local.id, missing.id]);
    assert.equal(sent.at(-1).targets[0].modelKey, model.key);
    assert.equal(sent.at(-1).targets[1].modelKey, model.key, "@all falls back to the member's default model");
  }
  // The same fallback applies to one mentioned member, so @member also just works.
  await send(`@${missing.id} fixture`);
  assert.deepEqual(sent.at(-1).targets, [{ targetMemberId: missing.id, modelKey: model.key }]);
  // An explicitly saved configuration is never silently replaced by the fallback.
  await configure(missing);
  const catalog = missing.models;
  // A catalog that no longer holds the saved key. The fallback must not quietly
  // stand in for a choice the user already made and saved.
  missing.models = [{ ...model, key: "fixture/other", modelId: "other", label: "Other" }];
  await assert.rejects(send(`@${missing.id} fixture`), /unavailable/);
  missing.models = catalog;
  await assert.rejects(send(`@${stale.id} fixture`), /unavailable/);
  await assert.rejects(send(`@${offline.id} fixture`), /offline/);
  for (const value of humans) { await send(`@${value.id} fixture`); assert.equal(sent.at(-1).targets, undefined); }
  // An email address is not a mention, so nobody is named and the message is
  // this machine's own — the same as any message with no @ at all.
  await send("mail human@example.com and @someone@example.com");
  assert.deepEqual(sent.at(-1).targets, [{ targetMemberId: local.id, modelKey: model.key }], "an email is not a mention");
  // 「需要谁自己会@他」 decides who *else* runs. With no mention the sender is
  // talking to their own computer, so it runs here on its own machine default.
  await send("default fixture");
  assert.deepEqual(sent.at(-1).targets, [{ targetMemberId: local.id, modelKey: model.key }], "a message with no mention runs on this machine");
  // Naming somebody else runs only them: this machine is never added as well.
  await send(`@${missing.id} fixture`);
  assert.deepEqual(sent.at(-1).targets.map(target => target.targetMemberId), [missing.id]);
  // A machine that cannot run does not run its own messages either; those stay
  // the plain broadcast they always were.
  local.agentStatus = "none";
  await send("default fixture");
  assert.equal(sent.at(-1).targets, undefined, "a chat-only machine broadcasts its own message");
  local.agentStatus = "approved"; local.online = false;
  // An approved-but-offline machine is reported, exactly as @mentioning it is:
  // silently broadcasting would hide a real misconfiguration.
  await assert.rejects(send("default fixture"), /offline/);
  local.online = true;
  // Back to a runnable machine: an explicit @ of itself resolves like any other
  // member, and nothing on this path has ever prompted an agent.
  await send(`@${local.id} fixture`);
  assert.deepEqual(sent.at(-1).targets, [{ targetMemberId: local.id, modelKey: model.key }]);
  assert.equal(f.calls.some(call => call.operation === "agent/prompt"), false);
});

test("an explicit unknown model or thinking level is still refused", async t => {
  const f = fixture(), roomId = randomUUID(), sessionId = randomUUID(), sent = [];
  const self = { id: randomUUID(), label: "Self", agentStatus: "approved", online: true, models: [model] };
  const current = { id: roomId, sessionId, selfMemberId: self.id, members: [self] };
  const backend = createBackend(f.api, { createNetwork: () => ({ status: async () => ({ rooms: [current] }), start: async () => ({ port: 47018 }), stop: async () => {}, shareRoom: async () => ({ invitation: "fixture" }), sendMessage: async args => { sent.push(args); return {}; } }) });
  await backend.load(); t.after(() => backend.stop());
  await backend.call("group-rooms.create", { name: "Fixture", projectPath: "/fixture", label: "Alice", address: "127.0.0.1" });
  await assert.rejects(backend.call("group-rooms.configure", { roomId, memberId: self.id, modelKey: "unknown/model" }), /unavailable/);
  await assert.rejects(backend.call("group-rooms.configure", { roomId, memberId: self.id, modelKey: model.key, thinkingLevel: "max" }), /Thinking level/);
  assert.equal((await backend.call("group-rooms.snapshot", { roomId })).preferences.memberConfigs.length, 0);
  // The refusals above left no saved configuration behind, so a plain message
  // resolves through the member's own machine default rather than the choice
  // that was refused — never a target built from a rejected configuration.
  await backend.submit({ sessionId, messageId: randomUUID(), content: "no mention" });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].targets, [{ targetMemberId: self.id, modelKey: model.key }], "a refused configuration never arms a target");
});

test("configure records the choice in the synced room state as well as local preferences", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const before = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  const self = before.members.find(value => value.id === before.selfMemberId);
  assert.equal(self.selection, null, "a fresh member has no synced selection");
  await backend.call("group-rooms.configure", { roomId: created.roomId, memberId: before.selfMemberId, modelKey: model.key, thinkingLevel: "high" });
  const after = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  assert.deepEqual(after.members.find(value => value.id === before.selfMemberId).selection, { modelKey: model.key, thinkingLevel: "high" });
  // The local preference is unchanged: it is still what this machine sends with.
  assert.deepEqual(after.preferences.memberConfigs, [{ targetMemberId: before.selfMemberId, modelKey: model.key, thinkingLevel: "high" }]);
  // The choice is in the persisted core state, so a restart and every peer see it.
  assert.deepEqual(f.doc().state.rooms[0].members.find(value => value.id === before.selfMemberId).selection, { modelKey: model.key, thinkingLevel: "high" });
  await assert.rejects(backend.call("group-rooms.configure", { roomId: created.roomId, memberId: before.selfMemberId, modelKey: "unknown/model" }), /unavailable/);
  assert.deepEqual((await backend.call("group-rooms.snapshot", { roomId: created.roomId })).members.find(value => value.id === before.selfMemberId).selection, { modelKey: model.key, thinkingLevel: "high" });
});

test("a guest publishes its own choice to the host and every machine sees it", async t => {
  const host = fixture(), guest = fixture(), a = createBackend(host.api), b = createBackend(guest.api);
  await a.load(); await b.load(); t.after(async () => { await b.stop(); await a.stop(); });
  const created = await sharedRoom(a);
  const joined = await b.call("group-rooms.join", { invitation: created.invitation, label: "Bob", projectPath: "/guest-local" });
  await b.call("group-rooms.requestAgent", { roomId: joined.roomId });
  const guestState = await b.call("group-rooms.snapshot", { roomId: joined.roomId });
  await a.call("group-rooms.approve", { roomId: joined.roomId, memberId: guestState.selfMemberId, approved: true });
  // The guest may only record its own selection, so it forwards to the host.
  await b.call("group-rooms.configure", { roomId: joined.roomId, memberId: guestState.selfMemberId, modelKey: model.key });
  await until(() => host.doc().state.rooms[0].members[1]?.selection?.modelKey === model.key);
  assert.deepEqual(host.doc().state.rooms[0].members[1].selection, { modelKey: model.key });
  assert.deepEqual((await a.call("group-rooms.snapshot", { roomId: joined.roomId })).members.find(value => value.id === guestState.selfMemberId).selection, { modelKey: model.key });
  await until(() => (guest.doc().state.rooms[0].members.find(value => value.id === guestState.selfMemberId) ?? {}).selection?.modelKey === model.key);
});

test("hosting is receiving: leaving the last room retires the listener and a guest never binds", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const current = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  const listening = (await backend.call("group-rooms.list")).listener;
  assert.ok(listening, "creating a room starts receiving with no switch");
  await backend.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: model.key });
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@all fixture" });
  await until(() => f.calls.some(call => call.operation === "agent/prompt"));
  f.api.onAbort = async session => { if (session) f.terminal(session, "aborted"); };
  // Leaving the only room ends receiving, and the core stops gracefully, so the
  // in-flight run is settled as aborted rather than silently dropped.
  await backend.call("group-rooms.leave", { roomId: current.id });
  assert.equal((await backend.call("group-rooms.list")).listener, undefined, "leaving the last room retires the listener");
  // The room is gone, but its in-flight run was settled, not dropped: the
  // worker journal keeps the terminal receipt the graceful stop persisted.
  assert.equal(Object.values(f.doc().workers)[0].status, "aborted");
  assert.equal(f.released(), true); assert.equal(f.bus.listenerCount("desktop:turnEnded"), 1);
  // Leaving drops the room but keeps its saved model preferences on disk.
  assert.equal(Object.keys(f.doc().preferences).length, 1);
  await assert.rejects(backend.call("group-rooms.snapshot", { roomId: current.id }), { code: "NOT_FOUND" });
  const again = await sharedRoom(backend, "Second room");
  assert.ok((await backend.call("group-rooms.list")).listener, "a later room starts receiving again");
  f.api.onPrompt = async session => { f.terminal(session); };
  await approveSelf(backend, again.roomId);
  const next = await backend.call("group-rooms.snapshot", { roomId: again.roomId });
  await backend.call("group-rooms.configure", { roomId: again.roomId, memberId: next.selfMemberId, modelKey: model.key });
  await backend.submit({ sessionId: again.sessionId, messageId: randomUUID(), content: "@Alice restarted fixture" });
  await until(() => f.doc().state.rooms[0]?.runs[0]?.status === "completed");
  assert.equal(f.calls.filter(call => call.operation === "agent/prompt").length, 2);
});

test("explicit unknown or unpersisted host terminal resolves unknown and cleans known workers", async () => {
  for (const [reason, overrides] of [["unknown", {}], ["completed", { persisted: false }], ["completed", { persisted: undefined }]]) {
    const f = fixture(), workers = createWorkers(f.api, createStorage(f.api)), req = request(); await workers.load();
    f.api.onPrompt = async session => { f.terminal(session, reason, overrides); };
    assert.deepEqual(await workers.executeRun(req, async () => {}), { status: "unknown" });
    await until(() => f.released());
    assert.equal(f.doc().workers[req.runId].status, "unknown");
    assert.equal(f.calls.filter(call => call.operation === "unsubscribe").length, 1);
    await workers.close();
  }
});

test("managed streaming forwards ordered author envelopes, nested identity and final append", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const current = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: model.key });
  const id = randomUUID(), final = { id, role: "assistant", content: "streamed answer", createdAt: new Date().toISOString(), status: "complete" };
  f.api.onPrompt = async session => {
    f.event(session, { type: "message_start", message: { ...final, content: "" } });
    f.event(session, { type: "message_update", message: final, delta: "streamed answer" }, { nestedParentToolCallId: "nested" });
    f.event(session, { type: "message_end", message: final });
    f.terminal(session);
  };
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@all stream fixture" });
  await until(() => f.doc().state.rooms[0].runs[0]?.status === "completed");
  assert.deepEqual(f.streams.map(row => row.envelope.event.type), ["message_start", "message_update", "message_end"]);
  // The streamed byline carries the member name and the admitted model: the
  // reply states what it ran on, the name still says who it came from, and the
  // dot is derived from the name so it is the same on every machine.
  assert.ok(f.streams.every(row => row.sessionId === created.sessionId && row.author === "🔵 Alice · Fixture" && row.envelope.turnId === f.doc().state.rooms[0].runs[0].id));
  assert.match(f.streams[1].envelope.nestedParentToolCallId, /^[0-9a-f-]{36}$/);
  assert.notEqual(f.streams[1].envelope.nestedParentToolCallId, "nested");
  const answer = f.appends.filter(row => row.message.content === "streamed answer");
  assert.equal(answer.length, 1);
  assert.equal(answer[0].author, "🔵 Alice · Fixture");
  assert.ok(f.calls.filter(call => call.operation && call.operation.includes("/")).every(call => call.confirm === true));
});

test("explicit host uncertainty propagates to core live status before shutdown", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const current = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: model.key });
  f.api.onPrompt = async session => { f.terminal(session, "unknown", { persisted: false }); };
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@all unknown fixture" });
  await until(() => f.doc().state.rooms[0].runs[0]?.status === "unknown");
  assert.equal((await backend.call("group-rooms.snapshot", { roomId: current.id })).runs[0].status, "unknown");
  await until(() => f.released());
  assert.equal(Object.values(f.doc().workers)[0].status, "unknown");
  assert.ok((await backend.call("group-rooms.list")).listener);
});

test("unacknowledged managed stream reaches live unknown after explicit terminal", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const current = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: model.key });
  f.api.session.emitManagedEvent = async () => ({ delivered: false });
  f.api.onPrompt = async session => {
    f.event(session, { type: "message_start", message: { id: randomUUID(), role: "assistant", content: "", createdAt: new Date().toISOString() } });
    f.terminal(session);
  };
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@all stream failure fixture" });
  await until(() => f.doc().state.rooms[0].runs[0]?.status === "unknown");
  await until(() => f.released());
  assert.equal(Object.values(f.doc().workers)[0].status, "unknown");
});

// A turn that ends without a durable receipt leaves the room refusing every
// later message to that member ("Agent already has an active or uncertain run"),
// and nothing else can ever retire it: only this machine knows its own worker
// settled the turn, and the room would otherwise refuse forever.
test("an unsettled run of this machine is released so the room accepts the next message", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const current = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: model.key });
  // The host never persists the turn, so the worker's own verdict is `unknown`.
  f.api.onPrompt = async session => { f.terminal(session, "completed", { persisted: false }); };
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@Alice first fixture" });
  await until(() => f.doc().state.rooms[0].runs[0]?.status === "unknown"); await until(() => f.released());
  assert.equal(Object.values(f.doc().workers)[0].status, "unknown", "the worker settled the turn it owns");
  // The next send is accepted instead of refused by the turn that is over.
  f.api.onPrompt = async session => { f.event(session, { type: "agent_end" }); f.terminal(session); };
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@Alice second fixture" });
  await until(() => f.doc().state.rooms[0].runs.some(run => run.status === "completed"));
  assert.equal(f.calls.filter(call => call.operation === "agent/prompt").length, 2, "the second message really ran");
});

// The release is only for a run this machine's own worker has settled. A run the
// service is still tracking (pending or running) is left alone however the room
// happens to label it, because the guard exists so a possibly-live turn is never
// double-started.
test("only a settled run of this machine is released", async t => {
  const f = fixture(), roomId = randomUUID(), sessionId = randomUUID(), selfId = randomUUID();
  const forgotten = [];
  const current = {
    id: roomId, sessionId, selfMemberId: selfId, host: true, revoked: false,
    members: [{ id: selfId, label: "Alice", agentStatus: "approved", online: true, models: [model] }],
    runs: [{ id: "settled-run", targetMemberId: selfId, status: "unknown", modelKey: model.key }], messages: [],
  };
  const backend = createBackend(f.api, { createNetwork: () => ({
    status: async () => ({ rooms: [current] }),
    forgetRunStatus: async (room, memberId, statuses) => {
      forgotten.push([room, memberId, statuses]);
      current.runs = current.runs.filter(run => !(statuses.includes(run.status) && run.targetMemberId === memberId));
    },
    sendMessage: async () => ({ turnId: randomUUID() }),
    stop: async () => {},
  }) });
  const store = createStorage(f.api);
  await store.update(doc => { doc.workers["settled-run"] = { sessionId, roomId, status: "running" }; });
  await backend.load(); t.after(() => backend.stop());
  // The journal is the proof: while the service still tracks the run, nothing in
  // the room is released, however the room happens to label it.
  await store.update(doc => { doc.workers["settled-run"].status = "running"; });
  assert.deepEqual(forgotten, [], "activation leaves a run the worker still tracks");
  await backend.submit({ sessionId, messageId: randomUUID(), content: "hello" });
  assert.deepEqual(forgotten, [], "a send leaves it too");
  // Once the worker has settled it, the room is allowed to forget the record.
  await store.update(doc => { doc.workers["settled-run"].status = "unknown"; });
  await backend.submit({ sessionId, messageId: randomUUID(), content: "hello again" });
  assert.deepEqual(forgotten, [[roomId, selfId, ["unknown"]]], "a settled run is released, once");
});

test("activation releases this machine's settled run so the first message after a restart is accepted", async t => {
  const saved = fixture(), first = createBackend(saved.api); await first.load(); t.after(() => first.stop());
  const created = await first.call("group-rooms.create", { name: "Fixture room", projectPath: "/fixture", label: "Alice", address: "127.0.0.1", bindAddress: "127.0.0.1" });
  await approveSelf(first, created.roomId);
  const current = await first.call("group-rooms.snapshot", { roomId: created.roomId });
  await first.call("group-rooms.configure", { roomId: current.id, memberId: current.selfMemberId, modelKey: model.key });
  saved.api.onPrompt = async session => { saved.terminal(session, "completed", { persisted: false }); };
  await first.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@Alice before restart" });
  await until(() => saved.doc().state.rooms[0].runs[0]?.status === "unknown"); await until(() => saved.released());
  await first.stop();
  // Same settings document, a fresh activation: the room still carries the
  // unknown run from before the app closed, and nothing will ever settle it.
  const second = createBackend(saved.api); await second.load(); t.after(() => second.stop());
  await second.call("group-rooms.list");
  saved.api.onPrompt = async session => { saved.event(session, { type: "agent_end" }); saved.terminal(session); };
  await second.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "@Alice after restart" });
  await until(() => saved.doc().state.rooms[0].runs.some(run => run.status === "completed"));
  assert.equal(saved.calls.filter(call => call.operation === "agent/prompt").length, 2, "the first message after activation runs");
});

test("persisted list and snapshot stay read only and never initialize core or reconnect", async () => {
  const f = fixture(), store = createStorage(f.api), roomId = randomUUID(), sessionId = randomUUID(), selfId = randomUUID(), remoteId = randomUUID();
  await store.update(doc => {
    doc.state = { machineId: randomUUID(), rooms: [{ id: roomId, sessionId, selfId, host: false, name: "Saved", projectPath: "/saved", members: [
      { id: selfId, label: "Local", online: true, agentStatus: "approved", models: [model] },
      { id: remoteId, label: "Remote", online: true, agentStatus: "approved", models: [model] },
    ], runs: [{ id: randomUUID(), status: "running" }], messages: [] }] };
  });
  const backend = createBackend(f.api, { createNetwork() { throw new Error("Read initialized core"); } }); await backend.load();
  const before = structuredClone(f.shared.settings);
  const listed = await backend.call("group-rooms.list");
  assert.equal(listed.rooms[0].connected, false); assert.equal(listed.rooms[0].members[1].online, false);
  assert.equal(listed.rooms[0].runs[0].status, "unknown");
  const snapshot = await backend.call("group-rooms.snapshot", { roomId }); assert.deepEqual(snapshot.preferences.memberConfigs, []);
  assert.deepEqual(f.shared.settings, before); assert.equal(f.shared.secrets.size, 0); assert.equal(f.calls.length, 0);
  await backend.call("group-rooms.configure", { roomId, memberId: remoteId, modelKey: model.key });
  assert.equal((await backend.call("group-rooms.snapshot", { roomId })).preferences.memberConfigs[0].targetMemberId, remoteId);
  await backend.stop();
});

test("host-only invitation addresses use the active listener port and preserve explicit ports", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await backend.call("group-rooms.create", { name: "Address room", projectPath: "/fixture", label: "Alice", address: "127.0.0.1", bindAddress: "127.0.0.1" });
  const listener = (await backend.call("group-rooms.list")).listener;
  const decode = value => JSON.parse(Buffer.from(decodeURIComponent(value.slice(8)), "base64url").toString()).address;
  assert.equal(decode(created.invitation), `wss://127.0.0.1:${listener.port}`);
  for (const [address, expected] of [["127.0.0.1:443", "wss://127.0.0.1"], ["[::1]", `wss://[::1]:${listener.port}`], ["wss://localhost:8443", "wss://localhost:8443"]]) {
    const invite = await backend.call("group-rooms.invite", { roomId: created.roomId, address });
    assert.equal(decode(invite.invitation), expected);
  }
  await assert.rejects(backend.call("group-rooms.create", { name: "Invalid", projectPath: "/fixture", label: "Alice", address: "ws://localhost" }), /Invalid room address/);
});

test("the directory picker answers through `list` instead of its own call", async t => {
  // The native picker stays open until the user answers, and the host times a
  // plugin.call out after 2s, so the call that starts a pick can never carry
  // its result: it must return at once and `list` must deliver the answer.
  // A picker inside the serial lock would also blank the page, because the
  // page polls `list` every 1.2s.
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  let release;
  f.api.fs.requestDirectory = () => new Promise(resolve => { release = () => resolve({ path: "/picked", name: "picked" }); });
  const started = await backend.call("group-rooms.selectDirectory", {});
  assert.equal(started.pending, true);
  assert.ok(started.requestId);
  // The page keeps polling while the dialog is open.
  const answered = await Promise.race([
    backend.call("group-rooms.list").then(() => "answered"),
    new Promise(resolve => setTimeout(() => resolve("blocked"), 500)),
  ]);
  assert.equal(answered, "answered");
  assert.deepEqual((await backend.call("group-rooms.list")).picker, { requestId: started.requestId, pending: true, done: false, path: null, name: "", error: "" });
  // A second pick while one is open reuses it instead of opening another dialog.
  assert.deepEqual(await backend.call("group-rooms.selectDirectory", {}), { requestId: started.requestId, pending: true });
  release();
  await tick();
  const settled = (await backend.call("group-rooms.list")).picker;
  assert.deepEqual(settled, { requestId: started.requestId, pending: false, done: true, path: "/picked", name: "picked", error: "" });
  // A cancelled pick keeps the previous folder and reports no path.
  f.api.fs.requestDirectory = () => Promise.resolve(null);
  const cancelled = await backend.call("group-rooms.selectDirectory", {});
  await tick();
  const cancelView = (await backend.call("group-rooms.list")).picker;
  assert.equal(cancelView.requestId, cancelled.requestId);
  assert.equal(cancelView.pending, false);
  assert.equal(cancelView.path, null);
  assert.equal(cancelView.error, "");
});

test("the directory picker still refuses to change a joined room directory", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await assert.rejects(backend.call("group-rooms.selectDirectory", { roomId: created.roomId }), { code: "UNSUPPORTED" });
});

test("a pick left open by a stop does not survive it", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load();
  f.api.fs.requestDirectory = () => new Promise(() => {});
  const started = await backend.call("group-rooms.selectDirectory", {});
  assert.equal(started.pending, true);
  await backend.stop();
  await backend.load();
  assert.equal((await backend.call("group-rooms.list")).picker.pending, false);
});

test("a remembered port that cannot be rebound reports the change instead of hiding it", async t => {
  // A restart normally rebinds the remembered port. When something else has
  // taken it the action still succeeds on an automatic port, but every
  // invitation already shared points at the old port, so the page must be told
  // rather than left believing the old invitation still works.
  const f = fixture(), attempted = [], rooms = []; let started;
  const backend = createBackend(f.api, {
    createNetwork: () => ({
      status: async () => ({ rooms, ...(started ? { listener: started } : {}) }),
      start: async ({ port }) => {
        attempted.push(port);
        if (port !== 0) throw new Error("EADDRINUSE");
        started = { port: 51234, fingerprint: "a".repeat(64) };
        return started;
      },
      stop: async () => {},
      shareRoom: async input => { rooms.push({ id: input.roomId, sessionId: input.sessionId, selfMemberId: "self", members: [{ id: "self", label: "Alice", online: true }] }); return { invitation: "fixture" }; },
    }),
  });
  await backend.load(); t.after(() => backend.stop());
  f.doc().listenerPort = 51233;
  const created = await backend.call("group-rooms.create", { name: "Taken port", projectPath: "/fixture", label: "Alice", address: "127.0.0.1" });
  assert.deepEqual(attempted, [51233, 0], "the remembered port is tried first, then an automatic one");
  const listed = await backend.call("group-rooms.list");
  assert.equal(listed.listener.port, 51234);
  assert.deepEqual(listed.listenerNotice, { from: 51233, to: 51234 });
  assert.equal(f.doc().listenerPort, 51234, "the new port is remembered for the next restart");
  // A fresh invitation carries the new port, so it clears the warning.
  const invite = await backend.call("group-rooms.invite", { roomId: created.roomId, address: "127.0.0.1" });
  assert.equal(invite.invitation, "fixture");
  assert.equal((await backend.call("group-rooms.list")).listenerNotice, undefined, "a new invitation clears the stale-port warning");
});

// The composer chip reads the managed session's own model columns. A managed
// session is created with them NULL, so the plugin writes this machine's own
// member choice onto the session and the chip follows the member instead of the
// app default. Only an explicit saved choice is written; a member with none
// already shows the app default, so writing it would be a call that changes
// nothing (and a read-only page must stay read only).
test("an explicit member choice is written onto the managed session; a default is not", async t => {
  const f = fixture(), roomId = randomUUID(), sessionId = randomUUID(), selfId = randomUUID();
  const self = { id: selfId, label: "Self", agentStatus: "approved", online: true, models: [model] };
  const current = { id: roomId, sessionId, selfMemberId: selfId, members: [self] };
  const backend = createBackend(f.api, { createNetwork: () => ({ status: async () => ({ rooms: [current] }), start: async () => ({ port: 47018 }), stop: async () => {}, shareRoom: async () => ({ invitation: "fixture" }), sendMessage: async () => ({}) }) });
  await backend.load(); t.after(() => backend.stop());
  await backend.call("group-rooms.create", { name: "Fixture", projectPath: "/fixture", label: "Alice", address: "127.0.0.1" });
  assert.equal(f.modelBindings.size, 0, "creating a room writes no binding before a choice exists");
  await backend.call("group-rooms.configure", { roomId, memberId: selfId, modelKey: model.key, thinkingLevel: "high" });
  assert.deepEqual(f.modelBindings.get(sessionId), { sessionId, providerId: model.providerId, modelId: model.modelId, thinkingLevel: "high" });
  // A restart re-writes the saved choice for every persisted room, so the chip
  // is right again before the page is even opened.
  f.modelBindings.clear();
  await backend.stop();
  f.doc().state = { version: 1, machineId: "", rooms: [{ id: roomId, sessionId, name: "Fixture", projectPath: "/fixture", selfId, host: true, members: [self], runs: [], messages: [] }] };
  await backend.load();
  assert.deepEqual(f.modelBindings.get(sessionId), { sessionId, providerId: model.providerId, modelId: model.modelId, thinkingLevel: "high" }, "a reload restores the binding");
});

// The choice may have been made on another computer. That machine holds no
// local configuration for this member, so the only record of the choice is the
// `selection` the room published — and unless the chip follows *that*, the
// machine whose member was configured keeps showing the app default.
test("a choice synced from another machine also moves this machine's composer chip", async t => {
  const f = fixture(), roomId = randomUUID(), sessionId = randomUUID(), selfId = randomUUID();
  const selection = { modelKey: model.key, thinkingLevel: "high" };
  const member = { id: selfId, label: "Self", agentStatus: "approved", online: true, models: [model], selection };
  const current = { id: roomId, sessionId, selfMemberId: selfId, host: false, members: [member] };
  let changed = () => {};
  const backend = createBackend(f.api, { createNetwork: options => { changed = options.changed; return { status: async () => ({ rooms: [current] }), start: async () => ({ port: 47018 }), stop: async () => {}, shareRoom: async () => ({ invitation: "fixture" }), joinRoom: async () => ({ roomId, sessionId, name: "Fixture" }), requestAgent: async () => ({}) }; } });
  await backend.load(); t.after(() => backend.stop());
  await backend.call("group-rooms.join", { invitation: "fixture", label: "Self", projectPath: "/fixture" });
  assert.deepEqual(f.modelBindings.get(sessionId), { sessionId, providerId: model.providerId, modelId: model.modelId, thinkingLevel: "high" }, "a synced selection is written like a local one");
  // Once the room reports the choice, the deferred refresh must skip an
  // identical write: a room persists on every message, so re-stating it would
  // be a host call per message.
  const writes = f.calls.filter(c => c.operation === "session.setManagedModel").length;
  changed();
  await tick();
  assert.equal(f.calls.filter(c => c.operation === "session.setManagedModel").length, writes, "an unchanged binding is not written twice");
  // A later change made on this machine still lands.
  await backend.call("group-rooms.configure", { roomId, memberId: selfId, modelKey: model.key, thinkingLevel: "off" });
  assert.equal(f.modelBindings.get(sessionId).thinkingLevel, "off", "the newest choice wins");
});

// A room message's attachments ride as content-addressed descriptors. The bytes
// already sit in this machine's store (the host content-addressed them before
// submit), so only the tiny descriptor travels on the room wire, and the durable
// transcript renders the same picture on reload.
test("a submission carries attachment descriptors into the room and the transcript", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  // A message with no mention runs on this machine, so the fixture answers the
  // turn it starts; this test is about the descriptor on the wire, not the run.
  f.api.onPrompt = async session => { f.terminal(session); };
  const ref = f.seedBlob(Buffer.from("fixture image bytes"));
  const attachment = { ref, name: "shot.png", kind: "image", mimeType: "image/png", size: 19 };
  const messageId = randomUUID();
  await backend.submit({ sessionId: created.sessionId, messageId, content: "look at this", attachments: [attachment] });
  await until(() => f.doc().state.rooms[0].runs.at(-1)?.status === "completed");
  const room = f.doc().state.rooms[0];
  assert.deepEqual(room.messages.at(-1).attachments, [attachment], "the descriptor, never bytes, rides the room wire");
  const appended = f.appends.find(row => row.externalId === messageId);
  assert.deepEqual(appended.message.attachments, [attachment], "the durable transcript keeps the descriptor for reload");
  // An attachment alone is a valid message; text alone still works; neither is not.
  await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "", attachments: [attachment] });
  await until(() => f.doc().state.rooms[0].runs.at(-1)?.status === "completed");
  await assert.rejects(backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "   " }), /Invalid message content/);
  await assert.rejects(backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "x", attachments: [{ ...attachment, ref: "attachments/nope" }] }), /Invalid attachment ref/);
  await assert.rejects(backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: "x", attachments: [{ ...attachment, kind: "video" }] }), /Invalid attachment kind/);
});

// The composer names an attachment with the same `@"<path>"` text an ordinary
// session uses, so the host hands that text over as the attachment's
// `inlinePath`. Reading it as a mention made `@all` plus a picture unsendable:
// the path matched no member, and the send died with "Mention must identify
// exactly one room member". The marker still travels, because it is what places
// the picture in the transcript.
test("an attachment's own marker text is never read as a mention", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  f.api.onPrompt = async session => { f.terminal(session); };
  const ref = f.seedBlob(Buffer.from("fixture image bytes"));
  const inlinePath = '@/scratch/session/pasted/shot.png';
  const attachment = { ref, name: "shot.png", kind: "image", mimeType: "image/png", size: 19, inlinePath };
  const runs = () => f.doc().state.rooms[0].runs.length;
  const submit = async (content, messageId = randomUUID()) => {
    const before = runs();
    await backend.submit({ sessionId: created.sessionId, messageId, content, attachments: [attachment] });
    await until(() => f.doc().state.rooms[0].runs.length > before && f.doc().state.rooms[0].runs.at(-1).status === "completed");
  };
  // Exactly what the composer serializes for `@all 这是什么游戏` with a picture.
  await submit(`@all 这是什么游戏 ${inlinePath}`);
  const room = f.doc().state.rooms[0];
  assert.equal(room.runs.at(-1).targetMemberId, room.members.find(member => member.id === room.selfId).id, "@all still runs the members it names");
  assert.equal(room.messages.at(-1).content, `@all 这是什么游戏 ${inlinePath}`, "the marker stays in the content that places the picture");
  assert.deepEqual(room.messages.at(-1).attachments, [attachment], "the inline placement travels with the descriptor");
  // A picture with no mention is this machine's own message, not a bad mention.
  await submit(`这是截图 ${inlinePath}`);
  assert.equal(f.doc().state.rooms[0].messages.at(-1).content, `这是截图 ${inlinePath}`);
  // Only a marker the host attributed to an attachment is stripped: a path the
  // user typed by hand still reads as a mention and is still refused.
  await assert.rejects(backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: `@"/someone/elses/shot.png" hi` }), /Mention must identify exactly one room member/);
});

// The host hands a managed session's attachments to the plugin as descriptors,
// and the plugin turns them back into the prompt paths the worker's model reads.
// `path` is the bare ref the host's own resolver already understands.
test("worker prompts carry attachments as content-addressed paths", async t => {
  const f = fixture(), workers = createWorkers(f.api, createStorage(f.api)), req = request();
  await workers.load(); t.after(() => workers.close());
  const ref = f.seedBlob(Buffer.from("fixture image bytes"));
  const seen = [];
  f.api.onPrompt = async (session, arg) => { seen.push(arg); f.terminal(session); };
  const done = workers.executeRun({ ...req, attachments: [{ ref, name: "shot.png", kind: "image", mimeType: "image/png", size: 19 }] }, async () => {});
  assert.deepEqual(await done, { status: "completed" });
  assert.deepEqual(seen[0].attachments, [{ path: ref, name: "shot.png", kind: "image", mimeType: "image/png", size: 19 }]);
});

// The host refuses a plugin.call whose answer passes 64 KB. A room that has
// chatted for a while used to answer `snapshot` with its whole history, so the
// call started failing on every 1.2s poll; the extension then read no room and
// the @ list came back empty. The page draws none of that history, so it must
// not travel, and the run journal has to be bounded even though rooms are not.
test("snapshot and list stay inside the host's answer limit however long a room talks", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend);
  await approveSelf(backend, created.roomId);
  const state = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  await backend.call("group-rooms.configure", { roomId: state.id, memberId: state.selfMemberId, modelKey: model.key });
  f.api.onPrompt = async session => { f.terminal(session); };
  // A long conversation: each message carries a body far larger than the room a
  // real one does, and there are enough of them that the history alone is well
  // past the host's 64 KB relay limit.
  const body = "这是一条很长很长的房间消息。".repeat(400);
  for (let index = 0; index < 40; index += 1) {
    await backend.submit({ sessionId: created.sessionId, messageId: randomUUID(), content: `@all ${body} #${index}` });
    await until(() => f.doc().state.rooms[0].runs.at(-1)?.status === "completed");
  }
  const saved = f.doc().state.rooms[0];
  assert.equal(saved.runs.length, 40, "every message admitted a run");
  // The portable core trims the transcript to its own byte window, so the count
  // stops short of 40 — but what it keeps is already well past the relay limit.
  assert.ok(Buffer.byteLength(JSON.stringify(saved.messages)) > 65536, "the history on its own is past the relay limit");
  const snapshot = await backend.call("group-rooms.snapshot", { roomId: created.roomId });
  assert.equal("messages" in snapshot, false, "history is not part of a poll answer");
  assert.equal("workers" in snapshot, false);
  assert.ok(snapshot.members.length > 0 && snapshot.preferences.memberConfigs.length === 1, "the live fields still answer");
  for (const answer of [snapshot, await backend.call("group-rooms.list")]) {
    assert.ok(Buffer.byteLength(JSON.stringify(answer)) < 65536, "every poll answer fits the host relay");
  }
  assert.ok(snapshot.runs.length <= 20, "the run journal is trimmed to the newest runs");
});

// A byline is the only place a reader can tell two speakers apart, and the
// same member appears on every machine, so the dot has to be a function of the
// name alone. Anything that read local roster order or a room-local index would
// paint "mac" blue on one computer and red on the other.
test("a member's dot follows the name, and only the seven colors are ever used", async () => {
  const { byline, bylineDot } = require("../lib/backend.cjs");
  const palette = ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤"];
  const names = ["mac", "w", "Alice", "Bob", "Windows", "macbook", "张三", "李四", "node-1", "PC"];
  const seen = new Set();
  for (const name of names) {
    const dot = bylineDot(name);
    // Deterministic: recomputing from the same name can never pick a new color.
    assert.equal(bylineDot(name), dot, `${name} keeps its dot`);
    // The palette is the seven chromatic circles. Black and white are out: on a
    // dark transcript a black disc reads as an uncolored byline, and white is
    // not a color a reader would name.
    assert.ok(palette.includes(dot), `${name} wears a colored circle, not ${JSON.stringify(dot)}`);
    assert.equal(byline(name, "Fixture · high"), `${dot} ${name} · Fixture · high`);
    assert.equal(byline(name), `${dot} ${name}`, "a member with no admitted model keeps just the name");
    seen.add(dot);
  }
  // The palette is not degenerate: a realistic roster uses more than one color.
  assert.ok(seen.size >= 4, `the roster spread across ${seen.size} colors`);
  assert.equal(byline("", "Fixture"), "Fixture");
  assert.equal(byline("  ", ""), "");
});

// Create and Join used to ask this machine's name and reachable address every
// time. Both are remembered, so the form never asks twice; a failed action must
// not remember a mistyped address.
test("create and join remember this machine's name and address", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  assert.deepEqual((await backend.call("group-rooms.list")).local, { label: "", address: "" });
  const created = await sharedRoom(backend, "Remembered room");
  const afterCreate = await backend.call("group-rooms.list");
  assert.deepEqual(afterCreate.local, { label: "Alice", address: "127.0.0.1" });
  // The probe and the remembered value are separate answers: the page prefers
  // what it remembers and falls back to the probe only when it has nothing.
  assert.equal(typeof afterCreate.suggestAddress, "string");
  await backend.call("group-rooms.leave", { roomId: created.roomId });
  assert.deepEqual((await backend.call("group-rooms.list")).local, { label: "Alice", address: "127.0.0.1" }, "leaving keeps what this machine calls itself");

  // A guest remembers the address it dialled and the name it joined under.
  const host = fixture(), a = createBackend(host.api), b = createBackend(f.api);
  await a.load(); await b.load(); t.after(() => a.stop());
  const hosted = await sharedRoom(a, "Hosted room");
  const joined = await b.call("group-rooms.join", { invitation: hosted.invitation, label: "Bob", projectPath: "/guest-local" });
  const afterJoin = await b.call("group-rooms.list");
  assert.equal(afterJoin.local.label, "Bob");
  // A guest remembers the host its invitation named, as the bare host a user
  // would have typed: the backend re-derives the port from the live listener.
  assert.equal(afterJoin.local.address, "127.0.0.1", "a guest remembers the host its invitation named");
  // A join that never happens leaves the previous memory alone.
  await assert.rejects(b.call("group-rooms.join", { invitation: "nonsense", label: "Bob", projectPath: "/guest-local" }));
  assert.deepEqual((await b.call("group-rooms.list")).local, afterJoin.local);
  // Stepping back out of the room does not erase it either.
  await b.call("group-rooms.leave", { roomId: joined.roomId });
  assert.deepEqual((await b.call("group-rooms.list")).local, afterJoin.local);
});

// Deleting a room is leaving it and erasing this machine's own copy of its chat.
test("remove leaves the room and deletes the local session, tolerating a refused delete", async t => {
  const f = fixture(), backend = createBackend(f.api); await backend.load(); t.after(() => backend.stop());
  const created = await sharedRoom(backend, "Doomed room");
  assert.ok((await backend.call("group-rooms.list")).listener, "creating the only room starts receiving");
  assert.deepEqual(await backend.call("group-rooms.remove", { roomId: created.roomId }), { removed: true });
  // The answer lands before the host's own delete confirmation does: the delete
  // is a dangerous operation whose dialog the user may keep open for a while,
  // and a `plugin.call` is cut off after 2s, so awaiting it here would answer
  // this call with a timeout and then trip the relay breaker on the page's polls.
  assert.equal((await backend.call("group-rooms.list")).rooms.length, 0, "the room is gone before the host answers its dialog");
  assert.equal((await backend.call("group-rooms.list")).listener, undefined, "leaving the last hosted room retires the listener");
  await until(() => f.calls.some(call => call.operation === "session/delete"));
  const deleted = f.calls.filter(call => call.operation === "session/delete");
  assert.deepEqual(deleted, [{ operation: "session/delete", args: [created.sessionId], confirm: true }], "the local session is deleted with native consent");
  assert.equal(f.sessions.has(created.sessionId), false);
  await assert.rejects(backend.call("group-rooms.snapshot", { roomId: created.roomId }), { code: "NOT_FOUND" });

  // The user may cancel the host's native confirmation. The room is already
  // left, so the delete failing must not fail the action or resurrect the room.
  const other = await sharedRoom(backend, "Survivor room");
  let refused = false;
  f.api.desktop.invoke = async input => { if (input.operation === "session/delete") { refused = true; throw Object.assign(new Error("cancelled"), { code: "DENIED" }); } return { deleted: true }; };
  assert.deepEqual(await backend.call("group-rooms.remove", { roomId: other.roomId }), { removed: true });
  await until(() => refused);
  assert.equal((await backend.call("group-rooms.list")).rooms.length, 0);
});

// A guest's `leave` records the room so a rejoin can keep this machine's old
// session and history. Delete erases that session, so the record must be
// dropped too or the next join would hand back a session that no longer exists.
test("a deleted room is not rejoined with the erased session", async t => {
  const host = fixture(), guest = fixture(), a = createBackend(host.api), b = createBackend(guest.api);
  await a.load(); await b.load(); t.after(async () => { await b.stop(); await a.stop(); });
  const created = await sharedRoom(a, "Shared room");
  const first = await b.call("group-rooms.join", { invitation: created.invitation, label: "Bob", projectPath: "/guest-local" });
  await until(() => guest.doc().state.rooms.length === 1);
  await b.call("group-rooms.remove", { roomId: first.roomId });
  assert.equal(guest.doc().state.rooms.length, 0, "the guest left");
  assert.deepEqual(guest.doc().state.departed ?? [], [], "the erased session is not kept for a rejoin");
  await until(() => guest.calls.some(call => call.operation === "session/delete" && call.args[0] === first.sessionId));
  assert.equal(guest.sessions.has(first.sessionId), false, "the guest's own session is deleted");
  // An invitation ticket is single use, so rejoining takes a fresh one. The
  // membership is new and the deleted session is not handed back.
  const fresh = await a.call("group-rooms.invite", { roomId: created.roomId, address: "127.0.0.1" });
  const again = await b.call("group-rooms.join", { invitation: fresh.invitation, label: "Bob", projectPath: "/guest-local" });
  assert.notEqual(again.sessionId, first.sessionId, "a rejoin creates a new local session, not the deleted one");
  assert.equal(guest.doc().state.rooms.length, 1);
});
