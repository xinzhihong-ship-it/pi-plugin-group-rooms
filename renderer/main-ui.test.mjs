// Run with Node and React/ReactDOM + jsdom available. Optional UI_DEPS supplies a dependency root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const deps = process.env.UI_DEPS;
if (deps) registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react' || specifier === 'react-dom' || specifier.startsWith('react-dom/')) return { url: pathToFileURL(`${deps}/node_modules/${specifier === 'react' ? 'react/index.js' : `react-dom/${specifier.split('/')[1] || 'index'}.js`}`).href, format: 'commonjs', shortCircuit: true };
  return next(specifier, context);
} });
const React = (await import('react')).default;
const { registerMainUI } = await import('./main-ui.mjs');
const workspaceRequire = createRequire(new URL('../../tests/package.json', import.meta.url));
const { JSDOM } = workspaceRequire('jsdom');
const tick = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

test('main slots: gesture navigation, management payloads, errors, native room open, cleanup', async context => {
  const dom = new JSDOM('<!doctype html><div id="nav"></div><div id="page"></div>', { url: 'https://fixture.invalid' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const calls = [], slots = new Map(), styles = new Set(), disposed = [], clipboard = [];
  // In the renderer the page's `navigator` is `window.navigator`; the plugin
  // writes through its clipboard API (with a detached-field command copy as the
  // fallback), so the suite records what actually landed on the clipboard.
  dom.window.navigator.clipboard = { writeText(value) { clipboard.push(value); return Promise.resolve(); } };
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
  let status = { rooms: [], listener: null, label: 'Fixture Mac', local: { label: '', address: '' }, suggestAddress: '' }, fail = false, pickSeq = 0;
  // The backend starts the pick in the background and publishes the answer on
  // `list`, because the host times a plugin.call out after 2s.
  let picker = { requestId: '', pending: false, done: true, path: null, name: '', error: '' };
  const answerPick = path => { picker = { requestId: picker.requestId, pending: false, done: true, path, name: path ? 'local' : '', error: '' }; };
  const room = { id: 'fixture-room', sessionId: 'fixture-session', name: 'Fixture room', host: true, connected: true, projectPath: '/fixture/local', selfMemberId: 'self', members: [{ id: 'self', label: 'Fixture Mac' }] };
  const pi = {
    ui: {
      injectStyle(css) { styles.add(css); return () => styles.delete(css); },
      // The host's layer: zero-size, carries the plugin's style scope, so a
      // menu portalled into it is the one place the plugin's CSS applies.
      openLayer() {
        const element = document.createElement('div');
        element.setAttribute('data-pi-plugin', 'local.group-rooms');
        element.setAttribute('data-pi-layer', '');
        document.body.appendChild(element);
        return { element, close() { element.remove(); } };
      },
    },
    slots: { register(value) { slots.set(value.slot, value); return () => { disposed.push(value.slot); slots.delete(value.slot); }; } },
    dispatch(action, payload) {
      calls.push({ action, payload });
      if (action === 'shell.openPage') return Promise.resolve({});
      if (action === 'workPanel.openView') return Promise.resolve({ ok: true });
      const name = payload.method.slice('group-rooms.'.length);
      if (name === 'appearance') return Promise.resolve({ locale: 'en' });
      if (name === 'list') return Promise.resolve({ ...structuredClone(status), picker: { ...picker } });
      if (fail) { fail = false; return Promise.reject({ code: 'UNAVAILABLE' }); }
      if (name === 'selectDirectory') {
        pickSeq += 1;
        picker = { requestId: `pick-${pickSeq}`, pending: true, done: false, path: null, name: '', error: '' };
        return Promise.resolve({ requestId: picker.requestId, pending: true });
      }
      // No listener switch exists: create/invite arm it themselves.
      if ((name === 'create' || name === 'invite') && status.rooms.some(value => value.host)) status.listener = { port: 47018 };
      if (name === 'create' || name === 'join') { status.rooms = [room]; if (name === 'create') status.listener = { port: 47018 }; }
      if (name === 'leave' || name === 'remove') { status.rooms = []; status.listener = null; }
      if (name === 'rename') status.rooms[0].name = payload.args.name;
      if (name === 'create' || name === 'join') return Promise.resolve({ roomId: room.id, sessionId: room.sessionId, name: room.name, invitation: 'FIXTURE INVITATION' });
      return Promise.resolve(name === 'invite' ? { invitation: 'FIXTURE INVITATION' } : {});
    },
  };
  const dispose = registerMainUI(pi, () => ({ context: { sessionId: 'fixture-session' } }));
  context.after(async () => { await React.act(async () => { dispose(); nav.unmount(); page.unmount(); }); dom.window.close(); });
  const nav = createRoot(document.getElementById('nav')), page = createRoot(document.getElementById('page'));
  const click = async node => { assert.ok(node, 'control exists'); await React.act(async () => node.click()); await tick(); };
  const button = (scope, label) => [...scope.querySelectorAll('button')].find(node => node.textContent === label);
  const input = (scope, label) => [...scope.querySelectorAll('label')].find(node => node.querySelector('span')?.textContent === label)?.querySelector('input,textarea');
  const fill = async (node, value) => React.act(async () => {
    const prototype = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    node.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await React.act(async () => { nav.render(React.createElement(slots.get('navigationSection').component)); page.render(React.createElement(slots.get('mainPage').component)); }); await tick();
  assert.equal(slots.get('mainPage').pageId, 'rooms');
  assert.match(document.getElementById('page').textContent, /No rooms yet/);
  assert.ok(!calls.some(c => /start|create|join|prompt/.test(c.payload?.method || '')), 'activation is read-only');
  // The pick is started by the click and answered by the backend through the
  // read-only `list` poll, so a test step answers it and forces one poll.
  const pickFolder = async path => {
    await click(button(document, 'Choose folder…'));
    assert.equal(button(document, 'Choosing…')?.disabled, true, 'a pick in flight disables the chooser');
    answerPick(path);
    await click(button(document, 'Refresh'));
  };
  assert.equal(document.querySelectorAll('iframe').length, 0);
  const before = calls.length;
  await React.act(async () => { button(document.getElementById('nav'), 'Join').click(); assert.equal(calls[before].action, 'shell.openPage', 'gesture dispatch is synchronous'); });
  assert.equal(button(document, 'Join room').getAttribute('aria-pressed'), 'true');
  assert.equal(document.activeElement, input(document, 'Invitation'));
  await fill(input(document, 'Invitation'), 'FIXTURE JOIN');
  await pickFolder('/fixture/local');
  await click(document.querySelector('form[aria-label="Join room"] button[type=submit]'));
  assert.deepEqual(calls.find(c => c.payload?.method === 'group-rooms.join').payload.args, { invitation: 'FIXTURE JOIN', label: 'Fixture Mac', projectPath: '/fixture/local' });
  assert.ok(document.querySelector('.gr-nav button[aria-current=page]'));
  await click(document.querySelector('.gr-nav .thread-item-main'));
  assert.equal(calls.find(c => c.payload?.method === 'group-rooms.open').payload.args.roomId, 'fixture-room');
  // Joining lands in the room: the same submission opens the native session
  // instead of leaving the user on the management page to click again.
  assert.equal(calls.find(c => c.payload?.method === 'group-rooms.join') && calls.some(c => c.payload?.method === 'group-rooms.open'), true, 'join opens the room');
  // The sidebar row carries a hover-revealed menu, portalled out of the
  // clipping sidebar, whose danger item needs a second click to confirm.
  await click(document.querySelector('.gr-nav .gr-row-more'));
  // The menu lives inside the plugin layer, never on the bare body: a style
  // rule of this plugin is scoped to `[data-pi-plugin]`, so a menu outside the
  // layer would arrive with no styles and be invisible.
  const menu = document.querySelector('[data-pi-layer] > .gr-menu[role=menu]');
  assert.ok(menu, 'the row menu is portalled into the plugin layer');
  assert.equal(document.querySelector('body > .gr-menu[role=menu]'), null, 'never portalled onto the bare body');
  // Presence in the DOM is not visibility: the shipped bug was a menu that
  // existed but was painted with no styles at all. So assert the layer is a
  // live layer the host is not suspending, and that the menu was actually
  // positioned against the row rather than left at the viewport origin.
  const layer = document.querySelector('[data-pi-layer]');
  // The host wraps this plugin's every style rule in
  // `@scope ([data-pi-plugin="<id>"])`, so the layer must carry exactly the id
  // the manifest declares, or the menu would be styled by nothing.
  assert.equal(layer.getAttribute('data-pi-plugin'), 'local.group-rooms', 'the layer carries the plugin id the host scopes styles to');
  assert.equal(layer.hidden, false, 'the host is not suspending the layer');
  assert.equal(layer.hasAttribute('inert'), false, 'the layer is not inert');
  assert.equal(document.body.contains(layer), true, 'the layer is mounted in the document');
  assert.match(menu.getAttribute('style') ?? '', /left:\s*\d+(\.\d+)?px/, 'the menu is positioned horizontally');
  assert.match(menu.getAttribute('style') ?? '', /top:\s*\d+(\.\d+)?px/, 'the menu is positioned vertically');
  assert.deepEqual([...menu.querySelectorAll('button')].map(node => node.textContent), ['Open session', 'Room members', 'Rename…', 'Create invitation…', 'Leave room', 'Delete room']);
  await click([...menu.querySelectorAll('button')].find(node => node.textContent === 'Delete room'));
  assert.equal([...document.querySelector('[data-pi-layer] > .gr-menu[role=menu]').querySelectorAll('button')].some(node => node.textContent === 'Confirm delete?'), true, 'deleting is a two-step confirm');
  await click([...document.querySelector('[data-pi-layer] > .gr-menu[role=menu]').querySelectorAll('button')].find(node => node.textContent === 'Confirm delete?'));
  assert.equal(calls.some(c => c.payload?.method === 'group-rooms.remove' && c.payload.args.roomId === 'fixture-room'), true, 'the confirmed delete calls remove');
  // Renaming and inviting open a small inline form rather than the management page.
  status.rooms = [room];
  await React.act(async () => { button(document, 'Refresh').click(); }); await tick();
  await click(document.querySelector('.gr-nav .gr-row-more'));
  await click([...document.querySelector('[data-pi-layer] > .gr-menu[role=menu]').querySelectorAll('button')].find(node => node.textContent === 'Rename…'));
  const renameForm = document.querySelector('[data-pi-layer] > .gr-menu-form');
  assert.ok(renameForm, 'rename opens an inline form');
  await fill(renameForm.querySelector('input'), 'Renamed room');
  await click([...renameForm.querySelectorAll('button')].find(node => node.textContent === 'OK'));
  assert.equal(calls.some(c => c.payload?.method === 'group-rooms.rename' && c.payload.args.name === 'Renamed room'), true, 'the inline rename saves');
  // An invitation exists to be pasted into another computer, so generating one
  // copies it right away — from the sidebar row, with the management page that
  // owns the visible invitation field not even mounted.
  await click(document.querySelector('.gr-nav .gr-row-more'));
  await click([...document.querySelector('[data-pi-layer] > .gr-menu[role=menu]').querySelectorAll('button')].find(node => node.textContent === 'Create invitation…'));
  const inviteForm = document.querySelector('[data-pi-layer] > .gr-menu-form');
  await fill(inviteForm.querySelector('input'), '192.168.1.10');
  await click([...inviteForm.querySelectorAll('button')].find(node => node.textContent === 'OK'));
  assert.equal(calls.some(c => c.payload?.method === 'group-rooms.invite' && c.payload.args.address === '192.168.1.10'), true, 'the inline invitation form invites');
  await tick();
  assert.equal(clipboard.at(-1), 'FIXTURE INVITATION', 'generating an invitation copies it without a second click');
  assert.equal(clipboard.filter(value => value === 'FIXTURE INVITATION').length, 1, 'one copy per generation, not one per poll');
  assert.match(document.getElementById('page').textContent, /copied to the clipboard/, 'and the page says the copy happened');
  await click(button(document.getElementById('nav'), '+ Create'));
  await fill(input(document.querySelector('form[aria-label="Create room"]'), 'Room name'), 'New room');
  await fill(input(document.querySelector('form[aria-label="Create room"]'), 'Address other computers can reach'), '192.168.1.20');
  await pickFolder('/fixture/local');
  // Creating a room is itself the consent to receive, so nothing has to be
  // switched on first and no listener switch exists anywhere in the page.
  assert.ok(![...document.querySelectorAll('button,summary')].some(node => /接收|listening|Listening/i.test(node.textContent)), 'no listener switch exists');
  assert.equal(document.querySelector('form[aria-label="Create room"] button[type=submit]').disabled, false, 'creation needs no listener switch');
  await click(document.querySelector('form[aria-label="Create room"] button[type=submit]'));
  assert.deepEqual(calls.find(c => c.payload?.method === 'group-rooms.create').payload.args, { name: 'New room', address: '192.168.1.20', label: 'Fixture Mac', projectPath: '/fixture/local' });
  assert.match(document.querySelector('textarea[readonly]').value, /FIXTURE INVITATION/);
  // Creating a room yields its own invitation, which is copied the same way.
  assert.equal(clipboard.at(-1), 'FIXTURE INVITATION', 'creating a room copies its invitation');
  // The Copy button is still there for a machine whose clipboard refused.
  await tick();
  clipboard.length = 0;
  await click(button(document, 'Copy'));
  await tick();
  assert.equal(clipboard.at(-1), 'FIXTURE INVITATION', 'the page Copy button still copies');
  await pickFolder(null);
  assert.match(document.querySelector('[role=status]').textContent, /Selection cancelled/);
  assert.equal(input(document.querySelector('form[aria-label="Create room"]'), 'Project folder on this computer').value, '/fixture/local');
  fail = true; await click(button(document, 'Open session'));
  assert.match(document.querySelector('[role=alert]').textContent, /Room unavailable/);
  await click(button(document, 'Refresh')); assert.equal(document.querySelectorAll('[role=alert]').length, 0);
  await click(button(document, 'Leave room')); assert.equal(status.rooms.length, 1, 'leave needs explicit confirmation');
  await click(button(document, 'Confirm leave')); assert.equal(status.rooms.length, 0);
  await React.act(async () => button(document, 'Choose folder…').click());
  assert.ok(button(document, 'Choosing…'), 'a pick is in flight on unload');
  const count = calls.length;
  await React.act(async () => { dispose(); answerPick('/late'); nav.unmount(); page.unmount(); }); await tick();
  assert.equal(calls.length, count, 'a pick settling after unload never refreshes');
  assert.equal(slots.size, 0); assert.equal(styles.size, 0); assert.deepEqual(disposed, ['navigationSection', 'mainPage']);
  dom.window.close();
});

test('manifest declares main-shell action and every management call, no side panel', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.rendererActions.includes('shell.openPage')); assert.equal(manifest.ui?.panel, undefined);
  // Opening the members panel is a work-panel view, and the host refuses that
  // word unless the manifest declares it.
  assert.ok(manifest.rendererActions.includes('workPanel.openView'));
  assert.equal(manifest.contributes.views[0].id, 'members');
  assert.equal(manifest.contributes.sessionSources[0].id, 'group-rooms');
  for (const name of ['list','snapshot','context','appearance','selectDirectory','create','join','invite','open','rename','leave','remove','requestAgent','approve','revoke','configure','cancel']) assert.ok(manifest.rendererCallMethods.includes(`group-rooms.${name}`), name);
  // The members page no longer keeps a recipient list, so the method that saved
  // one is gone rather than left declared and unreachable.
  assert.ok(!manifest.rendererCallMethods.includes('group-rooms.selectTargets'));
  for (const gone of ['start','stopListener','stop']) assert.ok(!manifest.rendererCallMethods.includes(`group-rooms.${gone}`), gone);
});

test('extension lifecycle registers main UI beside the native @ trigger and unloads every slot', async () => {
  const { onLoad, onUnload } = await import('./extension.mjs');
  const slots = new Map(), styles = new Set(), calls = [];
  let subscribed = false;
  const pi = {
    ui: { injectStyle(css) { styles.add(css); return () => styles.delete(css); } },
    slots: { register(value) { assert.ok(!slots.has(value.slot)); slots.set(value.slot, value); return () => slots.delete(value.slot); } },
    composer: { subscribeDraft() { subscribed = true; return () => { subscribed = false; }; } },
    dispatch(action, payload) {
      calls.push({ action, payload });
      if (action === 'session.readContext') return Promise.resolve(null);
      if (payload.method === 'group-rooms.list') return Promise.resolve({ rooms: [], listener: null });
      if (payload.method === 'group-rooms.appearance') return Promise.resolve({ locale: 'en' });
      return Promise.resolve({});
    },
  };
  try {
    onLoad(pi); await new Promise(resolve => setTimeout(resolve, 0));
    // The composer carries no room controls any more: who runs is decided by the
    // @mention the user types, so only the '@' trigger is registered there.
    assert.deepEqual([...slots.keys()], ['mainPage', 'navigationSection', 'composerTrigger']);
    assert.equal(slots.get('composerTrigger').trigger, '@');
    assert.equal(subscribed, false, 'the extension no longer subscribes to the draft');
    onLoad(pi); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(slots.size, 3, 're-enable never duplicates registrations');
    onUnload(); const count = calls.length; await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(slots.size, 0); assert.equal(styles.size, 0); assert.equal(calls.length, count);
  } finally { onUnload(); }
});

test('a pending agent request raises a host dialog, and entering a room opens its members panel', async context => {
  const dom = new JSDOM('<!doctype html><div id="nav"></div>', { url: 'https://fixture.invalid' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const calls = [], slots = new Map();
  const member = { id: 'guest', label: 'Guest Mac', agentStatus: 'pending', online: true };
  let status = { rooms: [], listener: null, local: { label: '', address: '' }, suggestAddress: '' };
  const hostRoom = { id: 'r1', sessionId: 's1', name: 'Alpha', host: true, connected: true, projectPath: '/p', selfMemberId: 'self', members: [{ id: 'self', label: 'Me' }, member] };
  const pi = {
    ui: {
      injectStyle() { return () => {}; },
      openLayer() {
        const element = document.createElement('div');
        element.setAttribute('data-pi-plugin', 'local.group-rooms'); element.setAttribute('data-pi-layer', '');
        document.body.appendChild(element);
        return { element, close() { element.remove(); } };
      },
    },
    slots: { register(value) { slots.set(value.slot, value); return () => slots.delete(value.slot); } },
    dispatch(action, payload) {
      calls.push({ action, payload });
      if (action === 'workPanel.openView') return Promise.resolve({ ok: true });
      if (action === 'shell.openPage') return Promise.resolve({});
      const name = payload.method.slice('group-rooms.'.length);
      if (name === 'appearance') return Promise.resolve({ locale: 'en' });
      if (name === 'list') return Promise.resolve(structuredClone(status));
      if (name === 'approve') { member.agentStatus = payload.args.approved ? 'approved' : 'rejected'; return Promise.resolve({}); }
      return Promise.resolve({});
    },
  };
  // `roomView` is what tells the navigation which room this machine is inside.
  const dispose = registerMainUI(pi, () => ({ context: { sessionId: 's1' }, roomView: hostRoom }));
  context.after(async () => { await React.act(async () => { dispose(); nav.unmount(); }); dom.window.close(); });
  const nav = createRoot(document.getElementById('nav'));
  await React.act(async () => nav.render(React.createElement(slots.get('navigationSection').component))); await tick();
  // No rooms yet: nothing to approve and no panel to open.
  assert.equal(document.querySelector('.p-dialog'), null);
  status = { ...status, rooms: [structuredClone(hostRoom)] };
  // The section draws from the store, which the page's own 1.2s poll fills; the
  // section has no refresh control of its own, so the test waits one tick.
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 1400)); }); await tick();
  const dialog = document.querySelector('[data-pi-layer] .p-dialog');
  assert.ok(dialog, 'a pending request raises the host dialog');
  assert.match(dialog.textContent, /Guest Mac/);
  // Entering the room (roomView present) opens its members panel on the first
  // gesture, because the host only accepts openView inside a real input event.
  assert.equal(calls.some(c => c.action === 'workPanel.openView'), false, 'nothing opens before the user acts');
  await React.act(async () => {
    document.getElementById('nav').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  }); await tick();
  const opened = calls.filter(c => c.action === 'workPanel.openView');
  assert.equal(opened.length, 1, 'the first gesture opens the members panel once');
  assert.deepEqual(opened[0].payload, { viewId: 'members', expectedSessionId: 's1' });
  // 「Later」 dismisses without a decision and does not come back for that member.
  await React.act(async () => [...document.querySelectorAll('[data-pi-layer] .p-dialog button')].find(node => node.textContent === 'Later').click()); await tick();
  assert.equal(document.querySelector('[data-pi-layer] .p-dialog'), null, 'Later closes the dialog');
  assert.equal(calls.some(c => c.payload?.method === 'group-rooms.approve'), false, 'Later decides nothing');
  await React.act(async () => nav.render(React.createElement(slots.get('navigationSection').component))); await tick();
  assert.equal(document.querySelector('[data-pi-layer] .p-dialog'), null, 'a waved-away request stays waved away');
  // The row still says one is waiting, and the sidebar carries the way in.
  assert.match(document.querySelector('.gr-nav').textContent, /Pending/);
  assert.equal(document.querySelector('.gr-nav .gr-row-members')?.textContent, 'Members');
  dom.window.close();
});

