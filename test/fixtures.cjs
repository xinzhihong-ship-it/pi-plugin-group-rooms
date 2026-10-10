"use strict";
const { EventEmitter } = require("node:events");
const { createHash, randomUUID } = require("node:crypto");
const { KEY } = require("../lib/storage.cjs");
const attachmentRef = bytes => `attachments/${createHash("sha256").update(bytes).digest("hex")}`;
const operationIds = ["session/create", "session/configure", "session/get", "session/delete", "session/open", "settings/get", "agent/prompt", "agent/abort"];
const dangerous = new Set(["session/configure", "session/delete"]);
const model = { key: "fixture/model", providerId: "fixture", providerName: "Fixture", modelId: "model", label: "Fixture", thinkingLevels: ["off", "high"], supportsReasoning: true };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 500; i++) { if (await predicate()) return; await tick(); }
  throw new Error("Fixture condition did not arrive");
}
function fixture(shared = {}) {
  const bus = new EventEmitter(), calls = [], sessions = new Map(), appends = [], streams = [], managed = shared.managed ??= new Map();
  // A content-addressed blob store mirroring the host's owner-checked one, so a
  // test can watch bytes move between machines and land on disk.
  const blobs = new Map(), uploads = new Map(), modelBindings = new Map(), refreshed = [];
  shared.settings ??= {}; shared.secrets ??= new Map(); shared.appSettings ??= { defaultPermissionMode: "ask" };
  const api = {
    plugin: { getSettings: async () => structuredClone(shared.settings), setSettings: async partial => { Object.assign(shared.settings, structuredClone(partial)); } },
    secrets: { get: async key => shared.secrets.get(key) ?? null, set: async (key, value) => { if (Buffer.byteLength(value) > 65536) throw new Error("Secret too large"); shared.secrets.set(key, value); }, delete: async key => { shared.secrets.delete(key); } },
    events: { on: (event, handler) => bus.on(event, handler), off: (event, handler) => bus.off(event, handler) },
    app: { getAppearance: async () => ({ locale: "en", base: "dark" }) },
    // Recorded so a test can assert what a room transcript does and does not
    // bind: an unbound room session is the fix for the stray sidebar project.
    project: { create: async ({ path }) => { calls.push({ operation: "project.create", args: [{ path }] }); return { projectId: 42, path, name: "Fixture" }; } },
    models: { list: async () => [model] },
    fs: { requestDirectory: async () => ({ path: "/fixture", name: "Fixture" }) },
    session: {
      createManaged: async input => {
        calls.push({ operation: "session.createManaged", args: [structuredClone(input)] });
        const key = `${input.source}:${input.externalId}`;
        if (managed.has(key)) return { sessionId: managed.get(key), created: false };
        const sessionId = randomUUID(); managed.set(key, sessionId); return { sessionId, created: true };
      },
      appendManaged: async input => {
        const previous = appends.find(row => row.sessionId === input.sessionId && row.externalId === input.externalId);
        if (previous) {
          if (JSON.stringify(previous) !== JSON.stringify(input)) throw new Error("Append identity collision");
          return { messageId: previous.externalId, appended: false };
        }
        appends.push(structuredClone(input)); return { messageId: input.externalId, appended: true };
      },
      emitManagedEvent: async input => { streams.push(structuredClone(input)); return { delivered: true }; },
      setManagedModel: async input => {
        calls.push({ operation: "session.setManagedModel", args: [structuredClone(input)] });
        modelBindings.set(input.sessionId, structuredClone(input)); return { updated: true };
      },
      readManagedAttachment: async input => {
        const bytes = blobs.get(input.ref);
        // The host answers "this machine does not have that blob" by *throwing*
        // NOT_FOUND, never with a falsy value. Mirroring that here is what lets a
        // test catch the core treating a missing blob as an empty read.
        if (!bytes) throw Object.assign(new Error("attachment blob is not stored on this machine"), { code: "NOT_FOUND" });
        const slice = bytes.subarray(input.offset ?? 0, (input.offset ?? 0) + (input.length ?? 1024 * 1024));
        return { ref: input.ref, size: bytes.length, offset: input.offset ?? 0, eof: (input.offset ?? 0) + slice.length >= bytes.length, contentBase64: slice.toString("base64") };
      },
      beginManagedAttachment: async input => { const uploadId = randomUUID(); uploads.set(uploadId, { chunks: [], received: 0, expected: input.size }); return { uploadId }; },
      writeManagedAttachment: async input => {
        const upload = uploads.get(input.uploadId); const bytes = Buffer.from(input.dataBase64, "base64");
        upload.chunks.push(bytes); upload.received += bytes.length; return { received: upload.received };
      },
      commitManagedAttachment: async input => {
        const upload = uploads.get(input.uploadId); uploads.delete(input.uploadId);
        const bytes = Buffer.concat(upload.chunks); if (bytes.length !== upload.expected) throw new Error("Attachment upload is incomplete");
        const ref = attachmentRef(bytes); blobs.set(ref, bytes); refreshed.push({ sessionId: input.sessionId, ref });
        return { ref, size: bytes.length };
      },
    },
    desktop: {
      listOperations: async () => operationIds.map(id => ({ id, risk: dangerous.has(id) ? "dangerous" : "write" })),
      subscribeAgentEvents: async ({ sessionId }) => { calls.push({ operation: "subscribe", sessionId }); const subscriptionId = randomUUID(); sessions.get(sessionId).subscriptionId = subscriptionId; return { subscriptionId }; },
      unsubscribeAgentEvents: async input => { calls.push({ operation: "unsubscribe", ...input }); for (const session of sessions.values()) if (session.subscriptionId === input.subscriptionId) session.subscriptionId = undefined; },
      invoke: async input => {
        calls.push(structuredClone(input));
        const [arg, config] = input.args ?? [];
        switch (input.operation) {
          case "session/create": { const session = { ...arg, id: randomUUID(), permissionMode: "inherit" }; sessions.set(session.id, session); return { session }; }
          case "session/configure": Object.assign(sessions.get(arg), config); return { session: sessions.get(arg) };
          case "session/get": return { session: sessions.get(arg.id) };
          case "settings/get": return structuredClone(shared.appSettings);
          case "session/delete": sessions.delete(arg); return { deleted: true };
          case "session/open": return {};
          case "agent/prompt": {
            const session = sessions.get(arg.sessionId); session.turnId = randomUUID();
            if (api.onPrompt) await api.onPrompt(session, arg);
            return { accepted: true, turnId: session.turnId };
          }
          case "agent/abort": {
            const session = sessions.get(arg.sessionId);
            if (api.onAbort) await api.onAbort(session, arg);
            return {};
          }
          default: throw new Error(`Unexpected operation ${input.operation}`);
        }
      },
    },
  };
  function event(session, value, overrides = {}) {
    bus.emit("desktop:agentEvent", { subscriptionId: session.subscriptionId, sessionId: session.id, turnId: session.turnId, ts: Date.now(), event: value, ...overrides });
  }
  function terminal(session, reason = "completed", overrides = {}) {
    bus.emit("desktop:turnEnded", { subscriptionId: session.subscriptionId, sessionId: session.id, turnId: session.turnId, reason, persisted: true, ...overrides });
  }
  const released = () => [...sessions.values()].every(session => !session.subscriptionId);
  const consents = () => calls.filter(call => dangerous.has(call.operation)).length;
  return { api, shared, bus, calls, sessions, appends, streams, blobs, uploads, modelBindings, refreshed, event, terminal, released, consents, doc: () => shared.settings[KEY], seedBlob: bytes => { const ref = attachmentRef(bytes); blobs.set(ref, Buffer.from(bytes)); return ref; } };
}
module.exports = { fixture, tick, until, model, operationIds, attachmentRef };
