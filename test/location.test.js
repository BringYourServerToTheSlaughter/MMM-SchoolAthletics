"use strict";
const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs');
const setup=require('../setup/generator');
const {transform}=require('../setup/apply-config');
const state={...setup.initialState('UTC'),calendarUrl:'https://www.arbiterlive.com/calendar/example.ics',outputMode:'clean',latitude:'12.5',longitude:'-45.25'};
test('coordinate validation accepts manual numbers and rejects missing, invalid and out-of-range values',()=>{
  assert.deepEqual(setup.coordinates(state),{lat:12.5,lon:-45.25});
  assert.deepEqual(setup.coordinates({latitude:0,longitude:0}),{lat:0,lon:0});
  assert.deepEqual(setup.coordinates({latitude:-90,longitude:180}),{lat:-90,lon:180});
  for(const value of ['', ' ', 'NaN', 'Infinity', '12x', null, true, {}, '0x10']) assert.equal(setup.coordinates({...state,latitude:value}),null);
  assert.equal(setup.coordinates({...state,latitude:91}),null);
  assert.equal(setup.coordinates({...state,longitude:-181}),null);
  assert.ok(setup.generate({...state,latitude:'invalid'}).output);
});
test('clean fallback produces current weather only; preservation and module-only output win',()=>{
  const source='var config={modules:[]};module.exports=config;';
  const read=text=>{const context={module:{}};vm.runInNewContext(text,context);return JSON.parse(JSON.stringify(context.module.exports));};
  const result=read(transform(source,state));
  assert.deepEqual(result.modules[1],{module:'weather',position:'top_right',config:{weatherProvider:'openmeteo',type:'current',lat:12.5,lon:-45.25}});
  assert.equal(result.modules.filter(m=>m.module==='weather').length,1);
  const existing='var config={modules:[{module:"weather",config:{type:"current",weatherProvider:"existing",location:"Example"}}]};module.exports=config;';
  assert.equal(read(transform(existing,state)).modules[1].config.weatherProvider,'existing');
  const report={};
  assert.equal(read(transform(source,{...state,latitude:''},report)).modules.length,2);
  assert.match(report.weather,/omitted/);
  assert.equal(transform(source,{...state,outputMode:'module'}),transform(source,{...state,outputMode:'module',latitude:'',longitude:''}));
  assert.doesNotMatch(setup.generate(state).output,/"weatherProvider"|"lat"|"lon"/);
});
function harness(geolocation) {
 const nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,handlers:{},addEventListener(e,f){this.handlers[e]=f;},dispatchEvent(e){this.handlers[e.type]?.();}});return nodes.get(id);}
 vm.runInNewContext(fs.readFileSync('setup/location.js','utf8'),{document:{getElementById:node},navigator:{geolocation},SchoolAthleticsSetup:setup,Event:class{constructor(type){this.type=type;}}});return node;
}
test('geolocation is explicit and fills editable coordinates on success',()=>{
 let success,calls=0;const node=harness({getCurrentPosition(ok){calls++;success=ok;}});
 assert.equal(calls,0);node('use-location').handlers.click();assert.equal(calls,1);
 success({coords:{latitude:12.5,longitude:-45.25}});
 assert.equal(node('latitude').value,'12.5');assert.equal(node('longitude').value,'-45.25');
 node('latitude').value='-10';node('latitude').handlers.input();assert.match(node('location-status').textContent,/ready/);
});
test('permission denial and failures retain manual coordinates with inline guidance',()=>{
 for(const code of [1,2,3]){
 const node=harness({getCurrentPosition(ok,fail){fail({code});}});node('latitude').value='10';node('use-location').handlers.click();
 assert.equal(node('latitude').value,'10');assert.match(node('location-status').textContent,/manually/);assert.equal(node('use-location').disabled,false);
 }
 const node=harness(undefined);node('use-location').handlers.click();assert.match(node('location-status').textContent,/unavailable/);
});