// The host mount for a main page is a flex item; a page that establishes its own
// container contributes no intrinsic width, so the page must claim its box itself.
test('scoped style claims the mount box for the page and the navigation group', async () => {
  const { mainStyle } = await import('./main-style.mjs');
  const block = selector => {
    const at = mainStyle.indexOf(selector);
    assert.ok(at >= 0, `missing rule ${selector}`);
    const open = mainStyle.indexOf('{', at), close = mainStyle.indexOf('}', open);
    return mainStyle.slice(open + 1, close);
  };
  // Line-start anchors skip the shared `.gr-nav,.gr-page{...}` reset above.
  for (const [selector, declarations] of [
    ['\n.gr-page{', ['flex:1 1 auto', 'width:100%', 'height:100%', 'align-self:stretch', 'min-height:0', 'overflow:auto']],
    ['\n.gr-nav{', ['width:100%', 'align-self:stretch']],
  ]) {
    const body = block(selector);
    for (const declaration of declarations) assert.ok(body.includes(declaration), `${selector} needs ${declaration}`);
  }
  assert.ok(mainStyle.includes('container-type:inline-size'), 'container queries still drive the narrow layout');
  // The row's `成员` chip and its `…` button share the row, so the chip reveals
  // on the same hover as the button. They are kept apart by the button's column
  // being an in-flow flex item rather than an absolute overlay: an overlay takes
  // no width, so a reserved margin on the chip reserved nothing and the two
  // boxes overlapped. The regression is that the column keeps its box in the
  // row's own flex line, which is what a rendered-geometry run measured.
  assert.match(mainStyle, /\.gr-nav \.thread-item:hover \.gr-row-members,\.gr-nav \.thread-item:focus-within \.gr-row-members\{opacity:1\}/, 'the chip reveals with the row');
  const actions = block('\n.gr-nav .gr-row-actions{');
  assert.ok(actions.includes('position:relative') && actions.includes('flex:0 0 auto'), 'the … column keeps its own box in the row flex line');
  assert.ok(!block('\n.gr-nav .gr-row-members{').includes('margin-right'), 'the chip reserves no margin for an overlay that is not there');
  // The approval dialog is the one surface the host has to read; the host's own
  // .p-dialog shell is translucent and styles no buttons.
  assert.match(block('\n.gr-approval.p-dialog{'), /--ds-bg-elevated-opaque/, 'the approval dialog is opaque, at a specificity the host cannot outrank');
  assert.match(mainStyle, /\.gr-approval \.p-dialog__foot button\{/, 'the approval buttons are styled by the plugin');
  // The host's own destination pages reserve the absolute titlebar band; a
  // plugin mainPage that does not have its heading painted over.
  assert.match(mainStyle, /\.gr-page\{padding-top:calc\(var\(--ds-toolbar-height,46px\) \+ 8px\)\}/, 'the page reserves the titlebar band');
  assert.match(mainStyle, /@media\(max-width:600px\)\{\.gr-page\{padding:16px;padding-top:calc\(var\(--ds-toolbar-height,46px\) \+ 8px\)\}\}/, 'the narrow layout keeps the reservation');
});
