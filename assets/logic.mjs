export const SCHEMA_VERSION=3;
export const SESSION_IDS=['A1','B1','A2','B2'];

export function emptyState(now=new Date().toISOString()){
  return{schemaVersion:SCHEMA_VERSION,completions:[],logs:[],legacyLogs:[],preferences:{exercises:{},variants:{}},prEvents:[],milestones:[],createdAt:now};
}

const familyMap={
  'a1-bench':['bench','barbell-bench'],'a1-row':['row','chest-supported-row'],'a1-incline':['bench','incline-db-bench'],'a1-pulldown':['vertical-pull','neutral-pulldown'],
  'b1-squat':['squat','high-bar-squat'],'b1-hip':['hip-thrust','barbell-hip-thrust'],'b1-split':['single-leg','bulgarian-split-squat'],'b1-lateral':['lateral-raise','db-lateral-raise'],'b1-rear':['rear-delt','reverse-pec-deck'],
  'a2-dbbench':['bench','db-bench'],'a2-cablerow':['row','seated-cable-row'],'a2-pullup':['vertical-pull','assisted-pullup'],'a2-pushup':['bench','pushup'],
  'b2-deadlift':['deadlift','trap-bar-deadlift'],'b2-curl':['leg-curl','seated-leg-curl'],'b2-step':['single-leg','step-up'],'b2-lateral':['lateral-raise','cable-lateral-raise'],'b2-rear':['rear-delt','cable-rear-fly']
};

export function migrateState(raw){
  if(!raw||typeof raw!=='object')return emptyState();
  if(raw.schemaVersion===SCHEMA_VERSION)return{...emptyState(raw.createdAt),...raw,preferences:{...emptyState().preferences,...(raw.preferences||{})},prEvents:raw.prEvents||[],milestones:raw.milestones||[]};
  if(raw.schemaVersion===2){
    const migrated=emptyState(raw.createdAt);
    migrated.completions=Array.isArray(raw.completions)?raw.completions:[];
    migrated.legacyLogs=Array.isArray(raw.legacyLogs)?raw.legacyLogs:[];
    migrated.preferences={...migrated.preferences,...(raw.preferences||{})};
    migrated.logs=(raw.logs||[]).map(log=>{
      const [canonicalExerciseId,variantId]=familyMap[log.exerciseId]||['legacy',`legacy-${log.exerciseId||'exercise'}`];
      const reps=Number.parseInt(log.reps,10),weight=Number(log.weight),rpe=Number(log.rpe);
      return{...log,canonicalExerciseId,variantId,qualityPassed:Boolean(weight>0&&reps>0&&(!rpe||rpe<=9)),e1rm:estimate1RM(weight,reps),phaseId:'legacy',migrated:true};
    });
    return migrated;
  }
  return emptyState();
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
  const comparable=history.filter(x=>validRecord(x)&&x.variantId===candidate.variantId&&x.completionId!==candidate.completionId);
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

export function computeStats(data,weeks=[]){
  const c=data.completions||[],fullWeeks=weeks.filter(w=>SESSION_IDS.every(s=>c.some(x=>x.week===w.week&&x.session===s))).map(w=>w.week);
  const prXp=(data.prEvents||[]).reduce((sum,x)=>sum+(Number(x.xp)||0),0);
  const xp=c.length*100+c.filter(x=>x.coreDone).length*20+fullWeeks.length*100+prXp;
  let streak=0;for(let w=1;w<=13;w++){if(fullWeeks.includes(w))streak++;else break}
  return{count:c.length,core:c.filter(x=>x.coreDone).length,fullWeeks,xp,prXp,prCount:(data.prEvents||[]).length,streak};
}

export function metricValue(log,metric){
  if(metric==='weight')return Number(log.weight)||0;
  if(metric==='volume')return (Number(log.weight)||0)*(Number(log.sets)||0)*(Number.parseInt(log.reps,10)||0);
  if(metric==='rpe')return Number(log.rpe)||0;
  return Number(log.e1rm)||estimate1RM(log.weight,log.reps)||0;
}
