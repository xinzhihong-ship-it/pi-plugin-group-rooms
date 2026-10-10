// Pure-module test for the members page's choice helpers. `shared.mjs` imports
// nothing, so this runs under plain Node with no React or jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configFor, agentEligible, choiceText, roomState, roomStateText, errorText } from './shared.mjs';

const model = (key, label, levels = ['off', 'high'], isDefault = false) => ({ key, label, thinkingLevels: levels, ...(isDefault ? { isDefault: true } : {}) });
const member = (id, label, overrides = {}) => ({ id, label, online: true, agentStatus: 'approved', models: [model('fixture/model', 'Fixture')], selection: null, ...overrides });
const room = (members, preferences = {}) => ({ id: 'room', members, preferences: { targets: [], memberConfigs: [], configurations: [], ...preferences } });

test('@all eligibility matches the rule the core applies', () => {
  const chatOnly = member('human', 'Bob', { agentStatus: 'none' });
  const offline = member('away', 'Away', { online: false });
  const noModels = member('bare', 'Bare', { models: [] });
  const pending = member('pend', 'Pend', { agentStatus: 'pending' });
  assert.deepEqual([chatOnly, offline, noModels, pending].filter(agentEligible), []);
  assert.ok(agentEligible(member('mac', 'Mac')));
});

test('the effective choice prefers the local preference over the synced selection', () => {
  const mac = member('mac', 'Mac', {
    models: [model('mac/default', 'Mac default', ['off'], true), model('mac/other', 'Mac other')],
    selection: { modelKey: 'mac/default' },
  });
  // A synced selection from the other machine is visible here.
  assert.equal(configFor(room([mac]), mac).modelKey, 'mac/default');
  // A local preference wins, because that is what this machine sends with.
  const local = room([mac], { memberConfigs: [{ targetMemberId: 'mac', modelKey: 'mac/other', thinkingLevel: 'high' }] });
  assert.deepEqual(configFor(local, mac), { targetMemberId: 'mac', modelKey: 'mac/other', thinkingLevel: 'high' });
  // A selection naming a model that is no longer in the catalog is not a choice.
  const stale = member('mac', 'Mac', { models: [model('mac/default', 'Mac default')], selection: { modelKey: 'gone/model' } });
  assert.equal(configFor(room([stale]), stale), null);
});

test('a member that just joined reads as pending, not as chat only', () => {
  // Joining asks for agent access, so `pending` is the state a user sees right
  // after a join. Calling that "chat only" is what made a waiting machine look
  // like a broken one.
  const pending = member('pend', 'Win', { agentStatus: 'pending', models: [] });
  const current = room([pending]);
  assert.equal(choiceText(current, pending, 'zh-CN'), '助手待批准 · 批准后即可运行');
  assert.equal(choiceText(current, pending, 'en-US'), 'Agent pending · runs once approved');
  // The genuinely chat-only and declined cases keep their own wording.
  assert.equal(choiceText(current, member('h', 'Bob', { agentStatus: 'none', models: [] }), 'zh-CN'), '仅聊天 · 不运行助手');
  assert.equal(choiceText(current, member('r', 'Rex', { agentStatus: 'rejected', models: [] }), 'zh-CN'), '助手未获批准 · 不运行助手');
  // An approved member with a catalog states its effective choice, not a state:
  // with nothing saved anywhere, that is its own machine default.
  const mac = member('mac', 'Mac', { models: [model('m/one', 'One', ['off', 'high'], true)] });
  assert.equal(choiceText(room([mac]), mac, 'zh-CN'), '默认模型 One');
  const saved = room([mac], { memberConfigs: [{ targetMemberId: 'mac', modelKey: 'm/one', thinkingLevel: 'high' }] });
  assert.equal(choiceText(saved, mac, 'zh-CN'), 'One · high');
});

test('a removed room reads as removed, never as a temporary disconnect', () => {
  // The host's decision is a membership state, so it must not be worded like the
  // offline blip a plain `connected: false` produces.
  const removed = { id: 'room', connected: false, revoked: true, members: [] };
  assert.equal(roomState(removed), 'revoked');
  assert.equal(roomStateText(removed, 'zh-CN'), '已被移出房间');
  assert.equal(roomStateText(removed, 'en-US'), 'Removed from room');
  const offline = { id: 'room', connected: false, revoked: false, members: [] };
  assert.equal(roomStateText(offline, 'zh-CN'), '已断开');
  assert.equal(roomStateText({ id: 'room', connected: true, revoked: false }, 'zh-CN'), '已连接');
  // A send refused for removal says so instead of the generic retry line.
  assert.match(errorText({ code: 'ROOM_REVOKED' }, 'zh-CN'), /已被移出房间/);
  assert.match(errorText({ code: 'ROOM_REVOKED' }, 'en-US'), /removed from the room/);
});
