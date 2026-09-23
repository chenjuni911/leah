import { initialState, validateState, migrateState } from './domain.js';
export const STORAGE_KEY = 'xiaoyi-growth-planet:v1';
export const RECOVERY_KEY = 'xiaoyi-growth-planet:before-restore';
export const UPGRADE_KEY = 'xiaoyi-growth-planet:before-upgrade';

export function readState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? initialState() : migrateState(JSON.parse(raw));
}

export function transact(storage, update) {
  const before = readState(storage);
  const result = update(before);
  if (result.state === before) return result;
  validateState(result.state);
  const raw = storage.getItem(STORAGE_KEY);
  if (raw && JSON.parse(raw).version === 1 && storage.getItem(UPGRADE_KEY) === null) storage.setItem(UPGRADE_KEY, raw);
  // Only expose success after the entire snapshot was saved.
  storage.setItem(STORAGE_KEY, JSON.stringify(result.state));
  return result;
}

export function restoreState(storage, imported, expectedRevision) {
  const before = readState(storage);
  if (before.revision !== expectedRevision) throw new Error('记录刚刚发生变化，请重新选择备份并确认。');
  const next = validateState({ ...structuredClone(imported), revision: before.revision + 1 });
  storage.setItem(RECOVERY_KEY, JSON.stringify(before));
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return { state: next, entry: null };
}

export async function withStorageLock(action, locks = globalThis.navigator?.locks) {
  if (!locks?.request) throw new Error('此浏览器暂不支持安全保存，请使用新版浏览器打开本机地址。');
  return locks.request('xiaoyi-growth-planet:write', { mode: 'exclusive' }, action);
}
