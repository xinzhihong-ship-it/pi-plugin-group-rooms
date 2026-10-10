import { PLUGIN_ID, method, roomForContext, mentionItems, errorText } from './shared.mjs';
import { registerMainUI } from './main-ui.mjs';
let disposeLoad;
export function onLoad(pi) {
  disposeLoad?.();
  let live = true, refreshing = false, generation = 0, mirrored = undefined;
  let appearanceAt = 0;
  let state = { context: null, room: null, locale: 'zh-CN', error: '', roomView: null };
  // Nothing renders from this store any more: the composer has no room control,
  // and the @ autocomplete reads the room only when it opens. The store is kept
  // because that callback is what tells the extension which session is current.
  const notify = patch => { if (!live) return; state = { ...state, ...patch }; };
  const call = (name, args = {}) => pi.dispatch('plugin.call', { method: method(name), args });
  async function refresh() {
    if (!live || refreshing) return;
    refreshing = true; const token = generation;
    try {
      const context = await pi.dispatch('session.readContext', {});
      if (!live || token !== generation) return;
      const key = JSON.stringify(context);
      if (key !== JSON.stringify(state.context)) notify({ context, room: null, error: '' });
      if (key !== mirrored) { await call('context', { context }); mirrored = key; }
      // Appearance is locale and theme, which change on a user action, not on a
      // poll. Reading it every tick spent a third of the relay's 10 calls/s
      // budget on an answer that is almost always identical.
      if (Date.now() - appearanceAt > 10000) {
        const appearance = await call('appearance').catch(() => null);
        if (!live || token !== generation) return;
        appearanceAt = Date.now();
        if (appearance?.locale) notify({ locale: appearance.locale });
      }
      if (context?.managedByPlugin !== PLUGIN_ID) { notify({ room: null, roomView: null }); return; }
      const status = await call('list');
      const match = roomForContext(status, context);
      const room = match ? await call('snapshot', { roomId: match.id }) : null;
      const checked = await pi.dispatch('session.readContext', {});
      if (!live || token !== generation) return;
      if (checked?.sessionId !== context.sessionId || checked?.managedByPlugin !== PLUGIN_ID) {
        notify({ context: checked, room: null, roomView: null }); return;
      }
      notify({ context, room, roomView: match ?? null });
    } catch (error) { if (live && token === generation) notify({ room: null, error: errorText(error, state.locale) }); }
    finally { refreshing = false; }
  }
  // The composer carries no room controls at all: the user's rule is
  // 「需要谁自己会@他」, so who runs is decided by the @mention they type and
  // nothing else. The only thing this extension adds to the composer is the @
  // autocomplete below; models and thinking levels live in the Members panel.
  const disposers = [
    registerMainUI(pi, () => state),
    pi.slots.register({ slot: 'composerTrigger', trigger: '@', items: async ({ query }) => {
      const checked = await pi.dispatch('session.readContext', {});
      if (checked?.sessionId !== state.context?.sessionId || checked?.managedByPlugin !== PLUGIN_ID) { notify({ context: checked, room: null }); return []; }
      return mentionItems(state.room, query, state.locale);
    } }),
  ];
  const timer = setInterval(() => { void refresh(); }, 1200);
  void refresh();
  disposeLoad = () => {
    live = false; generation++; clearInterval(timer); disposers.reverse().forEach(dispose => dispose()); disposeLoad = undefined;
  };
}
export function onUnload() { disposeLoad?.(); }
