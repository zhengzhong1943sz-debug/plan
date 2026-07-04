const STORAGE_KEY='mx_plan_v2_preview';
const SESSION_IDS=['A1','B1','A2','B2'];
const state={plan:null,week:Number(localStorage.getItem('mx_plan_v2_preview_week')||1),session:localStorage.getItem('mx_plan_v2_preview_session')||suggestSession(),readiness:'good',data:loadState()};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function suggestSession(){return({1:'A1',2:'B1',4:'A2',5:'B2'})[new Date().getDay()]||'A1'}
function emptyState(){return{schemaVersion:2,completions:[],logs:[],legacyLogs:[],preferences:{exercises:{},variants:{}},createdAt:new Date().toISOString()}}
function loadState(){try{const d=JSON.parse(localStorage.getItem(STORAGE_KEY));return d?.schemaVersion===2?{...emptyState(),...d,preferences:{...emptyState().preferences,...(d.preferences||{})}}:emptyState()}catch{return emptyState()}}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state.data))}
function sessionById(id=state.session){return state.plan.sessions.find(s=>s.id===id)}
function weekRule(w=state.week){return state.plan.weeks.find(x=>x.week===w)}
function phaseFor(w=state.week){return state.plan.phases.find(p=>p.weeks.includes(w))}
function completionId(w=state.week,s=state.session){return`w${w}-${s}`}
function getCompletion(w=state.week,s=state.session){return state.data.completions.find(c=>c.id===completionId(w,s))}
function allMainExercises(session,rule){let list=session.exercises.map(x=>({...x,type:'main'}));if(rule.power){const idx=list.findIndex(x=>x.replaceInPower);if(idx>=0)list.splice(idx,1,{...session.power,type:'power'});else list.unshift({...session.power,type:'power'})}return list}

async function init(){
  const res=await fetch('data/plan.json');if(!res.ok)throw Error('plan');state.plan=await res.json();
  renderSelectors();renderMission();renderRoadmap();renderSafety();renderAllStats();renderReviewGreeting();bindGlobal();
}

function renderSelectors(){
  $('#weekSelect').innerHTML=state.plan.weeks.map(w=>`<option value="${w.week}" ${w.week===state.week?'selected':''}>W${String(w.week).padStart(2,'0')} · ${esc(w.label)}</option>`).join('');
  $('#phaseBadge').textContent=`${phaseFor().emoji} ${phaseFor().name}`;
  $('#sessionTabs').innerHTML=state.plan.sessions.map(s=>`<button class="session-tab ${s.id===state.session?'active':''}" data-session="${s.id}"><b>${s.id} · ${esc(s.short)}</b><span>${esc(s.day)}</span></button>`).join('');
  document.querySelectorAll('.session-tab').forEach(b=>b.addEventListener('click',()=>{state.session=b.dataset.session;localStorage.setItem('mx_plan_v2_preview_session',state.session);renderSelectors();renderMission();renderAllStats()}));
}

function renderMission(){
  const session=sessionById(),rule=weekRule(),existing=getCompletion();
  $('#missionCode').textContent=`${session.id} · ${session.day}`;$('#missionTitle').textContent=session.short;$('#missionMood').textContent=session.mood;
  $('#missionSets').textContent=`主项 ${rule.mainSets} × ${rule.mainReps}`;$('#missionRpe').textContent=`RPE ${rule.rpe}`;$('#weekNote').innerHTML=`<b>W${rule.week} 提示：</b>${esc(rule.note)}`;
  $('#warmupList').innerHTML=`<h4>4 分钟开机热身</h4><div class="warmup-list">${session.warmup.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`;
  const exercises=allMainExercises(session,rule);
  $('#exerciseList').innerHTML=exercises.map((ex,i)=>renderExercise(ex,i,rule,existing)).join('');
  $('#bonusZone').innerHTML=renderBonus(session,'abs',true,existing)+renderBonus(session,'core',false,existing);
  bindMissionControls();updateCompletionStatus();
}

