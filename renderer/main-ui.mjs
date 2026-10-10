import React from 'react';
import { createPortal } from 'react-dom';
import { method, text, errorText, roomState, roomStateText } from './shared.mjs';
import { mainStyle } from './main-style.mjs';
const h = React.createElement;

// One store per extension lifetime: both main-shell slots share status and actions.
export function registerMainUI(pi, getNativeState) {
  let live = true, generation = 0, reading = false;
  let state = { status: null, loading: true, busy: false, error: '', notice: '', mode: 'create', request: 0, locale: 'zh-CN', invitation: '', picking: null, picked: null };
  const listeners = new Set();
  const call = (name, args = {}) => pi.dispatch('plugin.call', { method: method(name), args });
  const patch = values => { if (live) { state = { ...state, ...values }; listeners.forEach(fn => fn(state)); } };
  const t = (zh, en) => text(state.locale, zh, en);
  function useView() {
    const [view, setView] = React.useState(state);
    React.useEffect(() => { listeners.add(setView); setView(state); return () => listeners.delete(setView); }, []);
    return view;
  }
  // A folder pick cannot answer the call that starts it: the host times
  // `plugin.call` out after 2s and a human choosing a folder takes longer. The
  // backend runs the native dialog in the background and this page reads the
  // answer on its own 1.2s read-only status poll, which never waits on it.
  function settlePick(status) {
    const picker = status?.picker;
    if (!picker) return {};
    // Adopt a pick this page did not start (a reload while the dialog was open)
    // so the button stays disabled until its answer arrives.
    if (picker.pending) return state.picking ? {} : { picking: { requestId: picker.requestId, mode: state.mode } };
    if (!state.picking || picker.requestId !== state.picking.requestId) return {};
    if (picker.error) return { picking: null, picked: null, error: errorText({ code: picker.error }, state.locale), notice: '' };
    return {
      picking: null,
      picked: { mode: state.picking.mode, path: picker.path ?? null },
      notice: picker.path ? t('文件夹已选择。', 'Folder selected.') : t('已取消选择，保留原文件夹。', 'Selection cancelled; previous folder kept.')
    };
  }
  async function refresh(manual = false) {
    if (!live || reading || state.busy) return;
    reading = true; const token = generation;
    if (manual) patch({ loading: true, error: '' });
    try {
      const [status, appearance] = await Promise.all([call('list'), call('appearance').catch(() => null)]);
      if (!live || token !== generation) return;
      patch({ status, loading: false, error: manual || !state.status ? '' : state.error, ...(appearance?.locale ? { locale: appearance.locale } : {}), ...(manual ? { notice: t('已刷新。', 'Refreshed.') } : {}), ...settlePick(status) });
    } catch (error) {
      if (live && token === generation) patch({ status: null, loading: false, error: errorText(error, state.locale) });
    } finally { reading = false; }
  }
  async function action(name, args = {}, success, callback) {
    if (!live || state.busy) return;
    generation++; patch({ busy: true, loading: false, error: '', notice: t('正在处理…', 'Working…') });
    try {
      const result = await call(name, args);
      if (!live) return;
      patch({ notice: success || t('已完成。', 'Done.') });
      callback?.(result);
      const status = await call('list');
      if (live) patch({ status, loading: false });
    } catch (error) {
      if (live) patch({ error: errorText(error, state.locale), notice: '' });
    } finally { patch({ busy: false }); }
  }
  // An invitation is the one thing this plugin produces for the world outside
  // the app: it is useless until it is pasted into another computer. The
  // renderer's own clipboard API is the reliable path (the host's copy buttons
  // use it too); a detached field plus the command copy is the fallback. Both
  // are attempted for real, and a failure is reported as a failure — never
  // softened into a notice claiming a copy that did not happen.
  //
  // The field is detached rather than borrowed from the page: generating an
  // invitation from the sidebar row must copy even while the management page
  // that owns the visible invitation field is not mounted at all.
  async function copyText(value) {
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
    } catch { /* A refused write falls through to the command copy. */ }
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '-1000px';
    field.style.opacity = '0';
    document.body.appendChild(field);
    try {
      field.select();
      return typeof document.execCommand === 'function' && document.execCommand('copy') === true;
    } catch { return false; } finally { field.remove(); }
  }
  // Generating an invitation is only ever done to hand it to another computer,
  // so the copy rides the generation instead of asking for a second click. The
  // page still offers its own 「复制」 for the case where the clipboard refused.
  //
  // The answer is shown wherever the action was taken, and the sidebar is one of
  // those places: an invitation made from a room row used to report its success
  // into a management page that was not even mounted, so the one thing the user
  // needed to know — did it reach the clipboard — was invisible. The line is also
  // given an end, because a leftover confirmation sitting under the room list
  // reads as a current state rather than a message about a finished action.
  function deliverInvitation(result) {
    const value = result?.invitation ?? '';
    patch({ invitation: value });
    if (!value) return;
    void copyText(value).then(copied => {
      const line = copied
        ? text(state.locale, '邀请码已生成并复制到剪贴板。', 'Invitation created and copied to the clipboard.')
        : text(state.locale, '邀请码已生成。请点「复制」，或手动选中内容复制。', 'Invitation created. Use Copy, or select the text and copy it yourself.');
      patch({ notice: line, error: '' });
      setTimeout(() => { if (state.notice === line) patch({ notice: '' }); }, 10000);
    });
  }
  // A plugin's injected CSS is scoped to its own slot mounts (`@scope
  // ([data-pi-plugin="local.group-rooms"])`), so a menu portalled to
  // `document.body` arrives with none of the styles below and is invisible.
  // `pi.ui.openLayer` hands back a zero-size, viewport-fixed element that
  // carries this plugin's style scope and stacks above the app's own dialogs,
  // which is where every floating surface here portals. The element has no
  // size of its own, so a fixed child still positions against the viewport.
  function useLayer() {
    const [element, setElement] = React.useState(null);
    React.useEffect(() => {
      let layer;
      try { layer = pi.ui.openLayer(); } catch { return undefined; }
      setElement(layer.element);
      return () => layer.close();
    }, []);
    return element;
  }
  // The sidebar clips its rows (`overflow: hidden`) and a plugin gets no host
  // context-menu component, so the row menu is portalled into the layer and
  // positioned against the button's viewport rect. The sidebar sets no
  // `transform`, so a fixed box resolves to the viewport; a host that ever adds
  // one would offset this menu.
  function RoomRowMenu({ view, room, anchor, onClose, onForm }) {
    const tr = (zh, en) => text(view.locale, zh, en);
    const layer = useLayer();
    const ref = React.useRef(null);
    const [left, setLeft] = React.useState(anchor?.left ?? 0);
    const [top, setTop] = React.useState((anchor?.bottom ?? 0) + 4);
    const [confirm, setConfirm] = React.useState(false);
    // `layer` is a dependency, not just `anchor`: the portal target only exists
    // on the commit after `useLayer` resolves, so a first layout pass has no node
    // to measure. Without this the menu keeps its pre-measure position and never
    // clamps to the viewport or flips above a row near the bottom edge.
    React.useLayoutEffect(() => {
      const node = ref.current;
      if (!node || !anchor) return;
      const rect = node.getBoundingClientRect();
      setLeft(Math.max(4, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 4)));
      setTop(anchor.bottom + rect.height + 4 > window.innerHeight ? Math.max(4, anchor.top - rect.height - 4) : anchor.bottom + 4);
      node.querySelector('button')?.focus();
    }, [anchor, layer]);
    React.useEffect(() => {
      const onKey = event => { if (event.key === 'Escape') onClose(); };
      // The row's own `…` button is left alone: this handler runs on the capture
      // phase, before the button's click, so closing here would make the toggle
      // reopen itself instead of closing.
      const onDown = event => { if (event.target?.closest?.('.gr-row-more')) return; if (!ref.current?.contains(event.target)) onClose(); };
      const onScroll = () => onClose();
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll, true);
      return () => {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('mousedown', onDown, true);
        document.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll, true);
      };
    }, []);
    const item = (label, run, options = {}) => h('button', {
      type: 'button', role: 'menuitem', className: options.danger ? 'danger' : undefined, disabled: options.disabled || view.busy,
      'aria-label': label, onClick: () => run(),
    }, label);
    const choose = run => () => { onClose(); run(); };
    if (!layer) return null;
    return createPortal(h('div', { className: 'gr-menu', role: 'menu', ref, style: { left, top }, 'aria-label': tr('房间操作', 'Room actions') },
      item(tr('打开会话', 'Open session'), choose(() => action('open', { roomId: room.id }, tr('已打开原生会话。', 'Native session opened.')))),
      item(tr('房间成员', 'Room members'), choose(() => openMembers())),
      item(tr('重命名…', 'Rename…'), choose(() => onForm({ kind: 'rename', value: room.name })), { disabled: !room.host }),
      item(tr('生成邀请码…', 'Create invitation…'), choose(() => onForm({ kind: 'invite', value: view.status?.local?.address || view.status?.suggestAddress || '' })), { disabled: !room.host }),
      h('div', { className: 'gr-menu-sep', role: 'separator' }),
      item(tr('离开房间', 'Leave room'), choose(() => action('leave', { roomId: room.id }, tr('已离开房间。', 'Left the room.')))),
      confirm
        ? item(tr('确认删除？', 'Confirm delete?'), choose(() => action('remove', { roomId: room.id }, tr('已删除房间。', 'Room deleted.'))), { danger: true })
        : item(tr('删除房间', 'Delete room'), () => setConfirm(true), { danger: true })), layer);
  }
  // The host refuses `workPanel.openView` unless it is dispatched inside a real
  // input event of the user's (`PLUGIN_DRAFT_REMOTE` otherwise), so this is only
  // ever called straight from a gesture: a menu click, or the one-shot
  // enter-the-room gesture below. It also requires the room's session to be the
  // active one, so it never forces a switch behind the user's back.
  function openMembers() {
    if (!live) return;
    const context = getNativeState()?.context;
    if (!context?.sessionId) return;
    try {
      Promise.resolve(pi.dispatch('workPanel.openView', { viewId: 'members', expectedSessionId: context.sessionId }))
        .catch(() => undefined);
    } catch { /* A stale session or a missing declaration leaves the panel closed. */ }
  }
  function openPage(mode) {
    if (!live) return;
    patch({ ...(mode ? { mode } : {}), request: state.request + 1, error: '' });
    // Must be synchronous in the click gesture. No backend/read await before dispatch.
    try {
      Promise.resolve(pi.dispatch('shell.openPage', { pageId: 'rooms' }))
        .catch(error => patch({ error: errorText(error, state.locale) }));
    } catch (error) { patch({ error: errorText(error, state.locale) }); }
  }
  // Renaming and inviting are one-line jobs, so the row menu opens a small
  // inline form instead of sending the user to the management page.
  function RoomRowForm({ view, room, anchor, form, onClose }) {
    const tr = (zh, en) => text(view.locale, zh, en);
    const layer = useLayer();
    const [value, setValue] = React.useState(form.value);
    const ref = React.useRef(null);
    const [left, setLeft] = React.useState(anchor?.left ?? 0);
    const [top, setTop] = React.useState((anchor?.bottom ?? 0) + 4);
    // `layer` belongs in the deps for the same reason as the menu's: on the
    // first commit there is no portalled node to measure yet.
    React.useLayoutEffect(() => {
      const node = ref.current;
      if (!node || !anchor) return;
      const rect = node.getBoundingClientRect();
      setLeft(Math.max(4, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 4)));
      setTop(anchor.bottom + rect.height + 4 > window.innerHeight ? Math.max(4, anchor.top - rect.height - 4) : anchor.bottom + 4);
    }, [anchor, layer]);
    React.useEffect(() => {
      const onKey = event => { if (event.key === 'Escape') onClose(); };
      const onDown = event => { if (event.target?.closest?.('.gr-row-more')) return; if (!ref.current?.contains(event.target)) onClose(); };
      const onScroll = () => onClose();
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll, true);
      return () => {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('mousedown', onDown, true);
        document.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll, true);
      };
    }, []);
    const label = form.kind === 'rename' ? tr('房间名称', 'Room name') : tr('其他电脑可连接的地址', 'Address other computers can reach');
    if (!layer) return null;
    return createPortal(h('form', { className: 'gr-menu gr-menu-form', ref, style: { left, top }, role: 'dialog', 'aria-label': label,
      onSubmit: event => {
        event.preventDefault();
        const next = value.trim(); if (!next || view.busy) return;
        onClose();
        if (form.kind === 'rename') action('rename', { roomId: room.id, name: next }, tr('名称已保存。', 'Name saved.'));
        else action('invite', { roomId: room.id, address: next }, tr('正在生成邀请码…', 'Creating an invitation…'), deliverInvitation);
      } },
      h('input', { value, onChange: event => setValue(event.target.value), autoFocus: true, maxLength: 256, 'aria-label': label, placeholder: form.kind === 'rename' ? undefined : '192.168.1.10', autoComplete: 'off' }),
      h('div', { className: 'gr-page-actions' },
        h('button', { type: 'submit', disabled: view.busy || !value.trim() }, tr('确定', 'OK')),
        h('button', { type: 'button', onClick: onClose }, tr('取消', 'Cancel')))), layer);
  }
  // A member's agent request lands as `pending` until the host approves it, and
  // the host is the one person who can act on it. The sidebar row says so
  // quietly; this is the part that makes sure it is seen. One room at a time,
  // newest request first, and 「稍后」 is remembered for that member so the
  // dialog comes back only for a request the host has not seen.
  function PendingApproval({ view, room, member, onDismiss, onOpenMembers }) {
    const tr = (zh, en) => text(view.locale, zh, en);
    const layer = useLayer();
    const ref = React.useRef(null);
    React.useLayoutEffect(() => { ref.current?.querySelector('button')?.focus(); }, []);
    React.useEffect(() => {
      const onKey = event => { if (event.key === 'Escape') onDismiss(member.id); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, []);
    if (!layer) return null;
    // No host action is taken here: this asks the host to act, and the two
    // buttons hand the job to the members panel rather than deciding for it.
    const decide = approved => { onDismiss(member.id); action('approve', { roomId: room.id, memberId: member.id, approved }, approved ? tr('已批准该成员的助手。', 'Agent access approved.') : tr('已拒绝该成员的助手。', 'Agent access declined.'), () => onOpenMembers()); };
    return createPortal(h('div', { className: 'p-overlay', role: 'presentation' },
      h('div', { className: 'p-dialog gr-approval', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gr-approval-title', ref },
        h('div', { className: 'p-dialog-head' }, h('span', { id: 'gr-approval-title' }, tr('有助手申请待批准', 'An agent request needs your approval'))),
        h('div', { className: 'p-dialog__body' },
          h('p', { className: 'gr-page-small' }, tr(`「${member.label}」申请在这台电脑上运行助手。批准后，房间里 @ 它才会真正执行。`, `“${member.label}” asks to run an agent on this computer. Approve it and an @mention in the room will actually run here.`)),
          h('p', { className: 'gr-page-small' }, tr(`房间：${room.name}`, `Room: ${room.name}`))),
        h('div', { className: 'p-dialog__foot' },
          h('button', { type: 'button', onClick: () => onDismiss(member.id) }, tr('稍后', 'Later')),
          h('button', { type: 'button', onClick: () => decide(false) }, tr('拒绝', 'Decline')),
          h('button', { type: 'button', className: 'primary', onClick: () => decide(true) }, tr('批准', 'Approve'))))), layer);
  }
  function NavigationSection() {
    const view = useView(), native = getNativeState();
    const tr = (zh, en) => text(view.locale, zh, en);
    const [menu, setMenu] = React.useState(null);
    const [form, setForm] = React.useState(null);
    // Entering a room opens its members panel once. The host requires the
    // openView dispatch to ride a real input event, and there is none at the
    // moment the room's session becomes active (creating or joining is async),
    // so the panel waits for the first thing the user does on arrival — a click
    // on the composer opens it, which is when it is useful anyway.
    //
    // The trigger is the *session* the sidebar is showing, not the room the
    // store has resolved: knowing which room that session belongs to takes a
    // 1.2s poll, and a user who lands in a room presses something well inside
    // that window, so waiting for the room would arm the one-shot after the very
    // gesture it was meant to catch.
    const autoOpened = React.useRef('');
    const nativeSessionId = native.context?.sessionId ?? '';
    React.useEffect(() => {
      if (!nativeSessionId || autoOpened.current === nativeSessionId) return;
      autoOpened.current = nativeSessionId;
      const kinds = ['pointerdown', 'keydown'];
      const options = { capture: true, once: true };
      let timer, spent = false;
      // One gesture, one dispatch. `once` counts per listener, so registering
      // this same handler for two event kinds would let a single click fire it
      // twice: the host reuses one singleton tab per plugin view, so the second
      // dispatch would re-open the panel with no view behind it and the members
      // view would never appear. `openMembers` only dispatches when the active
      // session is one of this plugin's rooms, so a click on a non-room session
      // spends the one-shot and opens nothing.
      const onGesture = () => {
        if (spent) return;
        spent = true;
        for (const kind of kinds) document.removeEventListener(kind, onGesture, options);
        clearTimeout(timer);
        openMembers();
      };
      for (const kind of kinds) document.addEventListener(kind, onGesture, options);
      timer = setTimeout(() => { for (const kind of kinds) document.removeEventListener(kind, onGesture, options); }, 15000);
      return () => { clearTimeout(timer); for (const kind of kinds) document.removeEventListener(kind, onGesture, options); };
    }, [nativeSessionId]);
    const [approval, setApproval] = React.useState(null);
    const dismissed = React.useRef(new Set());
    // A host's own room is the only one with approvals to give, and a member
    // asking again after a decline is a fresh request worth showing again.
    const pending = (view.status?.rooms ?? []).filter(room => room.host).flatMap(room =>
      (room.members ?? []).filter(member => member.agentStatus === 'pending' && member.id !== room.selfMemberId).map(member => ({ room, member })));
    const pendingKey = pending.map(({ room, member }) => `${room.id}:${member.id}`).join('|');
    React.useEffect(() => {
      const next = pending.find(({ room, member }) => !dismissed.current.has(`${room.id}:${member.id}`));
      setApproval(next ?? null);
    }, [pendingKey]);
    const dismiss = memberId => { if (approval) dismissed.current.add(`${approval.room.id}:${memberId}`); setApproval(null); };
    const openMenu = (room, event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setForm(null);
      setMenu(previous => previous?.roomId === room.id ? null : { roomId: room.id, anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } });
    };
    const menuRoom = menu ? view.status?.rooms?.find(room => room.id === menu.roomId) : null;
    const formRoom = form ? view.status?.rooms?.find(room => room.id === form.roomId) : null;
    return h('section', { className: 'sidebar-session-group gr-nav', 'aria-label': tr('群聊', 'Group Rooms') },
      h('div', { className: 'sidebar-list-toolbar sidebar-list-toolbar-secondary' },
        h('button', { type: 'button', className: 'sidebar-list-label gr-nav-heading', onClick: () => openPage(), title: tr('管理群聊房间', 'Manage group rooms') }, tr('群聊', 'Group Rooms'))),
      h('div', { className: 'gr-nav-actions' },
        h('button', { type: 'button', onClick: () => openPage('create') }, tr('＋ 创建', '+ Create')),
        h('button', { type: 'button', onClick: () => openPage('join') }, tr('加入', 'Join'))),
      h('div', { className: 'sidebar-session-group-list', 'aria-busy': view.loading || view.busy },
        view.loading && !view.status ? h('p', { className: 'gr-nav-status', role: 'status' }, tr('正在加载…', 'Loading…')) : null,
        view.status?.rooms?.map(room => {
          const selected = room.sessionId === native.context?.sessionId;
          return h('div', { key: room.id, className: `thread-item${selected ? ' active' : ''}` },
            h('button', { type: 'button', className: 'thread-item-main', disabled: view.busy,
              'aria-current': selected ? 'page' : undefined,
              title: `${room.name} · ${roomStateText(room, view.locale)}`,
              onClick: () => action('open', { roomId: room.id }, tr('已打开原生会话。', 'Native session opened.')) },
            h('span', { className: `gr-dot${roomState(room) === 'connected' ? ' online' : roomState(room) === 'revoked' ? ' revoked' : ''}`, 'aria-hidden': true }),
            h('span', { className: 'thread-item-title' }, room.name),
            // A pending request stays visible on the room after the dialog is
            // waved away, so the host can always see there is one waiting.
            // The members panel is a tool of the room's own session, so the row
            // for the room this machine is currently in carries the way to it —
            // as a labelled chip that keeps its own column and only at hover, so
            // it never collides with the title or the more button beside it.
            selected ? h('span', { className: 'gr-row-members', role: 'button', tabIndex: 0,
              'aria-label': tr('打开房间成员', 'Open room members'), title: tr('房间成员', 'Room members'),
              onClick: event => { event.stopPropagation(); openMembers(); },
              onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMembers(); } } },
              tr('成员', 'Members')) : null,
            room.host && (room.members ?? []).some(member => member.agentStatus === 'pending' && member.id !== room.selfMemberId)
              ? h('span', { className: 'gr-row-pending' }, tr('待批准', 'Pending')) : null),
            h('div', { className: 'gr-row-actions' },
              h('button', { type: 'button', className: 'gr-row-more', disabled: view.busy,
                'aria-haspopup': 'menu', 'aria-expanded': menu?.roomId === room.id,
                'aria-label': tr(`房间操作：${room.name}`, `Room actions: ${room.name}`),
                title: tr('房间操作', 'Room actions'), onClick: event => openMenu(room, event) }, '⋯')));
        }),
        view.status && !view.status.rooms?.length ? h('p', { className: 'gr-nav-status' }, tr('还没有房间', 'No rooms yet')) : null),
      view.error ? h('div', { className: 'gr-nav-status', role: 'alert' }, view.error,
        h('button', { type: 'button', className: 'gr-nav-heading', disabled: view.busy || view.loading, onClick: () => refresh(true) }, tr('重试', 'Retry'))) : null,
      // The row menu does its work here, so its answer has to land here too: an
      // invitation's copy report was written only to the management page, which
      // is not mounted when the menu is used from the sidebar.
      !view.error && view.notice ? h('div', { className: 'gr-nav-status', role: 'status', 'aria-live': 'polite' }, view.notice) : null,
      menuRoom ? h(RoomRowMenu, { view, room: menuRoom, anchor: menu.anchor, onClose: () => setMenu(null), onForm: values => setForm({ roomId: menuRoom.id, anchor: menu.anchor, ...values }) }) : null,
      formRoom ? h(RoomRowForm, { view, room: formRoom, anchor: form.anchor, form, onClose: () => setForm(null) }) : null,
      approval ? h(PendingApproval, { view, room: approval.room, member: approval.member, onDismiss: dismiss, onOpenMembers: () => openMembers() }) : null);
  }
  function RoomCard({ room, view, index }) {
    const tr = (zh, en) => text(view.locale, zh, en);
    const [name, setName] = React.useState(room.name), [address, setAddress] = React.useState(''), [leaving, setLeaving] = React.useState(false);
    React.useEffect(() => { setName(room.name); }, [room.name]);
    // Prefill the address the way the row menu does: the remembered value wins,
    // then this machine's probe. A field the user already typed in is untouched.
    React.useEffect(() => {
      const suggested = view.status?.local?.address || view.status?.suggestAddress || '';
      if (suggested) setAddress(previous => previous || suggested);
    }, [view.status]);
    const field = (label, node) => h('label', null, h('span', null, label), node);
    const submit = (event, fn) => { event.preventDefault(); if (!view.busy) fn(); };
    return h('article', { className: 'gr-page-room', style: { '--delay': `${Math.min(index, 4) * 24}ms` } },
      h('div', { className: 'gr-page-row' }, h('h3', null, room.name), h('span', { className: `gr-page-badge${roomState(room) === 'revoked' ? ' revoked' : ''}` }, roomStateText(room, view.locale))),
      // A removed room still shows its history, so the card explains why it is
      // silent instead of leaving the user to guess from a bare badge.
      roomState(room) === 'revoked' ? h('p', { className: 'gr-page-small', role: 'status' }, tr('这台电脑已被房主移出房间。房间历史仍可查看，但无法再发送或运行助手。', 'The host removed this computer from the room. Its history stays readable, but it can no longer send or run agents.')) : null,
      h('p', { className: 'gr-page-small' }, `${room.members?.length ?? 0} ${tr('位成员', 'members')} · ${room.host ? tr('房主', 'Host') : tr('成员', 'Member')}`),
      h('p', { className: 'gr-page-small' }, room.projectPath),
      h('div', { className: 'gr-page-actions' },
        h('button', { type: 'button', disabled: view.busy, onClick: () => action('open', { roomId: room.id }, tr('已打开原生会话。', 'Native session opened.')) }, tr('打开会话', 'Open session')),
        room.sessionId === getNativeState()?.context?.sessionId
          ? h('button', { type: 'button', disabled: view.busy, onClick: () => openMembers() }, tr('房间成员', 'Room members'))
          : null),
      h('details', null, h('summary', null, tr('房间设置', 'Room settings')),
        h('div', { className: 'gr-page-stack' },
          h('form', { className: 'gr-page-stack', onSubmit: event => submit(event, () => action('rename', { roomId: room.id, name: name.trim() })) },
            field(tr('房间名称', 'Room name'), h('input', { value: name, onChange: event => setName(event.target.value), required: true, maxLength: 256, disabled: !room.host || view.busy })),
            h('div', { className: 'gr-page-actions' }, h('button', { type: 'submit', disabled: !room.host || view.busy || !name.trim() || name.trim() === room.name }, tr('保存名称', 'Save name')))),
          room.host ? h('form', { className: 'gr-page-stack', onSubmit: event => submit(event, () => action('invite', { roomId: room.id, address: address.trim() }, tr('正在生成邀请码…', 'Creating an invitation…'), deliverInvitation)) },
            field(tr('其他电脑可连接的地址', 'Address other computers can reach'), h('input', { value: address, onChange: event => setAddress(event.target.value), required: true, placeholder: '192.168.1.10', autoComplete: 'off', disabled: view.busy })),
            h('div', { className: 'gr-page-actions' }, h('button', { type: 'submit', disabled: view.busy || !address.trim() }, tr('生成邀请', 'Create invitation')))) : null,
          leaving ? h('div', { className: 'gr-page-stack', role: 'group', 'aria-label': tr('确认离开房间', 'Confirm leaving room') },
            h('p', null, tr('离开此房间？可使用邀请重新加入。', 'Leave this room? You can rejoin with an invitation.')),
            h('div', { className: 'gr-page-actions' },
              h('button', { type: 'button', className: 'danger', disabled: view.busy, onClick: () => action('leave', { roomId: room.id }, tr('已离开房间。', 'Left the room.')) }, tr('确认离开', 'Confirm leave')),
              h('button', { type: 'button', disabled: view.busy, onClick: () => setLeaving(false) }, tr('取消', 'Cancel'))))
            : h('div', { className: 'gr-page-actions' }, h('button', { type: 'button', className: 'danger', disabled: view.busy, onClick: () => setLeaving(true) }, tr('离开房间', 'Leave room'))))));
  }
  function RoomsPage() {
    const view = useView(), tr = (zh, en) => text(view.locale, zh, en);
    const [identity, setIdentity] = React.useState('');
    const [drafts, setDrafts] = React.useState({ create: { name: '', address: '', path: '' }, join: { invitation: '', path: '' } });
    // No listening switch exists: creating a room arms the listener, and
    // leaving the last hosted room retires it again.
    const invitationRef = React.useRef(null), createRef = React.useRef(null), joinRef = React.useRef(null), refreshRef = React.useRef(null);
    // A room that still holds this machine's member row is the strongest record
    // of its name; a machine with no room yet falls back to the name it last
    // used, so Create/Join never ask for it twice.
    const storedIdentity = view.status?.rooms?.flatMap(room => room.members?.filter(member => member.id === room.selfMemberId) ?? [])[0]?.label || view.status?.local?.label || view.status?.label;
    const seeded = React.useRef(false);
    React.useEffect(() => { if (view.request && !view.loading && !view.busy) (view.mode === 'create' ? createRef : joinRef).current?.focus(); }, [view.request, view.mode, view.loading]);
    React.useEffect(() => { if (storedIdentity) setIdentity(previous => previous || storedIdentity); }, [storedIdentity]);
    // Seed the address once, at the first answer: the remembered value wins over
    // the probe, and neither may overwrite something the user is already typing.
    React.useEffect(() => {
      if (seeded.current || !view.status) return;
      seeded.current = true;
      const suggested = view.status.local?.address || view.status.suggestAddress || '';
      if (suggested) setDrafts(previous => previous.create.address ? previous : { ...previous, create: { ...previous.create, address: suggested } });
    }, [view.status]);
    // The invitation is copied the moment it is generated (see
    // `deliverInvitation`), so the panel is a record of what was handed out, not
    // a step the user has to complete. It deliberately does not grab focus: the
    // submission that produced it is already opening the room's session.
    // The poll settles a pick outside this component's own state, so the draft
    // catches up from the shared store instead of a callback.
    React.useEffect(() => {
      if (!view.picked) return;
      const { mode: pickedMode, path } = view.picked;
      setDrafts(previous => ({ ...previous, [pickedMode]: { ...previous[pickedMode], path: path ?? previous[pickedMode].path } }));
      patch({ picked: null });
    }, [view.picked]);
    const disabled = view.busy || !view.status || view.loading, mode = view.mode, draft = drafts[mode];
    const update = (key, value) => setDrafts(previous => ({ ...previous, [mode]: { ...previous[mode], [key]: value } }));
    const field = (label, node) => h('label', null, h('span', null, label), node);
    function copyInvitation() {
      const value = state.invitation;
      if (!value) return;
      void copyText(value).then(copied => patch(copied
        ? { notice: tr('已复制到剪贴板。', 'Copied to the clipboard.'), error: '' }
        : { notice: '', error: tr('复制失败，请手动选中后复制。', 'Copy failed. Select the text and copy it.') }));
    }
    function chooseFolder() {
      const requestedMode = mode;
      if (state.picking) return;
      // Starts the pick and returns at once; the poll above delivers the answer.
      // Never through `action`: that would mark the page busy, and a busy page
      // stops polling, which is the one thing the answer depends on.
      patch({ error: '', notice: tr('请在系统窗口中选择文件夹。', 'Choose a folder in the system window.') });
      void call('selectDirectory', {}).then(started => {
        if (!live) return;
        patch({ picking: { requestId: started?.requestId ?? '', mode: requestedMode } });
      }, error => { if (live) patch({ error: errorText(error, state.locale), notice: '' }); });
    }
    function submit(event) {
      event.preventDefault();
      if (disabled || !identity.trim() || !draft.path) return;
      const args = { label: identity.trim(), projectPath: draft.path, ...(mode === 'create' ? { name: draft.name.trim(), address: draft.address.trim() } : { invitation: draft.invitation.trim() }) };
      void action(mode, args, tr('房间已就绪，正在打开会话…', 'Room ready. Opening its session…'), result => {
        if (mode === 'create') patch({ invitation: result?.invitation ?? '' });
        else setDrafts(previous => ({ ...previous, join: { invitation: '', path: previous.join.path } }));
        // Create/Join used to land back on this page and make the user click
        // 「打开会话」 a second time. `session/open` needs no click gesture of its
        // own, so the room is entered straight from the same submission; it goes
        // through `call` and not `action` so the page's busy flag is untouched.
        if (result?.roomId) void call('open', { roomId: result.roomId }).catch(error => { if (live) patch({ error: errorText(error, state.locale), notice: '' }); });
      });
    }
    return h('div', { className: 'gr-page' }, h('div', { className: 'gr-page-inner' },
      h('header', { className: 'gr-page-header' },
        h('div', null, h('h1', null, tr('群聊', 'Group Rooms')), h('p', null, tr('创建或加入房间，在原生会话中聊天。', 'Create or join a room. Chat in the native session.'))),
        h('button', { type: 'button', ref: refreshRef, disabled: view.busy || view.loading, onClick: () => refresh(true) }, tr('刷新', 'Refresh'))),
      view.error || view.notice ? h('div', { className: `gr-page-notice${view.error ? ' error' : ''}`, role: view.error ? 'alert' : 'status', 'aria-live': 'polite' }, view.error || view.notice) : null,
      h('div', { className: 'gr-page-grid' },
        h('div', null,
          h('section', { className: 'gr-page-section' }, h('h2', null, tr('这台电脑', 'This computer')),
            field(tr('成员名称', 'Member name'), h('input', { value: identity, onChange: event => setIdentity(event.target.value), required: true, maxLength: 256, autoComplete: 'nickname', readOnly: Boolean(view.status?.rooms?.length), disabled })),
            h('p', { className: 'gr-page-small' }, tr('每台电脑一个身份；助手能力属于该成员。', 'One identity per computer. Agent access belongs to that member.')),
            view.status?.rooms?.some(room => room.host)
              ? h('p', { className: 'gr-page-small', role: 'status' },
                view.status.listenerError
                  ? tr(`未能恢复接收连接：${view.status.listenerError}`, `Incoming connections could not be restored: ${view.status.listenerError}`)
                  : view.status.listener
                    ? tr(`正在接收 · 端口 ${view.status.listener.port}`, `Receiving · port ${view.status.listener.port}`)
                    : tr('正在准备接收连接…', 'Preparing incoming connections…'))
              : h('p', { className: 'gr-page-small' }, tr('创建房间时会自动开始接收连接，其他电脑才能连上这台电脑。', 'Creating a room starts incoming connections automatically, so other computers can reach this one.')),
            view.status?.listenerNotice
              ? h('p', { className: 'gr-page-small', role: 'alert' }, tr(`接收端口已从 ${view.status.listenerNotice.from} 变为 ${view.status.listenerNotice.to}（原端口被占用）。之前发出去的邀请串已失效，请重新生成邀请。`, `The receiving port changed from ${view.status.listenerNotice.from} to ${view.status.listenerNotice.to} (the old port was taken). Invitations you already shared no longer work — create a new one.`))
              : null),
          h('section', { className: 'gr-page-section' },
            h('div', { className: 'gr-page-tabs', role: 'group', 'aria-label': tr('创建或加入', 'Create or join') },
              ['create', 'join'].map(kind => h('button', { key: kind, type: 'button', 'aria-pressed': mode === kind, disabled: view.busy, onClick: () => patch({ mode: kind }) }, kind === 'create' ? tr('创建房间', 'Create room') : tr('加入房间', 'Join room')))),
            h('form', { className: 'gr-page-stack', onSubmit: submit, 'aria-label': mode === 'create' ? tr('创建房间', 'Create room') : tr('加入房间', 'Join room') },
              mode === 'create' ? h(React.Fragment, null,
                field(tr('房间名称', 'Room name'), h('input', { ref: createRef, value: draft.name, onChange: event => update('name', event.target.value), required: true, maxLength: 256, disabled })),
                field(tr('其他电脑可连接的地址', 'Address other computers can reach'), h('input', { value: draft.address, onChange: event => update('address', event.target.value), required: true, placeholder: '192.168.1.10', autoComplete: 'off', disabled })))
                : field(tr('邀请内容', 'Invitation'), h('textarea', { ref: joinRef, value: draft.invitation, onChange: event => update('invitation', event.target.value), required: true, spellCheck: false, autoComplete: 'off', disabled })),
              field(tr('这台电脑的项目文件夹', 'Project folder on this computer'), h('input', { value: draft.path, readOnly: true, required: true })),
              h('div', { className: 'gr-page-actions' }, h('button', { type: 'button', disabled: disabled || Boolean(view.picking), onClick: chooseFolder }, view.picking ? tr('选择中…', 'Choosing…') : tr('选择文件夹…', 'Choose folder…'))),
              h('p', { className: 'gr-page-small' }, tr('每个成员选择自己的本地路径；NAS 请先挂载，再选择挂载路径。不会自动下载项目。', 'Each member chooses a local folder. Mount your NAS first, then select its mounted path. Projects are not downloaded.')),
              !identity.trim() ? h('p', { className: 'gr-page-small' }, tr('请先填写这台电脑的成员名称。', 'Enter a member name for this computer first.')) : null,
              h('div', { className: 'gr-page-actions' }, h('button', { type: 'submit', className: 'primary', disabled: disabled || !identity.trim() || !draft.path || (mode === 'create' ? !draft.name.trim() || !draft.address.trim() : !draft.invitation.trim()) }, view.busy ? tr('正在处理…', 'Working…') : mode === 'create' ? tr('创建房间', 'Create room') : tr('加入房间', 'Join room')))))),
        h('div', null,
          view.invitation ? h('section', { className: 'gr-page-section' }, h('h2', null, tr('邀请成员', 'Invite members')), h('p', null, tr('将邀请内容发送给要加入的成员。', 'Share this invitation with the members you want to join.')),
            field(tr('邀请内容', 'Invitation'), h('textarea', { ref: invitationRef, value: view.invitation, readOnly: true, spellCheck: false })),
            h('div', { className: 'gr-page-actions', style: { marginTop: 12 } },
              // The text is already selected on arrival; this button is the copy
              // the user actually asked for, not a second way to select it.
              h('button', { type: 'button', onClick: copyInvitation }, tr('复制', 'Copy')),
              h('button', { type: 'button', onClick: () => { patch({ invitation: '' }); refreshRef.current?.focus(); } }, tr('收起', 'Dismiss')))) : null,
          h('section', { className: 'gr-page-section', 'aria-busy': view.loading || view.busy }, h('h2', null, tr('我的房间', 'My rooms')),
            view.loading && !view.status ? h('p', { role: 'status' }, tr('正在加载…', 'Loading…')) : null,
            !view.loading && !view.status ? h('div', null, h('p', null, tr('无法加载房间，请重试。', 'Unable to load rooms. Please retry.')), h('button', { type: 'button', disabled: view.busy, onClick: () => refresh(true) }, tr('重试', 'Retry'))) : null,
            view.status && !view.status.rooms?.length ? h('p', null, tr('还没有房间。创建一个，或使用邀请加入。', 'No rooms yet. Create one or join with an invitation.')) : null,
            view.status?.rooms?.map((room, index) => h(RoomCard, { key: room.id, room, view, index }))),
          h('p', { className: 'gr-page-small' }, tr('在原生会话输入框中使用 @成员 或 @all；模型与思考级别在右栏工作面板的「群聊成员」中设置。', 'Use @member or @all in the native composer. Set models and thinking levels in Room members in the right-hand work panel.'))))));
  }
  const disposers = [pi.ui.injectStyle(mainStyle)];
  try {
    disposers.push(pi.slots.register({ slot: 'mainPage', pageId: 'rooms', component: RoomsPage }));
    disposers.push(pi.slots.register({ slot: 'navigationSection', component: NavigationSection }));
  } catch (error) { live = false; disposers.reverse().forEach(dispose => dispose()); throw error; }
  const timer = setInterval(() => { void refresh(); }, 1200);
  void refresh();
  return () => { if (!live) return; live = false; generation++; clearInterval(timer); listeners.clear(); disposers.reverse().forEach(dispose => dispose()); };
}
