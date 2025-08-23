// Checklist Quotidienne — PWA (i18n FR/中文, v4)
const KEYS = { TASKS:'dq_tasks', STATE:'dq_state', LOG:'dq_log', LANG:'dq_lang' };
const MAX_DAYS = 5000;
const $ = (id)=>document.getElementById(id);

// --- Local date helper (avoid UTC drift) ---
function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n){ const d=new Date(dateStr); d.setDate(d.getDate()+n); return todayStrFromDate(d); }
function todayStrFromDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function startOfWeekISO(dateStr){
  const d=new Date(dateStr);
  const day=d.getDay();
  const diff=(day===0?-6:1-day); // Monday
  d.setDate(d.getDate()+diff);
  return todayStrFromDate(d);
}
function startOfMonthISO(dateStr){
  const d=new Date(dateStr);
  d.setDate(1);
  return todayStrFromDate(d);
}
function load(k,f){ try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function uid(){ return Math.random().toString(36).slice(2,10); }

// --- i18n dictionary ---
const i18n = {
  fr: {
    app_title: "Checklist Quotidienne",
    btn_install: "Installer",
    btn_language_label: "Langue / 语言",
    tab_tasks: "Tâches",
    tab_stats: "Statistiques",
    placeholder_new_task: "Ajouter une tâche quotidienne…",
    btn_add_task: "Ajouter",
    hint_drag: "Astuce : glissez-déposez pour réorganiser.",
    btn_close_day: "Clôturer la journée maintenant",
    confirm_close: "Clôturer la journée maintenant et tout décocher ?",
    toast_closed: "Journée clôturée ({date})",
    toast_error_close: "Erreur pendant la clôture",
    toast_midnight: "Nouveau jour ✓",
    toast_tz_changed: "Fuseau changé : jour ajusté",
    label_period: "Période :",
    opt_today: "Aujourd'hui",
    opt_3d: "3 derniers jours",
    opt_1w: "Dernière semaine",
    opt_1m: "Dernier mois",
    opt_all: "Toujours",
    card_global: "Succès global",
    card_per_task: "Par tâche",
    range_from_to: "Période depuis le {start} jusqu’au {end}",
    empty_tasks: "Aucune tâche pour l'instant.",
    btn_delete_title: "Supprimer",
    footer_note: "Fonctionne hors-ligne • Données stockées localement",
    lang_button: "🌐 FR"
  },
  zh: {
    app_title: "每日清单",
    btn_install: "安装",
    btn_language_label: "语言 / Langue",
    tab_tasks: "任务",
    tab_stats: "统计",
    placeholder_new_task: "添加每日任务…",
    btn_add_task: "添加",
    hint_drag: "提示：拖动以重新排序。",
    btn_close_day: "立即结算今天",
    confirm_close: "现在结算今天并清空勾选吗？",
    toast_closed: "已结算（{date}）",
    toast_error_close: "结算时出错",
    toast_midnight: "新的一天 ✓",
    toast_tz_changed: "时区已变更：已调整日期",
    label_period: "区间：",
    opt_today: "今天",
    opt_3d: "近 3 天",
    opt_1w: "本周",
    opt_1m: "本月",
    opt_all: "全部",
    card_global: "总体成功率",
    card_per_task: "按任务",
    range_from_to: "从 {start} 到 {end}",
    empty_tasks: "目前还没有任务。",
    btn_delete_title: "删除",
    footer_note: "可离线使用 • 数据保存在本地",
    lang_button: "🌐 中文"
  }
};
let lang = load(KEYS.LANG, (navigator.language||'fr').startsWith('zh') ? 'zh' : 'fr');
function t(key, params={}){
  const dict = i18n[lang] || i18n.fr;
  let s = dict[key] ?? key;
  for (const k in params){ s = s.replace(new RegExp(`\\{${k}\\}`,'g'), params[k]); }
  return s;
}
function setLang(l){
  lang = (l==='zh'?'zh':'fr');
  save(KEYS.LANG, lang);
  document.documentElement.lang = lang==='zh' ? 'zh-CN' : 'fr';
  applyI18n();
  renderTasks();
  renderStats();
}

// --- Data ---
let tasks = load(KEYS.TASKS, []);
let state = load(KEYS.STATE, { date: todayISO(), checked: {} });
let log = load(KEYS.LOG, []);

// If opening a different day, finalize yesterday (snapshot) and reset
(function handleDateRollover(){
  const t = todayISO();
  if (state.date !== t){
    finalizeDay(state.date);
    state = { date: t, checked: {} };
    save(KEYS.STATE, state);
  }
})();

// --- DOM ---
const taskList = $('taskList');
const newTaskInput = $('newTaskInput');
const addTaskBtn = $('addTaskBtn');
const resetTodayBtn = $('resetTodayBtn');
const tabTasks = $('tabTasks');
const tabStats = $('tabStats');
const viewTasks = $('viewTasks');
const viewStats = $('viewStats');
const rangePreset = $('rangePreset');
const globalPct = $('globalPct');
const globalRangeLabel = $('globalRangeLabel');
const perTaskStats = $('perTaskStats');
const installBtn = $('installBtn');
const appTitle = $('appTitle');
const langToggle = $('langToggle');
const labelPeriod = $('labelPeriod');
const h2Global = $('h2Global');
const h2PerTask = $('h2PerTask');
const hintDrag = $('hintDrag');
const footerNote = $('footerNote');

// --- Toast ---
function toast(msg){
  const tdiv=document.createElement('div'); tdiv.className='toast'; tdiv.textContent=msg; document.body.appendChild(tdiv);
  requestAnimationFrame(()=>{ tdiv.classList.add('show'); setTimeout(()=>{ tdiv.classList.remove('show'); setTimeout(()=>tdiv.remove(),250); },1800); });
}

// --- Install prompt ---
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault(); deferredPrompt=e;
  installBtn.style.display='inline-flex';
  installBtn.textContent = t('btn_install');
  installBtn.title = t('btn_install');
});
installBtn.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  installBtn.style.display='none';
});

