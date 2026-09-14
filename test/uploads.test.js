"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const sharp = require('sharp');
const { saveImage, MAX_BYTES } = require('../setup/uploads');
const setup = require('../setup/generator'), shared = require('../shared/config');
function root(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'athletics-upload-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir; }
const image = format => sharp({create:{width:3,height:3,channels:4,background:'#123456'}}).toFormat(format).toBuffer();
test('uploads save validated PNG, JPEG and WebP within the module and never overwrite',async t=>{
 const dir=root(t);
 for(const [format,name] of [['png','Tiger Logo.png'],['jpeg','background.jpg'],['webp','background.webp']]) {
 const bytes=await image(format), first=await saveImage(dir,name,bytes), second=await saveImage(dir,name,bytes);
 assert.match(first.path,/^images\/uploads\/[a-z-]+\.(png|jpg|webp)$/);
 assert.notEqual(first.path,second.path);assert.match(second.path,/-2\./);
 assert.equal((await sharp(fs.readFileSync(path.join(dir,first.path))).metadata()).format,format);
 }
 assert.ok(fs.existsSync(path.join(dir,'images/uploads/tiger-logo.png')));
});
test('uploads reject traversal, absolute paths, unsupported, oversized and malformed images',async t=>{
 const dir=root(t), bytes=await image('png');
 for(const name of ['../x.png','/x.png','x..png','C:\\x.png','a/b.png','x.svg','x.gif']) await assert.rejects(saveImage(dir,name,bytes));
 await assert.rejects(saveImage(dir,'x.png',Buffer.alloc(MAX_BYTES+1)),/8 MiB/);
 await assert.rejects(saveImage(dir,'x.jpg',bytes),/match/);
 await assert.rejects(saveImage(dir,'x.png',Buffer.from('not an image')));
 assert.deepEqual(fs.readdirSync(dir),[]);
});
test('upload directory symlinks are refused and file symlinks cannot be overwritten',async t=>{
 const dir=root(t), outside=root(t), bytes=await image('png');
 fs.symlinkSync(outside,path.join(dir,'images'));
 await assert.rejects(saveImage(dir,'x.png',bytes),/symlink/);assert.deepEqual(fs.readdirSync(outside),[]);
 fs.unlinkSync(path.join(dir,'images'));fs.mkdirSync(path.join(dir,'images/uploads'),{recursive:true});
 fs.writeFileSync(path.join(outside,'original'),'keep');fs.symlinkSync(path.join(outside,'original'),path.join(dir,'images/uploads/x.png'));
 assert.equal((await saveImage(dir,'x.png',bytes)).path,'images/uploads/x-2.png');assert.equal(fs.readFileSync(path.join(outside,'original'),'utf8'),'keep');
});
function harness(port='8081',fail=false) {
 const nodes=new Map(), calls=[];let events=0;
 const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'images/previous.png',disabled:id.endsWith('-upload'),files:[],handlers:{},addEventListener(k,v){this.handlers[k]=v;},dispatchEvent(){events++;}});return nodes.get(id);};
 vm.runInNewContext(fs.readFileSync('setup/upload-ui.js','utf8'),{SchoolAthleticsConfig:shared,document:{getElementById:get},location:{hostname:'127.0.0.1',port},Event:class{},fetch:async(url,options)=>{calls.push({url,options});return {ok:!fail||!options,json:async()=>options?(fail?{error:'Upload rejected'}:{path:'images/uploads/tiger-logo.png'}):{uploads:true}};}});
 return {get,calls,events:()=>events};
}
test('both existing image fields receive uploaded paths and notify generator/preview',async()=>{
 for(const field of ['schoolLogo','backgroundImage']) {
 const h=harness();await new Promise(r=>setImmediate(r));h.get(field+'-upload').files=[{name:'Tiger Logo.png',size:10}];await h.get(field+'-upload').handlers.change();
 assert.equal(h.get(field).value,'images/uploads/tiger-logo.png');assert.equal(h.events(),1);
 const state={...setup.initialState('UTC'),calendarUrl:'https://www.arbiterlive.com/calendar/example.ics',[field]:h.get(field).value};
 assert.equal(setup.generate(state).entry.config[field],h.get(field).value);
 }
});
test('failed uploads retain previous state and static mode never writes',async()=>{
 const failed=harness('8081',true);await new Promise(r=>setImmediate(r));failed.get('schoolLogo-upload').files=[{name:'logo.png',size:10}];await failed.get('schoolLogo-upload').handlers.change();
 assert.equal(failed.get('schoolLogo').value,'images/previous.png');assert.equal(failed.events(),0);assert.match(failed.get('schoolLogo-upload-status').textContent,/Previous image path kept/);
 const h=harness('8080');h.get('schoolLogo-upload').files=[{name:'logo.png',size:10}];await h.get('schoolLogo-upload').handlers.change();assert.equal(h.calls.length,0);assert.equal(h.get('schoolLogo-upload').disabled,true);
 const html=fs.readFileSync('setup/index.html','utf8');assert.match(html,/Image upload requires the local setup helper/);
});
test('upload endpoint enforces origin protections and returns a local asset path',async t=>{
 const {Readable}=require('node:stream'),{createServer}=require('../setup/server');const dir=root(t),server=createServer(dir,'unused');const bytes=await image('png');
 function request(headers) {const req=Readable.from([bytes]);Object.assign(req,{url:'/api/upload',method:'POST',socket:{localPort:8081},headers:{host:'127.0.0.1:8081','content-type':'image/png','x-image-name':'logo.png','x-setup-upload':'1',...headers}});return new Promise(resolve=>{let status;server.emit('request',req,{writeHead(n){status=n;},end(body){resolve({status,result:JSON.parse(body)});}});});}
 assert.equal((await request({origin:'https://example.org'})).status,403);
 const good=await request({origin:'http://127.0.0.1:8081'});assert.equal(good.status,200);assert.equal(good.result.path,'images/uploads/logo.png');
});
test('standalone setup redirects uploads only to a clearly installed MagicMirror module',async t=>{
 const {Readable}=require('node:stream'),{createServer,uploadRoot}=require('../setup/server');const standalone=root(t),magic=root(t),target=path.join(magic,'config','config.js'),installed=path.join(magic,'modules','MMM-SchoolAthletics'),bytes=await image('png');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'var config={modules:[]};');fs.mkdirSync(installed,{recursive:true});
 assert.equal(uploadRoot(standalone,target),fs.realpathSync(installed));
 assert.equal(uploadRoot(standalone,path.join(magic,'config','other.js')),standalone);
 const server=createServer(standalone,target),req=Readable.from([bytes]);Object.assign(req,{url:'/api/upload',method:'POST',socket:{localPort:8081},headers:{host:'127.0.0.1:8081',origin:'http://127.0.0.1:8081','content-type':'image/png','x-image-name':'board.png','x-setup-upload':'1'}});
 const response=await new Promise(resolve=>{let status;server.emit('request',req,{writeHead(n){status=n;},end(body){resolve({status,result:JSON.parse(body)});}});});
 assert.equal(response.status,200);assert.equal(response.result.path,'images/uploads/board.png');assert.ok(fs.existsSync(path.join(installed,response.result.path)));assert.equal(fs.existsSync(path.join(standalone,response.result.path)),false);
});