function renderExercise(ex,i,rule,existing){
  const chosen=state.data.preferences.exercises[ex.id]||ex.name;
  const sets=ex.main?rule.mainSets:rule.accessorySets,reps=ex.main?rule.mainReps:rule.accessoryReps;
  const prev=state.data.logs.filter(l=>l.exerciseId===ex.id).sort((a,b)=>b.timestamp-a.timestamp)[0];
  const options=[ex.name,...(ex.alternatives||[])].map(n=>`<option ${n===chosen?'selected':''}>${esc(n)}</option>`).join('');
  return`<article class="exercise-card ${ex.type==='power'?'power':''}" data-exercise="${ex.id}"><div class="exercise-num">${ex.type==='power'?'⚡':String(i+1).padStart(2,'0')}</div><div class="exercise-name"><strong>${esc(chosen)}</strong><span>${esc(ex.area)} · 建议 ${sets}×${esc(ex.type==='power'?rule.powerReps:reps)}</span><select class="alternative" aria-label="${esc(ex.name)}替代动作">${options}</select></div><p class="exercise-cue">${esc(ex.cue)}${prev?`<br><b>上次：</b>${esc(prev.weight||'-')}kg · ${esc(prev.sets)}×${esc(prev.reps)}`:''}</p><div class="exercise-controls"><div class="mini-field"><label>kg</label><input class="log-weight" type="number" min="0" step="0.5" placeholder="—"></div><div class="mini-field"><label>组</label><input class="log-sets" type="number" min="1" value="${sets}"></div><div class="mini-field"><label>次</label><input class="log-reps" type="text" value="${esc(ex.type==='power'?rule.powerReps:reps)}"></div><div class="mini-field"><label>RPE</label><input class="log-rpe" type="number" min="1" max="10" step="0.5" value="${String(rule.rpe).match(/[\d.]+/)[0]}"></div></div><input class="exercise-check" type="checkbox" aria-label="完成${esc(chosen)}" ${existing?'checked':''}></article>`
}

function renderBonus(session,type,required,existing){
  const ex=session[type],prefKey=`${session.id}-${type}`,variant=state.data.preferences.variants[prefKey]||'equipment',chosen=ex[variant];
  const checked=type==='abs'?!!existing:!!existing?.coreDone;
  return`<article class="bonus-card ${required?'required':'optional'}" data-bonus="${type}"><div class="bonus-top"><span>${esc(ex.label)}</span>${required?'<b>通关条件</b>':'<b class="optional-pill">+20 XP</b>'}</div><div class="variant-switch"><button class="${variant==='equipment'?'active':''}" data-variant="equipment">器械版</button><button class="${variant==='bodyweight'?'active':''}" data-variant="bodyweight">徒手版</button></div><div class="bonus-exercise"><div><h4>${esc(chosen.name)}</h4><p>${weekRule().coreSets} 组 × ${esc(ex.reps)} · ${esc(chosen.cue)}</p></div><label>完成<br><input type="checkbox" class="bonus-check" ${checked?'checked':''}></label></div></article>`
}

function bindMissionControls(){
  document.querySelectorAll('.alternative').forEach(sel=>sel.addEventListener('change',e=>{const card=e.target.closest('.exercise-card'),id=card.dataset.exercise;state.data.preferences.exercises[id]=e.target.value;saveState();card.querySelector('.exercise-name strong').textContent=e.target.value}));
  document.querySelectorAll('.variant-switch button').forEach(btn=>btn.addEventListener('click',()=>{const card=btn.closest('.bonus-card'),type=card.dataset.bonus,key=`${state.session}-${type}`;state.data.preferences.variants[key]=btn.dataset.variant;saveState();renderMission()}));
  document.querySelectorAll('.exercise-check,.bonus-check').forEach(c=>c.addEventListener('change',updateCompletionStatus));
}

function updateCompletionStatus(){
  const mains=[...document.querySelectorAll('.exercise-check')],mainDone=mains.length>0&&mains.every(x=>x.checked),absDone=$('[data-bonus="abs"] .bonus-check')?.checked,coreDone=$('[data-bonus="core"] .bonus-check')?.checked;
  let msg=mainDone&&absDone?'主任务已满足，随时可以通关':`还差${!mainDone?'主训练':''}${!mainDone&&!absDone?'和':''}${!absDone?'必做腹肌':''}`;
  if(mainDone&&absDone&&coreDone)msg='满星准备完成：核心彩蛋也拿到了';
  $('#completionStatus').textContent=msg;$('#completeButton').disabled=state.readiness==='pain';
}

