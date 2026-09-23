import { CATEGORIES, WISH_ICONS, activeEntries, balance, completedTasks, familyDay, examPoints, validateState, validDay, migrateState } from './domain.js';

const uid = () => crypto.randomUUID();
const text = (value, label, max = 80) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label}不能为空，最多 ${max} 个字。`);
  return value.trim();
};
const integer = (n, min = 0, max = 1000000) => { if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(`积分应为 ${min}–${max} 之间的整数。`); return n; };
const category = id => { if (!CATEGORIES.some(c => c.id === id)) throw new Error('请选择有效分类。'); return id; };
const note = value => { if (value !== undefined && (typeof value !== 'string' || value.length > 1000)) throw new Error('备注最多 1000 个字。'); return value?.trim() || ''; };
const result = (before, next, entry = null) => ({ state: validateState({ ...next, revision: before.revision + 1 }), entry });
function alive(list, id) { const found = list.find(item => item.id === id && !item.deletedAt); if (!found) throw new Error('内容已被修改或删除，请重新打开。'); return found; }
export function expectRevision(state, revision) { if (revision !== undefined && state.revision !== revision) throw new Error('记录刚刚发生了变化，请关闭窗口后重新操作。'); }
function push(state, data, { id = uid(), now = new Date() } = {}) {
  if (state.entries.some(e => e.id === id)) return { state, entry: null };
  const entry = { ...data, id, createdAt: now.toISOString(), day: familyDay(now), voidedAt: null };
  if (balance(state) + entry.points < 0) throw new Error('当前积分不足，无法完成这次操作。');
  return result(state, { ...state, entries: [...state.entries, entry] }, entry);
}
export function saveTask(state, input, id = null) {
  const values = { name: text(input.name, '任务名称'), category: category(input.category), standard: note(input.standard), points: integer(input.points), active: Boolean(input.active) };
  const item = id ? { ...alive(state.tasks, id), ...values } : { ...values, id: uid() };
  return result(state, { ...state, tasks: id ? state.tasks.map(t => t.id === id ? item : t) : [...state.tasks, item] });
}
export function deleteTask(state, id) {
  alive(state.tasks, id);
  return result(state, { ...state, tasks: state.tasks.map(t => t.id === id ? { ...t, active: false, deletedAt: new Date().toISOString() } : t) });
}
export function saveRule(state, input, id = null) {
  const old = id ? alive(state.rules, id) : null;
  const type = old?.type || 'reward';
  const amount = integer(input.points, 1);
  const item = { id: id || uid(), type, name: text(input.name, '奖励名称'), points: type === 'penalty' ? -amount : amount, active: Boolean(input.active) };
  return result(state, { ...state, rules: id ? state.rules.map(r => r.id === id ? item : r) : [...state.rules, item] });
}
export function saveWish(state, input, id = null) {
  if (!WISH_ICONS.includes(input.icon)) throw new Error('请选择一个愿望图标。');
  const values = { name: text(input.name, '愿望名称'), icon: input.icon, cost: integer(input.cost, 1) };
  const item = id ? { ...alive(state.wishes, id), ...values } : { ...values, id: uid() };
  const currentWishId = input.current ? item.id : state.currentWishId === item.id ? null : state.currentWishId;
  return result(state, { ...state, wishes: id ? state.wishes.map(w => w.id === id ? item : w) : [...state.wishes, item], currentWishId });
}
export function selectWish(state, id) { alive(state.wishes, id); return result(state, { ...state, currentWishId: id }); }
export function deleteWish(state, id) {
  alive(state.wishes, id);
  return result(state, { ...state, wishes: state.wishes.map(w => w.id === id ? { ...w, deletedAt: new Date().toISOString() } : w), currentWishId: state.currentWishId === id ? null : state.currentWishId });
}
export function recordOther(state, input, options = {}) {
  if (options.id && state.entries.some(e => e.id === options.id)) return { state, entry: null };
  const name = text(input.name, '记录名称');
  const item = { name, category: category(input.category), points: integer(input.points), note: note(input.note), type: 'custom' };
  item.rulePoints = item.points;
  if (input.fixed) {
    const newTask = { id: uid(), name, category: item.category, standard: '', points: item.points, active: true };
    state = { ...state, tasks: [...state.tasks, newTask] };
    item.type = 'task'; item.taskId = newTask.id;
  }
  return push(state, item, options);
}
export function recordRule(state, ruleId, comment, options = {}) {
  const rule = alive(state.rules, ruleId);
  if (!rule.active) throw new Error('这个奖励规则已停用。');
  return push(state, { type: rule.type, ruleId, name: rule.name, category: 'other', rulePoints: rule.points, points: Math.max(rule.points, -balance(state)), note: note(comment) }, options);
}
export function recordReward(state, input, options = {}) {
  const points = integer(input.points, 1);
  return push(state, { type: 'reward', name: text(input.name, '奖励原因'), category: 'other', rulePoints: points, points, note: note(input.note) }, options);
}
export function recordExam(state, input, options = {}) {
  if (!['chinese','math','english','other'].includes(input.category)) throw new Error('请选择考试科目。');
  const rulePoints = examPoints(input.score);
  return push(state, { type: 'exam', name: `${CATEGORIES.find(c => c.id === input.category).name}单元测试`, category: input.category, score: input.score, rulePoints, points: Math.max(rulePoints, -balance(state)), note: note(input.note) }, options);
}
export function adjustPoints(state, input, options = {}) {
  const points = integer(input.points, -1000000);
  if (!points) throw new Error('请填写需要增加或减少的积分。');
  return push(state, { type: 'adjustment', name: '手动调整积分', category: 'other', points, rulePoints: points, note: text(input.note, '调整原因', 1000) }, options);
}
export function redeemWish(state, id, options = {}) {
  if (options.id && state.entries.some(e => e.id === options.id)) return { state, entry: null };
  expectRevision(state, options.revision);
  const wish = alive(state.wishes, id);
  if (balance(state) < wish.cost) throw new Error(`还差 ${wish.cost - balance(state)} 积分，继续慢慢攒。`);
  return push(state, { type: 'redemption', wishId: id, name: wish.name, wishIcon: wish.icon, category: 'other', cost: wish.cost, points: -wish.cost, rulePoints: -wish.cost, note: '' }, options);
}
export function editEntry(state, entryId, input, { id = uid(), now = new Date() } = {}) {
  const old = state.entries.find(e => e.id === entryId && !e.voidedAt);
  if (!old) throw new Error('这条记录已经被修改或删除，请重新打开。');
  if (old.type === 'redemption') throw new Error('兑换记录保留当时的价格；如需纠错，请撤销后重新兑换。');
  const day = input.day || old.day;
  if (!validDay(day) || day > familyDay(now)) throw new Error('请选择今天或以前的有效日期。');
  const changed = { ...old, id, name: text(input.name, '记录名称'), category: category(input.category || old.category), note: note(input.note), day, voidedAt: null, correctedFrom: old.id, updatedAt: now.toISOString() };
  let points = integer(input.points ?? old.rulePoints, -1000000);
  if (old.type === 'exam') {
    if (!['chinese','math','english','other'].includes(changed.category)) throw new Error('请选择考试科目。');
    changed.score = input.score;
    points = examPoints(changed.score);
    changed.name = `${CATEGORIES.find(c => c.id === changed.category).name}单元测试`;
  }
  if (['task','custom','reward','improvement'].includes(old.type) && points < 0) throw new Error('任务和奖励不能设置负积分。');
  if (old.type === 'penalty' && points >= 0) throw new Error('扣分记录应为负积分。');
  if (old.type === 'adjustment' && !changed.note) throw new Error('请填写调整原因。');
  changed.rulePoints = points;
  const without = balance(state) - old.points;
  changed.points = points < 0 && without >= 0 && ['penalty','exam'].includes(old.type) ? Math.max(points, -without) : points;
  if (without + changed.points < 0) throw new Error('修改后积分不足，请先撤销相关兑换或调整积分。');
  if (old.type === 'task' && activeEntries(state).some(e => e.id !== old.id && e.type === 'task' && e.taskId === old.taskId && e.day === day)) throw new Error('这个任务在所选日期已经完成过，不能重复记录。');
  return result(state, { ...state, entries: [...state.entries.map(e => e.id === old.id ? { ...e, voidedAt: now.toISOString() } : e), changed] }, changed);
}
export function achievements(state) {
  const entries = activeEntries(state);
  const count = id => entries.filter(e => e.type === 'task' && e.taskId === id).length;
  return [
    ['📖','第一次英语阅读',count('english-reading'),1],['🌟','英语阅读 10 次',count('english-reading'),10],
    ['🔢','口算 30 次',count('math-calculation'),30],['✍️','第 5 篇作文',count('chinese-writing'),5],
    ['🏃','运动 10 次',entries.filter(e => ['task','custom'].includes(e.type) && e.category === 'sport').length,10],
    ['🎁','第一次兑换愿望',entries.filter(e => e.type === 'redemption').length,1],
  ].map(([icon,name,count,target]) => ({icon,name,count,target,earned:count>=target}));
}
export function carelessTrend(state, now = new Date()) {
  const day = familyDay(now), current = day.slice(0,7);
  const previousDate = new Date(`${current}-01T00:00:00Z`); previousDate.setUTCMonth(previousDate.getUTCMonth()-1);
  const previous = previousDate.toISOString().slice(0,7);
  const entries = activeEntries(state);
  const matches = month => entries.filter(e => e.type === 'penalty' && e.ruleId === 'careless' && e.day.startsWith(month)).length;
  return { current: matches(current), previous: matches(previous), hasPrevious: entries.some(e => e.day.startsWith(previous)) };
}
export function makeBackup(state) { return JSON.stringify({ app: 'xiaoyi-growth-planet', exportedAt: new Date().toISOString(), state: validateState(state) }, null, 2); }
export function parseBackup(raw) {
  if (typeof raw !== 'string' || raw.length > 10000000) throw new Error('备份文件太大，或不是可读取的文本。');
  let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('这不是有效的 JSON 备份文件。'); }
  if (parsed.app !== 'xiaoyi-growth-planet') throw new Error('请选择小伊的成长星球导出的完整备份。');
  return migrateState(parsed.state);
}
export function toCSV(state) {
  const names = {task:'固定任务',custom:'临时任务',reward:'额外奖励',penalty:'需要改进',improvement:'改进成功',exam:'单元测试',adjustment:'积分调整',redemption:'愿望兑换'};
  const cell = value => { let s = String(value ?? ''); if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };
  const rows = [['日期','项目','类型','分类','规则积分','实际积分','成绩','备注'], ...activeEntries(state).map(e => [e.day,e.name,names[e.type],CATEGORIES.find(c => c.id === e.category)?.name,e.rulePoints,e.points,e.score ?? '',e.note || ''])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export function saveAchievement(state, input, id = null) {
  if (!validDay(input.day) || input.day > familyDay()) throw new Error('请选择今天或以前的日期。');
  if (!WISH_ICONS.includes(input.icon)) throw new Error('请选择有效图标。');
  const list = state.achievements || [];
  const item = { ...(id ? alive(list,id) : {id:uid()}), name:text(input.name,'成就名称'), note:note(input.note), day:input.day, icon:input.icon };
  return result(state,{...state,achievements:id?list.map(a=>a.id===id?item:a):[...list,item]});
}
export function deleteAchievement(state,id) {
  alive(state.achievements || [],id);
  return result(state,{...state,achievements:state.achievements.map(a=>a.id===id?{...a,deletedAt:new Date().toISOString()}:a)});
}
