const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const classicRoot=process.env.CLASSIC_NOTEBOOK_DIR?path.resolve(process.env.CLASSIC_NOTEBOOK_DIR):path.resolve(__dirname,'../../obsidian-classic-notebook');
const pluginPath=id=>id==='classic-notebook'?path.join(classicRoot,'main.js'):path.resolve(__dirname,'../main.js');
if(!fs.existsSync(pluginPath('classic-notebook')))throw new Error('Build the sibling obsidian-classic-notebook checkout or set CLASSIC_NOTEBOOK_DIR before running integration tests.');

const root=path.resolve(__dirname,'..');
class TFile { constructor(path,content=''){this.path=path;this.extension=path.split('.').at(-1);this.basename=path.split('/').at(-1).replace(/\.[^.]+$/,'');this.content=content;} }
class TFolder { constructor(path){this.path=path;} }
const obsidian={Plugin:class{},Modal:class{},ItemView:class{},FileView:class{},Notice:class{},TFile,TFolder,normalizePath:value=>value.replace(/\\/g,'/').replace(/^\/+|\/+$/g,'')};
const load=(id,extra='')=>{const ctx={module:{exports:{}},require:()=>obsidian,Date,Math,Intl};vm.runInNewContext(fs.readFileSync(pluginPath(id),'utf8')+extra,ctx);return ctx.module.exports;};
const Notebook=load('classic-notebook'),GM=load('gm-note-shortcuts','\nmodule.exports.testApi={characterCategoryChoice,characterPlainText,characterValidName};');
const {characterCategoryChoice:choose,characterPlainText:plain,characterValidName:valid}=GM.testApi;
const files=new Map(),rootFolder=new TFolder('');files.set('',rootFolder);files.set('Chars',new TFolder('Chars'));
const add=(name,content='')=>{const file=new TFile(name,content);files.set(name,file);return file;};
const group=add('Chars/------- Hafenstadt -------.md'),oldChild=add('Chars/Alte Person.md'),sibling=add('Chars/------- Wald -------.md');
const depthTwo=add('Chars/--- Händler ---.md'),depthThree=add('Chars/--- Untergruppe ---.md'),depthFour=add('Chars/--- Detailgruppe ---.md'),depthFive=add('Chars/--- Tiefste Ebene ---.md');
const source=add('Verlauf/Sitzung.md','Eine **Neue Person** kommt an.');
const notebook=new Notebook();let writes=0,opened=null,persisted=0;
notebook.data={groups:[],hiddenFolders:[],pageLayouts:{Chars:[{path:group.path,parent:null},{path:oldChild.path,parent:group.path},{path:depthTwo.path,parent:group.path},{path:depthThree.path,parent:depthTwo.path},{path:depthFour.path,parent:depthThree.path},{path:depthFive.path,parent:depthFour.path},{path:sibling.path,parent:null}]},collapsedPages:{[group.path]:true},pageMeta:{},autoLinkRules:{},autoLinkMoves:[],pageSort:'original'};
const app={vault:{getRoot:()=>rootFolder,getFiles:()=>[...files.values()].filter(file=>file instanceof TFile),getAbstractFileByPath:value=>files.get(value)||null,async create(name,content){if(files.has(name))throw Error('exists');writes++;return add(name,content);},async createFolder(name){if(files.has(name))throw Error('exists');files.set(name,new TFolder(name));}},metadataCache:{getFileCache:()=>({frontmatter:{}}),getFirstLinkpathDest:()=>null},workspace:{getActiveFile:()=>null}};
notebook.app=app;notebook.persist=()=>persisted++;notebook.refresh=()=>{};notebook.refreshPages=()=>{};notebook.openPage=async file=>{opened=file;notebook.revealPage(file.path);};
app.plugins={getPlugin:id=>id==='classic-notebook'?notebook:null};
const gm=new GM();gm.app=app;let settings={};gm.loadData=async()=>settings;gm.saveData=async data=>{settings=data;};

