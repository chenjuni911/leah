import { migrateState, validateState } from './domain.js';

// Keep each Firestore document well below 1 MiB, including multibyte text.
export function encodeState(state) {
  const raw = JSON.stringify(validateState(state));
  if (raw.length > 8000000) throw new Error('记录超过当前同步容量，请先导出备份并联系维护者。');
  return raw.match(/[\s\S]{1,60000}/gu);
}
export function decodeState(parts) { return migrateState(JSON.parse(parts.join(''))); }

// The manifest is the concurrency lock. All chunks and its revision commit atomically.
export function createCloudStore({ run, ref, owner }) {
  const root = ref(`users/${owner}/planet/current`);
  const chunk = i => ref(`users/${owner}/chunks/${i}`);
  async function read(tx) {
    const manifest = await tx.get(root);
    if (!manifest.exists()) return null;
    const { count, revision } = manifest.data();
    if (!Number.isInteger(count) || count < 1 || count > 134) throw new Error('云端记录结构异常，未覆盖任何数据。');
    const docs = await Promise.all(Array.from({ length: count }, (_, i) => tx.get(chunk(i))));
    if (docs.some(d => !d.exists() || typeof d.data().text !== 'string')) throw new Error('云端记录不完整，未覆盖任何数据。');
    const state = decodeState(docs.map(d => d.data().text));
    if (state.revision !== revision) throw new Error('云端版本不一致，请重新连接。');
    return state;
  }
  function write(tx, state) {
    const parts = encodeState(state);
    parts.forEach((text, i) => tx.set(chunk(i), { text }));
    tx.set(root, { count: parts.length, revision: state.revision, schema: 1 });
  }
  return {
    root,
    load: () => run(read),
    initialize: state => run(async tx => {
      if ((await tx.get(root)).exists()) throw new Error('另一台设备已创建云端记录，请重新连接后查看。');
      const next = validateState({ ...structuredClone(state), revision: state.revision + 1 });
      write(tx, next); return next;
    }),
    mutate: (update, expectedRevision) => run(async tx => {
      const before = await read(tx);
      if (!before) throw new Error('云端记录不存在，请先选择初始记录。');
      if (before.revision !== expectedRevision) throw new Error('另一台设备已更新记录，请查看最新内容后重新操作。');
      const result = update(before);
      if (result.state !== before) {
        const next = validateState({ ...result.state, revision: before.revision + 1 });
        write(tx, next); return { ...result, state: next };
      }
      return result;
    }),
  };
}
