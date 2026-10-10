// Demo-only host and backend. Never imported by extension.mjs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerMainUI } from './main-ui.mjs';
const h = React.createElement, navRoot = createRoot(document.getElementById('nav')), pageRoot = createRoot(document.getElementById('page'));
let locale = 'en', failNext = false, empty = false, enabled = true, activeSession = 'demo-session', nextId = 2;
const rooms = [{ id: 'demo-room', sessionId: 'demo-session', name: 'Design review / 主界面协作 — a long room name that wraps', host: true, connected: true, projectPath: '/Volumes/Shared NAS/团队项目/a-long-locally-mounted-project-directory', selfMemberId: 'demo-member', members: [{ id: 'demo-member', label: 'My Mac' }, { id: 'demo-peer', label: 'Studio PC' }] }];
let listener = null, Page;
function native() { pageRoot.render(h('div', { className: 'demo-native' }, h('h2', null, 'Native chat destination · demo placeholder'), h('p', null, 'The plugin does not render a transcript or message input. In PI-Desktop this room opens the existing native session.'))); }
const pi = {
  ui: { injectStyle(css) { const style = document.createElement('style'); style.textContent = css; document.head.append(style); return () => style.remove(); } },
  slots: { register(registration) {
    if (registration.slot === 'mainPage') { Page = registration.component; return () => { Page = null; native(); }; }
    navRoot.render(h(registration.component)); return () => navRoot.render(null);
  } },
  dispatch(action, payload) {
    if (action === 'shell.openPage') { pageRoot.render(h(Page)); return Promise.resolve({}); }
    const name = payload.method.replace('group-rooms.', ''), args = payload.args;
    if (name === 'list') return Promise.resolve({ label: 'My Mac', listener, rooms: empty ? [] : structuredClone(rooms) });
    if (name === 'appearance') return Promise.resolve({ locale });
    if (failNext) { failNext = false; return Promise.reject({ code: 'UNAVAILABLE' }); }
    return new Promise((resolve, reject) => setTimeout(() => {
      let result = {};
      switch (name) {
        case 'selectDirectory': result = { path: '/demo/local-project', name: 'local-project' }; break;
        case 'create': case 'invite': listener ??= { port: 47018 }; break;
        case 'open': activeSession = rooms.find(room => room.id === args.roomId)?.sessionId; native(); break;
        case 'rename': rooms.find(room => room.id === args.roomId).name = args.name; break;
        case 'leave': {
          rooms.splice(rooms.findIndex(room => room.id === args.roomId), 1);
          if (!rooms.some(room => room.host)) listener = null;
          break;
        }
        case 'invite': result = { invitation: `DEMO INVITATION · ${args.roomId} · ${args.address}` }; break;
        case 'create': case 'join': {
          const id = `demo-${nextId++}`;
          rooms.push({ id, sessionId: id, name: args.name || 'Joined demo room', projectPath: args.projectPath, connected: true, host: name === 'create', selfMemberId: 'demo-member', members: [{ id: 'demo-member', label: args.label }] });
          empty = false; result = { roomId: id, invitation: name === 'create' ? `DEMO INVITATION · ${id}` : undefined }; break;
        }
        default: reject({ code: 'METHOD_NOT_FOUND' }); return;
      }
      resolve(result);
    }, 200));
  },
};
let dispose = registerMainUI(pi, () => ({ context: { sessionId: activeSession } }));
pageRoot.render(h(Page));
document.getElementById('enable').onclick = event => { enabled = !enabled; if (enabled) { dispose = registerMainUI(pi, () => ({ context: { sessionId: activeSession } })); pageRoot.render(h(Page)); } else dispose(); event.target.textContent = enabled ? 'Disable extension' : 'Enable extension'; };
document.getElementById('theme').onclick = () => document.documentElement.toggleAttribute('data-dark');
document.getElementById('empty').onclick = () => { empty = !empty; };
document.getElementById('error').onclick = () => { failNext = true; };
document.getElementById('language').onclick = () => { locale = locale === 'en' ? 'zh-CN' : 'en'; };
window.addEventListener('beforeunload', () => dispose());