// --- Language toggle ---
langToggle.addEventListener('click', ()=> setLang(lang==='fr'?'zh':'fr'));

// --- Tabs ---
tabTasks.addEventListener('click', () => switchTab('tasks'));
tabStats.addEventListener('click', () => switchTab('stats'));
function switchTab(which){
  const isTasks = which==='tasks';
  [tabTasks, tabStats].forEach(btn => btn.classList.remove('active'));
  (isTasks ? tabTasks : tabStats).classList.add('active');
  viewTasks.classList.toggle('active', isTasks);
  viewStats.classList.toggle('active', !isTasks);
  if (!isTasks) renderStats();
}

// --- Tasks rendering ---
function renderTasks(){
  taskList.innerHTML = '';
  if (tasks.length === 0){
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = t('empty_tasks');
    taskList.appendChild(empty);
    return;
  }
  tasks.sort((a,b)=> (a.order ?? 0) - (b.order ?? 0));
  for (const tsk of tasks){
    const li = document.createElement('li');
    li.className = 'task-item';
    li.setAttribute('draggable','true');
    li.dataset.id = tsk.id;

    const grip = document.createElement('span');
    grip.className = 'task-grip';
    grip.title = '↕';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!state.checked[tsk.id];
    cb.addEventListener('change', () => {
      state.checked[tsk.id] = cb.checked;
      save(KEYS.STATE, state);
    });

    const title = document.createElement('input');
    title.type = 'text';
    title.value = tsk.title;
    title.className = 'task-title';
    title.addEventListener('change', () => {
      tsk.title = title.value.trim() || (lang==='fr'?'Sans titre':'未命名');
      save(KEYS.TASKS, tasks);
      renderStats();
    });

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = t('btn_delete_title');
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => {
      if (confirm(t('btn_delete_title')+' ?')){
        delete state.checked[tsk.id];
        tasks = tasks.filter(x => x.id !== tsk.id);
        save(KEYS.STATE, state);
        save(KEYS.TASKS, tasks);
        renderTasks();
        renderStats();
      }
    });

    actions.appendChild(delBtn);
    li.append(grip, cb, title, actions);
    taskList.appendChild(li);
  }
  enableDragReorder();
}

