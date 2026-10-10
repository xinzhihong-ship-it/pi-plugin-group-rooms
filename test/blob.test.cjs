"use strict";
// An attachment must reach the machine that does NOT hold its bytes.
//
// The host holds the blob; the guest does not. When the host sends a message
// carrying that attachment, the guest's run has to pull the bytes over the room
// wire before it can prompt. The fake store here answers a missing blob the way
// the real host does — by *throwing* `NOT_FOUND` (`session.readManagedAttachment`
// refuses "attachment blob is not stored on this machine"), never with a falsy
// value. Written for the falsy shape, the core treated that throw as a hard
// failure and aborted the fetch, so an image ran on the sender's own computer
// and failed on every other one. (test/probe-blob.cjs is the same scenario as a
// runnable probe; this file is the standing regression.)
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { createRoomNetworkService } = require("../lib/network.cjs");
const model = { key: "blob/model", providerId: "blob", modelId: "model", label: "Blob", thinkingLevels: ["off", "high"], contextWindow: 1, isDefault: true };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function machine(name) {
  let state = { version: 1, machineId: `${name}-machine`, rooms: [] }, secret = null, revision = 0;
  const blobs = new Map(), uploads = new Map(), runs = [];
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
    executeRun: async request => { runs.push(request); return { status: "completed" }; },
    stopRun: async () => {}, emitEvent: async () => {}, changed: () => {},
    // The host answers a missing blob the way the real host does: by throwing.
    readAttachment: async (_sessionId, ref, offset = 0, length = 1024) => {
      const bytes = blobs.get(ref);
      if (!bytes) throw Object.assign(new Error("attachment blob is not stored on this machine"), { code: "NOT_FOUND" });
      const slice = bytes.subarray(offset, offset + length);
      return { ref, size: bytes.length, offset, eof: offset + slice.length >= bytes.length, contentBase64: slice.toString("base64") };
    },
    beginAttachment: async (_sessionId, input) => { const uploadId = `${name}-${uploads.size}`; uploads.set(uploadId, { chunks: [], expected: input.size }); return { uploadId }; },
    writeAttachment: async (_sessionId, input) => { const u = uploads.get(input.uploadId); u.chunks.push(Buffer.from(input.dataBase64, "base64")); return {}; },
    commitAttachment: async (_sessionId, uploadId) => { const u = uploads.get(uploadId); const bytes = Buffer.concat(u.chunks); blobs.set(`attachments/${sha(bytes)}`, bytes); return { ref: `attachments/${sha(bytes)}`, size: bytes.length }; },
  };
  return { name, service: createRoomNetworkService(deps), blobs, runs };
}

test("an image sent to a room lands on the machine that does not hold its bytes", async t => {
  const host = machine("host"), guest = machine("guest");
  // The bytes exist only on the host, under this content address.
  const bytes = Buffer.from("fake-png-bytes-".repeat(20));
  const ref = `attachments/${sha(bytes)}`;
  host.blobs.set(ref, bytes);

  // A per-run port keeps this file safe to run beside the rest of the suite.
  const port = 40000 + (process.pid % 20000);
  await host.service.start({ port, bindAddress: "127.0.0.1" });
  t.after(async () => { await guest.service.stop(true); await host.service.stop(true); });
  const shared = await host.service.shareRoom({ roomId: "r", sessionId: "hs", name: "P", projectPath: "/h", label: "Alice", address: `wss://127.0.0.1:${port}` });
  const joined = await guest.service.joinRoom({ invitation: shared.invitation, label: "Bob", projectPath: "/g" });
  await guest.service.requestAgent(joined.roomId);
  const room = (await host.service.status()).rooms[0];
  const bobId = room.members.find(m => m.label === "Bob").id;
  const approve = async id => { if (room.members.find(m => m.id === id)?.agentStatus === "pending") await host.service.approveAgent("r", id, true); };
  await approve(room.selfMemberId); await approve(bobId);
  await sleep(200);

  // The host is the sender and holds the blob; only the guest has to fetch it.
  await host.service.sendMessage({ roomId: "r", id: randomUUID(), content: "@Bob look", attachments: [{ ref, name: "shot.png", kind: "image", mimeType: "image/png", size: bytes.length }], targets: [{ targetMemberId: bobId, modelKey: model.key }] });
  for (let i = 0; i < 400 && !guest.runs.length; i++) await sleep(25);

  assert.equal(guest.runs.length, 1, "the guest's run started");
  assert.ok((guest.runs[0].attachments ?? []).some(a => a.ref === ref), "the attachment is on the run");
  assert.ok(guest.blobs.has(ref), "the bytes landed on the guest");
  assert.deepEqual(guest.blobs.get(ref), bytes, "the guest's copy is byte for byte the host's");
});