(async()=>{
const parents=notebook.getNotebookPageParents('Chars');assert(parents.some(parent=>parent.path===depthFour.path),'fourth-level categories can hold characters');assert(!parents.some(parent=>parent.path===depthFive.path),'fifth-level parents cannot add a sixth level');
const match=choose('Stadt',parents);assert.equal(match.kind,'existing');assert.equal(match.parent.path,group.path);
assert.equal(choose('WALD',parents).parent.path,sibling.path);assert.equal(choose('H',parents).kind,'ambiguous');assert.equal(choose('',parents).kind,'root');assert.equal(choose('Neue Gruppe',parents).kind,'new');
assert.equal(plain('<span style="color:#FF0000">**Neue Person**</span>'),'Neue Person');assert.equal(plain('[[Wissen/Name|Neue Person]]'),'Neue Person');
for(const value of ['../Datei','A/B','CON','Name: Rolle','Zwei\nZeilen','Name#Teil','Name.'])assert(!valid(value),value);assert(valid('Neue Person - Waldelf'));
const before=source.content;
const file=await gm.createCharacterPage({name:'Neue Person',section:'Chars',choice:match,selectedText:'Neue Person - Waldelf',sourceFile:source});
assert.equal(file.extension,'canvas');assert.equal(opened,file);assert.equal(source.content,before,'the source note must remain unchanged');
let outline=notebook.pageOutline('Chars'),item=outline.find(item=>item.path===file.path);assert.equal(item.parent,group.path);assert.equal(item.level,2);assert.equal(outline[outline.find(item=>item.path===sibling.path).index-1].path,file.path,'insert at the end of the chosen group before the next group');
const content=JSON.parse(file.content);assert.equal(content.nodes.length,1);assert(content.nodes[0].text.includes('[[Chars/------- Hafenstadt -------|'));assert(content.nodes[0].text.includes('[[Verlauf/Sitzung|'));assert(content.nodes[0].text.includes('## Notizen'));
assert(notebook.data.pageMeta[file.path].created);assert(notebook.autoLinkIndex.find('Neue Person - Waldelf')[0]?.path===file.path,'new Canvas aliases must resolve as automatic links');assert.equal(settings.lastCharacterCategory,group.basename);
const count=writes;await gm.createCharacterPage({name:'Neue Person',section:'Chars',choice:match,selectedText:'Neue Person',existing:file});assert.equal(writes,count,'opening an existing page cannot overwrite it');
await assert.rejects(()=>gm.createCharacterPage({name:'Neue Person',section:'Chars',choice:match,selectedText:'Neue Person'}),/inzwischen/);
const child=await gm.createCharacterPage({name:'Dritte Ebene',section:'Chars',choice:choose('Händler',parents),selectedText:'Dritte Ebene'});assert.equal(notebook.pageOutline('Chars').find(item=>item.path===child.path).level,3);
const deepChild=await gm.createCharacterPage({name:'Fünfte Ebene',section:'Chars',choice:choose('Detailgruppe',parents),selectedText:'Fünfte Ebene'});assert.equal(notebook.pageOutline('Chars').find(item=>item.path===deepChild.path).level,5);
const groupBefore=files.size;
await gm.createCharacterPage({name:'Andere Person',section:'Chars',choice:choose('Neue Gruppe',parents),selectedText:'Andere Person'});
assert.equal(files.size,groupBefore+2,'new category and character are separate native pages');const createdGroup=files.get('Chars/------- Neue Gruppe -------.canvas');assert(createdGroup);assert.equal(notebook.pageOutline('Chars').find(item=>item.path==='Chars/Andere Person.canvas').parent,createdGroup.path);
await gm.createCharacterPage({name:'Wieder eine Person',section:'Chars',choice:{kind:'new',title:'Neue Gruppe'},selectedText:'Wieder eine Person'});assert.equal(files.size,groupBefore+3,'a concurrently added exact category must be reused');
await gm.createCharacterPage({name:'Ohne Gruppe',section:'NeueChars',choice:{kind:'root'},selectedText:'Ohne Gruppe'});assert(files.get('NeueChars') instanceof TFolder);assert.equal(notebook.pageOutline('NeueChars').find(item=>item.path==='NeueChars/Ohne Gruppe.canvas').level,1);
const unchanged=writes;
await assert.rejects(()=>gm.createCharacterPage({name:'Unsicher',section:'Chars',choice:{kind:'ambiguous'}}),/eindeutige/);
await assert.rejects(()=>gm.createCharacterPage({name:'Unsicher',section:'Chars',choice:{kind:'new',title:'../Gruppe'}}),/gültigen/);
await assert.rejects(()=>notebook.createNotebookPage({section:'Chars',title:'Unzulässig',parentPath:depthFive.path}),/Seitenebene/);
await assert.rejects(()=>notebook.createNotebookPage({section:'Chars',title:'neue person'}),/existiert/);
const removed=files.get(group.path);files.delete(group.path);await assert.rejects(()=>gm.createCharacterPage({name:'Unsicher',section:'Chars',choice:match}),/inzwischen/);files.set(group.path,removed);
assert.equal(writes,unchanged,'validation failures must not create pages');assert(persisted>0);
console.log('PASS: category substring/exact/ambiguous matching, native Canvas creation through five levels, sixth-level rejection, source preservation, creation date, Canvas aliases, duplicate and stale-parent guards.');
})().catch(error=>{console.error(error);process.exitCode=1;});