test('bundled sample is a valid optional PNG and selection updates the existing path',async()=>{
 assert.equal((await sharp('images/sample-background.png').metadata()).format,'png');
 const h=harness('8080');h.get('sample-background').handlers.click();assert.equal(h.get('backgroundImage').value,'images/sample-background.png');assert.equal(h.events(),1);
 assert.equal(setup.initialState('UTC').backgroundImage,'');
 assert.equal(setup.generate({...setup.initialState('UTC'),calendarUrl:'https://www.arbiterlive.com/calendar/example.ics',backgroundImage:h.get('backgroundImage').value}).entry.config.backgroundImage,'images/sample-background.png');
});

test('preview frame renders uploaded logo and background from existing state fields',()=>{
 const preview=require('../setup/preview-model'), nodes=new Map();let listener;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,style:{setProperty(){}},removeAttribute(key){delete this[key];},replaceChildren(){},append(){},clientWidth:100,clientHeight:100});return nodes.get(id);};
 const parent={postMessage(){}};
 vm.runInNewContext(fs.readFileSync('setup/preview-frame.js','utf8'),{SchoolAthleticsConfig:shared,SchoolAthleticsPreview:preview,parent,URL,location:{href:'http://127.0.0.1:8081/setup/preview.html',origin:'http://127.0.0.1:8081'},requestAnimationFrame(){},window:{addEventListener(type,fn){if(type==='message')listener=fn;}},document:{getElementById:node,documentElement:node('root'),querySelectorAll(){return [];},createElement(){return {append(){}};}}});
 listener({source:parent,origin:'http://127.0.0.1:8081',data:{type:'school-preview-render',revision:1,state:preview.state({schoolLogo:'images/uploads/logo.png',backgroundImage:'images/uploads/background.webp',showSchoolName:false},{preset:'1920x1080',mode:'typical'})}});
 for(const [id,path] of [['school-logo','logo.png'],['background','background.webp']]){assert.equal(node(id).src,'http://127.0.0.1:8081/images/uploads/'+path);node(id).onload();assert.equal(node(id).hidden,false);}
});

test('helper hides manual inputs without changing existing paths; static keeps them available',async()=>{
 const helper=harness();await new Promise(r=>setImmediate(r));
 for(const field of ['schoolLogo','backgroundImage']) {
  assert.equal(helper.get(field).hidden,true);
  assert.equal(helper.get(field).value,'images/previous.png');
  assert.equal(helper.get(field+'-label').htmlFor,field+'-upload');
  assert.equal(helper.get(field+'-upload-label').hidden,true);
  assert.equal(helper.get(field+'-upload-status').textContent,'Current image: previous.png');
 }
 const staticPage=harness('8080');
 for(const field of ['schoolLogo','backgroundImage']) assert.notEqual(staticPage.get(field).hidden,true);
});

test('upload success shows friendly selected filename rather than the saved directory',async()=>{
 const h=harness();await new Promise(r=>setImmediate(r));
 h.get('schoolLogo-upload').files=[{name:'Tiger Logo.png',size:10}];
 await h.get('schoolLogo-upload').handlers.change();
 assert.match(h.get('schoolLogo-upload-status').textContent,/Tiger Logo.png saved/);
 assert.doesNotMatch(h.get('schoolLogo-upload-status').textContent,/images\/uploads/);
 assert.equal(h.get('schoolLogo').value,'images/uploads/tiger-logo.png');
});
