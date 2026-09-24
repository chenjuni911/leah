import { CATEGORIES, familyDay, activeEntries, balance, completedTasks, recordTask, undoEntry, wishProgress, periodEntries, statistics } from './domain.js';
import { STORAGE_KEY } from './store.js';
import { createCloudUI } from './cloud-ui.js';
import { createStage2, signed, typeNames } from './stage2-ui.js';

const main = document.querySelector('#main');
const navigation = document.querySelector('#navigation');
const feedback = document.querySelector('#feedback');
const feedbackMessage = document.querySelector('#feedback-message');
const undoButton = document.querySelector('#undo-button');
const dialog = document.querySelector('#confirm-dialog');
let state;
const cloudUI = createCloudUI({
  getState: () => state,
  accept: value => { state = value; main.hidden = false; document.querySelector('#manage-toggle').disabled = false; render(); },
  block: () => { state = null; main.innerHTML = ''; main.hidden = true; navigation.innerHTML = ''; document.querySelector('#manage-toggle').disabled = true; },
  notify: (...args) => showFeedback(...args),
});
let managing = false;
const stage2 = createStage2({ getState: () => state, isManaging: () => managing, mutate, render, notify: showFeedback, setState: value => { state = value; } });
let period = 'month';
let historyLimit = 5;
let noticeTimer;
let undoId = null;
let busy = false;
let shownDay = familyDay();
let cheerTimer;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const routes = [{ id: 'record', name: '记录', icon: 'check' }, { id: 'wishes', name: '愿望', icon: 'heart' }, { id: 'growth', name: '成长', icon: 'chart' }];
const categoryEmoji = { chinese: '📖', math: '🔢', english: '🔤', sport: '🏃', life: '🌱', other: '✨' };
const qiuqiuAsset = './assets/qiuqiu-640.webp';
function icon(name, className = '') {
  const paths = {
    check: '<path d="m5 12 4 4L19 6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    chart: '<path d="M5 20V10m7 10V4m7 16v-7"/>',
    book: '<path d="M12 6c-3-3-7-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/>',
    math: '<path d="M5 5h6M8 2v6m7 10h6m-6 3h6M4 15l6 6m0-6-6 6m10-15h6"/>',
    language: '<path d="m3 18 5-12 5 12M5 14h6m5-8h5m-3-3v3m-3 4h6m-5 0c0 4 2 6 5 8m-1-8c0 4-2 6-5 8"/>',
    activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    star: '<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3 9.6l6.3-.9L12 3Z"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    gift: '<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8H8C3 8 5 1 9 4l3 4Zm0 0h4c5 0 3-7-1-4l-3 4Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5m-5 5 5 5" transform="translate(0 -2)"/>',
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
}
function route() { return routes.some(r => r.id === location.hash.slice(1)) ? location.hash.slice(1) : 'record'; }
function formatDate(day, options = {}) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', ...options }).format(new Date(`${day}T12:00:00+08:00`)); }
function formatTime(createdAt) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(createdAt)); }
function heading(title, subtitle) { return `<div class="page-heading"><div><p class="eyebrow">${escape(subtitle)}</p><h1>${title}</h1></div><span class="date-chip">${icon('calendar')}${formatDate(familyDay(), { weekday: 'long' })}</span></div>`; }
function pointsCard() {
  return `<section class="points-card" aria-label="我的积分"><span class="points-star" aria-hidden="true">⭐</span><div><div class="card-label">我的积分</div><div class="points-total"><strong id="current-points">${balance(state)}</strong><span>积分</span></div></div><a href="#growth" class="points-detail" aria-label="查看积分记录">${icon('arrow')}</a></section>`;
}
function companion(className = '') { return `<img src="${qiuqiuAsset}" srcset="./assets/qiuqiu-320.webp 320w, ./assets/qiuqiu-640.webp 640w" sizes="(max-width:600px) 200px, 260px" decoding="async" width="380" height="480" alt="黄色玄凤球球" class="qiuqiu ${className}" />`; }
function greeting() {
  return `<section class="greeting"><div class="greeting-copy"><h1 aria-label="小伊，今天也很棒！">小伊，<br>今天也很棒！</h1><p>坚持做喜欢的事，<br>成为更好的自己！</p>${pointsCard()}</div><div class="companion-scene"><span class="sun-sticker" aria-hidden="true">☀️</span>${companion('hero-bird')}<p class="speech-bubble">${wishProgress(state).wish && wishProgress(state).remaining===0 ? '愿望攒够啦<br>可以兑换啦！' : '我是球球<br>和你一起<br>加油！'}<span aria-hidden="true">♥</span></p></div></section>`;
}
function wishCard(large = false) {
  const { wish, points, remaining, percent } = wishProgress(state);
  if (!wish) return '<section class="wish-card no-wish"><h2>还没有当前愿望</h2><p>选一个现在最想实现的愿望吧。</p><a href="#wishes" class="text-link">去愿望页选择</a></section>';
  return `<section class="wish-card ${large ? 'wish-large' : ''}" aria-label="当前愿望">${large ? '<div class="wish-ribbon"><span aria-hidden="true">👑</span> 当前目标</div>' : ''}<div class="wish-art">${large ? companion('wish-bird') : ''}<span class="snack-icon" aria-hidden="true">${escape(wish.icon)}</span></div><div class="wish-copy"><h2>${escape(wish.name)}</h2><p class="wish-price">${wish.cost} 积分</p><div class="wish-progress-label"><strong>${points}<span> / ${wish.cost}</span></strong><span>${remaining ? `还差 <b>${remaining}</b> 积分` : '可以兑换啦！'}</span></div><div class="progress-track" role="progressbar" aria-label="当前愿望进度" aria-valuemin="0" aria-valuemax="${wish.cost}" aria-valuenow="${Math.min(points, wish.cost)}" aria-valuetext="已有 ${points} 积分，${remaining ? `还差 ${remaining} 积分` : '已达成愿望所需积分'}"><span style="width:${percent}%"></span></div>${large ? '<p class="wish-cheer">球球陪你，一起加油！♡</p>' + stage2.wishButtons(wish) : ''}</div>${!large ? `<a class="wish-detail" href="#wishes" aria-label="查看我的愿望">${icon('heart')}</a>` : ''}</section>`;
}
function taskGroup(category, done) {
  const tasks = state.tasks.filter(t => t.category === category.id && !t.deletedAt && (managing || t.active));
  if (!tasks.length) return '';
  const count = tasks.filter(t => done.has(t.id)).length;
  return `<section class="task-group ${category.id}"><div class="group-heading"><span class="category-icon" aria-hidden="true">${categoryEmoji[category.id]}</span><h3>${category.name}</h3><span class="category-count" aria-label="今日完成 ${count} 项，共 ${tasks.length} 项">(${count}/${tasks.length})</span><span class="group-flourish" aria-hidden="true">✦</span></div><div class="task-list">${tasks.map(t => `<div class="task-wrapper"><button type="button" data-task="${escape(t.id)}" class="task-row ${done.has(t.id) ? 'completed' : ''}" aria-label="${escape(t.name)}，${done.has(t.id) ? '今日已完成' : `加 ${t.points} 积分`}，${escape(t.standard)}" ${done.has(t.id) || !t.active ? 'aria-disabled="true"' : ''} ${!t.active?'disabled':''}><span class="task-check">${done.has(t.id) ? icon('check') : ''}</span><span class="task-copy"><span class="task-name">${escape(t.name)}</span><span class="task-standard">${!t.active?'已停用':done.has(t.id) ? '今日已完成' : t.standard ? `（${escape(t.standard)}）` : ''}</span></span><span class="task-points">+${t.points}</span></button>${stage2.taskEdit(t)}</div>`).join('')}</div></section>`;
}
function recordsList(entries, { compact = false, limit = Infinity, redemption = false } = {}) {
  if (redemption && !entries.length) return '<div class="empty-state"><h3>还没有兑换过愿望</h3><p>慢慢攒，期待第一个愿望实现。</p></div>';
  if (!entries.length) return `<div class="empty-state">${icon('book')}<h3>${compact ? '今天的故事，从这里开始' : '这里会记住每一次努力'}</h3><p>完成一件小事，再来记一笔吧。</p>${compact ? '' : '<a href="#record" class="primary-button">去记录</a>'}</div>`;
  const sorted = [...entries].sort((a,b)=>b.day.localeCompare(a.day)||b.createdAt.localeCompare(a.createdAt));
  const visible = sorted.slice(0,limit);
  const days = [...new Set(visible.map(e=>e.day))];
  return days.map(day=>`<div class="record-day">${compact?'':`<div class="day-heading"><h3>${day===familyDay()?'今天':formatDate(day,{year:'numeric'})}</h3><span>${signed(sorted.filter(e=>e.day===day).reduce((s,e)=>s+e.points,0))} 积分</span></div>`}${visible.filter(e=>e.day===day).map(e=>{const category=CATEGORIES.find(c=>c.id===e.category);return `<div class="history-row"><span class="history-icon ${e.category}">${e.type==='redemption'?escape(e.wishIcon):icon(category?.symbol)}</span><div class="history-copy"><strong>${escape(e.name)}${e.type==='exam'?` · ${e.score} 分`:''}</strong><span>${typeNames[e.type]} · ${formatTime(e.createdAt)}${e.rulePoints!==e.points?` · 规则 ${signed(e.rulePoints)}`:''}</span>${e.note?`<p class="history-note">${escape(e.note)}</p>`:''}</div><strong class="history-points ${e.points<0?'negative':''}">${signed(e.points)}</strong>${stage2.editHistory(e)}${managing ? `<button class="history-undo" type="button" data-undo="${escape(e.id)}" aria-label="撤销${escape(e.name)}的记录">${icon('undo')}</button>` : ''}</div>`;}).join('')}</div>`).join('');
}
function recordPage() {
  const done = completedTasks(state);
  const today = activeEntries(state).filter(e => e.day === familyDay());
  return `${stage2.toolbar()}<div class="record-overview">${greeting()}${wishCard()}</div><div class="content-heading task-section-heading"><h2>做完了，就记一下</h2><span>${formatDate(familyDay())} · 今天完成 ${statistics(today).tasks} 项</span></div><div class="task-grid">${CATEGORIES.map(c => taskGroup(c, done)).join('')}</div>${stage2.quickActions()}<section class="recent-section"><div class="content-heading"><h2>今天的足迹 <span class="count-pill">${today.length}</span></h2><a href="#growth" class="text-link">全部记录 ${icon('arrow')}</a></div>${recordsList(today, { compact: true, limit: 5 })}</section>`;
}
function wishesPage() {
  return `${stage2.toolbar()}${heading('<span aria-hidden="true">💗</span> 我的愿望', '把喜欢的东西变成努力的动力！')}<div class="wish-layout">${wishCard(true)}<aside class="wish-note"><span class="note-heart" aria-hidden="true">💖</span><h2>每一个小小的努力，<br>都会离愿望更近一步！</h2><p>现在有 <strong>${balance(state)} 积分</strong>，<br>按自己的节奏，慢慢攒。</p><a href="#record" class="text-link">记录今天的完成 ${icon('arrow')}</a><span class="note-signature">—— 球球</span></aside></div>${stage2.wishList()}<section class="recent-section"><div class="content-heading"><h2>兑换记录</h2></div>${recordsList(activeEntries(state).filter(e=>e.type==='redemption'), {redemption:true,limit:historyLimit})}${historyControls(activeEntries(state).filter(e=>e.type==='redemption').length)}</section>`;
}
function historyControls(count) {
  return count > 5 ? `<div class="history-controls"><span>已显示 ${Math.min(historyLimit,count)} / ${count} 条</span>${historyLimit<count?`<button type="button" class="text-link" data-history-more>${historyLimit===5?'查看全部记录':'再显示 20 条'}</button>`:''}${historyLimit>5?'<button type="button" class="text-link" data-history-less>收起</button>':''}</div>` : '';
}
function growthPage() {
  const entries = periodEntries(state, period);
  const stats = statistics(entries);
  const max = Math.max(1, ...Object.values(stats.categories));
  return `${stage2.toolbar()}${heading('<span aria-hidden="true">📊</span> 小伊的成长', '努力的每一天，都在让你变得更棒！')}<div class="growth-toolbar"><h2>每一步都留下足迹</h2><div class="period-switch" role="group" aria-label="统计时间范围">${[['week', '本周'], ['month', '本月'], ['all', '全部']].map(([id, name]) => `<button type="button" data-period="${id}" aria-pressed="${id === period}">${name}</button>`).join('')}</div></div><div class="stats-grid"><section><span class="stat-emoji" aria-hidden="true">⭐</span><p>获得积分</p><strong>${stats.earned}<span> 积分</span></strong></section><section><span class="stat-emoji" aria-hidden="true">✅</span><p>完成任务</p><strong>${stats.tasks}<span> 次</span></strong></section><section><span class="stat-emoji" aria-hidden="true">🗓️</span><p>有记录的日子</p><strong>${stats.days}<span> 天</span></strong></section><section><span class="stat-emoji" aria-hidden="true">🏆</span><p>兑换愿望</p><strong>${stats.redemptions}<span> 次</span></strong></section></div><section class="category-summary"><h2>各分类完成情况</h2><div class="category-bars">${CATEGORIES.map(c => `<div class="category-bar ${c.id}"><span><span aria-hidden="true">${categoryEmoji[c.id]}</span>${c.name}</span><div><i style="width:${stats.categories[c.id] / max * 100}%"></i></div><strong>${stats.categories[c.id]}<small> 次</small></strong></div>`).join('')}</div></section>${stage2.growthExtras()}<section class="recent-section"><div class="content-heading"><h2>成长记录</h2><span>积分和努力，都有迹可循</span></div>${recordsList(entries,{limit:historyLimit})}${historyControls(entries.length)}</section><div class="data-footer"><button type="button" class="text-link" data-action="data">备份与导出</button></div>`;
}
function render({ preserveFocus = true } = {}) {
  if (!state) return;
  const active = document.activeElement;
  const focusTask = preserveFocus && active?.dataset?.task;
  const focusPeriod = preserveFocus && active?.dataset?.period;
  const currentRoute = route();
  const manageButton=document.querySelector('#manage-toggle'); manageButton.textContent=managing?'完成管理':'管理'; manageButton.setAttribute('aria-pressed',String(managing));
  navigation.innerHTML = routes.map(r => `<a href="#${r.id}" ${r.id === currentRoute ? 'aria-current="page"' : ''}>${icon(r.icon)}<span>${r.name}</span></a>`).join('');
  main.innerHTML = currentRoute === 'record' ? recordPage() : currentRoute === 'wishes' ? wishesPage() : growthPage();
  document.title = `${routes.find(r => r.id === currentRoute).name} · 小伊的成长星球`;
  if (focusTask) main.querySelector(`[data-task="${CSS.escape(focusTask)}"]`)?.focus({ preventScroll: true });
  if (focusPeriod) main.querySelector(`[data-period="${CSS.escape(focusPeriod)}"]`)?.focus({ preventScroll: true });
  shownDay = familyDay();
}
function showFeedback(message, entryId = null, error = false) {
  if (!error && message === '这次突破已经记下来啦！') celebrate();
  clearTimeout(noticeTimer);
  undoId = entryId;
  feedbackMessage.textContent = message;
  undoButton.hidden = !entryId;
  feedback.classList.toggle('is-error', error);
  feedback.hidden = false;
  noticeTimer = setTimeout(hideFeedback, error ? 15000 : 10000);
}
function hideFeedback() { feedback.hidden = true; undoId = null; clearTimeout(noticeTimer); }
function fatal(error) {
  main.innerHTML = `<section class="load-error"><h1>暂时没能读取成长记录</h1><p>原有数据没有被覆盖。可以下载一份原始数据，再重新打开页面。</p><p class="error-detail">${escape(error.message || '浏览器可能限制了本地保存。')}</p><button class="primary-button" type="button" data-retry>重新读取</button><button class="secondary-button" type="button" data-export>下载原始数据</button></section>`;
}
function readAndRender() { void cloudUI.refresh(); }
async function mutate(update) {
  if (busy) return null;
  busy = true;
  try {
    const result = await cloudUI.mutate(update);
    if (!state || result.state.revision >= state.revision) state = result.state;
    render();
    return result;
  } catch (error) {
    const message=error.message || '请检查此浏览器的存储空间后重试。';
    const formError=document.querySelector('#editor-dialog[open] #editor-error'); if(formError)formError.textContent=message;
    showFeedback(`没有保存成功：${message}`, null, true);
    return null;
  } finally { busy = false; }
}
function celebrate() {
  document.querySelector('.star-celebration')?.remove();
  const burst=document.createElement('div');burst.className='star-celebration';burst.setAttribute('aria-hidden','true');
  burst.innerHTML=Array.from({length:9},(_,i)=>`<span style="--angle:${i*40}deg;--delay:${i%3*60}ms">${i%2?'✧':'✦'}</span>`).join('');
  document.body.append(burst);setTimeout(()=>burst.remove(),1500);
}
function encourage() {
  const bubble=document.querySelector('.speech-bubble');if(!bubble)return;
  const cheers=['又完成一件事，真棒！','今天的努力，球球看见啦！','一点点积累，也很了不起！'];
  bubble.textContent=wishProgress(state).wish && wishProgress(state).remaining===0?'愿望攒够啦，可以兑换啦！':cheers[Math.floor(Math.random()*cheers.length)];
  bubble.classList.add('is-cheering');clearTimeout(cheerTimer);
  cheerTimer=setTimeout(()=>{if(bubble.isConnected){bubble.classList.remove('is-cheering');bubble.innerHTML=wishProgress(state).wish && wishProgress(state).remaining===0?'愿望攒够啦<br>可以兑换啦！':'我是球球<br>和你一起<br>加油！';}},4500);
}
const taskDialog = document.createElement('dialog');
taskDialog.id='task-confirm-dialog';taskDialog.setAttribute('aria-labelledby','task-confirm-title');
taskDialog.innerHTML='<form method="dialog"><span class="dialog-icon" aria-hidden="true">⭐</span><h2 id="task-confirm-title">确认完成这项任务？</h2><p id="task-confirm-description"></p><div class="dialog-actions"><button value="cancel" class="secondary-button" autofocus>暂不记录</button><button value="confirm" class="primary-button">确认完成</button></div></form>';
document.body.append(taskDialog);
let pendingTask=null;
function confirmTask(taskId) {
  if(!state || busy || taskDialog.open)return;
  const task=state.tasks.find(t=>t.id===taskId && t.active && !t.deletedAt);
  if(!task || completedTasks(state).has(taskId))return;
  pendingTask={id:taskId,revision:state.revision,day:familyDay()};
  taskDialog.querySelector('p').textContent=`「${task.name}」${task.standard?'（'+task.standard+'）':''}已完成了吗？确认后增加 ${task.points} 积分。`;
  taskDialog.returnValue='';taskDialog.showModal();
}
taskDialog.addEventListener('close',()=>{
  const pending=pendingTask;pendingTask=null;
  if(taskDialog.returnValue==='confirm' && pending)void complete(pending.id,pending);
});
async function complete(taskId, expected) {
  const result = await mutate(before => {
    if(expected && (before.revision!==expected.revision || familyDay()!==expected.day))throw new Error('记录或日期已经变化，请重新点选任务并确认。');
    return recordTask(before, taskId);
  });
  if (result?.entry) { showFeedback(`球球：${result.entry.name}完成啦！ +${result.entry.points} 积分`, result.entry.id); encourage(); }
  else if (result) showFeedback('这项任务今天已经记录过啦。');
  return result;
}
async function undo(entryId) {
  const result = await mutate(before => undoEntry(before, entryId));
  if (result?.entry) showFeedback(`已撤销${result.entry.name}，积分已恢复。`);
  else if (result) showFeedback('这条记录已经撤销了。');
}
main.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-history-more')) { historyLimit = historyLimit===5?20:historyLimit+20; render(); return; }
  if (button.hasAttribute('data-history-less')) { historyLimit=5; render(); return; }
  if (button.dataset.task) { confirmTask(button.dataset.task); return; }
  if (button.dataset.period) { period = button.dataset.period; historyLimit=5; render(); return; }
  if (button.dataset.undo) {
    const entry = state.entries.find(e => e.id === button.dataset.undo && !e.voidedAt);
    if (!entry) return;
    document.querySelector('#dialog-description').textContent = `撤销「${entry.name}」后，积分从 ${balance(state)} 变为 ${balance(state)-entry.points}。${entry.type==='task' && entry.day === familyDay() ? '这项任务今天可以重新记录。' : '其他记录不受影响。'}`;
    dialog.dataset.entryId = entry.id;
    dialog.returnValue = '';
    dialog.showModal();
  }
  if (button.hasAttribute('data-retry')) readAndRender();
  if (button.hasAttribute('data-export')) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const url = URL.createObjectURL(new Blob([raw ?? '没有找到保存的数据'], { type: 'text/plain;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `小伊成长记录-原始数据-${familyDay()}.txt`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { showFeedback('此浏览器没有开放数据读取，请换回之前使用的浏览器。', null, true); }
  }
});
dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') void undo(dialog.dataset.entryId); });
document.querySelector('#manage-toggle').addEventListener('click',()=>{managing=!managing;render();});
undoButton.addEventListener('click', () => { if (undoId) void undo(undoId); });
document.querySelector('#dismiss-feedback').addEventListener('click', hideFeedback);
window.addEventListener('hashchange', () => { if (state) { historyLimit=5; render({ preserveFocus: false }); main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); } });
// Cloud snapshots are authoritative; legacy browser data stays untouched.
document.addEventListener('visibilitychange', () => { if (!document.hidden) readAndRender(); });
window.addEventListener('focus', readAndRender);
setInterval(() => { if (familyDay() !== shownDay && !document.hidden) readAndRender(); }, 1000);
void cloudUI.start();

// Optional browser-agent access shares the exact same recording path as the UI.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tool = { name: 'record_completed_task', title: '记录已完成的任务', description: '打开固定任务确认窗口，用户确认后才增加积分。同一任务北京时间每天最多一次。', inputSchema: { type: 'object', properties: { taskId: { type: 'string', description: '当前固定任务的稳定编号' } }, required: ['taskId'], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input) {
    if (!input || typeof input.taskId !== 'string' || Object.keys(input).some(k => k !== 'taskId') || !state?.tasks.some(t => t.id === input.taskId)) throw new Error('请提供有效的任务编号。');
    confirmTask(input.taskId);
    return { recorded: false, awaitingConfirmation: taskDialog.open, points: balance(state) };
  } };
  try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Browsers without this optional proposal remain fully usable. */ }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
