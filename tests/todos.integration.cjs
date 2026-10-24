const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const classicRoot=process.env.CLASSIC_NOTEBOOK_DIR?path.resolve(process.env.CLASSIC_NOTEBOOK_DIR):path.resolve(__dirname,'../../obsidian-classic-notebook');
const pluginPath=id=>id==='classic-notebook'?path.join(classicRoot,'main.js'):path.resolve(__dirname,'../main.js');
if(!fs.existsSync(pluginPath('classic-notebook')))throw new Error('Build the sibling obsidian-classic-notebook checkout or set CLASSIC_NOTEBOOK_DIR before running integration tests.');

class TFile{constructor(path,content=''){this.path=path;this.content=content;this.extension=path.split('.').at(-1);this.basename=path.split('/').at(-1).replace(/\.[^.]+$/,'');}}
class TFolder{constructor(path){this.path=path;}}
const obsidian={Plugin:class{},ItemView:class{},FileView:class{},Modal:class{},Notice:class{},TFile,TFolder,normalizePath:value=>value?value.replace(/\\/g,'/').replace(/^\/+|\/+$/g,''):'.'};
const load=(id,extra='')=>{const context={module:{exports:{}},require:()=>obsidian,crypto:webcrypto,Date,Math,Intl,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(pluginPath(id),'utf8')+extra,context);return context.module.exports;};
const Notebook=load('classic-notebook'),GM=load('gm-note-shortcuts','\nmodule.exports.todoTest={gmTodoBlock,gmTodoCharacterMatches};');
const files=new Map([['',new TFolder('')],['Chars',new TFolder('Chars')],['Scenes',new TFolder('Scenes')]]);
const add=(path,text='')=>{const file=new TFile(path,text);files.set(path,file);return file;};
const occupied=add('TODOs.md','An existing user note, never replace this.');
const source=add('Scenes/Session.md','Original selected text.\n');
const actor=add('Chars/Actor.md','---\ntitle: Actor\n---\n<!-- tn-box:main:start -->\nOriginal description.\n<!-- tn-box:main:end -->\n\n---\nOriginal footer.\n');actor.meta={title:'Actor Name',aliases:['Actor Alias']};
const receiver=add('Chars/Receiver.md','Original receiver description.\r\n');
const board=add('Chars/Canvas Person.canvas',JSON.stringify({nodes:[{id:'old',type:'text',x:30,y:40,width:420,height:280,text:'Unsaved descriptions stay here.'}],edges:[],custom:{keep:true}}));
let settings={characterFolder:'Chars',lastCharacterCategory:'A category',unrelated:'keep'},writes=0,opened=null;const leaves=[];
const app={vault:{getRoot:()=>files.get(''),getFiles:()=>[...files.values()].filter(file=>file instanceof TFile),getAbstractFileByPath:path=>files.get(path)||null,read:async file=>file.content,create:async(path,text)=>{if(files.has(path))throw Error('exists');writes++;return add(path,text);},process:async(file,fn)=>{writes++;file.content=fn(file.content);return file.content;}},metadataCache:{getFileCache:file=>({frontmatter:{...file.meta,gm_todo_index:/gm_todo_index: true/.test(file.content)}})},workspace:{getLeavesOfType:type=>leaves.filter(leaf=>leaf.view.getViewType()===type),getActiveFile:()=>source}};
const notebook=new Notebook();notebook.app=app;notebook.data={groups:[],hiddenFolders:[],pageLayouts:{},collapsedPages:{},pageMeta:{},autoLinkRules:{},autoLinkMoves:[],pageSort:'original',spatialLayouts:{[actor.path]:{boxes:[{id:'main',x:24,y:48,width:650,height:500}]}},spatialDrafts:{[actor.path]:{main:{expected:'Original description.',value:'An unsaved draft.'}}}};
notebook.persist=()=>{};notebook.refresh=()=>{};notebook.refreshPages=()=>{};notebook.openPage=async file=>{opened=file;};
app.plugins={getPlugin:id=>id==='classic-notebook'?notebook:null};
const gm=new GM();gm.app=app;gm.loadData=async()=>settings;gm.saveData=async value=>{settings=value;};
const same=JSON.parse(JSON.stringify(notebook.data.spatialLayouts[actor.path].boxes[0]));
(async()=>{
 const chars=gm.todoCharacters();assert.equal(GM.todoTest.gmTodoCharacterMatches('alias',chars)[0].file,actor,'character aliases resolve without assigning a mentioned recipient automatically');
 const title='Actor brings the promised herbs to Receiver',selected='Promised herbs from the northern city.\n\nReceiver asks for something spicy.';
 const request={id:'gm-todo-example1',title,selectedText:selected,sourceFile:source,sourceLabel:'Margin note 3',characterFile:actor,characterTitle:'Actor Name',charTodo:true,details:'Play this promise in a future scene.'};
 const result=await gm.createTodo(request);
 assert.equal(result.overview.path,'TODOs (2).canvas','a conflicting user note is preserved');assert.equal(occupied.content,'An existing user note, never replace this.');
 assert.equal(result.index.path,'TODOs - Aufgaben.md');assert.equal(settings.todoIndexPath,result.index.path);assert.equal(settings.lastCharacterCategory,'A category');assert.equal(settings.unrelated,'keep');
 assert.equal(notebook.pageOutline('').find(row=>row.path===result.index.path).parent,result.overview.path,'the canonical task list is nested under its Canvas overview in General');
 const overviewData=JSON.parse(result.overview.content);assert.equal(overviewData.nodes[0].type,'file');assert.equal(overviewData.nodes[0].file,result.index.path);
 const text=result.index.content;assert(text.includes('- [ ] '+title));assert(text.includes('[[Chars/Actor|Actor Name]]'));assert(text.includes('[[Scenes/Session|Session]]'));assert(text.includes('Margin note 3'));assert(text.includes('Play this promise'));assert(text.includes('> Promised herbs'));assert(text.includes('\n\n^gm-todo-example1\n'),'the block id is separated from the callout so native embeds can resolve it');
 assert.equal(source.content,'Original selected text.\n','the source note is never rewritten');
 assert.deepEqual(JSON.parse(JSON.stringify(notebook.data.spatialLayouts[actor.path].boxes[0])),same,'the existing character box is not moved');
 assert.equal(notebook.data.spatialDrafts[actor.path].main.value,'An unsaved draft.');
 assert(actor.content.includes('![[TODOs - Aufgaben#^gm-todo-example1]]'));assert(actor.content.includes('Original description.'));assert(actor.content.endsWith('---\nOriginal footer.\n'),'the original footer stays intact');
 const box=notebook.data.spatialLayouts[actor.path].boxes.find(box=>box.integrationKey==='gm-character-todos');assert(box&&box.label==='Char TODOs');
 const first=actor.content;await gm.createTodo(request);assert.equal(actor.content,first,'retrying after a partial failure cannot duplicate a task or its embed');assert.equal((result.index.content.match(/\^gm-todo-example1\r?$/gm)||[]).length,1);
 // Check once in the canonical source. All character views embed this one block.
 assert.equal(await gm.toggleTodo(request.id),true);await gm.createTodo(request);assert(result.index.content.includes('- [x] '+title),'a retry cannot reopen a completed task');assert(!actor.content.includes('- [ ]'),'no independent checkbox copy can drift out of sync');
 assert.equal(await gm.toggleTodo(request.id),false);assert(result.index.content.includes('- [ ] '+title),'the same source checkbox can be reopened');
 const statusBefore=result.index.content;await assert.rejects(()=>gm.toggleTodo('gm-todo-missing'),/geändert oder gelöscht/);assert.equal(result.index.content,statusBefore,'a stale task cannot change another checkbox');
 await gm.createTodo({...request,id:'gm-todo-example12',title:'A distinct second task'});assert(result.index.content.includes('^gm-todo-example12\n'),'a different id sharing a prefix is not mistaken for a duplicate');assert.equal(notebook.data.spatialLayouts[actor.path].boxes.filter(box=>box.integrationKey==='gm-character-todos').length,1,'later tasks reuse the character task box');
 await gm.createTodo({id:'gm-todo-plain',title:'General preparation',sourceFile:source});assert(result.index.content.includes('General preparation'));
 const plainBefore=receiver.content;await gm.createTodo({...request,id:'gm-todo-receiver',characterFile:receiver});assert(receiver.content.startsWith(plainBefore),'plain Markdown preserves every original byte');assert(receiver.content.includes('## Char TODOs'));assert(receiver.content.includes('![[TODOs - Aufgaben#^gm-todo-receiver]]'));
 const wrapped=add('Chars/Wrapped.md','---\ntitle: Wrapped\n---\n<!-- tn-box:wrapped:start -->\nOriginal description.\n\n---\nOriginal footer.\n<!-- tn-box:wrapped:end -->\n');const wrappedBefore=wrapped.content;
 notebook.data.spatialLayouts[wrapped.path]={boxes:[{id:'wrapped',x:24,y:48,width:650,height:500}]};
 await gm.createTodo({...request,id:'gm-todo-wrapped',characterFile:wrapped});assert(wrapped.content.startsWith(wrappedBefore),'a footer already inside a box cannot cause nested markers or change the description');
 const wrappedBox=notebook.data.spatialLayouts[wrapped.path].boxes.find(box=>box.integrationKey==='gm-character-todos');assert(wrapped.content.slice(wrappedBefore.length).includes('<!-- tn-box:'+wrappedBox.id+':start -->'),'the task has a separate top-level box');
 const boardBefore=JSON.parse(board.content);await gm.createTodo({...request,id:'gm-todo-canvas',characterFile:board});const boardAfter=JSON.parse(board.content);assert.deepEqual(boardAfter.nodes[0],boardBefore.nodes[0]);assert.deepEqual(boardAfter.edges,boardBefore.edges);assert.deepEqual(boardAfter.custom,boardBefore.custom);assert.equal(boardAfter.nodes[1].subpath,'#^gm-todo-canvas');
 // An open Canvas must use its live model, including unsaved descriptions.
 let liveCalls=0,liveSaved=board.content;const liveData={nodes:[{id:'live',type:'text',x:10,y:20,width:400,height:300,text:'A newer unsaved description'}],edges:[]};
 const live={getData:()=>liveData,createFileNode(options){liveCalls++;liveData.nodes.push({type:'file',file:options.file.path,subpath:options.subpath});}};
 leaves.push({view:{file:board,getViewType:()=> 'canvas',canvas:live}});
 await gm.createTodo({...request,id:'gm-todo-live',characterFile:board});assert.equal(liveCalls,1);assert.equal(board.content,liveSaved,'the disk copy cannot overwrite the live Canvas');assert.equal(liveData.nodes[0].text,'A newer unsaved description');await gm.createTodo({...request,id:'gm-todo-live',characterFile:board});assert.equal(liveCalls,1);
 live.readonly=true;await assert.rejects(()=>gm.createTodo({...request,id:'gm-todo-retry',characterFile:board}),/Übersicht gespeichert/);assert(result.index.content.includes('^gm-todo-retry'));live.readonly=false;await gm.createTodo({...request,id:'gm-todo-retry',characterFile:board});assert.equal((result.index.content.match(/\^gm-todo-retry\r?$/gm)||[]).length,1,'a failed character attachment can be retried without losing or duplicating its task');
 const count=writes;files.delete(actor.path);await assert.rejects(()=>gm.createTodo({...request,id:'gm-todo-missing'}),/verschoben oder gelöscht/);files.set(actor.path,actor);assert.equal(writes,count,'stale character validation happens before task creation');
 await assert.rejects(()=>gm.createTodo({id:'gm-todo-empty',title:'',charTodo:true}),/Aufgabe/);
 // Concurrent submissions share one index and preserve both tasks.
 await Promise.all([gm.createTodo({id:'gm-todo-parallel1',title:'First parallel task'}),gm.createTodo({id:'gm-todo-parallel2',title:'Second parallel task'})]);assert(result.index.content.includes('First parallel task')&&result.index.content.includes('Second parallel task'));
 const escaped=GM.todoTest.gmTodoBlock({id:'gm-todo-safe',title:'<img src="remote">',selectedText:'> [!danger]\n<img src="remote">'});assert(!escaped.includes('<img'));assert(escaped.includes('&lt;img'));
 console.log('PASS: central native checkboxes, General Canvas overview, character alias picker, source and quote, spatial/Markdown/closed and live Canvas character embeds, draft preservation, completion and idempotent retries, collision protection, stale targets, and concurrent task creation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
