"use strict";
// Build-time adaptations of the preserved portable candidate. Abort if upstream
// changes an anchor; these transformations never run in the plugin host.
//
// Two capabilities are added to the portable core, both injected rather than
// edited into the checkout so the candidate tree stays pristine:
//
// `forgetDeparted` — a deleted room transcript must not be handed back by a
// later join. The candidate core keeps `departed` precisely so a rejoin can
// reuse this machine's session and history; deleting the session is the one case
// where that must not happen, so the retained entry is dropped on demand.
//
// `forgetRunStatus` — a run the plugin's own worker settled locally must not
// keep the room refusing every later message to that member (see the note above
// the injection below).
//
// Blob reads — `session.readManagedAttachment` answers "not on this machine" by
// *throwing* NOT_FOUND, never by returning a falsy value. Both blob paths in the
// core were written for the falsy shape, so the machine that did not hold the
// bytes threw instead of fetching them: an image sent to a room ran on the
// sender's own computer (which has the blob) and failed on every other one,
// which then reported 「助手没能完成这次回复」 and left the member stuck. A read
// failure is exactly the "not here yet, go and get it" case both call sites mean.
//
// Ghost retirement on join — see the note above the patch below.
function patchCore(source) {
  function replace(before, after) {
    if (source.split(before).length !== 2) throw new Error(`Portable core anchor changed: ${before.slice(0, 100)}`);
    source = source.replace(before, after);
  }
  // Reading a blob this machine does not have is the normal "fetch it" case, not
  // an error: the host answers a missing blob with a thrown NOT_FOUND.
  replace('    if (await deps.readAttachment(r.sessionId, a.ref, 0, 1)) return;',
    '    try { if (await deps.readAttachment(r.sessionId, a.ref, 0, 1)) return; } catch { /* Not on this machine yet; pull it. */ }');
  replace('    const local = await deps.readAttachment?.(r.sessionId, ref, offset, length);',
    '    const local = deps.readAttachment ? await deps.readAttachment(r.sessionId, ref, offset, length).catch(() => undefined) : undefined;');
  replace('if (!run || run.targetMemberId !== sender || !["completed", "failed", "aborted"].includes(String(data.status)))',
    'if (!run || run.targetMemberId !== sender || !["completed", "failed", "aborted", "unknown"].includes(String(data.status)))');
  replace('const publicEvent = clone(event);', `const publicEvent = clone(event);
    const mapTool = (value: Record<string, unknown>): void => {
      for (const key of ["toolCallId", "parentToolCallId", "nestedParentToolCallId"]) {
        if (value[key] !== undefined) value[key] = messageId(runId, text(value[key]));
      }
    };
    mapTool(publicEvent as unknown as Record<string, unknown>);
    if (["tool_start", "tool_update", "tool_end"].includes(publicEvent.event.type)) mapTool(publicEvent.event as unknown as Record<string, unknown>);`);
  replace('finalized.push(message({ ...raw, id, groupChat: g }, r.id));', `const mapped = { ...raw, id, groupChat: g };
      for (const key of ["toolCallId", "parentToolCallId", "nestedParentToolCallId"]) {
        if (mapped[key] !== undefined) mapped[key] = messageId(runId, text(mapped[key]));
      }
      finalized.push(message(mapped, r.id));`);
  replace('const source = publicEvent.event.message;', 'const source = publicEvent.event.message;\n      mapTool(source as unknown as Record<string, unknown>);');
  replace('if (publicEvent.event.type === "message_end" && publicEvent.event.precedingAssistant) {',
    'if (publicEvent.event.type === "message_end" && publicEvent.event.precedingAssistant) {\n        mapTool(publicEvent.event.precedingAssistant as unknown as Record<string, unknown>);');
  // Anchored on the whole `sendMessage` declaration because the added lines name
  // `state`, `text`, `persist` and `locked`, which only this scope defines.
  replace('    async sendMessage(args) {',
    `    async forgetDeparted(roomId: string): Promise<void> {
      await locked(async () => {
        const id = text(roomId);
        if (state.departed?.some(r => r.id === id)) { state.departed = state.departed.filter(r => r.id !== id); await persist(); }
      });
    },
    async sendMessage(args) {`);
  // A run whose target never got a terminal receipt stays `unknown` forever, and
  // `admit` refuses a later message to that member ("Agent already has an active
  // or uncertain run"). That guard exists so a possibly-live turn is never
  // double-started, and it holds until the run really is provably dead. It is
  // also the one state the *throw* path leaves behind: `admit` records `unknown`
  // for every target as soon as the message could not be flushed, including runs
  // that were never dispatched anywhere, and a route to such a target that comes
  // back up can never clear it. So the plugin, which is the only side that knows
  // a run was settled locally, is given a way to release that record.
  //
  // The anchor is parsed, not sliced, because the built bundle minifies this
  // method: the property is found after `async`, before `(`.
  // A run this machine never got a terminal receipt for is recorded `unknown`, and
  // `admit` refuses every later message to that member until something clears it.
  // The record is only *self*-clearing when the target is this machine's own
  // member (the plugin's `forgetRunStatus`). A target on another computer has no
  // such path: the local worker that could have settled it is gone, and a route
  // that comes back up can never retire it. The one thing that *does* prove the
  // old turn is dead is the member connecting again — a fresh connection cannot
  // be mid-turn from before — so `resume` retires the member's leftover
  // `running`/`unknown` records. Only the host does this, because only the host
  // owns `runs`; a guest learns the cleared list through the `sync` it already
  // gets back.
  replace('      if (method === "resume") { member(r, memberId).online = true; await persist(); await sync(r); return { snapshot: view(r) }; }',
    `      if (method === "resume") {
        const resumed = member(r, memberId);
        const wasOffline = resumed.online === false;
        resumed.online = true;
        if (r.host && wasOffline) {
          const retired = r.runs.filter(v => v.targetMemberId === memberId && ["running", "unknown"].includes(v.status));
          if (retired.length) {
            r.runs = r.runs.filter(v => !(v.targetMemberId === memberId && ["running", "unknown"].includes(v.status)));
            for (const v of retired) if (executing.has(v.id)) void deps.stopRun(v.id).catch(() => void 0);
          }
        }
        await persist();
        await sync(r);
        return { snapshot: view(r) };
      }`);
  // A machine only leaves cleanly while its link is up. If the guest's app was
  // relaunched and its stored room was lost (reinstall, cleared data), the guest
  // later joins again with a *fresh* invitation and a new credential — but its
  // old row is still on the host, offline, because the dropped connection never
  // sent `leave`. Rejoining then added a second row for the same name that is
  // never retired: the members list grows one ghost per rejoin, on both machines
  // (the guest's view is the host's snapshot). So a join retires every offline
  // row carrying the same name — a name is one computer's identity here — and its
  // credential, and its still-`running` runs become `unknown` exactly as a
  // revoke would leave them. A clean rejoin is unaffected: a connected row is
  // matched by its credential and never re-joins.
  replace('                assigned = randomUUID(); const credential = token(); r.credentials[assigned] = hash(credential);\n                r.members.push({ id: assigned, label, online: true, agentStatus: "none", models: [], selection: null }); attach(r, assigned, p);',
    `                assigned = randomUUID(); const credential = token(); r.credentials[assigned] = hash(credential);
                const ghosts = r.members.filter(m => m.id !== r.selfId && m.online === false && m.label === label);
                if (ghosts.length) {
                  const gone = new Set(ghosts.map(m => m.id));
                  for (const id of gone) delete r.credentials[id];
                  for (const run of r.runs) if (run.targetMemberId && gone.has(run.targetMemberId) && run.status === "running") run.status = "unknown";
                  r.members = r.members.filter(m => !gone.has(m.id));
                }
                r.members.push({ id: assigned, label, online: true, agentStatus: "none", models: [], selection: null }); attach(r, assigned, p);`);
  const ADMIT_GUARD = 'if (r.runs.some(v => v.targetMemberId === target.id && ["running", "unknown"].includes(v.status)))';
  if (source.split(ADMIT_GUARD).length !== 2) throw new Error(`Portable core anchor changed: ${ADMIT_GUARD.slice(0, 100)}`);
  // The class method is the only `async sendMessage` in the file, and it reads the
  // same in the TypeScript source and in the minified bundle.
  const asyncAt = source.indexOf("async sendMessage");
  if (asyncAt < 0) throw new Error("Portable core anchor changed: async sendMessage");
  const signatureAt = source.indexOf("(", asyncAt);
  if (signatureAt < 0 || source.slice(asyncAt + "async sendMessage".length, signatureAt).trim()) {
    throw new Error("Portable core anchor changed: sendMessage signature");
  }
  source = source.slice(0, asyncAt)
    + `async forgetRunStatus(roomId: string, memberId: string, statuses: string[]): Promise<void> {
      await locked(async () => {
        const r = state.rooms.find(v => v.id === text(roomId));
        if (!r) return;
        const next = r.runs.filter(v => !(v.targetMemberId === text(memberId) && Array.isArray(statuses) && statuses.includes(v.status)));
        if (next.length === r.runs.length) return;
        r.runs = next;
        await persist();
      });
    },
    `
    + source.slice(asyncAt);
  return source;
}
module.exports = { patchCore };
