// Checklist Quotidienne — PWA (v3)
const KEYS = { TASKS:'dq_tasks', STATE:'dq_state', LOG:'dq_log' };
const MAX_DAYS = 5000;
const $ = (id)=>document.getElementById(id);

function todayISO(){
  const d = new Date();                  // heure locale
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;             // ex: "2025-08-21" (locale)
}

function addDays(dateStr, n){ const d=new Date(dateStr); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function startOfWeekISO(dateStr){ const d=new Date(dateStr); const day=d.getDay(); const diff=(day===0?-6:1-day); d.setDate(d.getDate()+diff); return d.toISOString().slice(0,10); }
function startOfMonthISO(dateStr){ const d=new Date(dateStr); d.setDate(1); return d.toISOString().slice(0,10); }
function load(k,f){ try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function uid(){ return Math.random().toString(36).slice(2,10); }

let tasks = load(KEYS.TASKS, []);
let state = load(KEYS.STATE, { date: todayISO(), checked: {} });
let log = load(KEYS.LOG, []);

(function handleDateRollover(){
  const t = todayISO();
  if (state.date !== t){
    finalizeDay(state.date);
    state = { date: t, checked: {} };
    save(KEYS.STATE, state);
  }
})();

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

function toast(msg){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t);
  requestAnimationFrame(()=>{ t.classList.add('show'); setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),250); },1800); });
}

let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; installBtn.style.display='inline-flex'; });
installBtn.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.style.display='none'; });

tabTasks.addEventListener('click', ()=>switchTab('tasks'));
tabStats.addEventListener('click', ()=>switchTab('stats'));
function switchTab(which){
  const isTasks = which==='tasks';
  [tabTasks,tabStats].forEach(b=>b.classList.remove('active'));
  (isTasks?tabTasks:tabStats).classList.add('active');
  viewTasks.classList.toggle('active', isTasks);
  viewStats.classList.toggle('active', !isTasks);
  if (!isTasks) renderStats();
}

function renderTasks(){
  taskList.innerHTML='';
  if (tasks.length===0){
    const p=document.createElement('p'); p.className='empty'; p.textContent="Aucune tâche. Ajoutez-en ci-dessus."; taskList.appendChild(p); return;
  }
  tasks.sort((a,b)=> (a.order??0)-(b.order??0));
  for (const t of tasks){
    const li=document.createElement('li'); li.className='task-item'; li.setAttribute('draggable','true'); li.dataset.id=t.id;
    const grip=document.createElement('span'); grip.className='task-grip'; grip.textContent='⋮⋮'; grip.title='Glisser pour réorganiser';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!state.checked[t.id];
    cb.addEventListener('change',()=>{ state.checked[t.id]=cb.checked; save(KEYS.STATE,state); });
    const title=document.createElement('input'); title.type='text'; title.value=t.title; title.className='task-title';
    title.addEventListener('change',()=>{ t.title=title.value.trim()||'Sans titre'; save(KEYS.TASKS,tasks); renderStats(); });
    const actions=document.createElement('div'); actions.className='task-actions';
    const delBtn=document.createElement('button'); delBtn.className='icon-btn'; delBtn.title='Supprimer'; delBtn.textContent='🗑️';
    delBtn.addEventListener('click',()=>{
      if (!confirm('Supprimer cette tâche ?')) return;
      delete state.checked[t.id];
      tasks=tasks.filter(x=>x.id!==t.id);
      save(KEYS.STATE,state); save(KEYS.TASKS,tasks);
      renderTasks(); renderStats();
    });
    actions.appendChild(delBtn);
    li.append(grip,cb,title,actions); taskList.appendChild(li);
  }
  enableDragReorder();
}
function enableDragReorder(){
  taskList.querySelectorAll('.task-item').forEach(item=>{
    item.addEventListener('dragstart',()=>{ item.classList.add('dragging'); });
    item.addEventListener('dragend',()=>{
      item.classList.remove('dragging');
      [...taskList.querySelectorAll('.task-item')].forEach((el,idx)=>{
        const t = tasks.find(x=>x.id===el.dataset.id); if (t) t.order=idx;
      });
      save(KEYS.TASKS,tasks);
    });
  });
  taskList.addEventListener('dragover',(e)=>{
    e.preventDefault();
    const dragging=taskList.querySelector('.dragging'); if (!dragging) return;
    const after = getDragAfter(taskList, e.clientY);
    if (!after) taskList.appendChild(dragging); else taskList.insertBefore(dragging, after);
  });
  function getDragAfter(container,y){
    const els=[...container.querySelectorAll('.task-item:not(.dragging)')];
    return els.reduce((closest,child)=>{
      const box=child.getBoundingClientRect(); const offset = y - box.top - box.height/2;
      if (offset<0 && offset>closest.offset) return {offset,element:child}; else return closest;
    }, {offset:-Infinity}).element;
  }
}

