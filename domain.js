export const SCHEMA_VERSION = 2;
export const CATEGORIES = [
  { id: 'chinese', name: '语文', symbol: 'book', subtitle: '在文字里发现世界' },
  { id: 'math', name: '数学', symbol: 'math', subtitle: '和每一道难题交朋友' },
  { id: 'english', name: '英语', symbol: 'language', subtitle: '多认识一点世界' },
  { id: 'sport', name: '运动', symbol: 'activity', subtitle: '动起来，也是一种成长' },
  { id: 'life', name: '生活', symbol: 'heart', subtitle: '生活里的小进步' },
  { id: 'other', name: '其他', symbol: 'star', subtitle: '每一份努力都算数' },
];
export const DEFAULT_RULES = [
  { id: 'teacher', name: '老师微信表扬', type: 'reward', points: 3, active: true },
  { id: 'progress', name: '明显进步', type: 'reward', points: 2, active: true },
  { id: 'effort', name: '特别努力', type: 'reward', points: 1, active: true },
  { id: 'careless', name: '粗心 / 看错题', type: 'penalty', points: -2, active: true },
  { id: 'improved', name: '明显改善 / 改进成功', type: 'improvement', points: 2, active: true },
];
export const WISH_ICONS = ['🎁','🥣','🦜','📚','🎬','🎡','🍰','🎨','🎮','🧸','🧩','🚲','✨'];
const task = (id, category, name, standard, points) => ({ id, category, name, standard, points, active: true });
export const DEFAULT_TASKS = [
  task('chinese-reading', 'chinese', '课外阅读', '20 分钟', 1),
  task('chinese-review', 'chinese', '课内预习 / 复习', '完成今天的内容', 1),
  task('chinese-writing', 'chinese', '作文', '约 300 字', 3),
  task('math-calculation', 'math', '口算', '完成一组练习', 1),
  task('math-practice', 'math', '数学学霸', '完成一次约定练习', 3),
  task('math-class', 'math', '数学网课', '30 分钟', 2),
  task('english-words', 'english', '背单词', '完成今天的单词', 1),
  task('english-review', 'english', '课内复习', '复习今天的内容', 1),
  task('english-phonics', 'english', '自然拼读', '学习 1 课', 1),
  task('english-reading', 'english', '英语阅读', '15 分钟', 1),
  task('english-practice', 'english', '英语练习', '15 分钟', 1),
  task('sport-rope', 'sport', '跳绳', '3 组 × 1 分钟', 1),
  task('sport-run', 'sport', '跑步', '完成一次跑步', 2),
  task('sport-cycle', 'sport', '周末骑车', '完成一次骑行', 5),
];

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
export function familyDay(now = new Date()) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function initialState() {
  return { version: SCHEMA_VERSION, revision: 0, tasks: structuredClone(DEFAULT_TASKS), rules: structuredClone(DEFAULT_RULES), wishes: [{ id: 'qiuqiu-snacks', name: '球球的零食', icon: '🥣', cost: 20 }], currentWishId: 'qiuqiu-snacks', achievements: [], entries: [] };
}
export function activeEntries(state) { return state.entries.filter(entry => !entry.voidedAt); }
export function balance(state) { return activeEntries(state).reduce((sum, entry) => sum + entry.points, 0); }
export function completedTasks(state, day = familyDay()) { return new Set(activeEntries(state).filter(e => e.day === day && e.type === 'task').map(e => e.taskId)); }
export function currentWish(state) { return state.wishes.find(wish => wish.id === state.currentWishId && !wish.deletedAt) ?? null; }
export function wishProgress(state) {
  const wish = currentWish(state);
  const points = balance(state);
  return { wish, points, remaining: wish ? Math.max(0, wish.cost - points) : 0, percent: wish ? Math.min(100, Math.max(0, points / wish.cost * 100)) : 0 };
}
export function recordTask(state, taskId, { now = new Date(), id = crypto.randomUUID() } = {}) {
  const selected = state.tasks.find(item => item.id === taskId && item.active && !item.deletedAt);
  if (!selected) throw new Error('这个任务已不存在，请刷新页面。');
  const day = familyDay(now);
  if (completedTasks(state, day).has(taskId)) return { state, entry: null };
  if (state.entries.some(e => e.id === id)) throw new Error('记录编号重复，请重试。');
  const entry = { id, taskId, type: 'task', name: selected.name, standard: selected.standard, category: selected.category, points: selected.points, rulePoints: selected.points, day, createdAt: now.toISOString(), voidedAt: null };
  return { state: { ...state, revision: state.revision + 1, entries: [...state.entries, entry] }, entry };
}
export function undoEntry(state, entryId, now = new Date()) {
  const entry = state.entries.find(e => e.id === entryId && !e.voidedAt);
  if (!entry) return { state, entry: null };
  if (balance(state) - entry.points < 0) throw new Error('这些积分已使用，请先撤销相关兑换或调整积分，再删除这条记录。');
  return { state: { ...state, revision: state.revision + 1, entries: state.entries.map(e => e.id === entryId ? { ...e, voidedAt: now.toISOString() } : e) }, entry };
}
export function periodEntries(state, period = 'month', now = new Date()) {
  const day = familyDay(now);
  let start = '0000-01-01';
  if (period === 'month') start = `${day.slice(0, 7)}-01`;
  if (period === 'week') {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    start = date.toISOString().slice(0, 10);
  }
  return activeEntries(state).filter(entry => entry.day >= start && entry.day <= day);
}
export function statistics(entries) {
  const learning = entries.filter(e => !['adjustment','redemption'].includes(e.type));
  const tasks = entries.filter(e => ['task','custom'].includes(e.type));
  return { earned: learning.reduce((sum, e) => sum + Math.max(0, e.points), 0), tasks: tasks.length, days: new Set(learning.map(e => e.day)).size, redemptions: entries.filter(e => e.type === 'redemption').length, categories: Object.fromEntries(CATEGORIES.map(c => [c.id, tasks.filter(e => e.category === c.id).length])) };
}

