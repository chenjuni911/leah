import { CATEGORIES, WISH_ICONS, activeEntries, balance, examPoints, familyDay, migrateState } from './domain.js';
import * as op from './operations.js';
import { RECOVERY_KEY, restoreState, withStorageLock, readState } from './store.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const signed = n => n > 0 ? `+${n}` : String(n);
export const typeNames = { task:'固定任务',custom:'临时任务',reward:'额外奖励',penalty:'需要改进',improvement:'改进成功',exam:'单元测试',adjustment:'积分调整',redemption:'愿望兑换' };
const options = (list, selected) => list.map(([value,label]) => `<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('');
const field = (label, name, value = '', attrs = '') => `<label class="form-field">${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const select = (label,name,list,value) => `<label class="form-field">${label}<select name="${name}">${options(list,value)}</select></label>`;
const noteField = (value='') => `<label class="form-field">备注（可选）<textarea name="note" maxlength="1000" rows="2">${esc(value)}</textarea></label>`;
const check = (label,name,checked) => `<label class="form-check"><input type="checkbox" name="${name}" ${checked?'checked':''}>${label}</label>`;
const categories = CATEGORIES.map(c => [c.id,c.name]);
const pointsField = (value=1,min=0,label='积分') => field(label,'points',value,`type="number" inputmode="numeric" min="${min}" max="1000000" step="1" required`);
const action = (name,label,id='',className='secondary-button') => `<button type="button" class="${className}" data-action="${name}" data-id="${esc(id)}">${label}</button>`;

export function createStage2({ getState, isManaging, mutate, render, notify, setState }) {
  const editor = document.createElement('dialog');
  editor.id = 'editor-dialog'; editor.className = 'editor-dialog'; editor.setAttribute('aria-labelledby','editor-title');
  document.body.append(editor);
  let submitting = false;
  const state = () => getState();
  const commit = async (update, message, entryUndo = false) => {
    const result = await mutate(update);
    if (result) notify(message, entryUndo ? result.entry?.id : null);
    return result;
  };
  function open(title, html, save, submitLabel='保存', afterOpen) {
    editor.innerHTML = `<form id="editor-form"><div class="editor-heading"><h2 id="editor-title">${esc(title)}</h2><button type="button" class="close-editor" data-close aria-label="关闭窗口">×</button></div>${html}<p id="editor-error" class="form-error" role="alert"></p>${save ? `<div class="dialog-actions"><button type="button" class="secondary-button" data-close>取消</button><button type="submit" class="primary-button" id="editor-submit">${submitLabel}</button></div>` : ''}</form>`;
    editor.querySelector('form').onsubmit = async event => {
      event.preventDefault(); if (!save || submitting) return;
      submitting = true;
      const submit = editor.querySelector('#editor-submit'); if (submit) submit.disabled = true;
      editor.querySelector('#editor-error').textContent = '';
      try {
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const done = await save(data);
        if (done) editor.close();
      } catch (error) { editor.querySelector('#editor-error').textContent = error.message || '没有保存成功，请重试。'; }
      finally { submitting = false; if (submit?.isConnected) submit.disabled = false; }
    };
    if (!editor.open) editor.showModal();
    afterOpen?.();
  }
  function revisionGuard(update) { const revision = state().revision; return before => { op.expectRevision(before,revision); return update(before); }; }
  function editTask(id) {
    const t = state().tasks.find(t => t.id === id) || {name:'',category:'chinese',standard:'',points:1,active:true};
    const revision = state().revision;
    open(id?'编辑任务':'添加固定任务', `<p class="form-hint">分值调整只影响之后的记录，历史积分保留。</p>${field('任务名称','name',t.name,'required maxlength="80"')}${select('分类','category',categories,t.category)}${field('完成标准','standard',t.standard,'maxlength="1000"')}${pointsField(t.points)}${check('在记录页显示这个任务','active',t.active)}${id?action('delete-task','删除任务',id,'danger-link'):''}`, data => commit(before => { if(id) op.expectRevision(before,revision); return op.saveTask(before,{...data,points:Number(data.points),active:data.active==='on'},id||null); },'任务已保存。'));
  }
  function editWish(id) {
    const w=state().wishes.find(w=>w.id===id)||{name:'',icon:'🎁',cost:20};
    const revision=state().revision;
    open(id?'编辑愿望':'添加愿望',`${select('愿望图标','icon',WISH_ICONS.map(i=>[i,i]),w.icon)}${field('愿望名称','name',w.name,'required maxlength="80"')}${field('所需积分','cost',w.cost,'type="number" min="1" max="1000000" step="1" required')}${check('设为当前目标','current',id?state().currentWishId===id:!state().currentWishId)}${id?action('delete-wish','删除愿望',id,'danger-link'):''}`,data=>commit(before=>{if(id)op.expectRevision(before,revision);return op.saveWish(before,{...data,cost:Number(data.cost),current:data.current==='on'},id||null);},'愿望已保存。'));
  }
  function otherRecord() {
    const id=crypto.randomUUID();
    open('今天还完成了什么？',`${field('记录名称','name','','required maxlength="80"')}${select('分类','category',categories,'other')}${pointsField(1)}${noteField()}${check('以后还会做，加入固定任务','fixed',false)}`,data=>commit(before=>op.recordOther(before,{...data,points:Number(data.points),fixed:data.fixed==='on'},{id}),'已记录这次完成。',true),'完成并记录');
  }
  function ruleMenu(improvement=false) {
    const rules=state().rules.filter(r=>r.active&&!r.deletedAt&&(improvement?['penalty','improvement'].includes(r.type):r.type==='reward'));
    open(improvement?'认真审题，慢慢进步':'额外奖励',`<div class="rule-options">${rules.map(r=>action('record-rule',`<span>${esc(r.name)}</span><strong>${signed(r.points)}</strong>`,r.id,'rule-choice')).join('')}</div>${!improvement?action('custom-reward','＋ 自定义奖励','','text-link'):''}${!rules.length?'<p class="form-hint">暂无启用的规则，可在管理中调整。</p>':''}`,null);
  }
  function ruleRecord(id) {
    const r=state().rules.find(r=>r.id===id); if(!r)return;
    const revision=state().revision,operationId=crypto.randomUUID();
    open(r.type==='penalty'?'记录一次需要改进':r.name,`<div class="confirmation-summary"><strong>${esc(r.name)}</strong><b>${signed(r.points)} 积分</b></div>${noteField()}<p class="form-hint">${r.type==='penalty'?'记录这次看错题的情况，下次进步也值得记下来。':'每一次值得肯定的努力，都可以单独记录。'}</p>`,data=>commit(before=>{op.expectRevision(before,revision);return op.recordRule(before,id,data.note,{id:operationId});},'记录已保存。',true),r.type==='penalty'?`确认 ${signed(r.points)} 积分`:'确认奖励');
  }
  function customReward() {
    const id=crypto.randomUUID();
    open('自定义奖励',`${field('奖励原因','name','','required maxlength="80"')}${pointsField(1,1)}${noteField()}`,data=>commit(before=>op.recordReward(before,{...data,points:Number(data.points)},{id}),'奖励已记录。',true),'确认奖励');
  }
  function exam() {
    const id=crypto.randomUUID();
    open('记录单元测试',`${select('科目','category',categories.filter(([id])=>['chinese','math','english','other'].includes(id)),'math')}${field('成绩','score','','type="number" inputmode="decimal" min="0" max="100" step="0.1" required')}<p class="score-preview" id="score-preview">输入成绩后自动计算积分</p><p class="form-hint">100 分 +5；98–99.9 分 +2；95–97.9 分 +1；90–94.9 分 0；低于 90 分 -2。</p>${noteField()}`,data=>commit(before=>op.recordExam(before,{...data,score:Number(data.score)},{id}),'单元测试已记录。',true),'确认记录',()=>editor.querySelector('[name="score"]').addEventListener('input',event=>{
      const value=event.target.value;let message='输入成绩后自动计算积分';
      try {if(value!=='')message=`本次积分：${signed(examPoints(Number(value)))}`;}catch{message='请输入 0–100 的成绩，最多一位小数。';}
      editor.querySelector('#score-preview').textContent=message;
    }));
  }
  function adjustment() {
    const id=crypto.randomUUID();
    open('调整积分',`<p class="form-hint">当前 ${balance(state())} 积分。输入正数增加、负数减少，每次调整都会留记录。</p>${pointsField(1,-1000000,'调整数量（可为负数）')}${field('调整原因','note','','required maxlength="1000"')}`,data=>commit(before=>op.adjustPoints(before,{...data,points:Number(data.points)},{id}),'积分调整已记录。',true),'确认调整');
  }
  function redeem(id) {
    const w=state().wishes.find(w=>w.id===id&&!w.deletedAt); if(!w)return;
    const revision=state().revision,operationId=crypto.randomUUID();
    open('确认兑换这个愿望？',`<div class="confirmation-summary"><span class="confirm-emoji">${w.icon}</span><strong>${esc(w.name)}</strong><b>使用 ${w.cost} 积分</b></div><p class="form-hint">当前 ${balance(state())} 积分，兑换后剩余 ${balance(state())-w.cost} 积分。愿望会保留，以后还可以再兑换。</p>`,()=>commit(before=>op.redeemWish(before,id,{id:operationId,revision}),'愿望兑换成功！',true),'确认兑换');
  }
  function remove(kind,id) {
    const list=kind==='task'?state().tasks:state().wishes;const item=list.find(x=>x.id===id);if(!item)return;
    const update=revisionGuard(before=>kind==='task'?op.deleteTask(before,id):op.deleteWish(before,id));
    open('确认删除？',`<p class="form-hint">删除「${esc(item.name)}」？已有积分和历史记录会保留。</p>`,()=>commit(update,'已删除，历史记录保留。'),'确认删除');
  }
  function editRecord(id) {
    const e=state().entries.find(e=>e.id===id&&!e.voidedAt);if(!e||e.type==='redemption')return;
    const revision=state().revision,newId=crypto.randomUUID();
    const fields=`<p class="form-hint">只修改这一笔记录，不改动固定任务规则。</p>${e.type!=='exam'?field('记录名称','name',e.name,'required maxlength="80"'):''}${select(e.type==='exam'?'科目':'分类','category',e.type==='exam'?categories.filter(([id])=>['chinese','math','english','other'].includes(id)):categories,e.category)}${field('日期','day',e.day,`type="date" max="${familyDay()}" required`)}${e.type==='exam'?field('成绩','score',e.score,'type="number" min="0" max="100" step="0.1" required'):pointsField(e.rulePoints,['penalty','adjustment'].includes(e.type)?-1000000:0)}${noteField(e.note)}<p class="score-preview" id="edit-impact"></p>`;
    const input=data=>({...data,name:data.name||e.name,points:data.points===undefined?undefined:Number(data.points),score:data.score===undefined?undefined:Number(data.score)});
    open('修改记录',fields,data=>commit(before=>{op.expectRevision(before,revision);return op.editEntry(before,id,input(data),{id:newId});},'记录已更正，统计已更新。'),'保存修改',()=>{
      const preview=()=>{try{const d=Object.fromEntries(new FormData(editor.querySelector('form')));const changed=op.editEntry(state(),id,input(d),{id:newId});editor.querySelector('#edit-impact').textContent=`保存后：${balance(state())} → ${balance(changed.state)} 积分`;}catch(error){editor.querySelector('#edit-impact').textContent=error.message;}};
      editor.querySelector('form').addEventListener('input',preview);preview();
    });
  }
  function rulesManagement() {
    open('管理奖励与改进规则',`<p class="form-hint">修改只影响之后的记录，单元测试仍按成绩自动计算。</p><div class="rule-options">${state().rules.filter(r=>!r.deletedAt).map(r=>action('edit-rule',`<span>${esc(r.name)}${r.active?'':' · 已停用'}</span><strong>${signed(r.points)}</strong>`,r.id,'rule-choice')).join('')}</div>${action('edit-rule','＋ 添加奖励规则','','text-link')}`,null);
  }
  function editRule(id) {
    const r=state().rules.find(r=>r.id===id)||{name:'',points:1,active:true,type:'reward'};
    const revision=state().revision;
    open('编辑奖励规则',`${field('名称','name',r.name,'required maxlength="80"')}${pointsField(Math.abs(r.points),1,r.type==='penalty'?'扣除积分数量':'奖励积分')}${check('启用这个规则','active',r.active)}`,data=>commit(before=>{op.expectRevision(before,revision);return op.saveRule(before,{...data,points:Number(data.points),active:data.active==='on'},id||null);},'规则已保存。'));
  }
  function editAchievement(id) {
    const a=(state().achievements||[]).find(a=>a.id===id)||{name:'',day:familyDay(),note:'',icon:WISH_ICONS[Math.floor(Math.random()*WISH_ICONS.length)]};
    const revision=state().revision;
    open(id?'编辑小成就':'记录一次自己的突破',`<p class="form-hint">无论大小，超越昨天的自己都值得记下来。小成就不改变积分。</p><div class="achievement-picker"><span id="achievement-icon">${a.icon}</span><input type="hidden" name="icon" value="${a.icon}"><button type="button" class="mini-button" data-action="shuffle-achievement">换一个图标</button></div>${field('这次的突破','name',a.name,'required maxlength="80" placeholder="例如：第一次独立骑完 5 公里"')}${field('日期','day',a.day,`type="date" max="${familyDay()}" required`)}${noteField(a.note)}${id?action('delete-achievement','删除这个成就',id,'danger-link'):''}`,data=>commit(before=>{op.expectRevision(before,revision);return op.saveAchievement(before,data,id);},id?'小成就已更新。':'这次突破已经记下来啦！'));
  }
  function removeAchievement(id) {
    const update=revisionGuard(before=>op.deleteAchievement(before,id));
    open('删除这个成就？','<p class="form-hint">积分和任务记录不会受影响。</p>',()=>commit(update,'小成就已删除。'),'确认删除');
  }
  function download(content,name,type='application/json;charset=utf-8') {
    const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function dataManagement() {
    const recovery=localStorage.getItem(RECOVERY_KEY);
    open('备份与导出',`<p class="form-hint">完整备份可以恢复任务、愿望、小成就和全部记录。CSV 用来查看明细，不能直接恢复。</p><div class="data-actions">${action('export-json','📦 下载完整备份')}${action('export-csv','📋 导出积分明细 CSV')}<label class="secondary-button file-picker">📂 选择备份恢复<input type="file" id="backup-file" accept=".json,application/json"></label>${recovery?action('restore-previous','↶ 恢复上一次导入前的数据'):''}</div><p class="form-hint">恢复前会显示内容供核对，并自动保留当前数据，方便退回。</p>`,null,undefined,()=>{
      editor.querySelector('#backup-file').addEventListener('change',async event=>{
        const file=event.target.files[0];if(!file)return;
        try{if(file.size>10000000)throw new Error('备份文件不能大于 10 MB。');const imported=op.parseBackup(await file.text());confirmRestore(imported,file.name);}catch(error){editor.querySelector('#editor-error').textContent=error.message;}
      });
    });
  }
  function confirmRestore(imported,name) {
    const revision=state().revision;
    open('核对备份并恢复',`<p class="form-hint">${esc(name)}</p><div class="confirmation-summary"><strong>${balance(imported)} 积分</strong><span>${imported.tasks.filter(t=>!t.deletedAt).length} 项任务 · ${imported.wishes.filter(w=>!w.deletedAt).length} 个愿望</span><span>${activeEntries(imported).length} 条有效记录 · ${(imported.achievements||[]).filter(a=>!a.deletedAt).length} 个自定义成就</span></div><p class="form-hint">将替换当前 ${balance(state())} 积分、${activeEntries(state()).length} 条记录。当前数据会自动保留为恢复副本。</p>`,async()=>{
      const result=await withStorageLock(()=>restoreState(localStorage,imported,revision));setState(result.state);render();notify('备份已恢复。');return true;
    },'确认恢复');
  }
  document.body.addEventListener('click',event=>{
    const close=event.target.closest('[data-close]');if(close){if(!submitting)editor.close();return;}
    const button=event.target.closest('[data-action]');if(!button||submitting)return;
    const id=button.dataset.id||null;
    const actions={ 'edit-achievement':()=>editAchievement(id),'delete-achievement':()=>removeAchievement(id),'shuffle-achievement':()=>{const input=editor.querySelector('[name=icon]');const icons=WISH_ICONS.filter(i=>i!==input.value);input.value=icons[Math.floor(Math.random()*icons.length)];editor.querySelector('#achievement-icon').textContent=input.value;}, 'edit-task':()=>editTask(id),'edit-wish':()=>editWish(id),'other':otherRecord,'rewards':()=>ruleMenu(false),'improve':()=>ruleMenu(true),'record-rule':()=>ruleRecord(id),'custom-reward':customReward,'exam':exam,'adjust':adjustment,'redeem':()=>redeem(id),'delete-task':()=>remove('task',id),'delete-wish':()=>remove('wish',id),'edit-entry':()=>editRecord(id),'rules':rulesManagement,'edit-rule':()=>editRule(id),'data':dataManagement,
      'select-wish':()=>commit(before=>op.selectWish(before,id),'当前目标已更新。'),
      'export-json':()=>{download(op.makeBackup(readState(localStorage)),`小伊成长星球-完整备份-${familyDay()}.json`);notify('完整备份已下载。');},
      'export-csv':()=>{download(op.toCSV(readState(localStorage)),`小伊成长星球-积分明细-${familyDay()}.csv`,'text/csv;charset=utf-8');notify('明细已导出。');},
      'restore-previous':()=>{const raw=localStorage.getItem(RECOVERY_KEY);if(raw)confirmRestore(migrateState(JSON.parse(raw)),'上一次导入前的数据');},
    };
    try { Promise.resolve(actions[button.dataset.action]?.()).catch(error=>notify(error.message,null,true)); } catch(error) {notify(error.message,null,true);}
  });
  editor.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
  return {
    toolbar: () => isManaging()?`<div class="manage-bar"><span>管理模式</span>${action('edit-task','＋ 固定任务')}${action('rules','奖励规则')}${action('adjust','调整积分')}${action('data','备份与导出')}</div>`:'',
    taskEdit: t => isManaging()?action('edit-task',`编辑${!t.active?' · 已停用':''}`,t.id,'mini-button'):'',
    quickActions: () => `<div class="quick-actions">${action('other','<span>＋</span>记录其他','','quick-action')}${action('rewards','<span>🌟</span>额外奖励','','quick-action')}${action('exam','<span>📝</span>单元测试','','quick-action')}${action('improve','<span>🌱</span>粗心 / 改进','','quick-action')}</div>`,
    editHistory: e => isManaging()&&e.type!=='redemption'?action('edit-entry','修改',e.id,'mini-button'):'',
    wishButtons: wish => `<div class="wish-buttons">${isManaging()?action('edit-wish','编辑',wish.id,'mini-button'):''}${state().currentWishId!==wish.id?action('select-wish','设为目标',wish.id,'mini-button'):''}<button type="button" class="primary-button" data-action="redeem" data-id="${esc(wish.id)}" ${balance(state())<wish.cost?'disabled':''}>${balance(state())>=wish.cost?'兑换愿望':`还差 ${wish.cost-balance(state())} 分`}</button></div>`,
    wishList: () => `<div class="content-heading wishlist-heading"><h2>其他愿望</h2>${action('edit-wish','＋ 添加愿望','','primary-button')}</div><div class="wish-list">${state().wishes.filter(w=>!w.deletedAt&&w.id!==state().currentWishId).map(w=>`<article class="wish-item"><span class="wish-item-emoji">${w.icon}</span><div><h3>${esc(w.name)}</h3><p>${w.cost} 积分 ${state().currentWishId===w.id?'· 当前目标':''}</p><div class="progress-track"><span style="width:${Math.min(100,balance(state())/w.cost*100)}%"></span></div></div><div class="wish-buttons">${isManaging()?action('edit-wish','编辑',w.id,'mini-button'):''}${state().currentWishId!==w.id?action('select-wish','设为目标',w.id,'mini-button'):''}<button type="button" class="primary-button" data-action="redeem" data-id="${esc(w.id)}" ${balance(state())<w.cost?'disabled':''}>${balance(state())>=w.cost?'兑换':`还差 ${w.cost-balance(state())} 分`}</button></div></article>`).join('')||'<p class="form-hint">还可以添加下一个期待实现的愿望。</p>'}</div>`,
    growthExtras: () => {
      const trend=op.carelessTrend(state());
      const difference=trend.previous-trend.current;
      return `<section class="growth-extras"><article class="careless-card"><h2>🌱 认真审题挑战</h2><p>本月粗心记录 <strong>${trend.current}</strong> 次</p><span>${!trend.hasPrevious?'暂无上月记录':`上月 ${trend.previous} 次 · ${difference>0?`少了 ${difference} 次`:difference<0?`多了 ${-difference} 次，慢慢改进`:'和上月一样'}`}</span></article><article class="achievement-panel"><div class="content-heading"><h2>🏅 我的小成就</h2>${action('edit-achievement','＋ 记录突破','','mini-button')}</div><div class="personal-achievements">${(state().achievements||[]).filter(a=>!a.deletedAt).sort((a,b)=>b.day.localeCompare(a.day)).map(a=>`<article class="personal-achievement"><span>${a.icon}</span><div><strong>${esc(a.name)}</strong><small>${esc(a.day)}</small>${a.note?`<p>${esc(a.note)}</p>`:''}</div>${isManaging()?action('edit-achievement','编辑',a.id,'mini-button'):''}</article>`).join('')}</div><div class="achievements">${op.achievements(state()).map(a=>`<div class="achievement ${a.earned?'earned':''}"><span>${a.icon}</span><strong>${a.name}</strong><small>${a.earned?'已达成':`${Math.min(a.count,a.target)} / ${a.target}`}</small></div>`).join('')}</div></article></section>`;
    },
  };
}