addTaskBtn.addEventListener('click', addTaskFromInput);
newTaskInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter') addTaskFromInput(); });
function addTaskFromInput(){
  const title=newTaskInput.value.trim(); if(!title) return;
  const id=uid(); const maxOrder=tasks.reduce((m,t)=>Math.max(m,t.order??0),-1);
  tasks.push({ id, title, order:maxOrder+1, createdAt: todayISO() });
  save(KEYS.TASKS,tasks); newTaskInput.value=''; renderTasks(); renderStats();
}

resetTodayBtn.addEventListener('click', ()=>{
  try{
    if (!confirm('Clôturer la journée maintenant et tout décocher ?')) return;
    finalizeDay(state.date);
    const old=state.date;
    state={ date: todayISO(), checked:{} };
    save(KEYS.STATE,state);
    renderTasks(); renderStats(); toast('Journée clôturée ('+old+')');
  }catch(err){ console.error(err); toast('Erreur pendant la clôture'); }
});

function finalizeDay(dateStr){
  const completedIds=Object.keys(state.checked).filter(id=>state.checked[id]);
  const total=tasks.length;
  const entry={ date:dateStr, completedIds, total };
  const idx=log.findIndex(x=>x.date===dateStr);
  if (idx>=0) log[idx]=entry; else log.push(entry);
  save(KEYS.LOG,log);
}

(function scheduleMidnightReset(){
  const now=new Date(); const midnight=new Date(now); midnight.setHours(24,0,0,0);
  const ms=midnight-now;
  setTimeout(()=>{
    finalizeDay(state.date);
    state={ date: todayISO(), checked:{} };
    save(KEYS.STATE,state);
    renderTasks(); renderStats(); toast('Nouveau jour ✓');
    scheduleMidnightReset();
  }, ms);
})();

rangePreset.addEventListener('change', renderStats);

function earliestDateISO(){
  const today=todayISO(); let earliest=today;
  for (const t of tasks){ if (t.createdAt && t.createdAt<earliest) earliest=t.createdAt; }
  for (const e of log){ if (e.date && e.date<earliest) earliest=e.date; }
  return earliest;
}

function renderStats(){
  try{
    const preset=rangePreset.value; const today=todayISO();
    let startDate=today;
    if (preset==='today'){ startDate=today; }
    else if (preset==='3d'){ startDate=addDays(today,-2); }
    else if (preset==='1w'){ startDate=startOfWeekISO(today); }
    else if (preset==='1m'){ startDate=startOfMonthISO(today); }
    else if (preset==='all'){ startDate=earliestDateISO(); }

    globalRangeLabel.textContent = `Période depuis le ${startDate} jusqu'au ${today}`;

    const byDate={};
    for (const e of log){ if (e.date>=startDate && e.date<=today) byDate[e.date]=e; }

    // Utiliser le snapshot "clôturé" du jour s'il existe; sinon live.
    if (today >= startDate){
      const todayLog = log.find(x=>x.date===today);
      if (todayLog){
        byDate[today] = todayLog;
      } else {
        const liveCompleted=Object.keys(state.checked).filter(id=>state.checked[id]);
        byDate[today] = { date: today, completedIds: liveCompleted, total: tasks.length };
      }
    }

    let sumCompleted=0, sumTotal=0;
    for (const d in byDate){ sumCompleted += byDate[d].completedIds.length; sumTotal += byDate[d].total; }
    globalPct.textContent = sumTotal? Math.round(100*sumCompleted/sumTotal)+'%' : '0%';

    const days=[];
    for (let dt=startDate; dt<=today && days.length<MAX_DAYS; dt=addDays(dt,1)) days.push(dt);

    const perTask=[];
    for (const t of tasks){
      let present=0, done=0;
      for (const d of days){
        if (t.createdAt && t.createdAt>d) continue;
        present++;
        const entry=byDate[d];
        if (entry && entry.completedIds.includes(t.id)) done++;
      }
      const pct=present? Math.round(100*done/present):0;
      perTask.push({title:t.title, pct});
    }

    perTaskStats.innerHTML='';
    if (perTask.length===0){
      const p=document.createElement('p'); p.className='empty'; p.textContent="Aucune tâche pour l'instant."; perTaskStats.appendChild(p);
    }else{
      for (const row of perTask){
        const div=document.createElement('div'); div.className='per-task-row';
        const name=document.createElement('span'); name.textContent=row.title;
        const badge=document.createElement('span'); badge.className='badge'; badge.textContent=row.pct+'%';
        div.append(name,badge); perTaskStats.appendChild(div);
      }
    }
  }catch(err){
    console.error(err);
    globalPct.textContent='—%'; globalRangeLabel.textContent='Erreur de calcul des statistiques';
    perTaskStats.innerHTML='<p class="empty">Impossible d’afficher les statistiques.</p>';
  }
}

renderTasks(); renderStats();