function enableDragReorder(){
  taskList.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('dragstart', () => { item.classList.add('dragging'); });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      [...taskList.querySelectorAll('.task-item')].forEach((el, idx) => {
        const tsk = tasks.find(x=>x.id===el.dataset.id);
        if (tsk){ tsk.order = idx; }
      });
      save(KEYS.TASKS, tasks);
    });
  });
  taskList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = taskList.querySelector('.dragging');
    if (!dragging) return;
    const after = getDragAfterElement(taskList, e.clientY);
    if (after == null){ taskList.appendChild(dragging); }
    else { taskList.insertBefore(dragging, after); }
  });
  function getDragAfterElement(container, y){
    const els = [...container.querySelectorAll('.task-item:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height/2;
      if (offset < 0 && offset > closest.offset){
        return { offset, element: child };
      } else { return closest; }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
}

// --- Add task ---
addTaskBtn.addEventListener('click', addTaskFromInput);
newTaskInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') addTaskFromInput(); });
function addTaskFromInput(){
  const title = newTaskInput.value.trim();
  if (!title) return;
  const id = uid();
  const maxOrder = tasks.reduce((m,t)=>Math.max(m, t.order??0), -1);
  tasks.push({ id, title, order: maxOrder+1, createdAt: todayISO() });
  save(KEYS.TASKS, tasks);
  newTaskInput.value = '';
  renderTasks();
  renderStats();
}

// --- Close day (snapshot of now) ---
resetTodayBtn.addEventListener('click', () => {
  try{
    if (!confirm(t('confirm_close'))) return;
    finalizeDay(state.date);
    const old = state.date;
    state = { date: todayISO(), checked: {} }; // remain same day but cleared
    save(KEYS.STATE, state);
    renderTasks();
    renderStats();
    toast(t('toast_closed', {date: old}));
  }catch(err){
    console.error(err);
    toast(t('toast_error_close'));
  }
});

function finalizeDay(dateStr){
  const completedIds = Object.keys(state.checked).filter(id => state.checked[id]);
  const total = tasks.length;
  const entry = { date: dateStr, completedIds, total, ts: Date.now(), tzOffset: new Date().getTimezoneOffset() };
  const idx = log.findIndex(x=>x.date===dateStr);
  if (idx>=0) log[idx] = entry; else log.push(entry);
  save(KEYS.LOG, log);
}

// --- Midnight reset scheduling (local) + timezone guard ---
function computeNextMidnightMs(){
  const now = new Date();
  const m = new Date(now);
  m.setHours(24,0,0,0);
  return m.getTime();
}
function doMidnightReset(){
  finalizeDay(state.date);
  state = { date: todayISO(), checked: {} };
  save(KEYS.STATE, state);
  renderTasks(); renderStats(); toast(t('toast_midnight'));
}
function scheduleMidnightReset(){
  clearTimeout(window._midnightTimer);
  const delay = Math.max(1000, computeNextMidnightMs() - Date.now());
  window._midnightTimer = setTimeout(()=>{ doMidnightReset(); scheduleMidnightReset(); }, delay);
}
scheduleMidnightReset();

let _tzOffset = new Date().getTimezoneOffset();
setInterval(()=>{
  const cur = new Date().getTimezoneOffset();
  if (cur !== _tzOffset){
    _tzOffset = cur;
    const today = todayISO();
    if (state.date !== today){
      finalizeDay(state.date);
      state = { date: today, checked: {} };
      save(KEYS.STATE, state);
      renderTasks(); renderStats(); toast(t('toast_tz_changed'));
    }
    scheduleMidnightReset();
  }
}, 60_000);

document.addEventListener('visibilitychange', ()=>{
  if (!document.hidden){
    const today = todayISO();
    if (state.date !== today){
      finalizeDay(state.date);
      state = { date: today, checked: {} };
      save(KEYS.STATE, state);
      renderTasks(); renderStats();
    }
    scheduleMidnightReset();
  }
});

// --- Stats ---
rangePreset.addEventListener('change', renderStats);

function earliestDateISO(){
  const today = todayISO();
  let earliest = today;
  for (const tsk of tasks){
    if (tsk.createdAt && tsk.createdAt < earliest) earliest = tsk.createdAt;
  }
  for (const e of log){
    if (e.date && e.date < earliest) earliest = e.date;
  }
  return earliest;
}

function renderStats(){
  try{
    const preset = rangePreset.value;
    const today = todayISO();
    let startDate = today;

    if (preset==='today'){ startDate = today; }
    else if (preset==='3d'){ startDate = addDays(today, -2); }
    else if (preset==='1w'){ startDate = startOfWeekISO(today); }
    else if (preset==='1m'){ startDate = startOfMonthISO(today); }
    else if (preset==='all'){ startDate = earliestDateISO(); }

    globalRangeLabel.textContent = t('range_from_to', {start:startDate, end:today});

    const byDate = {};
    for (const e of log){
      if (e.date >= startDate && e.date <= today) byDate[e.date] = e;
    }

    // Use today's snapshot if exists; otherwise live
    if (today >= startDate){
      const todayLog = log.find(x=>x.date===today);
      if (todayLog){
        byDate[today] = todayLog;
      } else {
        const liveCompleted = Object.keys(state.checked).filter(id=>state.checked[id]);
        byDate[today] = { date: today, completedIds: liveCompleted, total: tasks.length };
      }
    }

    let sumCompleted = 0, sumTotal = 0;
    for (const d in byDate){
      sumCompleted += byDate[d].completedIds.length;
      sumTotal += byDate[d].total;
    }
    globalPct.textContent = sumTotal ? Math.round(100 * sumCompleted / sumTotal) + '%' : '0%';

    const days = [];
    for (let dt = startDate; dt <= today && days.length < MAX_DAYS; dt = addDays(dt, 1)) days.push(dt);

    const perTask = [];
    for (const tsk of tasks){
      let present = 0, done = 0;
      for (const d of days){
        if (tsk.createdAt && tsk.createdAt > d) continue;
        present++;
        const entry = byDate[d];
        if (entry && entry.completedIds.includes(tsk.id)) done++;
      }
      const pct = present ? Math.round(100 * done / present) : 0;
      perTask.push({ title: tsk.title, pct });
    }

    perTaskStats.innerHTML = '';
    if (perTask.length === 0){
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('empty_tasks');
      perTaskStats.appendChild(p);
    } else {
      for (const row of perTask){
        const div = document.createElement('div');
        div.className = 'per-task-row';
        const name = document.createElement('span');
        name.textContent = row.title;
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = row.pct + '%';
        div.append(name, badge);
        perTaskStats.appendChild(div);
      }
    }
  }catch(err){
    console.error(err);
    globalPct.textContent = '—%';
    globalRangeLabel.textContent = lang==='fr' ? 'Erreur de calcul des statistiques' : '统计计算出错';
    perTaskStats.innerHTML = '<p class="empty">'+(lang==='fr' ? 'Impossible d’afficher les statistiques.' : '无法显示统计。')+'</p>';
  }
}

// --- Apply i18n to static UI ---
function applyI18n(){
  appTitle.textContent = t('app_title');
  installBtn.textContent = t('btn_install');
  installBtn.title = t('btn_install');
  langToggle.title = t('btn_language_label');
  langToggle.textContent = i18n[lang].lang_button;

  tabTasks.textContent = t('tab_tasks');
  tabStats.textContent = t('tab_stats');

  newTaskInput.placeholder = t('placeholder_new_task');
  addTaskBtn.textContent = t('btn_add_task');
  hintDrag.textContent = t('hint_drag');

  resetTodayBtn.textContent = t('btn_close_day');
  resetTodayBtn.title = t('btn_close_day');

  labelPeriod.textContent = t('label_period');

  // Options
  rangePreset.querySelector('option[value="today"]').textContent = t('opt_today');
  rangePreset.querySelector('option[value="3d"]').textContent = t('opt_3d');
  rangePreset.querySelector('option[value="1w"]').textContent = t('opt_1w');
  rangePreset.querySelector('option[value="1m"]').textContent = t('opt_1m');
  rangePreset.querySelector('option[value="all"]').textContent = t('opt_all');

  h2Global.textContent = t('card_global');
  h2PerTask.textContent = t('card_per_task');
  footerNote.textContent = t('footer_note');
}

// --- Init ---
applyI18n();
renderTasks();
renderStats();
