"use strict";
const { randomUUID, createHash } = require("node:crypto");
const os = require("node:os");
const { createStorage } = require("./storage.cjs");
const { createWorkers } = require("./workers.cjs");
const SOURCE = "group-rooms";
const fail = (message, code = "INVALID_ARGUMENT") => Object.assign(new Error(message), { code });
function object(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("Expected an object");
  return value;
}
function text(value, name, max = 4096) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw fail(`Invalid ${name}`);
  return value;
}
const uuid = value => {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw fail("Message ID must be a UUID");
  return value;
};
function advertisedAddress(value, port) {
  const raw = text(value, "advertised address").trim();
  const input = raw.includes("://") ? raw : `wss://${raw}`;
  let url;
  try { url = new URL(input); } catch { throw fail("Invalid room address"); }
  if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw fail("Invalid room address");
  const authority = input.slice(input.indexOf("://") + 3).split("/")[0];
  if (!/:\d+$/.test(authority)) url.port = String(port);
  return url.origin;
}
// The page has to offer an address the other computers can dial, and asking the
// user to retype their own LAN IP every time is the busywork this removes. The
// first non-loopback IPv4 is the address this machine is most likely reachable
// at; a multi-homed box (NAS, VPN, several NICs) may hand back one of the
// others, so the page always leaves the field editable and a remembered address
// wins over this probe. No interface at all (loopback only) answers empty and
// the page falls back to its placeholder rather than inventing an address.
function localAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry?.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "";
}
// An invitation carries a full dial origin (scheme and port), and that is the
// only record this machine gets of the address it joined through — a room does
// not persist one. What the forms want back is the bare host, exactly what the
// user would have typed, because the backend re-derives the port from whichever
// listener is live; keeping the old port would pin an address the room may have
// since moved off. Decoding is best effort: an invitation that has since
// expired still joined, and a form that keeps the last good host beats one that
// throws after a join that already succeeded.
function invitationAddress(invitation) {
  try {
    const encoded = decodeURIComponent(invitation.slice("pi-room:".length));
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return typeof value?.address === "string" ? new URL(value.address).hostname : "";
  } catch { return ""; }
}

// A room byline is a member name, and a reader has to tell two speakers apart
// at a glance, so the name carries a colored dot. The index is a stable hash of
// the name, so the same member gets the same dot on every computer and across
// restarts: a per-machine or per-room color would paint one person two ways.
// The palette holds the seven chromatic circles and nothing else. Black was
// dropped after rendering both themes: on a dark transcript it is a dark disc
// on a dark disc, so a member that hashed onto it looked like a member the
// plugin had failed to color, and white is not one of the colors a reader
// names. Seven is still enough that a realistic roster of machine names spreads
// across every entry (each lands within a point of 14%).
const BYLINE_DOTS = ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤"];
function bylineDot(name) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return BYLINE_DOTS[hash % BYLINE_DOTS.length];
}
// The host renders a managed message's author as a byline and has no column of
// its own for a model, so an agent reply states the model and thinking level it
// ran on in that same string, after the member name. A member with no admitted
// model keeps the bare name. The host caps the author at 256 characters; the
// slice counts code points so it can never cut a dot or a name in half.
function byline(name, modelLabel) {
  const who = typeof name === "string" ? name.trim() : "";
  const what = typeof modelLabel === "string" ? modelLabel.trim() : "";
  return Array.from([who ? `${bylineDot(who)} ${who}` : "", what].filter(Boolean).join(" · ")).slice(0, 256).join("");
}

// An attachment descriptor is tiny and content-addressed: `ref` names the blob
// (`attachments/<sha256>`) and never a path on anyone's disk. The host owns the
// bounds, so this only strips a descriptor to the fields the wire carries.
//
// `inlinePath` is kept: it is the `@"<path>"` text the host's own composer put
// in the message body for this attachment. It is what lets the transcript draw
// the picture where the user placed it, and it is what `submit` removes before
// reading mentions — the composer names an image exactly like a file reference,
// so the marker would otherwise read as a mention of a member that never existed.
const ATTACHMENT_REF = /^attachments\/[0-9a-f]{64}$/i;
function attachmentDescriptors(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 32) throw fail("Invalid attachments");
  return value.map(raw => {
    const a = object(raw);
    if (typeof a.ref !== "string" || !ATTACHMENT_REF.test(a.ref)) throw fail("Invalid attachment ref");
    if (!["image", "file"].includes(a.kind)) throw fail("Invalid attachment kind");
    const name = text(a.name, "attachment name", 255);
    if (a.mimeType !== undefined && (typeof a.mimeType !== "string" || a.mimeType.length > 128)) throw fail("Invalid attachment mime type");
    if (a.size !== undefined && (!Number.isSafeInteger(a.size) || a.size < 0)) throw fail("Invalid attachment size");
    if (a.inlinePath !== undefined && (typeof a.inlinePath !== "string" || a.inlinePath.length > 1024)) throw fail("Invalid attachment inline path");
    return { ref: a.ref, name, kind: a.kind, ...(a.mimeType !== undefined ? { mimeType: a.mimeType } : {}), ...(a.size !== undefined ? { size: a.size } : {}), ...(a.inlinePath ? { inlinePath: a.inlinePath } : {}) };
  });
}
// The message body with every attachment's own marker text taken out. The
// composer writes `@"<path>"` for a file chip, and a path is not a room member,
// so leaving it in makes an attached photo unsendable. Removing exactly the text
// the host attributed to an attachment can never touch what the user typed.
function withoutAttachmentMarkers(content, attachments) {
  let result = content;
  for (const attachment of attachments ?? []) {
    if (attachment.inlinePath) result = result.split(attachment.inlinePath).join(" ");
  }
  return result;
}

