export const SCHEMA_VERSION=4;
export const SESSION_IDS=['A1','B1','A2','B2'];

export function createRound(number=1,now=new Date().toISOString()){
  return{id:`round-${number}`,number,status:'active',startedAt:now,endedAt:null,currentWeek:1};
}

export function emptyState(now=new Date().toISOString()){
  const round=createRound(1,now);
  return{schemaVersion:SCHEMA_VERSION,activeRoundId:round.id,rounds:[round],completions:[],logs:[],preferences:{exercises:{},variants:{},finishers:{}},prEvents:[],milestones:[],createdAt:now};
}

export function migrateState(raw){
  if(!raw||typeof raw!=='object'||raw.schemaVersion!==SCHEMA_VERSION)return emptyState();
  const base=emptyState(raw.createdAt),rounds=Array.isArray(raw.rounds)&&raw.rounds.length?raw.rounds:base.rounds;
  const active=rounds.find(x=>x.id===raw.activeRoundId&&x.status==='active')||rounds.find(x=>x.status==='active')||rounds.at(-1);
  return{...base,...raw,activeRoundId:active.id,rounds,completions:raw.completions||[],logs:raw.logs||[],preferences:{...base.preferences,...(raw.preferences||{}),exercises:{...base.preferences.exercises,...(raw.preferences?.exercises||{})},variants:{...base.preferences.variants,...(raw.preferences?.variants||{})},finishers:{...base.preferences.finishers,...(raw.preferences?.finishers||{})}},prEvents:raw.prEvents||[],milestones:raw.milestones||[]};
}

export function mergeStateData(current,incoming){
  const local=migrateState(current),remote=migrateState(incoming);
  const pristine=local.completions.length===0&&local.logs.length===0&&local.prEvents.length===0&&local.rounds.length===1&&Number(local.rounds[0].currentWeek)===1;
  if(pristine)return remote;
  local.rounds=[...new Map([...remote.rounds,...local.rounds].map(x=>[x.id,x])).values()].sort((a,b)=>a.number-b.number);
  local.completions=[...new Map([...local.completions,...remote.completions].map(x=>[x.id,x])).values()];
  local.logs=[...new Map([...local.logs,...remote.logs].map(x=>[x.id,x])).values()];
  local.prEvents=[...new Map([...local.prEvents,...remote.prEvents].map(x=>[x.id,x])).values()];
  local.milestones=[...new Map([...local.milestones,...remote.milestones].map(x=>[x.id,x])).values()];
  local.preferences={exercises:{...local.preferences.exercises,...remote.preferences.exercises},variants:{...local.preferences.variants,...remote.preferences.variants},finishers:{...local.preferences.finishers,...remote.preferences.finishers}};
  return local;
}

export function estimate1RM(weight,reps){
  const w=Number(weight),r=Number.parseInt(reps,10);
  if(!(w>0)||!(r>=1&&r<=10))return null;
  return Math.round(w*(1+r/30)*10)/10;
}

export function validRecord(log){
  const reps=Number.parseInt(log.reps,10);
  return log.type==='main'&&log.qualityPassed===true&&Number(log.weight)>0&&reps>=1&&reps<=10&&Number(log.rpe)>0&&Number(log.rpe)<=9;
}

export function detectRecords(candidate,history=[]){
  if(!validRecord(candidate))return{types:[],milestones:[],previous:{}};
  const comparable=history.filter(x=>validRecord(x)&&x.variantId===candidate.variantId&&x.id!==candidate.id&&x.completionId!==candidate.completionId);
  const maxWeight=Math.max(0,...comparable.map(x=>Number(x.weight)||0));
  const sameWeight=comparable.filter(x=>Number(x.weight)===Number(candidate.weight));
  const maxReps=Math.max(0,...sameWeight.map(x=>Number.parseInt(x.reps,10)||0));
  const maxE1rm=Math.max(0,...comparable.map(x=>Number(x.e1rm)||estimate1RM(x.weight,x.reps)||0));
  const types=[];
  if(!comparable.length)types.push('first');
  else{
    if(Number(candidate.weight)>maxWeight)types.push('weight');
    if(sameWeight.length&&Number.parseInt(candidate.reps,10)>maxReps)types.push('reps');
    if(Number(candidate.e1rm)>maxE1rm+.05)types.push('e1rm');
  }
  const previousMilestone=Math.floor(maxWeight/10)*10,currentMilestone=Math.floor(Number(candidate.weight)/10)*10,milestones=[];
  if(!comparable.length&&currentMilestone>=10)milestones.push(currentMilestone);
  else for(let value=Math.max(10,previousMilestone+10);value<=currentMilestone;value+=10)milestones.push(value);
  return{types,milestones,previous:{maxWeight,maxReps,maxE1rm}};
}

