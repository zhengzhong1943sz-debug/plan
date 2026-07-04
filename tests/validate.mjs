import fs from'node:fs';
import assert from'node:assert/strict';
import{estimate1RM,detectRecords,migrateState,computeStats}from'../assets/logic.mjs';

const plan=JSON.parse(fs.readFileSync(new URL('../data/plan.json',import.meta.url),'utf8'));
const ok=(label,fn)=>{fn();console.log(`✓ ${label}`)};

ok('schemaVersion 3 and 13 weeks',()=>{assert.equal(plan.schemaVersion,3);assert.equal(plan.weeks.length,13)});
ok('exactly four sessions and four primers',()=>{assert.deepEqual(plan.sessions.map(x=>x.id),['A1','B1','A2','B2']);assert.equal(plan.sessions.filter(x=>x.primer).length,4)});
ok('B1 and B2 each contain middle and rear delt work',()=>{for(const id of['B1','B2']){const s=plan.sessions.find(x=>x.id===id);assert.equal(s.exercises.filter(x=>x.canonicalExerciseId==='lateral-raise').length,1);assert.equal(s.exercises.filter(x=>x.canonicalExerciseId==='rear-delt').length,1)}});
ok('no landmine defaults and no direct arm isolation',()=>{const names=plan.sessions.flatMap(s=>[s.primer,...s.exercises]).map(x=>x.name).join(' ');assert.doesNotMatch(names,/地雷管|二头弯举|三头下压|绳索下压/)});
ok('all default exercises expose details and demo URL',()=>{for(const s of plan.sessions)for(const ex of[s.primer,...s.exercises]){assert.ok(ex.canonicalExerciseId);assert.ok(ex.variantId);assert.ok(ex.phaseRole);assert.ok(ex.details?.setup);assert.ok(ex.details?.stop);assert.match(ex.demoUrl,/^https:\/\//)}});
ok('strength phase names conventional deadlift priority',()=>{const p=plan.phases.find(x=>x.id==='deadlift-strength');assert.deepEqual(p.weeks,[5,6,7,8]);assert.equal(p.priority,'传统杠铃硬拉')});
ok('performance phase uses speed deadlift variant',()=>{const ex=plan.sessions.find(x=>x.id==='B2').exercises.find(x=>x.id==='b2-deadlift');assert.equal(ex.phaseVariants.performance.variantId,'conventional-deadlift-speed')});

const base={type:'main',qualityPassed:true,canonicalExerciseId:'deadlift',variantId:'conventional-deadlift',completionId:'w1-B2',exercise:'传统杠铃硬拉',weight:75,reps:'3',rpe:8,e1rm:estimate1RM(75,3)};
ok('first 80kg record establishes PR and milestone',()=>{const x={...base,weight:80,e1rm:estimate1RM(80,3)};const r=detectRecords(x,[]);assert.deepEqual(r.types,['first']);assert.deepEqual(r.milestones,[80])});
ok('75kg to 80kg triggers weight and e1RM PR',()=>{const x={...base,completionId:'w2-B2',weight:80,e1rm:estimate1RM(80,3)};const r=detectRecords(x,[base]);assert.ok(r.types.includes('weight'));assert.ok(r.types.includes('e1rm'));assert.deepEqual(r.milestones,[80])});
ok('80kg x3 to x5 triggers reps and e1RM PR',()=>{const old={...base,weight:80,reps:'3',e1rm:estimate1RM(80,3)},x={...base,completionId:'w3-B2',weight:80,reps:'5',e1rm:estimate1RM(80,5)};const r=detectRecords(x,[old]);assert.ok(r.types.includes('reps'));assert.ok(r.types.includes('e1rm'));assert.ok(!r.types.includes('weight'))});
ok('variants do not share records',()=>{const trap={...base,variantId:'trap-bar-deadlift',weight:120,e1rm:132};const r=detectRecords({...base,completionId:'w2-B2',weight:80,e1rm:88},[trap]);assert.deepEqual(r.types,['first'])});
ok('invalid quality and RPE cannot trigger records',()=>{assert.deepEqual(detectRecords({...base,qualityPassed:false},[]).types,[]);assert.deepEqual(detectRecords({...base,rpe:9.5},[]).types,[])});
ok('V2 state migrates without PR rewards',()=>{const v2={schemaVersion:2,completions:[{id:'w1-A1'}],logs:[{id:'l1',exerciseId:'b2-deadlift',exercise:'六角杠硬拉',weight:60,reps:'5',rpe:7,type:'main'}],preferences:{}};const v3=migrateState(v2);assert.equal(v3.schemaVersion,3);assert.equal(v3.logs[0].canonicalExerciseId,'deadlift');assert.equal(v3.logs[0].variantId,'trap-bar-deadlift');assert.equal(v3.prEvents.length,0)});
ok('PR XP is additive and deduplicated by event list',()=>{const stats=computeStats({completions:[],prEvents:[{id:'x',xp:30}],logs:[]},plan.weeks);assert.equal(stats.xp,30)});
