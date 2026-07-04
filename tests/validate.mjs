import fs from 'node:fs';
const plan=JSON.parse(fs.readFileSync(new URL('../data/plan.json',import.meta.url),'utf8'));
const fail=(m)=>{throw new Error(m)};
if(plan.schemaVersion!==2)fail('schemaVersion must be 2');
if(plan.weeks.length!==13)fail('must contain 13 weeks');
if(plan.sessions.length!==4)fail('must contain exactly 4 sessions');
if(plan.sessions.some(s=>s.id==='CORE'))fail('standalone CORE session is forbidden');
const armPattern=/哑铃弯举|杠铃弯举|锤式弯举|三头下压|过头.*臂屈伸|双杠臂屈伸|窄距卧推|手臂孤立/;
for(const session of plan.sessions){
  if(!session.abs||!session.core)fail(`${session.id} needs abs and core`);
  for(const block of [session.abs,session.core]){
    if(!block.equipment?.name||!block.bodyweight?.name)fail(`${session.id} bonus needs equipment and bodyweight variants`);
  }
  const names=session.exercises.flatMap(e=>[e.name,...e.alternatives]);
  if(names.some(n=>armPattern.test(n)))fail(`${session.id} contains direct arm isolation`);
}
for(const week of plan.weeks){
  if(Number(String(week.rpe).match(/[\d.]+/)[0])>8)fail(`W${week.week} exceeds RPE 8`);
  if(week.week<=9&&week.power)fail(`W${week.week} must not contain power work`);
}
if(!plan.weeks.slice(9,12).every(w=>w.power))fail('W10-12 must be tennis power weeks');
console.log('✓ 13 weeks');
console.log('✓ 4 sessions, no standalone core day');
console.log('✓ 1 required abs + 1 optional core with two variants per session');
console.log('✓ no direct arm isolation');
console.log('✓ RPE and power safety rules pass');
