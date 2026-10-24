const GM_TODO_INDEX_MARKER = '<!-- gm-note-shortcuts:todo-index:v1 -->';
function gmTodoId() { return 'gm-todo-' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(16) + Math.random().toString(16).slice(2))).replaceAll('-', ''); }
function gmTodoEscape(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_\[\]#]/g, '\\$&'); }
function gmTodoKey(value) { return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[’‘]/g, "'").toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
function gmTodoCharacterMatches(query, characters) {
  const key = gmTodoKey(query);
  return characters.filter(character => !key || [character.title, ...character.aliases].some(value => gmTodoKey(value).includes(key)))
    .sort((a, b) => Number(![a.title, ...a.aliases].some(value => gmTodoKey(value) === key)) - Number(![b.title, ...b.aliases].some(value => gmTodoKey(value) === key)) || a.title.localeCompare(b.title, 'de'));
}
function gmTodoLink(file, label) { return '[[' + file.path.replace(/\.md$/i, '') + '|' + String(label || file.basename).replace(/[\[\]|\r\n]/g, '') + ']]'; }
function gmTodoToggle(text, id) {
  if (!/^gm-todo-[a-z0-9]+$/.test(id) || !text.includes(GM_TODO_INDEX_MARKER) || !new RegExp('^\\^'+id+'\\r?$','m').test(text)) throw new Error('Die Aufgabe wurde inzwischen geändert oder gelöscht.');
  const marker = '<span class="gm-todo-reference" data-gm-todo-id="'+id+'"></span>';
  const lines = text.split('\n'), matches = lines.map((line,index)=>line.includes(marker)?index:-1).filter(index=>index>=0);
  if(matches.length!==1)throw new Error('Die Aufgabe konnte nicht eindeutig zugeordnet werden.');
  const index=matches[0],match=lines[index].match(/^(> - \[)([ xX])(\] .*)$/);
  if(!match)throw new Error('Das Erledigt-Häkchen fehlt inzwischen.');
  const checked=match[2]===' ';lines[index]=match[1]+(checked?'x':' ')+match[3];return {text:lines.join('\n'),checked};
}
function gmTodoBlock({id, title, details, selectedText, sourceFile, sourceLabel, characterFile, characterTitle}) {
  const lines = ['> [!todo] ' + (characterFile ? 'Char TODO · ' + gmTodoLink(characterFile, characterTitle) : 'TODO'), '> - [ ] ' + gmTodoEscape(title.replace(/\s+/g, ' ').trim())+' <span class="gm-todo-reference" data-gm-todo-id="'+id+'"></span>'];
  if (characterFile) lines.push('>', '> **Char:** ' + gmTodoLink(characterFile, characterTitle));
  if (sourceFile) lines.push('>', '> **Quelle:** ' + gmTodoLink(sourceFile) + (sourceLabel ? ' · ' + gmTodoEscape(sourceLabel) : ''));
  for (const [label, value] of [['Spielnotiz',details],['Markierte Notiz',selectedText]]) {
    if (!String(value || '').trim()) continue;
    lines.push('>', '> **' + label + ':**');
    for (const line of String(value).trim().split(/\r?\n/)) lines.push('> ' + gmTodoEscape(line));
  }
  return lines.join('\n') + '\n\n^' + id + '\n';
}

class TodoCreateModal extends Modal {
  constructor(plugin, {snapshot, characters, charTodo}) {
    super(plugin.app); this.plugin=plugin; this.textSelectionSnapshot=snapshot; this.characters=characters; this.charTodo=charTodo; this.taskId=gmTodoId();
    this.selectedText=characterPlainText(snapshot?.text?.slice(snapshot.from,snapshot.to) || '');
  }
  onOpen() {
    this.modalEl.addClass('gm-todo-dialog'); const root=this.contentEl; root.addClass('gm-todo-modal');
    root.createEl('h2',{text:this.charTodo?'Char TODO':'TODO anlegen'});
    root.createEl('p',{cls:'gm-character-subtitle',text:this.charTodo?'Die Aufgabe erscheint in der TODO-Übersicht und direkt auf der gewählten Charseite.':'Halte fest, was du später vorbereiten oder ausspielen möchtest.'});
    const form=root.createEl('form');
    if(this.charTodo){
      const label=form.createEl('label',{cls:'gm-character-field',text:'Charakter'});
      this.characterInput=label.createEl('input',{type:'text',attr:{'aria-label':'Charakter suchen',placeholder:'Name oder Alias eingeben …',autocomplete:'off',role:'combobox','aria-expanded':'false','aria-autocomplete':'list'}});
      this.suggestions=form.createDiv({cls:'gm-character-suggestions',attr:{role:'listbox','aria-label':'Passende Charaktere',id:'gm-todo-characters-'+this.taskId}});
      this.characterInput.setAttribute('aria-controls',this.suggestions.id);
      this.characterTarget=form.createDiv({cls:'gm-todo-character-target',attr:{role:'status','aria-live':'polite'}});
      this.characterInput.oninput=()=>{this.chosenCharacter=null;this.updateCharacters();};
      this.characterInput.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();this.suggestions.querySelector('button')?.focus();}};
    }
    const title=form.createEl('label',{cls:'gm-character-field',text:'Was bleibt noch zu tun?'});
    this.titleInput=title.createEl('input',{type:'text',attr:{'aria-label':'Aufgabe',maxlength:'500',placeholder:'Zum Beispiel: das Versprechen beim nächsten Treffen ausspielen'}});
    this.titleInput.value=this.selectedText.split(/\n\s*\n/)[0].replace(/\s+/g,' ').slice(0,500);
    const details=form.createEl('label',{cls:'gm-character-field',text:'Spielnotiz / Zusammenhang (optional)'});
    this.detailsInput=details.createEl('textarea',{attr:{'aria-label':'Spielnotiz oder Zusammenhang',rows:'3',placeholder:'Wer hat wem was versprochen? Was möchtest du später damit machen?'}});
    if(this.selectedText){const preview=form.createEl('details',{cls:'gm-todo-selection'});preview.createEl('summary',{text:'Markierte Notiz wird mit übernommen'});preview.createEl('div',{cls:'gm-todo-quote',text:this.selectedText});}
    const source=form.createDiv('gm-todo-source'); source.textContent=this.textSelectionSnapshot?.sourceFile?'Aus: '+this.textSelectionSnapshot.sourceFile.basename+(this.textSelectionSnapshot.sourceLabel?' · '+this.textSelectionSnapshot.sourceLabel:''): 'Ohne Ausgangsseite';
    const target=form.createDiv('gm-character-target'); target.createDiv({cls:'gm-character-target-category',text:'Übersicht: Allgemein / TODOs'});target.createDiv({cls:'gm-character-target-path',text:'Ein gemeinsamer Eintrag: Erledigt-Häkchen gelten auch auf der Charseite.'});
    this.error=form.createDiv({cls:'gm-character-error',attr:{role:'alert'}});
    const openLabel=form.createEl('label',{cls:'gm-todo-open'});this.openInput=openLabel.createEl('input',{type:'checkbox'});this.openInput.checked=true;openLabel.createSpan({text:this.charTodo?'Charseite danach öffnen':'TODO-Übersicht danach öffnen'});
    const footer=form.createDiv('gm-character-actions');footer.createEl('button',{attr:{type:'button'},text:'Abbrechen'}).onclick=()=>this.close();
    this.submitButton=footer.createEl('button',{attr:{type:'submit'},cls:'mod-cta',text:this.charTodo?'Char TODO anlegen':'TODO anlegen'});
    this.titleInput.oninput=()=>this.updateSubmit();form.onsubmit=event=>{event.preventDefault();void this.submit();};
    if(this.charTodo)this.updateCharacters();this.updateSubmit();(this.characterInput||this.titleInput).focus();
  }
  updateCharacters(){
    const matches=gmTodoCharacterMatches(this.characterInput.value,this.characters);this.suggestions.empty();
    for(const character of matches.slice(0,8)){
      const button=this.suggestions.createEl('button',{cls:'gm-character-category-option',attr:{type:'button',role:'option','aria-selected':'false'}});
      button.createDiv({text:character.title});button.createDiv({cls:'gm-todo-character-path',text:character.file.path});
      button.onclick=()=>{this.chosenCharacter=character;this.characterInput.value=character.title;this.suggestions.hidden=true;this.characterInput.setAttribute('aria-expanded','false');this.characterTarget.textContent='Charseite: '+character.title;this.updateSubmit();this.titleInput.focus();};
    }
    this.suggestions.hidden=!matches.length;this.characterInput.setAttribute('aria-expanded',String(matches.length>0));
    this.characterTarget.textContent=matches.length?'Bitte den passenden Charakter anklicken.':'Kein passender Charakter gefunden.';this.updateSubmit();
  }
  updateSubmit(){if(this.submitButton)this.submitButton.disabled=this.saving||!this.titleInput.value.trim()||(this.charTodo&&!this.chosenCharacter);}
  async submit(){
    if(this.saving||this.submitButton.disabled)return;this.saving=true;this.updateSubmit();this.error.textContent='';
    try{
      const result=await this.plugin.createTodo({id:this.taskId,title:this.titleInput.value,details:this.detailsInput.value,selectedText:this.selectedText,sourceFile:this.textSelectionSnapshot?.sourceFile,sourceLabel:this.textSelectionSnapshot?.sourceLabel,characterFile:this.chosenCharacter?.file,characterTitle:this.chosenCharacter?.title,charTodo:this.charTodo});
      if(this.openInput.checked)await this.plugin.characterNotebook().openPage(this.chosenCharacter?.file||result.overview);
      new Notice(this.charTodo?'Char TODO angelegt.':'TODO angelegt.');this.close();
    }catch(error){this.saving=false;this.updateSubmit();this.error.textContent=error.message||'Das TODO konnte nicht angelegt werden.';}
  }
  onClose(){this.contentEl.empty();}
}