export function completedWeekKeys(data){
  const completions=data.completions||[];
  return(data.rounds||[]).flatMap(round=>Array.from({length:13},(_,i)=>i+1).filter(week=>SESSION_IDS.every(session=>completions.some(x=>x.roundId===round.id&&x.week===week&&x.session===session))).map(week=>({roundId:round.id,roundNumber:round.number,week,key:`${round.id}:w${week}`})));
}

export function computeStats(data){
  const completions=data.completions||[],fullWeeks=completedWeekKeys(data),fullSet=new Set(fullWeeks.map(x=>x.key));
  const rounds=[...(data.rounds||[])].sort((a,b)=>a.number-b.number),active=rounds.find(x=>x.id===data.activeRoundId);
  const evaluated=[];
  for(const round of rounds){
    const last=round.status==='completed'?13:round.id===active?.id?Math.max(0,Number(round.currentWeek||1)-1):13;
    for(let week=1;week<=last;week++)evaluated.push(fullSet.has(`${round.id}:w${week}`));
    if(round.id===active?.id&&fullSet.has(`${round.id}:w${round.currentWeek}`))evaluated.push(true);
  }
  let streak=0,maxStreak=0;
  for(const done of evaluated){streak=done?streak+1:0;maxStreak=Math.max(maxStreak,streak)}
  const prXp=(data.prEvents||[]).reduce((sum,x)=>sum+(Number(x.xp)||0),0);
  const xp=completions.length*100+completions.filter(x=>x.coreDone).length*20+fullWeeks.length*100+prXp;
  return{count:completions.length,core:completions.filter(x=>x.coreDone).length,fullWeeks,xp,prXp,prCount:(data.prEvents||[]).length,streak,maxStreak,rounds:rounds.length};
}

export function metricValue(log,metric){
  if(metric==='weight')return Number(log.weight)||0;
  if(metric==='volume')return (Number(log.weight)||0)*(Number(log.sets)||0)*(Number.parseInt(log.reps,10)||0);
  if(metric==='rpe')return Number(log.rpe)||0;
  return Number(log.e1rm)||estimate1RM(log.weight,log.reps)||0;
}

export function exerciseVisible(exercise,phaseId){return !exercise.hiddenPhases?.includes(phaseId)}
export function exerciseRequired(exercise,phaseId,week,readiness='good'){
  const fallback=exercise.fatigueFallback||{};
  if(readiness==='tired'&&(fallback.optional||fallback.optionalWeeks?.includes(Number(week))))return false;
  return exercise.requiredPhases?exercise.requiredPhases.includes(phaseId):true;
}
export function resolvePrescription(exercise,{phaseId,week,rule,readiness='good'}){
  const phaseRx=exercise.prescriptionsByPhase?.[phaseId],phaseOverride=phaseRx?.weekOverrides?.[week],weekOverride=exercise.weekOverrides?.[week];
  let p=phaseRx?{...phaseRx,...phaseOverride,...weekOverride}:{sets:exercise.main?rule.mainSets:rule.accessorySets,reps:exercise.main?rule.mainReps:rule.accessoryReps,rpe:rule.rpe};
  if(exercise.id==='b2-deadlift'&&rule.deadliftSets)p={...p,sets:rule.deadliftSets,reps:rule.deadliftReps,rpe:rule.rpe};
  if(readiness==='tired'&&exercise.fatigueFallback?.reduceSets)p={...p,sets:Math.max(1,Number(p.sets)-Number(exercise.fatigueFallback.reduceSets)),rpe:String(Math.min(7,Number.parseFloat(p.rpe)||7))};
  return p;
}

export function mergeCompletionLogs(allLogs,completionId,currentExerciseIds,replacementLogs,legacyRevision='3.2'){
  const currentIds=new Set(currentExerciseIds);
  const outside=allLogs.filter(log=>log.completionId!==completionId);
  const removedHistorical=allLogs.filter(log=>log.completionId===completionId&&log.type==='main'&&!currentIds.has(log.exerciseId)).map(log=>({...log,legacyFromRevision:log.planRevision||legacyRevision}));
  return[...outside,...removedHistorical,...replacementLogs];
}

export function startNextRound(data,now=new Date().toISOString()){
  const current=data.rounds.find(x=>x.id===data.activeRoundId);
  if(!current||Number(current.currentWeek)<13)return null;
  current.status='completed';current.endedAt=now;
  const next=createRound(Math.max(0,...data.rounds.map(x=>Number(x.number)||0))+1,now);
  data.rounds.push(next);data.activeRoundId=next.id;
  return next;
}