function completeMission(){
  if(state.readiness==='pain'){toast('今天先停：尖锐疼痛不进入训练通关。');return}
  const cards=[...document.querySelectorAll('.exercise-card')],mainDone=cards.every(c=>c.querySelector('.exercise-check').checked),absDone=$('[data-bonus="abs"] .bonus-check').checked,coreDone=$('[data-bonus="core"] .bonus-check').checked;
  if(!mainDone||!absDone){toast(`马小，还差${!mainDone?'主训练 ':''}${!absDone?'必做腹肌':''}`);return}
  const id=completionId(),old=getCompletion(),now=Date.now();
  const completion={id,week:state.week,session:state.session,date:new Date().toISOString().slice(0,10),timestamp:old?.timestamp||now,updatedAt:now,coreDone:coreDone||!!old?.coreDone,readiness:state.readiness};
  if(old)Object.assign(old,completion);else state.data.completions.push(completion);
  state.data.logs=state.data.logs.filter(log=>log.completionId!==id);
  cards.forEach(card=>{const exId=card.dataset.exercise,name=card.querySelector('.exercise-name strong').textContent;state.data.logs.push({id:`${id}-${exId}-${now}`,completionId:id,exerciseId:exId,exercise:name,week:state.week,session:state.session,date:completion.date,timestamp:now,weight:Number(card.querySelector('.log-weight').value)||null,sets:card.querySelector('.log-sets').value,reps:card.querySelector('.log-reps').value,rpe:Number(card.querySelector('.log-rpe').value)||null,type:'main'})});
  const session=sessionById();['abs','core'].forEach(type=>{if(type==='core'&&!coreDone)return;const variant=state.data.preferences.variants[`${state.session}-${type}`]||'equipment',ex=session[type][variant];state.data.logs.push({id:`${id}-${type}-${now}`,completionId:id,exerciseId:`${state.session}-${type}`,exercise:ex.name,week:state.week,session:state.session,date:completion.date,timestamp:now,sets:weekRule().coreSets,reps:session[type].reps,rpe:null,type})});
  saveState();renderAllStats();renderMission();toast(old?'记录已更新，马小继续稳住。':coreDone?'满星通关！+120 XP，核心彩蛋到手。':'漂亮，马小！+100 XP，核心没做也不欠账。')
}

function computeStats(){
  const c=state.data.completions,fullWeeks=state.plan?state.plan.weeks.filter(w=>SESSION_IDS.every(s=>c.some(x=>x.week===w.week&&x.session===s))).map(w=>w.week):[];
  const xp=c.length*100+c.filter(x=>x.coreDone).length*20+fullWeeks.length*100;
  let streak=0;for(let w=1;w<=13;w++){if(fullWeeks.includes(w))streak++;else break}
  return{count:c.length,core:c.filter(x=>x.coreDone).length,fullWeeks,xp,streak,currentWeek:c.filter(x=>x.week===state.week).length}
}
function levelFor(xp){if(xp>=5000)return{name:'稳定王者',next:5200,min:5000};if(xp>=3000)return{name:'强者上线',next:5000,min:3000};if(xp>=1500)return{name:'持续输出',next:3000,min:1500};if(xp>=500)return{name:'规律玩家',next:1500,min:500};return{name:'热身玩家',next:500,min:0}}

function renderAllStats(){if(!state.plan)return;const s=computeStats(),level=levelFor(s.xp),pct=(s.xp-level.min)/(level.next-level.min)*100;
  $('#heroXp').textContent=s.xp;$('#heroLevel').textContent=level.name;$('#heroStreak').textContent=s.streak;$('#levelTrack').style.width=`${Math.min(100,pct)}%`;
  $('#sessionCount').textContent=`${s.count} / 52`;$('#sessionMeter').style.width=`${s.count/52*100}%`;$('#weekCount').textContent=`${s.currentWeek} / 4`;$('#coreCount').textContent=s.core;$('#xpCount').textContent=s.xp;$('#nextLevel').textContent=`距下一级 ${Math.max(0,level.next-s.xp)} XP`;
  renderHeatmap();renderHistory();renderAchievements();renderRoadmap();renderReviewGreeting();
}
function renderHeatmap(){const c=state.data.completions;$('#heatmap').innerHTML=state.plan.weeks.map(w=>`<div class="heat-week"><b>W${w.week}</b>${SESSION_IDS.map(id=>{const x=c.find(k=>k.week===w.week&&k.session===id);return`<i title="W${w.week} ${id}" class="heat-cell ${x?'done':''} ${x?.coreDone?'core':''}"></i>`}).join('')}</div>`).join('')}
function renderHistory(){const list=[...state.data.completions].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,7);$('#historyList').innerHTML=list.length?list.map(x=>`<div class="history-item"><div><b>W${x.week} · ${x.session} ${esc(sessionById(x.session)?.short||'')}</b><span>${esc(x.date)}${x.coreDone?' · 核心彩蛋':''}</span></div><div class="history-xp">+${x.coreDone?120:100} XP</div></div>`).join(''):'<div class="empty">第一条战绩，等马小来写。</div>'}
function renderAchievements(){const s=computeStats(),items=[{icon:'🚀',name:'首次上线',desc:'完成第一次训练',on:s.count>=1},{icon:'🔥',name:'四连胜',desc:'完成一个完整训练周',on:s.fullWeeks.length>=1},{icon:'🧩',name:'彩蛋猎人',desc:'完成 4 次可选核心',on:s.core>=4},{icon:'🎾',name:'球场传力',desc:'完成 W10–12 任意 8 次训练',on:state.data.completions.filter(x=>x.week>=10&&x.week<=12).length>=8},{icon:'🏁',name:'十三周毕业',desc:'完成全部 52 次必做任务',on:s.count>=52}];$('#achievementGrid').innerHTML=items.map(x=>`<article class="achievement ${x.on?'unlocked':''}"><i>${x.icon}</i><h3>${x.name}</h3><p>${x.desc}</p></article>`).join('')}