const todoCommandMethods={
  setupTodoCommands(){
    if(typeof document!=='undefined')this.registerDomEvent(document,'click',event=>this.handleTodoCheckboxClick(event),true);
    for(const [id,name,charTodo] of [['create-todo','TODO anlegen',false],['create-character-todo','Char TODO',true]])this.addCommand({id,name,callback:()=>{const snapshot=this.characterSelection();void this.showTodoCreate(charTodo,snapshot);}});
    this.addCommand({id:'open-todo-overview',name:'TODO-Übersicht öffnen',callback:()=>{void this.openTodoOverview();}});
    if(this.app.vault?.on)this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{void this.queueTodoWrite(async()=>{const settings=await this.loadData()||{},patch={};for(const key of ['todoIndexPath','todoOverviewPath'])if(settings[key]===oldPath)patch[key]=file.path;if(Object.keys(patch).length)await this.saveTodoSettings(patch);}).catch(error=>new Notice(error.message));}));
  },
  handleTodoCheckboxClick(event){
    const input=event.target;if(!input?.matches?.('input.task-list-item-checkbox'))return;
    const item=input.closest('li'),id=item?.querySelector('.gm-todo-reference[data-gm-todo-id]')?.getAttribute('data-gm-todo-id');
    if(!id||!/^gm-todo-[a-z0-9]+$/.test(id))return;
    event.preventDefault();event.stopImmediatePropagation();if(input.disabled)return;
    const previous=item.classList.contains('is-checked');input.disabled=true;
    const update=checked=>{input.checked=checked;item.classList.toggle('is-checked',checked);item.setAttribute('data-task',checked?'x':' ');};
    void this.toggleTodo(id).then(update).catch(error=>{update(previous);new Notice(error.message||'Der Aufgabenstatus konnte nicht gespeichert werden.');}).finally(()=>{input.disabled=false;});
  },
  toggleTodo(id){return this.queueTodoWrite(async()=>{
    const settings=await this.loadData()||{},file=this.app.vault.getAbstractFileByPath(settings.todoIndexPath||'');
    if(file?.extension!=='md')throw new Error('Die TODO-Liste wurde verschoben oder gelöscht.');
    for(const leaf of this.app.workspace.getLeavesOfType('markdown'))if(leaf.view.file===file)await leaf.view.save?.();
    let checked;await this.app.vault.process(file,text=>{const result=gmTodoToggle(text,id);checked=result.checked;return result.text;});return checked;
  });},
  todoNotebook(){const api=this.characterNotebook();if(typeof api?.appendNotebookPageEmbed!=='function')throw new Error('Für TODOs bitte Classic Notebook ab Version 2.13.0 aktivieren.');return api;},
  todoCharacters(folder='Chars'){
    folder=String(folder).replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
    return this.app.vault.getFiles().filter(file=>['md','canvas'].includes(file.extension)&&file.path.startsWith(folder+'/')).map(file=>{
      const meta=this.app.metadataCache.getFileCache(file)?.frontmatter||{},page=this.characterNotebook()?.data.pageMeta?.[file.path]||{};
      const aliases=[meta.aliases,page.aliases].flat().filter(value=>typeof value==='string');
      return {file,title:meta.title||page.title||file.basename,aliases};
    }).filter(character=>!/^\s*[-–—─]{2,}/.test(character.title)&&!/(?:übersicht|register)$/i.test(character.title));
  },
  async showTodoCreate(charTodo,snapshot){
    const sourceFile=snapshot?.sourceFile||this.app.workspace.getActiveFile();
    try{this.todoNotebook();const settings=await this.loadData()||{};new TodoCreateModal(this,{snapshot:{...(snapshot||{text:'',from:0,to:0}),sourceFile},characters:this.todoCharacters(settings.characterFolder||'Chars'),charTodo}).open();}
    catch(error){new Notice(error.message||'Der TODO-Dialog konnte nicht geöffnet werden.');}
  },
  queueTodoWrite(run){const next=(this.todoWriteQueue||Promise.resolve()).catch(()=>{}).then(run);this.todoWriteQueue=next;return next;},
  async saveTodoSettings(patch){const settings=await this.loadData()||{};await this.saveData({...settings,...patch});},
  async waitForTodoBlock(file,id){
    const cache=this.app.metadataCache;if(!cache.on||cache.getFileCache(file)?.blocks?.[id])return;
    await new Promise(resolve=>{let timer,ref;const done=()=>{clearTimeout(timer);if(ref)cache.offref?.(ref);resolve();};ref=cache.on('changed',changed=>{if(changed===file&&cache.getFileCache(file)?.blocks?.[id])done();});timer=setTimeout(done,1500);});
  },
  async ensureTodoPages(){
    const api=this.todoNotebook(),vault=this.app.vault,settings=await this.loadData()||{};
    let index=vault.getAbstractFileByPath(settings.todoIndexPath||'');
    if(index?.extension!=='md')index=null;
    if(!index){
      for(const file of vault.getFiles().filter(file=>file.extension==='md'&&(this.app.metadataCache.getFileCache(file)?.frontmatter?.gm_todo_index===true||file.basename.startsWith('TODOs - Aufgaben'))))if((await vault.read(file)).includes(GM_TODO_INDEX_MARKER)){index=file;break;}
    }
    if(index&&!(await vault.read(index)).includes(GM_TODO_INDEX_MARKER))throw new Error('Die gespeicherte TODO-Liste wurde ersetzt. Bitte die TODO-Einstellungen prüfen.');
    let overview=vault.getAbstractFileByPath(settings.todoOverviewPath||'');if(overview?.extension!=='canvas')overview=null;
    const unique=stem=>{let name=stem,n=2;while(vault.getFiles().some(file=>['md','canvas'].includes(file.extension)&&file.path.replace(/\.(?:md|canvas)$/i,'').toLocaleLowerCase()===name.toLocaleLowerCase()))name=stem+' ('+(n++)+')';return name;};
    if(!overview){overview=await api.createNotebookPage({section:'',title:unique('TODOs'),kind:'canvas'});await this.saveTodoSettings({todoOverviewPath:overview.path});}
    if(!index){
      index=await api.createNotebookPage({section:'',title:unique('TODOs - Aufgaben'),parentPath:overview.path,kind:'md',text:GM_TODO_INDEX_MARKER+'\n\n# TODOs\n\nOffene Aufgaben und Dinge für spätere Spielszenen. Ein Häkchen markiert eine Aufgabe überall als erledigt.\n\n'});
      await vault.process(index,text=>text.replace(/^---\r?\n/,'---\ngm_todo_index: true\n'));
      await this.saveTodoSettings({todoIndexPath:index.path});
    }
    await api.appendNotebookPageEmbed({file:overview,embedFile:index,key:'gm-todo-overview',label:'TODOs',width:800,height:1000});
    return {index,overview};
  },
  async openTodoOverview(){try{await this.queueTodoWrite(async()=>{const {overview}=await this.ensureTodoPages();await this.characterNotebook().openPage(overview);});}catch(error){new Notice(error.message||'Die TODO-Übersicht konnte nicht geöffnet werden.');}},
  createTodo(input){return this.queueTodoWrite(async()=>{
    const api=this.todoNotebook(),vault=this.app.vault;
    const id=input.id||gmTodoId(),title=String(input.title||'').trim();
    if(!/^gm-todo-[a-z0-9]+$/.test(id)||!title||title.length>500)throw new Error('Bitte eine Aufgabe mit höchstens 500 Zeichen eingeben.');
    if(input.charTodo&&!input.characterFile)throw new Error('Bitte einen Charakter auswählen.');
    if(input.characterFile&&(!['md','canvas'].includes(input.characterFile.extension)||vault.getAbstractFileByPath(input.characterFile.path)!==input.characterFile))throw new Error('Die Charseite wurde verschoben oder gelöscht. Bitte neu auswählen.');
    const {index,overview}=await this.ensureTodoPages();
    const sourceFile=input.sourceFile&&vault.getAbstractFileByPath(input.sourceFile.path)===input.sourceFile?input.sourceFile:null;
    const block=gmTodoBlock({...input,id,title,sourceFile});
    for(const leaf of this.app.workspace.getLeavesOfType('markdown'))if(leaf.view.file===index)await leaf.view.save?.();
    await vault.process(index,text=>{
      if(!text.includes(GM_TODO_INDEX_MARKER))throw new Error('Die TODO-Liste wurde inzwischen geändert. Bitte erneut versuchen.');
      if(new RegExp('^\\^'+id+'\\r?$','m').test(text))return text;
      const newline=text.includes('\r\n')?'\r\n':'\n';return text+(text.endsWith(newline)?newline:newline+newline)+block.replace(/\n/g,newline)+newline;
    });
    await this.waitForTodoBlock(index,id);
    if(input.characterFile){try{await api.appendNotebookPageEmbed({file:input.characterFile,embedFile:index,subpath:'#^'+id,key:'gm-character-todos',label:'Char TODOs'});}catch(error){throw new Error('Das TODO ist in der Übersicht gespeichert. Die Char-Verknüpfung fehlt noch: '+error.message+' Du kannst erneut auf „Char TODO anlegen“ klicken; die Aufgabe wird nicht doppelt angelegt.');}}
    return {id,index,overview};
  });}
};