export function validateState(value) {
  const fail = () => { throw new Error('保存的数据格式异常。原数据没有被覆盖，请先下载数据副本。'); };
  if (!value || value.version !== SCHEMA_VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.tasks) || !Array.isArray(value.rules) || !Array.isArray(value.wishes) || !Array.isArray(value.entries)) fail();
  const text = x => typeof x === 'string' && x.length > 0;
  const integer = x => Number.isSafeInteger(x) && x >= 0;
  const unique = list => list.every(item => item && text(item.id)) && new Set(list.map(item => item.id)).size === list.length;
  const category = id => CATEGORIES.some(c => c.id === id);
  if (!unique(value.tasks) || !unique(value.wishes) || !unique(value.entries) || !unique(value.rules)) fail();
  if (!value.tasks.every(t => text(t.name) && typeof t.standard === 'string' && category(t.category) && integer(t.points) && typeof t.active === 'boolean')) fail();
  if (!value.rules.every(r => text(r.name) && ['reward','penalty','improvement'].includes(r.type) && Number.isSafeInteger(r.points) && (r.type === 'penalty' ? r.points < 0 : r.points > 0) && typeof r.active === 'boolean')) fail();
  if (!value.wishes.every(w => text(w.name) && integer(w.cost) && w.cost > 0 && WISH_ICONS.includes(w.icon))) fail();
  if (value.currentWishId !== null && !value.wishes.some(w => w.id === value.currentWishId && !w.deletedAt)) fail();
  if (value.achievements !== undefined && (!Array.isArray(value.achievements) || !unique(value.achievements) || !value.achievements.every(a => text(a.name) && a.name.length <= 80 && WISH_ICONS.includes(a.icon) && validDay(a.day) && typeof a.note === 'string' && a.note.length <= 1000))) fail();
  const keys = new Set();
  for (const e of value.entries) {
    if (!['task','custom','reward','penalty','improvement','exam','adjustment','redemption'].includes(e.type) || !text(e.name) || !category(e.category) || !Number.isSafeInteger(e.points) || !Number.isSafeInteger(e.rulePoints) || !validDay(e.day) || !Number.isFinite(Date.parse(e.createdAt)) || (e.voidedAt !== null && !Number.isFinite(Date.parse(e.voidedAt))) || (e.note !== undefined && typeof e.note !== 'string')) fail();
    if (['task','custom','reward','improvement'].includes(e.type) && (e.points < 0 || e.rulePoints !== e.points)) fail();
    if (e.type === 'task' && (!text(e.taskId) || !value.tasks.some(t => t.id === e.taskId))) fail();
    if (e.type === 'penalty' && (e.rulePoints >= 0 || e.points > 0 || e.points < e.rulePoints)) fail();
    if (e.type === 'exam') {
      if (!['chinese','math','english','other'].includes(e.category) || typeof e.score !== 'number') fail();
      let expected; try { expected = examPoints(e.score); } catch { fail(); }
      if (e.rulePoints !== expected || (expected >= 0 ? e.points !== expected : e.points < expected || e.points > 0)) fail();
    }
    if (e.type === 'adjustment' && (!text(e.note) || e.rulePoints !== e.points)) fail();
    if (e.type === 'redemption' && (!text(e.wishId) || !value.wishes.some(w => w.id === e.wishId) || !integer(e.cost) || e.cost < 1 || e.points !== -e.cost || e.rulePoints !== e.points || !WISH_ICONS.includes(e.wishIcon))) fail();
    if (e.correctedFrom && !value.entries.some(old => old.id === e.correctedFrom && old.voidedAt && old.type === e.type)) fail();
    if (!e.voidedAt && e.type === 'task') {
      const key = `${e.taskId}:${e.day}`;
      if (keys.has(key)) fail();
      keys.add(key);
    }
  }
  if (!Number.isSafeInteger(balance(value)) || balance(value) < 0) fail();
  return value;
}

export function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
export function examPoints(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100 || Math.abs(score * 10 - Math.round(score * 10)) > 1e-8) throw new Error('成绩应为 0–100，最多一位小数。');
  return score === 100 ? 5 : score >= 98 ? 2 : score >= 95 ? 1 : score >= 90 ? 0 : -2;
}
export function migrateState(value) {
  if (value?.version === 1) {
    if (!Array.isArray(value.entries) || value.entries.some(e => e?.type !== 'task' || familyDay(new Date(e.createdAt)) !== e.day)) throw new Error('旧版数据异常，未覆盖原记录。');
    value = { ...value, version: 2, rules: structuredClone(DEFAULT_RULES), wishes: value.wishes.map(w => ({ ...w, icon: w.icon === 'gift' ? '🥣' : w.icon })) };
  }
  return validateState(value);
}
