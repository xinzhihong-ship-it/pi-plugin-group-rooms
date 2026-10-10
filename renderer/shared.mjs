export const PLUGIN_ID = 'local.group-rooms';
export const method = name => `group-rooms.${name}`;
export const isChinese = locale => !locale || /^zh/i.test(locale);
export const text = (locale, zh, en) => isChinese(locale) ? zh : en;
export const roomForContext = (status, context) => context?.managedByPlugin === PLUGIN_ID
  ? status?.rooms?.find(room => room.sessionId === context.sessionId) ?? null : null;
export const agentEligible = member => member.online && member.agentStatus === 'approved' && member.models?.length > 0;
// The machine that owns a model choice runs on it. `selection` is the synced copy
// every other machine can see; a local preference for the same member wins when
// this machine holds one, because that is what this machine would send with.
export function configFor(room, member) {
  const local = room?.preferences?.memberConfigs?.find(value => value.targetMemberId === member.id)
    ?? room?.preferences?.targets?.find(value => value.targetMemberId === member.id);
  const config = local ?? member.selection ?? null;
  const model = member.models?.find(value => value.key === config?.modelKey);
  if (!model || (config.thinkingLevel !== undefined && !model.thinkingLevels.includes(config.thinkingLevel))) return null;
  return { targetMemberId: member.id, modelKey: model.key, ...(config.thinkingLevel !== undefined ? { thinkingLevel: config.thinkingLevel } : {}) };
}
// What a send would run on when nobody saved a choice anywhere: the member's own
// machine default, which is exactly the fallback the backend applies for @all
// and @member. `null` means the member genuinely has no model to run on.
export const defaultModel = member => member.models?.find(value => value.isDefault) ?? member.models?.[0] ?? null;
export function plannedTarget(member) {
  const model = defaultModel(member);
  return model ? { targetMemberId: member.id, modelKey: model.key } : null;
}
// One readable line for what this member would run on, in the same words on
// every machine. Only an approved member with a catalog can run at all.
export function choiceText(room, member, locale) {
  const t = (zh, en) => text(locale, zh, en);
  // A member that joined asks for agent access on the spot, so `pending` is the
  // normal state right after a join and must not read as "chat only": that is
  // the wording that made a waiting machine look like a broken one.
  if (member.agentStatus === 'pending') return t('助手待批准 · 批准后即可运行', 'Agent pending · runs once approved');
  if (member.agentStatus === 'rejected') return t('助手未获批准 · 不运行助手', 'Agent declined · no agent run');
  if (member.agentStatus !== 'approved') return t('仅聊天 · 不运行助手', 'Chat only · no agent run');
  if (!member.models?.length) return t('未选择 · 暂无可用模型', 'Not chosen · no available models');
  const config = configFor(room, member);
  const model = member.models.find(value => value.key === config?.modelKey);
  if (model) return `${model.label}${config.thinkingLevel ? ` · ${config.thinkingLevel}` : ''}`;
  const fallback = defaultModel(member);
  return fallback ? t(`默认模型 ${fallback.label}`, `Default model ${fallback.label}`) : t('未选择', 'Not chosen');
}
// A room this machine was removed from is a membership state, not a connection
// state. It keeps its history but can no longer send, receive or run anything,
// and the host will not re-admit it — so showing the plain 「已断开」 a temporary
// network problem shows is what made a removal look like nothing happened.
export const roomState = room => room?.revoked ? 'revoked' : room?.connected ? 'connected' : 'disconnected';
export function roomStateText(room, locale) {
  const state = roomState(room);
  if (state === 'revoked') return text(locale, '已被移出房间', 'Removed from room');
  return state === 'connected' ? text(locale, '已连接', 'Connected') : text(locale, '已断开', 'Disconnected');
}
export function mentionItems(room, query, locale) {
  if (!room) return [];
  const t = (zh, en) => text(locale, zh, en);
  const eligible = room.members.filter(agentEligible);
  const ready = eligible.filter(member => configFor(room, member));
  const result = [{ label: '@all', send: '@all', detail: t(`全部在线助手 · ${ready.length}/${eligible.length} 已配置`, `All online agents · ${ready.length}/${eligible.length} configured`) }];
  for (const member of room.members) {
    const config = configFor(room, member);
    const model = member.models?.find(value => value.key === config?.modelKey) ?? (agentEligible(member) ? defaultModel(member) : null);
    result.push({ label: `@${member.label}`.slice(0, 64), send: `@${member.id}`, detail: (
      agentEligible(member) ? model ? `${model.label}${config?.thinkingLevel ? ` · ${config.thinkingLevel}` : ''}` : t('请先选择模型', 'Choose a model first')
      : t('发送给房间 · 不运行助手', 'Room broadcast · no agent run')
    ).slice(0, 256) });
  }
  const needle = String(query ?? '').toLocaleLowerCase();
  return result.filter(item => `${item.label} ${item.detail} ${item.send}`.toLocaleLowerCase().includes(needle)).slice(0, 50);
}
export function errorText(error, locale) {
  const t = (zh, en) => text(locale, zh, en);
  const messages = {
    SDK_UNAVAILABLE: t('请更新 PI-Desktop 后重试。', 'Update PI-Desktop and try again.'),
    PLUGIN_ACTION_UNKNOWN: t('请更新 PI-Desktop 后重试。', 'Update PI-Desktop and try again.'),
    METHOD_NOT_FOUND: t('此功能暂不可用，请更新插件后重试。', 'This feature is unavailable. Update the plugin and try again.'),
    UNSUPPORTED: t('当前版本不支持此操作。', 'This version does not support this action.'),
    UNAVAILABLE: t('房间暂不可用，请重试。', 'Room unavailable. Please retry.'),
    // The host removed this machine. It is not a transient failure and retrying
    // cannot fix it, so the wording has to say what actually happened.
    ROOM_REVOKED: t('这台电脑已被移出房间，无法再发送消息。房间历史仍可查看。', 'This computer was removed from the room and can no longer send. Its history stays readable.'),
    STALE: t('会话已切换，请重新选择。', 'The session changed. Select again.'),
    PLUGIN_DRAFT_STALE: t('会话已切换，请重新选择。', 'The session changed. Select again.'),
    CANCELLED: t('已取消。', 'Cancelled.'),
    // The host relays plugin.call at 10 calls/s; over it, or after five
    // consecutive failures, it refuses before reaching the plugin. Both are
    // transient and both used to fall through to the generic line.
    PLUGIN_CALL_RATE_LIMITED: t('操作太快了，请稍候重试。', 'Too many requests at once. Please retry.'),
    PLUGIN_CALL_DISABLED: t('插件刚刚连续出错，已暂停约 30 秒，请稍候重试。', 'The plugin paused for about 30 seconds after repeated failures. Please retry.'),
    PLUGIN_CALL_TIMEOUT: t('操作超时，请重试。', 'The action timed out. Please retry.'),
    PLUGIN_CALL_FAILED: t('操作未完成，请重试。', 'The action did not finish. Please retry.'),
    PLUGIN_UNLOADED: t('插件已停用或重新加载，请重新打开。', 'The plugin was disabled or reloaded. Open it again.'),
  };
  return messages[error?.code] ?? t('操作未完成，请检查连接和输入后重试。', 'Action failed. Check your connection and input, then retry.');
}
export function createGeneration() {
  let generation = 0;
  return { next: () => ++generation, current: token => token === generation, invalidate: () => ++generation };
}
