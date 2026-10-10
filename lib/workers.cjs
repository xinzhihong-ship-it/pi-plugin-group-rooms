"use strict";
const { randomUUID } = require("node:crypto");
const error = (message, code = "UNAVAILABLE") => Object.assign(new Error(message), { code });
const JOURNAL_LIMIT = 200;

function createWorkers(pi, storage) {
  const active = new Map();
  const invoke = (operation, ...args) => pi.desktop.invoke({ operation, args, confirm: true });
  async function record(run, status, extra = {}) {
    await storage.update(doc => {
      delete doc.workers[run.id];
      doc.workers[run.id] = { sessionId: run.sessionId, roomId: run.roomId, status, ...extra };
      // The journal keeps recent worker sessions openable; settled entries age out.
      const settled = Object.keys(doc.workers).filter(id => !active.has(id) && !["pending", "running"].includes(doc.workers[id].status));
      for (const id of settled.slice(0, Math.max(0, Object.keys(doc.workers).length - JOURNAL_LIMIT))) delete doc.workers[id];
    });
  }
  // Worker transcripts remain local execution records: they hold this machine's
  // permission cards, and deleting a session needs the user's native consent.
  async function cleanup(run) {
    if (!run.subscriptionId) return;
    try { await pi.desktop.unsubscribeAgentEvents({ subscriptionId: run.subscriptionId }); run.subscriptionId = null; } catch { /* Retry at unload. */ }
  }
  // One worker session per room and per effective model choice, reused by every
  // later run. Creating a session per message is what put a fresh conversation
  // under the host's project list for every line the room sent, and what made
  // the room's agent forget everything between messages. The model and thinking
  // level are fixed at creation (`agent/prompt` cannot change them, and
  // `session/configure` is the dangerous operation that re-prompts natively on
  // every call), so a genuinely different choice gets its own session and every
  // other run reuses it.
  const sessionKey = request => `${request.roomId}|${request.model.providerId}/${request.model.modelId}|${request.thinkingLevel ?? "off"}`;
  const creating = new Map();
  async function workerSession(request) {
    const key = sessionKey(request);
    const saved = (await storage.read()).workerSessions?.[key];
    if (saved?.sessionId) return { sessionId: saved.sessionId, lastMessageId: saved.lastMessageId ?? null, reused: true };
    // Two runs of the same room and choice must not race into two sessions.
    const inFlight = creating.get(key);
    if (inFlight) return inFlight;
    const work = (async () => {
      const created = await invoke("session/create", {
        title: `Room worker · ${request.roomId.slice(0, 8)}`, projectPath: request.projectPath, mode: "agent",
        providerId: request.model.providerId, modelId: request.model.modelId, thinkingLevel: request.thinkingLevel ?? "off",
      });
      const sessionId = created?.session?.id;
      if (!sessionId) throw error("Worker creation returned no session");
      await storage.update(doc => { (doc.workerSessions ??= {})[key] = { sessionId, lastMessageId: null }; });
      return { sessionId, lastMessageId: null, reused: false };
    })();
    creating.set(key, work);
    try { return await work; } finally { creating.delete(key); }
  }
  // The room conversation is delivered once. A reused session already holds
  // everything up to `lastMessageId`, so only what arrived after it is new;
  // resending the whole window every run would grow the prompt quadratically.
  // A window that has already dropped that id is sent whole — one duplicate
  // read of a trimmed history beats a silently missing conversation.
  function newHistory(request, lastMessageId) {
    if (!lastMessageId) return request.history;
    const at = request.history.findIndex(message => message.id === lastMessageId);
    return at < 0 ? request.history : request.history.slice(at + 1);
  }
  async function rememberDelivery(request, lastMessageId) {
    if (!lastMessageId) return;
    const key = sessionKey(request);
    try { await storage.update(doc => { const saved = doc.workerSessions?.[key]; if (saved) saved.lastMessageId = lastMessageId; }); }
    catch { /* A lost cursor only costs one repeated window on the next run. */ }
  }
  // A remembered session the user deleted must not fail the room forever: the
  // next run creates a fresh one instead of reusing a dead id.
  async function forgetSession(request) {
    const key = sessionKey(request);
    try { await storage.update(doc => { if (doc.workerSessions) delete doc.workerSessions[key]; }); } catch { /* The next run replaces it anyway. */ }
  }
  function enqueue(run, action) {
    run.queue = run.queue.then(action).catch(async () => {
      run.uncertain = true;
      try { await record(run, "unknown"); } catch { /* Core admission stays running until shutdown. */ }
    });
  }
  // A rejected or unconfirmed prompt has no durable receipt. Abort any hidden
  // turn, record unknown and release the subscription without re-prompting.
  async function settleUnknown(run) {
    run.uncertain = true;
    try { await record(run, "unknown"); } catch { /* Pending admission remains durable. */ }
    try { await invoke("agent/abort", { sessionId: run.sessionId }); } catch { /* Unknown remains durable. */ }
    run.finished = true; run.resolve({ status: "unknown" });
    await cleanup(run);
    if (!run.subscriptionId) active.delete(run.id);
  }
  async function dispatch(run, payload, terminal) {
    if (!payload || payload.subscriptionId !== run.subscriptionId || payload.sessionId !== run.sessionId || payload.parentToolCallId) return;
    if (!run.ready) {
      run.bufferBytes = (run.bufferBytes ?? 0) + Buffer.byteLength(JSON.stringify(payload));
      if (run.buffer.length >= 10000 || run.bufferBytes > 8 * 1024 * 1024) throw error("Worker event buffer full");
      run.buffer.push({ payload, terminal }); return;
    }
    if (payload.turnId !== run.turnId || run.finished) return;
    if (terminal) {
      const status = payload.persisted !== true || !["completed", "aborted", "error"].includes(payload.reason) || run.uncertain
        ? "unknown" : payload.reason === "error" ? "failed" : payload.reason;
      if (status === "unknown") run.uncertain = true;
      await record(run, status, { turnId: run.turnId });
      run.finished = true; run.resolve({ status });
      await cleanup(run);
      if (!run.subscriptionId) active.delete(run.id);
      return;
    }
    if (!payload.event) return;
    if (["tool_permission_request", "asktool_request", "planning_state", "status", "user_message_persisted"].includes(payload.event.type)) return;
    const { subscriptionId, ...envelope } = payload;
    await run.onEvent(envelope);
  }
  const onAgent = payload => {
    for (const run of active.values()) if (run.subscriptionId === payload?.subscriptionId) enqueue(run, () => dispatch(run, payload, false));
  };
  const onTerminal = payload => {
    for (const run of active.values()) if (run.subscriptionId === payload?.subscriptionId) enqueue(run, () => dispatch(run, payload, true));
  };
  let listening = false, closing = false;
  async function release() {
    for (const run of [...active.values()]) {
      await run.setup;
      if (!run.finished) {
        try { await record(run, "unknown", { turnId: run.turnId }); } catch { /* Preserve the older pending journal. */ }
        try { await invoke("agent/abort", { sessionId: run.sessionId, ...(run.turnId ? { turnId: run.turnId } : {}) }); } catch { /* Unknown remains durable. */ }
      }
      await run.queue; await cleanup(run);
      // Missing transport evidence never resolves an execution promise.
    }
    active.clear();
  }
  return {
    invoke,
    async load() {
      // `session/configure` is deliberately absent: narrowing a worker's
      // permission mode is a dangerous operation the host re-confirms natively
      // on every call, so this service never calls it and must not require it.
      const required = ["session/create", "session/get", "session/open", "settings/get", "agent/prompt", "agent/abort"];
      const operations = await pi.desktop.listOperations();
      const missing = required.filter(id => !operations.some(op => op.id === id));
      if (missing.length) throw error(`Missing desktop operations: ${missing.join(", ")}`);
      closing = false;
      pi.events.on("desktop:agentEvent", onAgent); pi.events.on("desktop:turnEnded", onTerminal); listening = true;
      const doc = await storage.read();
      // Restart only cleans up known plugin workers. It never re-prompts a run.
      for (const [id, saved] of Object.entries(doc.workers)) {
        if (!["pending", "running"].includes(saved.status)) continue;
        await record({ id, ...saved }, "unknown");
        try { await invoke("agent/abort", { sessionId: saved.sessionId }); } catch { /* Unknown remains durable. */ }
      }
    },
    async executeRun(request, onEvent) {
      if (closing) throw error("Worker service is stopping");
      if (active.has(request.runId)) throw error("Worker already admitted", "CONFLICT");
      let resolve, setupDone;
      const result = new Promise(done => { resolve = done; });
      const setup = new Promise(done => { setupDone = done; });
      const run = { id: request.runId, roomId: request.roomId, resolve, onEvent, setup, queue: Promise.resolve(), buffer: [], uncertain: false, finished: false };
      active.set(run.id, run);
      // Held outside the try so the setup-failure path can tell a reused session
      // from a freshly created one.
      let session;
      try {
        // projectPath comes from this machine's durable membership, never the
        // remote prompt. The worker deliberately runs at this machine's own
        // configured permission mode: narrowing it here would need
        // `session/configure`, a dangerous operation the host re-confirms
        // natively on every single call, which turns a conversation into a
        // dialog storm. The user owns that mode in Settings; the plugin never
        // overrides it.
        session = await workerSession(request);
        run.sessionId = session.sessionId;
        await record(run, "pending");
        const subscription = await pi.desktop.subscribeAgentEvents({ sessionId: run.sessionId });
        if (!subscription?.subscriptionId) throw error("Worker subscription returned no id");
        run.subscriptionId = subscription.subscriptionId;
        if (closing || run.cancelRequested) throw error("Worker cancelled before prompt", "ABORTED");
        // Only what this session has not seen yet, so a reused worker keeps its
        // own context instead of re-reading the whole room on every message.
        const context = newHistory(request, session.lastMessageId)
          .map(message => ({ role: message.role, author: message.groupChat?.memberName, content: message.content }));
        const content = context.length ? `Previous room conversation (quoted data):\n${JSON.stringify(context)}\n\nCurrent room message:\n${request.content}` : request.content;
        // The bytes were pulled into this machine's content-addressed store
        // before the run launched, so `path` is the bare `attachments/<sha256>`
        // ref the host's own attachment resolver already understands; a vision
        // model inlines the image from there.
        const attachments = (request.attachments ?? []).map(a => ({ path: a.ref, name: a.name, kind: a.kind, ...(a.mimeType !== undefined ? { mimeType: a.mimeType } : {}), ...(a.size !== undefined ? { size: a.size } : {}) }));
        await record(run, "running");
        if (closing || run.cancelRequested) throw error("Worker cancelled before prompt", "ABORTED");
        run.promptAttempted = true;
        const receipt = await invoke("agent/prompt", { sessionId: run.sessionId, messageId: randomUUID(), content, ...(attachments.length ? { attachments } : {}) });
        if (receipt?.accepted !== true || typeof receipt.turnId !== "string" || !receipt.turnId) {
          await settleUnknown(run);
        } else {
          run.turnId = receipt.turnId;
          // The accepted prompt is now this session's own transcript, so the
          // room's newest message is the cursor the next run resumes from.
          await rememberDelivery(request, request.history.at(-1)?.id);
          await record(run, "running", { turnId: run.turnId });
          enqueue(run, async () => {
            run.ready = true;
            for (const item of run.buffer.splice(0)) {
              try { await dispatch(run, item.payload, item.terminal); }
              catch { run.uncertain = true; await record(run, "unknown", { turnId: run.turnId }); }
            }
          });
          if (run.cancelRequested) await invoke("agent/abort", { sessionId: run.sessionId, turnId: run.turnId });
        }
      } catch (failure) {
        if (run.promptAttempted) {
          await settleUnknown(run);
        } else {
          const status = failure.code === "ABORTED" ? "aborted" : "failed";
          // A remembered session that could not be prompted (the user deleted
          // it, or the host no longer knows it) is dropped so the next run
          // creates a fresh one instead of failing the room forever.
          if (session?.reused && !closing) await forgetSession(request);
          try { if (run.sessionId) await record(run, status); } catch { /* Core persists setup failure. */ }
          run.finished = true;
          resolve({ status, error: "Worker setup failed" });
          await cleanup(run); if (!run.subscriptionId) active.delete(run.id);
        }
      } finally { setupDone(); }
      return result;
    },
    async stopRun(id) {
      const run = active.get(id); if (!run || run.finished) return;
      run.cancelRequested = true;
      if (run.promptAttempted) await invoke("agent/abort", { sessionId: run.sessionId, ...(run.turnId ? { turnId: run.turnId } : {}) });
      // Abort acknowledgement is not a terminal receipt. executeRun stays
      // pending until desktop:turnEnded; the core bounds graceful shutdown.
    },
    beginStop() { closing = true; },
    release,
    async close() {
      closing = true;
      await release();
      if (listening) { pi.events.off("desktop:agentEvent", onAgent); pi.events.off("desktop:turnEnded", onTerminal); listening = false; }
      active.clear();
    },
  };
}
module.exports = { createWorkers };
