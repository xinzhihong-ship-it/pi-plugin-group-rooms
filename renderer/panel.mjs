import { $, el, button, field, call, t, notice, failure, bridgeAvailable, initAppearance, locale } from './dom.mjs';
import { createGeneration, roomState, roomStateText } from './shared.mjs';
let status = null, busy = false, picking = null;
const requests = createGeneration();
function updateControls() {
  const available = bridgeAvailable() && Boolean(status) && !busy;
  $('choose-create').disabled = $('choose-join').disabled = !available || Boolean(picking);
  const identity = $('identity').value.trim();
  $('create-submit').disabled = !available || !identity || !$('create-path').value;
  $('join-submit').disabled = !available || !identity || !$('join-path').value;
  $('create-help').hidden = false;
  $('identity').readOnly = Boolean(status?.rooms?.length);
}
function showInvitation(value) {
  if (!value) return;
  $('invitation-output').value = value;
  $('invitation-section').hidden = false;
  $('invitation-output').focus();
}
async function action(name, args, success, callback) {
  if (busy) return;
  busy = true; requests.invalidate(); updateControls();
  document.querySelectorAll('#rooms button').forEach(node => { node.disabled = true; });
  notice(t('正在处理…', 'Working…'));
  try {
    const result = await call(name, args);
    await refresh();
    notice(success || t('已完成。', 'Done.'));
    callback?.(result);
  } catch (error) { failure(error); }
  finally { busy = false; renderRooms(); updateControls(); }
}
async function refresh() {
  const token = requests.next(); $('rooms').setAttribute('aria-busy', 'true');
  try {
    const result = await call('list');
    if (!requests.current(token)) return;
    status = result;
    applyPick(result.picker);
    const self = result.rooms?.flatMap(room => room.members.filter(member => member.id === room.selfMemberId))[0];
    if (self || result.label) $('identity').value = self?.label || result.label;
    $('listener-status').textContent = result.listenerError ? t(`未能恢复接收连接：${result.listenerError}`, `Incoming connections could not be restored: ${result.listenerError}`) : result.listenerNotice ? t(`接收端口已从 ${result.listenerNotice.from} 变为 ${result.listenerNotice.to}（原端口被占用）；之前发出去的邀请串已失效，请重新生成邀请。`, `The receiving port changed from ${result.listenerNotice.from} to ${result.listenerNotice.to} (the old port was taken). Invitations you already shared no longer work — create a new one.`) : result.listener ? t(`正在接收 · 端口 ${result.listener.port}`, `Receiving · port ${result.listener.port}`) : t('创建房间后自动接收', 'Receiving starts with a created room');
    renderRooms(); updateControls();
  } catch (error) {
    if (!requests.current(token)) return;
    status = null; $('rooms').replaceChildren(el('p', t('无法加载房间，请重试。', 'Unable to load rooms. Please retry.'), 'empty'));
    updateControls(); throw error;
  } finally { if (requests.current(token)) $('rooms').setAttribute('aria-busy', 'false'); }
}
const formMode = () => ($('create-form')?.hidden ? 'join' : 'create');
// The picker cannot answer the call that starts it (the host times a
// plugin.call out after 2s), so the backend starts it in the background and
// this panel reads the answer on its own `list` refresh. A pick is only
// adopted once it started here or arrived pending, never from a stale result.
function applyPick(picker) {
  if (!picker) return;
  if (picker.pending) {
    if (!picking) picking = { requestId: picker.requestId, mode: formMode() };
    return;
  }
  if (!picking || !picking.requestId || picker.requestId !== picking.requestId) return;
  const mode = picking.mode;
  picking = null;
  if (picker.error) { failure({ code: picker.error }); updateControls(); return; }
  if (picker.path) $(`${mode}-path`).value = picker.path;
  else notice(t('已取消选择，保留原文件夹。', 'Selection cancelled; previous folder kept.'));
  updateControls();
}
function renderRooms() {
  const list = $('rooms'); list.replaceChildren();
  if (!status?.rooms?.length) { list.append(el('p', t('还没有房间。创建一个，或使用邀请加入。', 'No rooms yet. Create one or join with an invitation.'), 'empty')); return; }
  status.rooms.forEach((room, index) => {
    const node = el('article', undefined, 'room appear'); node.style.setProperty('--delay', `${Math.min(index, 4) * 24}ms`);
    const heading = el('div', undefined, 'row'); heading.append(el('h3', room.name, 'wrap'), el('span', roomStateText(room, locale), `badge${roomState(room) === 'revoked' ? ' revoked' : ''}`));
    if (roomState(room) === 'revoked') node.append(el('p', t('这台电脑已被房主移出房间。房间历史仍可查看，但无法再发送或运行助手。', 'The host removed this computer from the room. Its history stays readable, but it can no longer send or run agents.'), 'small wrap'));
    const actions = el('div', undefined, 'actions');
    actions.append(button(t('打开会话', 'Open session'), () => action('open', { roomId: room.id }, t('已打开会话。模型与思考级别在「房间成员」中设置。', 'Session opened. Set models and thinking levels in Room members.'))));
    const details = el('details'); details.append(el('summary', t('房间设置', 'Room settings')));
    const settings = el('div', undefined, 'stack');
    const name = el('input'); name.value = room.name; name.maxLength = 256; name.required = true; name.disabled = !room.host;
    settings.append(field(t('房间名称', 'Room name'), name));
    const rename = button(t('保存名称', 'Save name'), () => { if (name.reportValidity() && name.value.trim()) action('rename', { roomId: room.id, name: name.value.trim() }); }); rename.disabled = !room.host;
    settings.append(rename);
    if (room.host) {
      const address = el('input'); address.placeholder = '192.168.1.10'; address.required = true;
      settings.append(field(t('其他电脑可连接的地址', 'Address other computers can reach'), address));
      const invite = button(t('生成邀请', 'Create invitation'), () => { if (address.reportValidity()) action('invite', { roomId: room.id, address: address.value.trim() }, t('邀请已生成。', 'Invitation created.'), result => showInvitation(result?.invitation)); });
      settings.append(invite);
    }
    const leave = button(t('离开房间', 'Leave room'), () => {
      if (confirm(t('离开此房间？可使用邀请重新加入。', 'Leave this room? You can rejoin with an invitation.'))) action('leave', { roomId: room.id }, t('已离开房间。', 'Left the room.'));
    }, 'danger'); settings.append(leave); details.append(settings);
    node.append(heading, el('p', `${room.members?.length ?? 0} ${t('位成员', 'members')} · ${room.host ? t('房主', 'Host') : t('成员', 'Member')}`, 'small'), el('p', room.projectPath, 'small wrap'), actions, details);
    if (busy) node.querySelectorAll('button').forEach(control => { control.disabled = true; });
    list.append(node);
  });
}
for (const mode of ['create', 'join']) {
  $(`${mode}-tab`).addEventListener('click', () => {
    for (const kind of ['create', 'join']) { $(`${kind}-tab`).setAttribute('aria-pressed', String(kind === mode)); $(`${kind}-form`).hidden = kind !== mode; }
  });
  $(`choose-${mode}`).addEventListener('click', () => {
    if (picking) return;
    notice(t('请在系统窗口中选择文件夹。', 'Choose a folder in the system window.'));
    picking = { requestId: '', mode }; updateControls();
    call('selectDirectory', {}).then(started => {
      if (picking && picking.mode === mode) picking = { requestId: started?.requestId ?? '', mode };
      updateControls();
    }, error => { picking = null; failure(error); updateControls(); });
  });
  $(`${mode}-form`).addEventListener('submit', event => {
    event.preventDefault(); if (busy) return;
    if (!$('identity').reportValidity() || !$(`${mode}-path`).value) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    action(mode, { ...values, label: $('identity').value.trim(), projectPath: $(`${mode}-path`).value }, mode === 'create' ? t('房间已创建。请从下方打开会话。', 'Room created. Open its session below.') : t('已加入房间。请从下方打开会话。', 'Joined the room. Open its session below.'), result => {
      if (mode === 'create') showInvitation(result?.invitation);
      if (mode === 'join') event.target.reset();
    });
  });
}
$('identity').addEventListener('input', updateControls);
$('refresh').addEventListener('click', () => { if (!busy) refresh().then(() => notice(t('已刷新。', 'Refreshed.'))).catch(failure); });
$('select-invitation').addEventListener('click', () => { $('invitation-output').focus(); $('invitation-output').select(); notice(t('已选中，请复制后发送给成员。', 'Selected. Copy and share with members.')); });
$('close-invitation').addEventListener('click', () => { $('invitation-section').hidden = true; $('invitation-output').value = ''; $('refresh').focus(); });
await initAppearance(() => { renderRooms(); updateControls(); });
if (!bridgeAvailable()) {
  notice(t('请在 PI-Desktop 中打开此面板。', 'Open this panel in PI-Desktop.'), true);
  $('rooms').replaceChildren(el('p', t('尚未连接。', 'Not connected.'), 'empty'));
  $('rooms').setAttribute('aria-busy', 'false'); updateControls();
} else { await refresh().catch(failure); }