function renderRoadmap(){if(!state.plan)return;const s=computeStats();$('#phaseGrid').innerHTML=state.plan.phases.map(p=>`<article class="phase-card ${p.weeks.includes(state.week)?'current':''}" style="--phase:var(--${p.color})"><span>W${p.weeks[0]}${p.weeks.length>1?`–${p.weeks.at(-1)}`:''}</span><div class="phase-emoji">${p.emoji}</div><b>${esc(p.name)}</b><p>${esc(p.goal)}</p><i></i></article>`).join('');$('#weekStrip').innerHTML=state.plan.weeks.map(w=>`<div class="week-dot ${w.week===state.week?'active':''} ${s.fullWeeks.includes(w.week)?'done':''}">W${w.week}</div>`).join('')}
function renderSafety(){$('#safetyList').innerHTML=state.plan.safety.map(x=>`<li>${esc(x)}</li>`).join('')}
function renderReviewGreeting(){if(!state.plan)return;const h=new Date().getHours(),s=computeStats();let t=h<11?'早上好':h<18?'马小你回来了':'今晚也来稳稳推进';if(s.count===0)t='马小，第一关不拼重量，只拼上线';else if(getCompletion())t=`马小你回来了，W${state.week} ${state.session} 已通关`;else t+=`，W${state.week} ${state.session} 等你`;$('#welcomeText').textContent=`${t}。动作质量优先，今天保留余力。`}

function setReadiness(value){state.readiness=value;document.querySelectorAll('.ready-chip').forEach(b=>b.classList.toggle('active',b.dataset.ready===value));const msg={good:'今天按计划走，所有组都保留余力。',tired:'每个动作减少 1 组，RPE 上限降到 7；睡眠比硬撑更值钱。',pain:'今天停止相关训练：尖锐疼痛不是可兑换 XP 的任务。'}[value];$('#readinessMessage').textContent=msg;updateCompletionStatus()}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2800)}

function exportData(){const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`马小训练计划V2_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('备份已导出。')}
function importData(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(d.schemaVersion!==2||!Array.isArray(d.completions))throw Error();const merged=emptyState();merged.completions=[...new Map([...state.data.completions,...d.completions].map(x=>[x.id,x])).values()];merged.logs=[...new Map([...state.data.logs,...(d.logs||[])].map(x=>[x.id,x])).values()];merged.legacyLogs=[...state.data.legacyLogs,...(d.legacyLogs||[])];merged.preferences={exercises:{...state.data.preferences.exercises,...(d.preferences?.exercises||{})},variants:{...state.data.preferences.variants,...(d.preferences?.variants||{})}};state.data=merged;saveState();renderMission();renderAllStats();closeModal();toast('V2 备份已合并。')}catch{toast('文件不是有效的 V2 备份。')}};r.readAsText(file)}
function copyLegacy(){try{const old=JSON.parse(localStorage.getItem('tp_v13')||'[]');if(!Array.isArray(old)||!old.length){toast('当前浏览器没有找到旧版记录。');return}state.data.legacyLogs=[...old];saveState();closeModal();toast(`已复制 ${old.length} 条旧记录到预览，只读保留。`)}catch{toast('旧版记录格式无法读取。')}}
function openModal(){$('#dataModal').classList.add('open');$('#dataModal').setAttribute('aria-hidden','false')}
function closeModal(){$('#dataModal').classList.remove('open');$('#dataModal').setAttribute('aria-hidden','true')}

function bindGlobal(){
  $('#weekSelect').addEventListener('change',e=>{state.week=Number(e.target.value);localStorage.setItem('mx_plan_v2_preview_week',state.week);renderSelectors();renderMission();renderAllStats()});
  document.querySelectorAll('.ready-chip').forEach(b=>b.addEventListener('click',()=>setReadiness(b.dataset.ready)));$('#completeButton').addEventListener('click',completeMission);
  $('#dataButton').addEventListener('click',openModal);document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',closeModal));$('#exportButton').addEventListener('click',exportData);$('#importInput').addEventListener('change',e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value=''});$('#legacyButton').addEventListener('click',copyLegacy);
  $('#clearPreview').addEventListener('click',()=>{if(confirm('只清空 V2 预览记录，确定吗？')){state.data=emptyState();saveState();renderMission();renderAllStats();toast('预览记录已清空，正式计划未受影响。')}})
}

init().catch(()=>{document.body.innerHTML='<main style="font-family:sans-serif;padding:40px"><h1>计划数据加载失败</h1><p>请刷新页面重试。</p></main>'});
