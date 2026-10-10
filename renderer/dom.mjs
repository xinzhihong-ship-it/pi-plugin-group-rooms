import { text, isChinese, method, errorText } from './shared.mjs';
export let locale = 'zh-CN';
export const t = (zh, en) => text(locale, zh, en);
export const $ = id => document.getElementById(id);
export function el(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
}
export function button(label, action, className) {
  const control = el('button', label, className);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}
export function notice(value, error = false) {
  $('notice').textContent = value;
  $('notice').classList.toggle('error', error);
  $('notice').setAttribute('role', error ? 'alert' : 'status');
}
export function applyAppearance(appearance) {
  locale = appearance?.locale || 'zh-CN';
  document.documentElement.lang = locale;
  document.documentElement.dataset.base = ['light', 'dark'].includes(appearance?.base) ? appearance.base
    : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.querySelectorAll('[data-zh][data-en]').forEach(node => { node.textContent = isChinese(locale) ? node.dataset.zh : node.dataset.en; });
}
export const bridgeAvailable = () => typeof window.pluginBridge?.invoke === 'function';
export async function call(name, args = {}) {
  if (!bridgeAvailable()) throw Object.assign(new Error('PI-Desktop bridge unavailable'), { code: 'SDK_UNAVAILABLE' });
  return window.pluginBridge.invoke(method(name), args);
}
export async function initAppearance(afterChange) {
  applyAppearance(null);
  window.pluginBridge?.on('appearance:changed', value => { applyAppearance(value); afterChange?.(); });
  if (bridgeAvailable()) {
    try { applyAppearance(await window.pluginBridge.invoke('app.getAppearance')); } catch { applyAppearance(null); }
  }
}
export function failure(error) { notice(errorText(error, locale), true); }
export function field(label, control) {
  const wrapper = el('label'); wrapper.append(el('span', label), control); return wrapper;
}
export function option(value, label, selected = false) {
  const node = el('option', label); node.value = value; node.selected = selected; return node;
}
