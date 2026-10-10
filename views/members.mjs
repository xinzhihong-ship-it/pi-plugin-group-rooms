import { $, el, button, field, option, call, t, notice, failure, locale, initAppearance, bridgeAvailable } from '../renderer/dom.mjs';
import { agentEligible, configFor, choiceText, plannedTarget, roomForContext, createGeneration, roomState, roomStateText } from '../renderer/shared.mjs';
let currentContext = null, room = null, busy = false, loading = false, signature = '';
const requests = createGeneration();
const sameContext = value => value?.sessionId === currentContext?.sessionId && value?.managedByPlugin === currentContext?.managedByPlugin;
function clear() {
  room = null; signature = ''; requests.invalidate();
  $('content').replaceChildren(el('p', t('打开群组房间会话后，在这里查看成员。', 'Open a Group Rooms session to see its members here.'), 'empty'));
}
async function refresh(force = false) {
  if (loading || busy || !bridgeAvailable()) return;
  loading = true; const token = requests.next();
  try {
    const context = await call('context');
    if (!requests.current(token)) return;
    if (!sameContext(context)) { currentContext = context; clear(); }
    const nextToken = requests.next();
    const status = await call('list');
    if (!requests.current(nextToken)) return;
    const match = roomForContext(status, currentContext);
    if (!match) { clear(); return; }
    const snapshot = await call('snapshot', { roomId: match.id });
    const checked = await call('context');
    if (!requests.current(nextToken)) return;
    if (!sameContext(checked)) { currentContext = checked; clear(); return; }
    room = snapshot;
    const next = JSON.stringify([snapshot.id, snapshot.name, snapshot.connected, snapshot.members, snapshot.runs, snapshot.preferences, snapshot.projectPath, locale]);
    // Avoid removing focused form controls during a read-only refresh.
    if (force || (next !== signature && !$('content').contains(document.activeElement))) { signature = next; render(); }
  } catch (error) {
    room = null; signature = ''; $('content').replaceChildren(el('p', t('无法加载成员，请重试。', 'Unable to load members. Please retry.'), 'empty')); failure(error);
  } finally { loading = false; $('content').setAttribute('aria-busy', 'false'); }
}
async function mutate(name, args) {
  if (busy || !room) return;
  const expected = currentContext?.sessionId, roomId = room.id;
  busy = true; requests.invalidate();
  $('content').querySelectorAll('button,input,select').forEach(node => { node.disabled = true; });
  notice(t('正在保存…', 'Saving…'));
  try {
    const checked = await call('context');
    if (checked?.sessionId !== expected || checked?.managedByPlugin !== 'io.github.xinzhihong.group-rooms') throw Object.assign(new Error('Session changed'), { code: 'STALE' });
    await call(name, { roomId, ...args });
    const after = await call('context');
    if (after?.sessionId !== expected) { currentContext = after; clear(); return; }
    notice(t('已保存。发送消息时才会运行助手。', 'Saved. Agents run only when you send a message.'));
  } catch (error) { failure(error); }
  finally { busy = false; signature = ''; await refresh(true); }
}
function render() {
  const content = $('content'); content.replaceChildren(); if (!room) return;
  const section = el('section', undefined, 'section');
  const heading = el('div', undefined, 'row'); heading.append(el('h2', room.name, 'wrap'), el('span', roomStateText(room, locale), `badge${roomState(room) === 'revoked' ? ' revoked' : ''}`));
  section.append(heading, el('p', room.projectPath, 'small wrap'), el('p', t('此路径属于这台电脑。更换文件夹请离开后重新加入。', 'This path belongs to this computer. Leave and rejoin to change it.'), 'small'));
  if (roomState(room) === 'revoked') section.append(el('p', t('这台电脑已被房主移出房间。房间历史仍可查看，但无法再发送或运行助手。', 'The host removed this computer from the room. Its history stays readable, but it can no longer send or run agents.'), 'small wrap'));
  const eligible = room.members.filter(agentEligible);
  // Who runs is decided by @mention in the composer alone, so the members page
  // no longer keeps a recipient list. This line stays because it explains what
  // happens to a member nobody picked a model for.
  if (eligible.length) section.append(el('p', t('未选择模型的助手将使用它自己电脑上的默认模型。', 'An agent with no chosen model runs on its own computer’s default model.'), 'small'));
  content.append(section);
  const members = el('section', undefined, 'section'); members.append(el('h2', `${t('成员', 'Members')} · ${room.members.length}`));
  room.members.forEach((member, index) => {
    const node = el('article', undefined, 'member appear'); node.style.setProperty('--delay', `${Math.min(index, 4) * 24}ms`);
    const heading = el('div', undefined, 'member-name'); heading.append(el('h3', member.label));
    if (member.id === room.selfMemberId) heading.append(el('span', t('本机', 'This computer'), 'badge'));
    heading.append(el('span', member.online ? t('在线', 'Online') : t('离线', 'Offline'), `badge${member.online ? ' positive' : ''}`));
    const states = { none: t('仅聊天', 'Chat only'), pending: t('助手待批准', 'Agent pending'), rejected: t('助手未获批准', 'Agent declined'), approved: t('助手已批准', 'Agent approved') };
    node.append(heading, el('p', states[member.agentStatus] || states.none, 'small'));
    const config = configFor(room, member), models = member.models ?? [], canConfigure = member.agentStatus === 'approved' && models.length > 0;
    // A target always exists for an eligible member: the saved choice, the synced
    // selection another machine published, or the machine default the backend
    // falls back to. The selects below show this effective choice, so a peer's
    // model and thinking level are visible here even before anyone saves one.
    const planned = config ?? (agentEligible(member) ? plannedTarget(member) : null);
    // Every member states its current choice in words, including chat-only ones:
    // a synced selection is what another machine picked, and a member with none
    // still runs on its own computer's default model.
    node.append(el('p', `${t('当前：', 'Current: ')}${choiceText(room, member, locale)}`, 'choice-current wrap'));
    if (canConfigure) {
      const controls = el('div', undefined, 'grid');
      const model = el('select'); model.setAttribute('aria-label', `${member.label} ${t('模型', 'model')}`);
      model.append(option('', t('选择模型…', 'Choose model…'), !planned));
      models.forEach(value => model.append(option(value.key, value.label, planned?.modelKey === value.key)));
      const thinking = el('select'); thinking.setAttribute('aria-label', `${member.label} ${t('思考级别', 'thinking level')}`);
      const selectedModel = models.find(value => value.key === planned?.modelKey);
      const levels = selectedModel?.thinkingLevels ?? [];
      thinking.append(option('', t('默认', 'Default'), planned?.thinkingLevel === undefined));
      levels.forEach(level => thinking.append(option(level, level, planned?.thinkingLevel === level))); thinking.disabled = !selectedModel || !levels.length;
      // Both selects go through `configure`, which records the choice locally and
      // publishes it to the room so the other machines show the same thing.
      model.addEventListener('change', () => { if (model.value) mutate('configure', { memberId: member.id, modelKey: model.value }); else render(); });
      thinking.addEventListener('change', () => { if (planned?.modelKey) mutate('configure', { memberId: member.id, modelKey: planned.modelKey, ...(thinking.value ? { thinkingLevel: thinking.value } : {}) }); });
      controls.append(field(t('模型', 'Model'), model), field(t('思考级别', 'Thinking level'), thinking)); node.append(controls);
    } else if (member.agentStatus === 'none' || member.agentStatus === 'rejected') {
      // Chat-only members are the usual reason a mention gets no reply: only the
      // member itself can request agent access, and the host then approves it.
      node.append(el('p', member.id === room.selfMemberId
        ? t('这台电脑还没有申请助手能力。申请后由主机批准，之后 @ 它才会运行助手。', 'This computer has not requested agent access. Request it, the host approves, then @mentions run an agent here.')
        : t('这台电脑还没有申请助手能力，因此 @ 它只会广播消息。只有它自己能申请，之后由主机批准。', 'That computer has not requested agent access, so @mentioning it only broadcasts. Only it can request; the host then approves.'), 'small wrap'));
    }
    const actions = el('div', undefined, 'actions');
    if (member.id === room.selfMemberId && ['none', 'rejected'].includes(member.agentStatus)) actions.append(button(t('申请助手能力', 'Request agent access'), () => mutate('requestAgent', {})));
    if (room.host && member.agentStatus === 'pending') {
      actions.append(button(t('批准助手', 'Approve agent'), () => mutate('approve', { memberId: member.id, approved: true })), button(t('拒绝助手', 'Decline agent'), () => mutate('approve', { memberId: member.id, approved: false })));
    }
    if (room.host && member.id !== room.selfMemberId) actions.append(button(t('移除成员', 'Remove member'), () => {
      if (confirm(t(`移除成员「${member.label}」？`, `Remove member “${member.label}”?`))) mutate('revoke', { memberId: member.id });
    }, 'danger'));
    node.append(actions); members.append(node);
  });
  content.append(members);
  const runs = room.runs?.filter(run => run.status === 'running' || run.status === 'unknown') ?? [];
  if (runs.length) {
    const section = el('section', undefined, 'section'); section.append(el('h2', t('当前任务', 'Current tasks')));
    runs.forEach(run => {
      const node = el('div', undefined, 'room'); const member = room.members.find(value => value.id === run.targetMemberId);
      node.append(el('p', `${member?.label ?? run.targetMemberId} · ${run.status === 'running' ? t('运行中', 'Running') : t('结果未知', 'Outcome unknown')}`, 'wrap'));
      if (run.status === 'running') node.append(button(t('停止任务', 'Stop task'), () => mutate('cancel', { runId: run.id })));
      section.append(node);
    }); content.append(section);
  }
}
$('refresh').addEventListener('click', () => refresh(true));
await initAppearance(() => { signature = ''; render(); });
if (!bridgeAvailable()) { clear(); notice(t('请在 PI-Desktop 工作面板中打开成员视图。', 'Open this view in the PI-Desktop work panel.'), true); $('content').setAttribute('aria-busy', 'false'); }
else {
  await refresh(true);
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, 1200);
  window.addEventListener('pagehide', () => { clearInterval(timer); requests.invalidate(); }, { once: true });
}