// Group metadata remains in the portable journal; the SDK owns native message
// and streaming identity projection.
function managedMessage(message) {
  const result = { role: message.role, content: message.content, createdAt: message.createdAt };
  if (message.role === "assistant") {
    if (message.modelId) result.modelId = message.modelId;
    if (message.providerId) result.providerId = message.providerId;
  } else if (message.role === "tool") {
    result.toolName = text(message.toolName, "tool name");
    result.toolCallId = text(message.toolCallId, "tool call id");
    result.toolStatus = ["error", "denied"].includes(message.toolStatus) || message.isError ? "error" : "success";
    if (message.toolArgs !== undefined) result.toolArgs = message.toolArgs;
    if (message.toolResult !== undefined) result.toolResult = message.toolResult;
  } else if (message.role === "user") {
    // A user message's attachments are part of the durable transcript, so a
    // reload renders the same picture. Only the descriptor travels here; the
    // bytes live in the host's content-addressed store.
    const attachments = attachmentDescriptors(message.attachments);
    if (attachments?.length) result.attachments = attachments;
  } else throw fail("Unsupported transcript role");
  return result;
}

function createBackend(pi, options = {}) {
  const storage = createStorage(pi), workers = createWorkers(pi, storage);
  let core, loaded = false, closing = false, serial = Promise.resolve(), context = null;
  let armError = "", portNotice = null;
  // The native picker answers through the page's read-only `list` polling, not
  // through the call that started it: the host times a plugin.call out after 2s
  // and a human choosing a folder takes longer, so awaiting it in `call` can
  // only ever fail. One pick is in flight at a time; the last answer stays
  // readable until the next pick replaces it.
  let picker = { requestId: "", pending: false, done: true, path: null, name: "", error: "" };
  const pickerView = () => ({ ...picker });
  function startDirectoryPick() {
    if (typeof pi.fs?.requestDirectory !== "function") throw fail("Missing public directory picker", "SDK_UNAVAILABLE");
    if (picker.pending) return { requestId: picker.requestId, pending: true };
    const requestId = randomUUID();
    picker = { requestId, pending: true, done: false, path: null, name: "", error: "" };
    // Deliberately not inside `exclusive` and not awaited by the caller: the
    // dialog is modal to the user, touches no shared state, and must never hold
    // the serial lock the page polls through.
    //
    // This branch returns before the picker settles, so it must also not be
    // touched by a later `stop()` that replaces the answer.
    void Promise.resolve()
      .then(() => pi.fs.requestDirectory())
      .then(result => {
        if (picker.requestId !== requestId) return;
        picker = { requestId, pending: false, done: true, path: result?.path ?? null, name: result?.name ?? "", error: "" };
      }, error => {
        if (picker.requestId !== requestId) return;
        picker = { requestId, pending: false, done: true, path: null, name: "", error: error?.code ?? "UNAVAILABLE" };
      });
    return { requestId, pending: true };
  }
  const exclusive = action => {
    const work = serial.then(action); serial = work.catch(() => {}); return work;
  };
  // This machine's own name and reachable address are remembered across rooms,
  // so Create/Join never ask for either a second time. A blank value leaves the
  // remembered one alone: a join whose invitation decodes to nothing must not
  // erase an address the user typed earlier.
  const rememberLocal = (label, address) => storage.update(doc => {
    if (typeof label === "string" && label.trim()) doc.local.label = label.trim();
    if (typeof address === "string" && address.trim()) doc.local.address = address.trim();
  });
  // A room transcript is a managed chat session: it never runs an agent, so it
  // needs neither a host project nor a workspace binding. `projectPath` is a
  // per-machine member fact the core records for this machine's worker runs and
  // is passed to `session/create` only when an agent actually runs.
  //
  // Creating a project here (or binding this session to one) is what made a
  // project appear in the sidebar the moment a room was opened: the host
  // promotes a session's project path into the sidebar's project tabs when the
  // session is opened, and a plugin has no way to un-promote it. Leaving the
  // session unbound keeps the room in the plugin's own navigation, where it
  // belongs, and leaves the user's project list untouched.
  async function createSession(title, projectPath, externalId = randomUUID()) {
    void projectPath;
    const result = await pi.session.createManaged({ source: SOURCE, externalId, title });
    return text(result.sessionId, "managed session id");
  }
  async function models() {
    const levels = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
    // `isDefault` marks the app's own default launch model. It must survive this
    // adapter because the portable core syncs it to every machine, and a peer
    // with no saved choice runs on it.
    return (await pi.models.list()).slice(0, 100).map(model => ({
      key: model.key, providerId: model.providerId, modelId: model.modelId, label: model.label,
      thinkingLevels: model.thinkingLevels.filter(level => levels.has(level)), contextWindow: 1,
      ...(model.isDefault === true ? { isDefault: true } : {}),
    }));
    // SDK models.list has no contextWindow; 1 is a schema placeholder only.
    // The host owns actual context limits; the adapter never truncates to it.
  }
  function network() {
    if (!loaded || closing) throw fail("Group Rooms backend is not loaded", "UNAVAILABLE");
    core ??= (options.createNetwork ?? require("./network.cjs").createRoomNetworkService)({
      store: storage.core, createSession, listModels: models,
      // Blob access for room attachments, scoped by the host to sessions this
      // plugin owns. Bytes never appear in a room message; they are read and
      // written here in chunks and content-addressed on disk.
      readAttachment: async (sessionId, ref, offset, length) => pi.session.readManagedAttachment({ sessionId, ref, offset, length }),
      beginAttachment: async (sessionId, input) => pi.session.beginManagedAttachment({ sessionId, ...input }),
      writeAttachment: async (sessionId, input) => { await pi.session.writeManagedAttachment({ sessionId, ...input }); },
      commitAttachment: async (sessionId, uploadId) => pi.session.commitManagedAttachment({ sessionId, uploadId }),
      refreshMessage: async (sessionId, message) => {
        // The blob just landed, so the same durable row now renders. Re-appending
        // the identical externalId is idempotent on the host and makes it emit
        // `sessionsChanged`, which is what re-reads the transcript.
        const group = message.groupChat ?? {};
        await pi.session.appendManaged({ sessionId, externalId: message.id, author: byline(group.memberName, group.modelLabel), message: managedMessage(message) });
      },
      appendMessage: async (sessionId, message) => {
        // An agent reply states the model and thinking level it ran on. The host
        // renders the managed author as a byline above the message, and it has
        // no model column of its own, so both ride in the author string. A human
        // message carries no model and keeps the plain member name.
        const group = message.groupChat ?? {};
        await pi.session.appendManaged({ sessionId, externalId: message.id, author: byline(group.memberName, group.modelLabel), message: managedMessage(message) });
      },
      emitEvent: async (sessionId, event) => {
        if (!["message_start", "message_update", "message_end", "tool_start", "tool_update", "tool_end"].includes(event.event?.type)) return;
        // Reading status here would re-enter the core's lock. Its durable
        // journal already contains the admitted run and member identity.
        const saved = (await storage.read()).state?.rooms.find(room => room.sessionId === sessionId);
        const run = saved?.runs.find(run => run.id === event.turnId);
        // Same byline as the durable append: the member name followed by the
        // model label when the run states one. A stream may arrive before the
        // finalized message, so the label is read off the event's group chat and
        // the name falls back to the run's target member.
        const group = event.event.message?.groupChat ?? {};
        const name = group.memberName ?? saved?.members.find(member => member.id === run?.targetMemberId)?.label ?? event.agentName;
        const author = byline(name, group.modelLabel);
        const envelope = { turnId: event.turnId, ts: event.ts, event: event.event };
        for (const key of ["parentToolCallId", "nestedParentToolCallId"]) if (event[key] !== undefined) envelope[key] = event[key];
        const receipt = await pi.session.emitManagedEvent({ sessionId, ...(author ? { author } : {}), envelope });
        if (receipt?.delivered !== true) throw fail("Managed stream delivery was not acknowledged", "UNKNOWN_OUTCOME");
      },
      // Room sessions are created empty here, so there is no imported history
      // to seed. Core owns canonical history and retry identities thereafter.
      executeRun: workers.executeRun, stopRun: workers.stopRun, changed: scheduleModelRefresh,
    });
    return core;
  }
  // Creating a room or an invitation is the act that makes this computer
  // reachable, so it arms the listener itself; there is no separate switch.
  // Only a host ever listens: joining dials out and never binds. Both the port
  // and an explicit bind address are remembered, so a restart rebinds the same
  // address and invitations that were already shared keep working.
  async function listening(requested, requestedBind) {
    if (requested !== undefined && (!Number.isInteger(requested) || requested < 0 || requested > 65535)) throw fail("Invalid listener port");
    const core = network(), current = await core.status();
    if (current.listener) return current.listener;
    const doc = await storage.read();
    const port = Number.isInteger(requested) ? requested : Number.isInteger(doc.listenerPort) ? doc.listenerPort : 0;
    const bind = requestedBind ?? doc.listenerBind;
    const options = typeof bind === "string" ? { bindAddress: text(bind, "listener bind address", 256) } : {};
    let listener, fellBack = false;
    try { listener = await core.start({ port, ...options }); }
    catch (error) {
      // Another program may have taken the remembered port while the app was
      // closed. Falling back keeps the action working, but it silently
      // invalidates invitations that were already shared, so record the change
      // and let the page ask for a fresh invitation instead of going stale.
      if (port === 0) throw error;
      listener = await core.start({ port: 0, ...options });
      fellBack = true;
    }
    await storage.update(saved => {
      saved.listenerPort = listener.port;
      if (typeof bind === "string") saved.listenerBind = bind;
    });
    portNotice = fellBack ? { from: port, to: listener.port } : null;
    armError = "";
    return listener;
  }
  // Restart path only. Activation stays network inert for a machine that hosts
  // nothing; a machine with a saved host room re-binds the same port, because
  // hosting a room is exactly what makes it reachable and the user consented
  // when they created that room. A failure is reported to the page, not thrown.
  async function arm() {
    const hosted = ((await storage.read()).state?.rooms ?? []).some(saved => saved.host);
    if (!hosted) return null;
    return listening();
  }
  // The counterpart of `arm`: receiving exists only while a hosted room does.
  // `core.stop` is machine level (it closes every peer and socket), so it may
  // only run when no room at all remains; a still-joined guest room needs its
  // connection, and the core only re-dials it when it is rebuilt.
  async function disarm() {
    if (!core) return;
    const rooms = (await storage.read()).state?.rooms ?? [];
    if (rooms.length) return;
    await core.stop(true);
    core = undefined;
    armError = "";
  }
  // The newest runs are the only ones anyone reads (the one a room just
  // admitted). `list` is polled every 1.2s through the host's 64 KB call relay,
  // so an unbounded run journal on every room would end the same way the room
  // history did: a poll that quietly stops answering.
  const RUN_VIEW_LIMIT = 20;
  function runView(runs) {
    // A room that has never admitted a run still answers, and an older stored
    // room may predate the journal entirely; a missing journal reads as empty.
    return (Array.isArray(runs) ? runs : []).slice(-RUN_VIEW_LIMIT)
      .map(run => run.status === "running" ? { ...run, status: "unknown" } : run);
  }
  // A room answer is polled every 1.2s and has to fit the host's 64 KB call
  // relay, so every room's own history and worker log are dropped here rather
  // than at the one caller that happens not to draw them: the page reads the
  // transcript straight from the host, and a room message is capped at 100000
  // bytes, so a few dozen of them are already past the relay on their own.
  function roomView(room) {
    return {
      id: room.id, sessionId: room.sessionId, name: room.name, projectPath: room.projectPath,
      selfMemberId: room.selfMemberId, host: room.host, connected: room.connected, revoked: room.revoked,
      members: room.members ?? [], runs: runView(room.runs),
    };
  }
  // Both answers go through the same projection, not just the storage-only one:
  // a machine with a live core is the normal case, and its answer is the one
  // that ships.
  async function status() {
    const current = core ? await core.status() : await storedStatus();
    return { ...current, rooms: current.rooms.map(roomView) };
  }
  async function storedStatus() {
    const { state } = await storage.read();
    return { machineId: state?.machineId ?? "", rooms: (state?.rooms ?? []).map(saved => roomView({
      id: saved.id, sessionId: saved.sessionId, name: saved.name, projectPath: saved.projectPath,
      selfMemberId: saved.selfId, host: saved.host, connected: saved.host, revoked: saved.revoked === true,
      members: saved.members.map(member => ({ ...member, online: member.id === saved.selfId })),
      runs: saved.runs,
    })) };
  }
  async function room(id) {
    const result = (await status()).rooms.find(value => value.id === text(id, "room id"));
    if (!result) throw fail("Room not found", "NOT_FOUND");
    return result;
  }
  // `targets` stays in the view as an always-empty array so a reader written
  // against the older shape still finds the key. It is no longer a stored
  // setting: an @mention decides who runs, and nothing else does.
  function preferenceView(value = {}) {
    const configurations = value.configurations ?? value.targets ?? [];
    return { targets: [], configurations, memberConfigs: configurations };
  }
  async function preferences(id) { return preferenceView((await storage.read()).preferences[id]); }
  function validateTargets(current, targets, requireOnline = false) {
    if (!Array.isArray(targets) || targets.length > 32) throw fail("Invalid targets");
    const seen = new Set();
    return targets.map(raw => {
      const target = object(raw), member = current.members.find(m => m.id === target.targetMemberId);
      if (seen.has(target.targetMemberId)) throw fail("Duplicate target member ID");
      seen.add(target.targetMemberId);
      const model = member?.models.find(m => m.key === target.modelKey);
      if (!member || member.agentStatus !== "approved" || !model) throw fail("Target or model is unavailable");
      if (requireOnline && !member.online) throw fail("Approved target is offline");
      if (target.thinkingLevel !== undefined && !model.thinkingLevels.includes(target.thinkingLevel)) throw fail("Thinking level is unavailable");
      return { targetMemberId: member.id, modelKey: model.key, ...(target.thinkingLevel !== undefined ? { thinkingLevel: target.thinkingLevel } : {}) };
    });
  }
  // A member with no saved choice runs on its own machine's default model. The
  // user decided that a send must just work rather than refuse, so a missing
  // configuration falls back to `isDefault` and then to the first catalog entry.
  // An explicitly saved configuration stays strict: an unknown model key or an
  // unsupported thinking level is still rejected.
  function fallbackTarget(member) {
    const model = member.models.find(value => value.isDefault) ?? member.models[0];
    return { targetMemberId: member.id, modelKey: model?.key };
  }
  function resolveTarget(current, member, config) {
    return validateTargets(current, [config ?? fallbackTarget(member)], true)[0];
  }
  function parseTargets(content, current, preferences) {
    // `preferences.targets` is always empty now (see `preferenceView`): the
    // members page no longer arms recipients, so the mention is the only thing
    // that decides who runs.
    // A mention starts at a text boundary, never inside an email. JSON quoted
    // labels support spaces and escaped quotes: @"Alice Smith".
    const mentions = [...content.matchAll(/(?:^|[\s(])@("(?:\\.|[^"\\])*"|[^\s]+)/g)].flatMap(match => {
      const token = match[1];
      if (token.startsWith('"')) return [{ label: JSON.parse(token), quoted: true }];
      if (token.includes("@")) return [];
      return [{ label: token.replace(/[.,;!?)]+$/, ""), quoted: false }];
    });
    // 「需要谁自己会@他」 decides who *else* runs. With no mention at all the
    // sender is talking to their own computer, so the message is treated exactly
    // like `@<this machine>`: the same approval, presence and saved-config rules
    // apply, and a chat-only machine still just broadcasts. A message that names
    // somebody else runs only that somebody, never this machine as well.
    const self = current.members.find(member => member.id === current.selfMemberId);
    const named = mentions.length || !self ? mentions : [{ label: self.id, quoted: false }];
    if (!named.length) return [];
    const targets = new Map();
    const configuration = id => preferences.configurations.find(target => target.targetMemberId === id);
    for (const { label, quoted } of named) {
      if (!quoted && ["all", "所有人"].includes(label)) {
        // A member that genuinely cannot run is still excluded: offline, not
        // approved, or without any model at all never enters the @all set.
        for (const member of current.members.filter(m => m.online && m.agentStatus === "approved" && m.models.length)) {
          try { targets.set(member.id, resolveTarget(current, member, configuration(member.id))); } catch { /* @all skips unavailable members. */ }
        }
      } else {
        const matches = current.members.filter(m => m.id === label || m.label === label);
        if (matches.length !== 1) throw fail("Mention must identify exactly one room member");
        const member = matches[0];
        // The core projects one machine member as both human and agent. An
        // unapproved member mention is human-only broadcast, with no execution.
        if (member.agentStatus !== "approved") continue;
        if (!member.online) throw fail("Approved target is offline");
        targets.set(member.id, resolveTarget(current, member, configuration(member.id)));
      }
    }
    return [...targets.values()];
  }
  // The room transcript is a managed session that never runs an agent, so the
  // composer's model chip has no agent of its own to follow and falls back to
  // the app default. This machine's own member row is the choice that matters,
  // so its model and thinking level are written onto the managed session and
  // the chip reads that binding instead.
  //
  // Two places hold that choice, and both must count. A local configuration is
  // what this machine sends with, so it wins. The member row's synced
  // `selection` is the copy the room published, and it is the *only* record a
  // machine has when the choice was made on another computer — configuring the
  // Windows member from the Mac is exactly that case, and reading only the
  // local file left that machine's chip stuck on the app default.
  //
  // Only an explicit choice is written. A member with no choice anywhere
  // already runs on its machine's default model (`fallbackTarget`), which is the
  // same model the chip shows, so writing that default would add a call that
  // changes nothing. Display only, either way: a room must keep working against
  // a host without the API, so a failure is swallowed and never surfaced.
  // An `unknown` run never blocks a send by itself: `admit` only refuses while a
  // *running* or *unknown* run exists for that target, and a route that is up
  // lets the host re-admit the member, which is how an unsettled turn is normally
  // retired. What cannot come back is a target this machine itself ran and then
  // lost: the worker settled it locally as unknown, nothing will ever deliver a
  // terminal receipt for it, and the room keeps refusing every later message to
  // that member with 「Agent already has an active or uncertain run」.
  //
  // The room only records `unknown` when it cannot prove the turn is dead, so the
  // worker's own settled verdict is the missing proof. This machine's newest
  // unknown run for its own member is exactly that case, and the local journal is
  // what tells the two apart: a run the service is still tracking (pending or
  // running) is left alone, however the room happens to label it.
  //
  // Runs without a stated model are left in place: a host core older than
  // `forgetRunStatus` has none in its journal either (it pushes `modelKey` from
  // the admission request), so the filter cannot reach one and guessing would
  // only drop evidence.
  async function clearStuckSelfRun(current) {
    if (!core || typeof core.forgetRunStatus !== "function") return;
    const mine = current.runs.filter(run => run.targetMemberId === current.selfMemberId && run.status === "unknown" && run.modelKey);
    if (!mine.length) return;
    const journal = (await storage.read()).workers;
    if (!mine.some(run => !["pending", "running"].includes(journal[run.id]?.status ?? ""))) return;
    try { await core.forgetRunStatus(current.id, current.selfMemberId, ["unknown"]); }
    catch { /* The refusal below will say so rather than this cleanup. */ }
  }
  async function managedModelTarget(current) {
    const self = current.members.find(m => m.id === current.selfMemberId);
    if (!self) return null;
    const local = (await preferences(current.id)).configurations.find(t => t.targetMemberId === self.id);
    const chosen = local ?? self.selection ?? null;
    if (!chosen) return null;
    const model = self.models.find(m => m.key === chosen.modelKey);
    if (!model) return null;
    return { sessionId: current.sessionId, providerId: model.providerId, modelId: model.modelId, ...(chosen.thinkingLevel !== undefined ? { thinkingLevel: chosen.thinkingLevel } : {}) };
  }
  // One write per distinct binding: a room persists on every message and every
  // peer sync, and re-stating an unchanged model would be a host call per
  // message. The signature is recorded only after a successful write, so a
  // failure is retried on the next change instead of being remembered as done.
  const managedModelWrites = new Map();
  async function writeManagedModel(current, force = false) {
    const target = await managedModelTarget(current);
    const signature = target ? JSON.stringify(target) : "";
    if (!force && managedModelWrites.get(current.sessionId) === signature) return;
    if (!target) { managedModelWrites.delete(current.sessionId); return; }
    await pi.session.setManagedModel(target);
    managedModelWrites.set(current.sessionId, signature);
  }
  async function syncManagedModel(roomId) {
    try { await writeManagedModel(await room(roomId), true); }
    catch { /* Display only; the room keeps working on an older host. */ }
  }
  // A room snapshot this machine receives can carry a new selection for its own
  // member, so a persisted state change is what makes the chip follow a choice
  // made on another computer. The core calls this from inside its own lock, so
  // the refresh is deferred instead of re-entering it, and identical writes are
  // skipped by `writeManagedModel`.
  let modelRefresh = null;
  function scheduleModelRefresh() {
    if (modelRefresh || !loaded || closing) return;
    modelRefresh = setTimeout(() => {
      modelRefresh = null;
      void exclusive(async () => {
        for (const current of (await status()).rooms) await writeManagedModel(current).catch(() => {});
      }).catch(() => {});
    }, 0);
  }
  async function submit(input) {
    return exclusive(async () => {
      object(input); uuid(input.messageId);
      // The host content-addresses a composer attachment before it reaches the
      // plugin, so by here it is a descriptor whose bytes already sit in this
      // machine's blob store. Text is required only when no attachment is.
      const attachments = attachmentDescriptors(input.attachments);
      const content = typeof input.content === "string" ? input.content.slice(0, 65536) : "";
      if (!content.trim() && !attachments?.length) throw fail("Invalid message content");
      const current = (await network().status()).rooms.find(r => r.sessionId === input.sessionId);
      if (!current) throw fail("Native session does not belong to a room", "NOT_FOUND");
      // A removed machine keeps its transcript but is no longer a member. Saying
      // so beats the generic "disconnected" the send would otherwise report.
      if (current.revoked) throw fail("This computer was removed from the room", "ROOM_REVOKED");
      // A run this machine already settled must not keep the room refusing every
      // later message to it (see `clearStuckSelfRun`). This only ever releases a
      // record this machine owns, and it runs before the submission is journalled.
      await clearStuckSelfRun(current);
      const key = `${input.sessionId}:${input.messageId}`;
      const digest = createHash("sha256").update(JSON.stringify([content, (attachments ?? []).map(a => a.ref)])).digest("hex");
      const doc = await storage.read(), previous = doc.submissions[key];
      if (previous) {
        if (previous.digest !== digest) throw fail("Message ID has different content", "CONFLICT");
        if (previous.status === "accepted") return { accepted: true };
        throw fail("Previous submission outcome is unknown; it will not be replayed", "UNKNOWN_OUTCOME");
      }
      if (Object.keys(doc.submissions).length >= 10000) throw fail("Submission journal capacity reached");
      // Mentions are read from the message as the user means it: an attachment's
      // own `@"<path>"` marker is the host's file reference, not a person, so the
      // text the host attributed to each attachment is removed first. The content
      // itself keeps the marker, which is what places the picture in the transcript.
      const targets = parseTargets(withoutAttachmentMarkers(content, attachments), current, await preferences(current.id));
      await storage.update(saved => { saved.submissions[key] = { digest, status: "pending", roomId: current.id, targets }; });
      try {
        const result = await network().sendMessage({ roomId: current.id, id: input.messageId, content, ...(attachments?.length ? { attachments } : {}), ...(targets.length ? { targets } : {}) });
        await storage.update(saved => { saved.submissions[key].status = "accepted"; saved.submissions[key].result = result; });
      } catch (error) {
        await storage.update(saved => { saved.submissions[key].status = "unknown"; });
        throw error;
      }
      return { accepted: true };
    });
  }
  async function stop() {
    closing = true;
    workers.beginStop();
    // A pick started before the stop is abandoned with it: leaving it pending
    // would make the next session show a pick that can never settle.
    picker = { requestId: "", pending: false, done: true, path: null, name: "", error: "" };
    // A deferred model refresh belongs to the process being torn down; letting
    // it fire would call the host after the plugin stopped.
    if (modelRefresh) { clearTimeout(modelRefresh); modelRefresh = null; }
    managedModelWrites.clear();
    await serial;
    try { if (core) await core.stop(true); } finally { await workers.close(); core = undefined; loaded = false; }
  }
  return {
    async load() {
      if (loaded) return;
      // `project.create` is deliberately absent: a room transcript is managed by
      // this plugin and never runs an agent, so it binds no host project. Only a
      // worker's own `session/create` names the folder it runs in.
      const required = ["plugin.getSettings", "plugin.setSettings", "session.createManaged", "session.appendManaged", "session.setManagedModel", "session.emitManagedEvent", "session.readManagedAttachment", "session.beginManagedAttachment", "session.writeManagedAttachment", "session.commitManagedAttachment", "models.list", "secrets.get", "secrets.set", "secrets.delete", "desktop.invoke", "desktop.listOperations", "desktop.subscribeAgentEvents", "desktop.unsubscribeAgentEvents", "events.on", "events.off"];
      for (const path of required) {
        const [scope, name] = path.split(".");
        if (typeof pi?.[scope]?.[name] !== "function") throw fail(`Missing public SDK API: pi.${path}`, "SDK_UNAVAILABLE");
      }
      try {
        await storage.update(doc => { for (const value of Object.values(doc.submissions)) if (value.status === "pending") value.status = "unknown"; });
        await workers.load(); loaded = true; closing = false;
        // A restart must not leave the composer chip on the app default: every
        // saved room re-states this machine's member choice on its own session.
        for (const saved of (await storage.read()).state?.rooms ?? []) await syncManagedModel(saved.id);
        // …and a room this machine left with an unsettled run of its own is
        // released here, so the first message after a restart is not refused by a
        // turn that ended before the app closed.
        for (const saved of (await status()).rooms) await clearStuckSelfRun(saved).catch(() => {});
      } catch (error) { await workers.close(); throw error; }
      // Activation itself stays network inert: no prompt, reconnect or bind. A
      // saved host room does re-arm its listener here, because hosting a room is
      // what makes this computer reachable and the user already consented when
      // they created it. Failure is reported to the page through `list`.
      await arm().catch(error => { armError = error?.message ?? "Listener unavailable"; });
    },
    stop, submit,
    async call(channel, raw = {}, source = "panel") {
      if (!loaded || closing) throw fail("Group Rooms backend is not loaded", "UNAVAILABLE");
      const args = object(raw);
      const method = typeof channel === "string" && channel.startsWith("group-rooms.") ? channel.slice(12) : "";
      // The native picker stays open as long as the user needs it, so it never
      // answers this call. It touches no shared state, so it also must not hold
      // the serial lock: the page polls `list` every 1.2s and the host times a
      // plugin.call out after 2s, so a picker awaited here can only time out and
      // then trip the relay breaker that blanks the page. This starts the pick
      // and the page reads the answer from its own `list` polling.
      if (method === "selectDirectory") {
        if (args.roomId) throw fail("Changing a joined room directory requires leave/rejoin; the portable core has no directory setter", "UNSUPPORTED");
        return startDirectoryPick();
      }
      return exclusive(async () => {
        switch (method) {
          case "context": {
            if (Object.hasOwn(args, "context")) {
              if (source !== "renderer") throw fail("Only the native renderer can save context", "FORBIDDEN");
              if (args.context === null) context = null;
              else {
                const value = object(args.context);
                context = { sessionId: text(value.sessionId, "context session id"), ...(value.managedByPlugin !== undefined ? { managedByPlugin: text(value.managedByPlugin, "managed plugin") } : {}) };
              }
            }
            return context ? { ...context } : null;
          }
          case "appearance": {
            if (typeof pi.app?.getAppearance !== "function") throw fail("Missing public appearance API", "SDK_UNAVAILABLE");
            return pi.app.getAppearance();
          }
          // No listener switch exists. A host room means this computer is
          // receiving, so `create`/`invite` arm the listener themselves and a
          // restart re-arms it for a saved room (see `arm`).
          // `list` is the page's read-only poll, so it also carries the last
          // directory pick (the picker cannot answer inside its own 2s call) and
          // a listener that failed to re-arm on restart.
          // `list` also carries a listener that failed to re-arm on restart and
          // a listener port that had to change, because a changed port makes
          // every invitation already shared unusable until a new one is made.
          case "list": return {
            ...(await status()), picker: pickerView(),
            // What this machine calls itself and the address it last handed out.
            // Both are tiny, so the 64 KB poll budget is untouched, and the page
            // seeds its Create/Join form from them so neither is retyped.
            local: { ...(await storage.read()).local },
            suggestAddress: localAddress(),
            ...(armError ? { listenerError: armError } : {}), ...(portNotice ? { listenerNotice: portNotice } : {}),
          };
          // The page reads `list` for everything it draws; this answer exists for
          // the live fields `list` trims. It must stay small: the host refuses a
          // plugin.call whose answer passes 64 KB, and the room history alone
          // crossed that after a few dozen messages, which made this call fail on
          // every poll and left the @ list empty. History is not returned at all —
          // nothing renders it here — and `room()` already trims the run journal.
          case "snapshot": {
            const current = await room(args.roomId), doc = await storage.read();
            return { ...current, preferences: preferenceView(doc.preferences[current.id]) };
          }
          case "create": {
            const id = args.roomId ?? randomUUID(), name = text(args.name, "room name", 256), projectPath = text(args.projectPath, "local project path"), label = text(args.label, "member label", 256);
            const listener = await listening(args.port, args.bindAddress);
            const address = advertisedAddress(args.address, listener.port);
            const sessionId = await createSession(name, projectPath, text(id, "room id", 128));
            const result = await network().shareRoom({ roomId: id, sessionId, name, projectPath, label, address });
            // The machine that creates a room is the host, and the host's own
            // member row is created already approved: asking the user to click
            // 「批准助手」 on their own row is the self-approval they asked to be
            // rid of. Every other member, including one that joins and asks,
            // still waits for a host click.
            await syncManagedModel(id);
            // Only a room that was actually created is remembered, so a mistyped
            // address on a failed attempt is never what the next form offers.
            await rememberLocal(label, args.address);
            return { roomId: id, sessionId, ...result };
          }
          case "join": {
            const invitation = text(args.invitation, "invitation"), label = text(args.label, "member label", 256);
            const joined = await network().joinRoom({ invitation, label, projectPath: text(args.projectPath, "local project path") });
            // Joining is the moment this computer offers to run agents, so it
            // publishes its model catalog and asks for access right away: a
            // member that stays chat-only is the usual reason an @mention gets
            // no reply, and the machine's own user has already consented by
            // joining. The host still decides — the request lands as `pending`
            // until it approves. Best effort: a room with an unreachable host
            // is still joined, and the member can request again from the panel.
            try { await network().requestAgent(joined.roomId); }
            catch { /* Chat-only until the request succeeds; join itself stands. */ }
            await syncManagedModel(joined.roomId);
            // The address a guest is reachable at is the one its host dialled in
            // the invitation; the label is whatever it just joined under.
            await rememberLocal(label, invitationAddress(invitation));
            return joined;
          }
          case "invite": {
            const current = await room(args.roomId), self = current.members.find(m => m.id === current.selfMemberId);
            const listener = await listening(args.port, args.bindAddress);
            const result = await network().shareRoom({ roomId: current.id, sessionId: current.sessionId, name: current.name, projectPath: current.projectPath, label: self.label, address: advertisedAddress(args.address, listener.port) });
            portNotice = null;
            return result;
          }
          case "requestAgent": return network().requestAgent(text(args.roomId, "room id"));
          case "approve": {
            if (typeof args.approved !== "boolean") throw fail("Approval must be a boolean");
            return network().approveAgent(text(args.roomId, "room id"), text(args.memberId, "member id"), args.approved);
          }
          case "revoke": return network().revoke(text(args.roomId, "room id"), text(args.memberId, "member id"));
          case "leave": {
            const result = await network().leave(text(args.roomId, "room id"));
            await disarm();
            return result;
          }
          // Deleting a room is leaving it *and* erasing this machine's own copy
          // of its chat. The room is left first, because leaving reads the room
          // and deleting the session afterwards no longer needs it; a session
          // delete is a dangerous host operation and still shows the native
          // confirmation, which is the user's own consent and not something the
          // plugin menu may stand in for.
          //
          // The delete is dispatched, not awaited. The host keeps its own
          // confirmation dialog open until the user answers, and a `plugin.call`
          // is cut off after 2s; waiting here would answer this call with a
          // timeout, and the page's 1.2s `list` polls during the dialog would run
          // five timeouts in a row and trip the relay breaker — the plugin then
          // reads as 「连续出错」 for 30s while the user is still deciding. The
          // room is already left by this point, so the dialog's answer changes
          // nothing about this reply: the delete settles in the background and a
          // refusal leaves the session for the native sidebar to remove.
          case "remove": {
            const current = await room(args.roomId), sessionId = current.sessionId, hosted = current.host;
            await network().leave(current.id);
            // A guest's `leave` records the room in the core's `departed` list so
            // a later rejoin keeps this machine's session and history; that is
            // the entry just written, and exactly what must not happen once the
            // session is deleted below. It is dropped after `leave` (before the
            // last-room `disarm` retires the core) so a rejoin cannot hand the
            // deleted session back.
            if (!hosted) { try { await network().forgetDeparted(current.id); } catch { /* The session is erased below regardless. */ } }
            await disarm();
            void Promise.resolve()
              .then(() => workers.invoke("session/delete", sessionId))
              .catch(() => { /* Refused or already gone; the room is left either way. */ });
            return { removed: true };
          }
          case "rename": return network().renameRoom(text(args.roomId, "room id"), text(args.name, "room name", 256));
          case "configure": case "selectModel": case "selectThinking":
          {
            const current = await room(args.roomId), previous = await preferences(current.id);
            const old = previous.configurations.find(t => t.targetMemberId === args.memberId);
            if (method === "selectThinking" && !old) throw fail("Select a model before thinking level");
            const target = method === "selectThinking" ? { ...old, thinkingLevel: args.thinkingLevel } : { targetMemberId: args.memberId, modelKey: args.modelKey, ...(args.thinkingLevel !== undefined ? { thinkingLevel: args.thinkingLevel } : {}) };
            const validated = validateTargets(current, [target])[0];
            const configurations = [...previous.configurations.filter(t => t.targetMemberId !== args.memberId), validated];
            const next = { targets: [], configurations };
            await storage.update(doc => { doc.preferences[current.id] = next; });
            // The local preference above is what this machine sends with. The
            // synced selection is the copy every other machine displays for this
            // member, and only the member itself (or the host) may record it. The
            // sync is display-only: a guest whose host is unreachable still keeps
            // the choice the user just made, so a failure here is never surfaced.
            if (core && typeof core.setSelection === "function" && (current.host || args.memberId === current.selfMemberId)) {
              try {
                await core.setSelection(current.id, validated.targetMemberId, {
                  modelKey: validated.modelKey, ...(validated.thinkingLevel !== undefined ? { thinkingLevel: validated.thinkingLevel } : {}),
                });
              } catch { /* Synced display copy only; the local preference still applies. */ }
            }
            // Changing this machine's own model is exactly what the composer
            // chip shows, so re-state it on the managed session.
            if (validated.targetMemberId === current.selfMemberId) await syncManagedModel(current.id);
            return preferenceView(next);
          }
          case "cancel": return network().cancelRun(text(args.roomId, "room id"), text(args.runId, "run id"));
          case "open": return workers.invoke("session/open", (await room(args.roomId)).sessionId);
          case "openWorker": {
            const saved = (await storage.read()).workers[text(args.runId, "run id")];
            if (!saved) throw fail("Worker not found", "NOT_FOUND");
            return workers.invoke("session/open", saved.sessionId);
          }
          case "models": return models();
          default: throw fail("Unknown Group Rooms bridge method", "METHOD_NOT_FOUND");
        }
      });
    },
  };
}
module.exports = { createBackend, managedMessage, byline, bylineDot, SOURCE };
