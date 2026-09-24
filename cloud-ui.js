import { initialState, balance } from './domain.js';
import { STORAGE_KEY, readState } from './store.js';
import { makeBackup } from './operations.js';

export function createCloudUI({ accept, block, getState, notify }) {
  const panel = document.createElement('section');
  panel.className = 'cloud-panel'; panel.setAttribute('aria-label', '账号与云端记录');
  document.querySelector('main').before(panel);
  const bar = document.createElement('div'); bar.className = 'cloud-bar';
  panel.before(bar);
  let api, user, stopWatch, epoch = 0, loading = false, again = false, ready = false, saving = false;
  let local, localError;
  try { local = localStorage.getItem(STORAGE_KEY) === null ? null : readState(localStorage); } catch (error) { localError = error; }
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function status(text) {
    bar.innerHTML = `<span role="status">${esc(text)}</span>${user ? '<button type="button" class="text-link" data-cloud-logout>退出登录</button>' : ''}`;
    bar.querySelector('button')?.addEventListener('click', async () => {
      if (saving) return notify('正在保存，请稍候再退出。', null, true);
      try { await api.logout(); } catch (error) { notify(message(error), null, true); }
    });
  }
  function message(error) {
    const messages = { 'auth/invalid-credential':'邮箱或密码不正确，请重新输入。', 'auth/invalid-email':'请填写有效的邮箱。', 'auth/too-many-requests':'尝试次数过多，请稍后再试。', 'auth/network-request-failed':'连接失败，请检查网络后重试。', 'permission-denied':'当前账号没有访问权限，请核对账号和 Firestore 规则。', 'unavailable':'暂时无法连接云端，请稍后重试。', 'auth/unauthorized-domain':'请在 Firebase 中添加当前网站到已获授权的网域。' };
    return messages[error.code] || error.message || '连接失败，请稍后重试。';
  }
  function gate(html) {
    ready = false; block(); panel.hidden = false; panel.innerHTML = html;
  }
  function exportLocal() {
    try {
      const raw = local ? makeBackup(local) : localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type:'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = '小伊-原手机记录备份.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { notify(message(error), null, true); }
  }
  function loginView(error = '') {
    gate(`<img class="cloud-bird" src="./assets/qiuqiu-320.webp" alt="球球"/><h1>欢迎回到成长星球</h1><p>登录后，在不同设备查看同一份成长记录。</p><form id="cloud-login"><label>邮箱<input name="email" type="email" autocomplete="username" required /></label><label>密码<input name="password" type="password" autocomplete="current-password" required /></label><p class="form-error" role="alert">${esc(error)}</p><button class="primary-button" type="submit">登录</button></form>${local || localError ? '<p>原浏览器记录仍保留在这台设备。</p><button class="text-link" data-local-export>下载原手机记录</button>' : ''}`);
    panel.querySelector('[data-local-export]')?.addEventListener('click', exportLocal);
    panel.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button');
      button.disabled = true; button.textContent = '正在登录…';
      try { await api.login(form.elements.email.value.trim(), form.elements.password.value); }
      catch (error) { form.querySelector('[role=alert]').textContent = message(error); }
      finally { button.disabled = false; button.textContent = '登录'; }
    };
  }
  function initializeView() {
    gate(`<h1>选择第一份云端记录</h1><p>云端还没有数据。请优先在保存旧记录的手机上完成这一步。</p>${local ? `<div class="confirmation-summary"><strong>本机 ${balance(local)} 积分</strong><span>${local.entries.length} 条积分流水 · ${(local.achievements || []).length} 个小成就</span></div><button class="primary-button" data-upload-local>确认上传本机记录</button><button class="text-link" data-local-export>先下载一份备份</button>` : `<p>${localError ? '本机旧记录读取异常，请先下载原始记录处理，不要创建空白记录。' : '这个浏览器没有找到旧记录。如果旧记录在另一台设备，请先在那里登录上传。'}</p>${localError ? '<button class="text-link" data-local-export>下载原始记录</button>' : '<button class="secondary-button" data-start-new>我没有旧记录，从 0 开始</button>'}`}<p class="form-error" role="alert"></p>`);
    panel.querySelector('[data-local-export]')?.addEventListener('click', exportLocal);
    async function initialize(value) {
      if (saving) return;
      saving = true; panel.querySelectorAll('button').forEach(b => b.disabled = true); status('正在创建云端记录…');
      try { await api.cloud.initialize(value); await refresh(); }
      catch (error) { panel.querySelector('[role=alert]')?.replaceChildren(document.createTextNode(message(error))); status('尚未创建成功'); }
      finally { saving = false; panel.querySelectorAll('button').forEach(b => b.disabled = false); }
    }
    panel.querySelector('[data-upload-local]')?.addEventListener('click', () => initialize(local));
    panel.querySelector('[data-start-new]')?.addEventListener('click', () => {
      if (confirm('确认没有需要导入的旧记录？将创建一份 0 积分的云端记录。')) void initialize(initialState());
    });
  }
  async function refresh() {
    if (!user) return;
    if (loading) { again = true; return; }
    loading = true; const token = epoch;
    try {
      const value = await api.cloud.load();
      if (token !== epoch) return;
      if (value) {
        const current = getState();
        if (!current || value.revision >= current.revision) accept(value);
        ready = true; panel.hidden = true; status('☁ 已同步到云端');
      } else initializeView();
    } catch (error) {
      if (token !== epoch) return;
      if (getState()) { ready = false; status('连接中断 · 显示上次记录，暂不能修改'); }
      else gate(`<h1>暂时无法读取云端记录</h1><p>${esc(message(error))}</p><button class="primary-button" data-cloud-retry>重新连接</button>`);
      panel.querySelector('[data-cloud-retry]')?.addEventListener('click', refresh);
    } finally { loading = false; if (again) { again = false; void refresh(); } }
  }
  async function start() {
    status('正在连接…'); gate('<h1>正在连接成长星球…</h1><p>确认账号后读取云端记录，请稍候。</p>');
    const slow = setTimeout(() => {
      if (!user && !panel.querySelector('form')) {
        status('连接时间较长，请检查网络');
        panel.innerHTML = '<h1>仍在连接登录服务</h1><p>原手机记录没有改动。可以继续等待，或重新连接。</p><button class="primary-button" data-reload>重新连接</button>';
        panel.querySelector('button').onclick = () => location.reload();
      }
    }, 15000);
    try {
      api = await import('./firebase-client.js');
      api.observeAuth(async account => {
        clearTimeout(slow);
        epoch++; stopWatch?.(); user = null; ready = false; block();
        document.querySelectorAll('dialog[open]').forEach(d => { d.returnValue = ''; d.close(); });
        if (!account) { status('登录后同步成长记录'); loginView(); return; }
        if (account.uid !== api.OWNER_UID) { await api.logout(); loginView('此账号未获授权，请使用已配置的成长星球账号。'); return; }
        user = account; status('正在读取云端记录…'); gate('<h1>正在读取成长记录…</h1>');
        stopWatch = api.watch(refresh, error => { ready = false; status(message(error)); });
        void refresh();
      });
    } catch (error) {
      clearTimeout(slow);
      gate('<h1>暂时无法连接登录服务</h1><p>原手机记录未改动，请检查网络后重试。</p><button class="primary-button" data-reload>重新连接</button>');
      panel.querySelector('button').onclick = () => location.reload(); status('连接未完成');
    }
  }
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => { ready = false; status('当前离线 · 联网后才能保存'); });
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  return {
    start, refresh,
    async mutate(update) {
      if (!ready || !user || !navigator.onLine) throw new Error('请先登录并连接云端，再确认这次操作。');
      const token = epoch;
      saving = true; status('正在保存到云端…');
      try {
        const result = await api.cloud.mutate(update, getState().revision);
        if (token !== epoch) throw new Error('登录状态已变化，请重新登录查看保存结果。');
        status('☁ 已同步到云端'); return result;
      } catch (error) { status('本次未保存成功，请重试'); void refresh(); throw new Error(message(error)); }
      finally { saving = false; }
    },
  };
}
