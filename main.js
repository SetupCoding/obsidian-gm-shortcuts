'use strict';
const { Plugin, Notice, Modal, TFolder } = require('obsidian');

// Portable inline formatting. Live Preview hides only these strictly validated wrappers.
function notebookImportedFormats(text) {
  const protectedRanges = [], add = (from, to) => protectedRanges.push({ from, to });
  const front = text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (front) add(0, front[0].length);
  for (const match of text.matchAll(/<!--[\s\S]*?(?:-->|$)|%%[\s\S]*?(?:%%|$)|(`+)[^\n]*?\1/g)) add(match.index, match.index + match[0].length);
  let offset = 0, fence = null, fenceStart = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence && marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) { add(fenceStart, offset + line.length); fence = null; }
    else if (!fence && marker) { fence = marker[1]; fenceStart = offset; }
    if (/^(?: {4}|\t)/.test(line)) add(offset, offset + line.length);
    offset += line.length;
  }
  if (fence) add(fenceStart, text.length);
  const formats = [];
  const expression = /<span class="tn-import-format"(?: data-tn-color="(#[0-9A-F]{6})")? style="((?:color:#[0-9A-F]{6}(?:;font-weight:700)?|font-weight:700)(?:;font-size:1\.2em)?)">([^\n]*?)<\/span>/g;
  for (const match of text.matchAll(expression)) {
    const from = match.index, to = from + match[0].length;
    if (protectedRanges.some(range => range.from < to && range.to > from)) continue;
    if (match[1] && !match[2].startsWith('color:' + match[1])) continue;
    const openEnd = from + match[0].indexOf('>') + 1, closeStart = to - '</span>'.length;
    if (openEnd === closeStart) continue;
    formats.push({ from, to, openEnd, closeStart, color: match[1], style: match[2] });
  }
  return formats;
}
function notebookImportedFormatExtension() {
  const cacheKey = Symbol.for('obsidian.notebook.inline-formats.v2');
  if (globalThis[cacheKey]) return globalThis[cacheKey];
  const { StateField } = require('@codemirror/state');
  const { Decoration, EditorView } = require('@codemirror/view');
  const { editorLivePreviewField } = require('obsidian');
  const build = state => {
    const mode = state.field(editorLivePreviewField, false) !== false, marks = [];
    if (mode) for (const format of notebookImportedFormats(state.doc.toString())) {
      const attributes = { style: format.style };
      if (format.color) attributes['data-tn-color'] = format.color;
      marks.push(Decoration.replace({}).range(format.from, format.openEnd));
      marks.push(Decoration.mark({ class: 'tn-import-format', attributes }).range(format.openEnd, format.closeStart));
      marks.push(Decoration.replace({}).range(format.closeStart, format.to));
    }
    return { mode, decorations: Decoration.set(marks, true) };
  };
  return globalThis[cacheKey] = StateField.define({ create: build,
    update: (value, transaction) => transaction.docChanged || value.mode !== (transaction.state.field(editorLivePreviewField, false) !== false) ? build(transaction.state) : value,
    provide: field => EditorView.decorations.from(field, value => value.decorations) });
}

// Replace only our own formatting wrappers. Preserve existing emphasis and link targets.
function notebookColorEdit(text, from, to, color, preset = {}) {
  if (from >= to) throw new Error('Bitte zuerst Text in einer Karte oder Textseite markieren.');
  if (color && !/^#[0-9A-F]{6}$/.test(color)) throw new Error('Ungültige Textfarbe.');
  if (preset.size && preset.size !== '1.2em') throw new Error('Ungültige Schriftgröße.');
  for (const match of text.matchAll(/!?\[\[[^\n]*?\]\]|!?\[(?:[^\]\\]|\\.)*\]\([^\n]*?\)/g)) {
    const start = match.index, end = start + match[0].length;
    if (start < to && end > from) { from = Math.min(from, start); to = Math.max(to, end); }
  }
  const formats = notebookImportedFormats(text);
  // Code, properties and arbitrary HTML must not be changed by a colour command.
  const masked = text.split('');
  for (const span of formats) for (const [start, end] of [[span.from, span.openEnd], [span.closeStart, span.to]])
    for (let i = start; i < end; i++) masked[i] = ' ';
  const protectedText = masked.join('');
  for (const match of protectedText.matchAll(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)|^\s{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s{0,3}\1\s*$|`+[^\n]*?`+|<[^>\n]*>/gm)) {
    if (match.index < to && match.index + match[0].length > from) throw new Error('Bitte normalen Text außerhalb von Code, Eigenschaften oder HTML markieren.');
  }
  let start = from, end = to;
  const affected = formats.filter(span => span.from < to && span.to > from);
  for (const span of affected) { start = Math.min(start, span.from); end = Math.max(end, span.to); }
  const boundaries = new Set([start, end, from, to]);
  for (const span of affected) for (const point of [span.from, span.openEnd, span.closeStart, span.to]) boundaries.add(point);
  const points = [...boundaries].sort((a, b) => a - b), pieces = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (a < start || b > end || a === b) continue;
    if (affected.some(span => a >= span.from && b <= span.openEnd || a >= span.closeStart && b <= span.to)) continue;
    const old = affected.find(span => a >= span.openEnd && b <= span.closeStart);
    const selected = a >= from && b <= to;
    const style = {
      color: selected ? color : old?.color || null,
      bold: selected && Object.hasOwn(preset, 'bold') ? !!preset.bold : !!old?.style.includes('font-weight:700'),
      size: selected && Object.hasOwn(preset, 'size') ? preset.size : old?.style.includes('font-size:1.2em') ? '1.2em' : null
    };
    const previous = pieces.at(-1);
    if (previous && previous.color === style.color && previous.bold === style.bold && previous.size === style.size) previous.text += text.slice(a, b);
    else pieces.push({ ...style, text: text.slice(a, b) });
  }
  const wrap = (value, style) => {
    if (!value || !style.color && !style.bold) return value;
    const attributes = style.color ? ` data-tn-color="${style.color}"` : '';
    const css = [style.color ? `color:${style.color}` : '', style.bold ? 'font-weight:700' : '', style.size ? 'font-size:' + style.size : ''].filter(Boolean).join(';');
    return `<span class="tn-import-format"${attributes} style="${css}">${value}</span>`;
  };
  let atLineStart = start === 0 || text[start - 1] === '\n';
  const replacement = pieces.map(piece => piece.text.split(/(\r?\n)/).map(line => {
    if (/^\r?\n$/.test(line)) { atLineStart = true; return line; }
    let prefix = '';
    if (atLineStart) { const match = line.match(/^(\s*(?:> ?)*(?:(?:#{1,6}|[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?)/); prefix = match?.[0] || ''; }
    atLineStart = false;
    return prefix + wrap(line.slice(prefix.length), piece);
  }).join('')).join('');
  return { from: start, to: end, insert: replacement };
}

function characterPlainText(value) {
  return String(value || '').replace(/<\/?span\b[^>]*>/g, '').replace(/!?\[\[([^\]\n]+)\]\]/g, (_, inner) => inner.split('|').at(-1))
    .replace(/\[([^\]\n]+)\]\([^\n]*?\)/g, '$1').replace(/\*\*|__|~~|[`*]/g, '').trim();
}
function characterValidName(value) {
  return !!value && value.length <= 180 && !/[\\/:*?"<>|\[\]#^\u0000-\u001f]/.test(value) && !/[. ]$/.test(value)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(value) && !['.', '..'].includes(value);
}
function characterCategoryLabel(value) { return String(value || '').replace(/^[-\s\u2013\u2014\u2500]+|[-\s\u2013\u2014\u2500]+$/g, '').trim(); }
function characterCategoryKey(value) { return characterCategoryLabel(value).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function characterCategoryChoice(query, parents) {
  const key = characterCategoryKey(query);
  if (!key) return { kind: 'root', matches: [] };
  const exact = parents.filter(parent => characterCategoryKey(parent.title) === key);
  const matches = exact.length ? exact : parents.filter(parent => characterCategoryKey(parent.title).includes(key));
  return matches.length === 1 ? { kind: 'existing', parent: matches[0], matches }
    : matches.length ? { kind: 'ambiguous', matches } : { kind: 'new', title: characterCategoryLabel(query), matches: [] };
}

class CharacterCreateModal extends Modal {
  constructor(plugin, snapshot, settings) { super(plugin.app); this.plugin = plugin; this.textSelectionSnapshot = snapshot; this.settings = settings; this.initialName = characterPlainText(snapshot.text.slice(snapshot.from, snapshot.to)); }
  onOpen() {
    const root = this.contentEl; root.addClass('gm-character-modal'); this.modalEl.addClass('gm-character-dialog');
    root.createEl('h2', { text: 'Char anlegen' });
    root.createEl('p', { cls: 'gm-character-subtitle', text: 'Aus dem markierten Namen wird eine neue Canvas-Seite. Du kannst den Namen vorher anpassen.' });
    const form = root.createEl('form');
    const nameLabel = form.createEl('label', { cls: 'gm-character-field', text: 'Name der Person' });
    this.nameInput = nameLabel.createEl('input', { type: 'text', attr: { 'aria-label': 'Name der Person', maxlength: '180', spellcheck: 'false' } }); this.nameInput.value = this.initialName;
    const sectionLabel = form.createEl('label', { cls: 'gm-character-field', text: 'Abschnitt' });
    this.sectionInput = sectionLabel.createEl('input', { type: 'text', attr: { 'aria-label': 'Abschnitt', placeholder: 'Chars', spellcheck: 'false' } }); this.sectionInput.value = this.settings.characterFolder || 'Chars';
    const categoryLabel = form.createEl('label', { cls: 'gm-character-field', text: 'Unterkategorie (optional)' });
    this.categoryInput = categoryLabel.createEl('input', { type: 'text', attr: { 'aria-label': 'Unterkategorie', placeholder: 'Ort oder Gruppe eingeben …', autocomplete: 'off', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false' } });
    this.categoryInput.value = this.settings.lastCharacterCategory || '';
    this.suggestions = form.createDiv({ cls: 'gm-character-suggestions', attr: { role: 'listbox', 'aria-label': 'Passende Unterkategorien', id: 'gm-character-categories-' + Date.now() } });
    this.categoryInput.setAttribute('aria-controls', this.suggestions.id);
    this.target = form.createDiv({ cls: 'gm-character-target', attr: { role: 'status', 'aria-live': 'polite' } });
    this.targetLabel = this.target.createDiv('gm-character-target-category'); this.targetPath = this.target.createDiv('gm-character-target-path');
    this.error = form.createDiv({ cls: 'gm-character-error', attr: { role: 'alert' } });
    const footer = form.createDiv('gm-character-actions');
    footer.createEl('button', { attr: { type: 'button' }, text: 'Abbrechen' }).onclick = () => this.close();
    this.submitButton = footer.createEl('button', { attr: { type: 'submit' }, cls: 'mod-cta', text: 'Char anlegen & öffnen' });
    for (const input of [this.nameInput, this.sectionInput, this.categoryInput]) input.oninput = () => { this.error.textContent = ''; this.updateTarget(); };
    this.categoryInput.onkeydown = event => { if (event.key === 'ArrowDown') { const button = this.suggestions.querySelector('button'); if (button) { event.preventDefault(); button.focus(); } } };
    form.onsubmit = event => { event.preventDefault(); void this.submit(); };
    this.updateTarget(); this.nameInput.focus(); this.nameInput.select();
  }
  updateTarget() {
    const section = this.sectionInput.value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''), api = this.plugin.characterNotebook();
    const parents = api?.getNotebookPageParents(section) || [];
    this.choice = characterCategoryChoice(this.categoryInput.value, parents);
    this.suggestions.empty();
    for (const parent of this.choice.matches.slice(0, 8)) {
      const button = this.suggestions.createEl('button', { cls: 'gm-character-category-option', text: parent.title, attr: { type: 'button', role: 'option', 'aria-selected': String(this.choice.parent?.path === parent.path) } });
      button.onclick = () => { this.categoryInput.value = parent.title; this.updateTarget(); this.categoryInput.focus(); };
    }
    this.suggestions.hidden = !this.choice.matches.length;
    this.categoryInput.setAttribute('aria-expanded', String(!this.suggestions.hidden));
    const name = this.nameInput.value.trim(), existing = this.plugin.existingCharacterPage(section, name);
    this.existingFile = existing;
    this.targetLabel.textContent = existing ? 'Diese Seite existiert bereits. Du kannst sie öffnen.'
      : this.choice.kind === 'existing' ? 'Wird eingerückt unter: ' + this.choice.parent.title
      : this.choice.kind === 'ambiguous' ? 'Mehrere Unterkategorien passen. Bitte einen Eintrag auswählen.'
      : this.choice.kind === 'new' ? 'Neue Unterkategorie: ' + this.choice.title
      : 'Direkt im Abschnitt, ohne Unterkategorie';
    this.targetPath.textContent = (section || '…') + ' / ' + (name || 'Name der Person') + (existing ? '.' + existing.extension : '.canvas');
    this.submitButton.textContent = existing ? 'Vorhandene Seite öffnen' : this.choice.kind === 'new' ? 'Unterkategorie & Char anlegen' : 'Char anlegen & öffnen';
    this.submitButton.disabled = this.creating || !api || !characterValidName(name) || !section || (!existing && this.choice.kind === 'ambiguous');
  }
  async submit() {
    if (this.creating || this.submitButton.disabled) return;
    this.creating = true; this.submitButton.disabled = true;
    try {
      await this.plugin.createCharacterPage({ name: this.nameInput.value.trim(), section: this.sectionInput.value, choice: this.choice, selectedText: this.initialName, sourceFile: this.textSelectionSnapshot.sourceFile, existing: this.existingFile });
      this.close();
    } catch (error) { this.creating = false; this.updateTarget(); this.error.textContent = error.message || 'Der Char konnte nicht angelegt werden.'; }
  }
  onClose() { this.contentEl.empty(); }
}

const characterCommandMethods = {
  setupCharacterSelection() {
    if (typeof document === 'undefined') return;
    this.registerDomEvent(document, 'selectionchange', () => this.captureCharacterReadingSelection());
    this.registerDomEvent(document, 'select', event => { if(event.target?.matches?.('textarea.tn-free-editor')) this.captureCharacterReadingSelection(); }, true);
    this.registerDomEvent(document, 'pointerdown', event => {
      if (event.target?.closest?.('.view-content')) this.characterTextSnapshot = null;
    }, true);
  },
  captureCharacterReadingSelection() {
    if (typeof document === 'undefined') return null;
    const input = document.activeElement;
    if (input?.matches?.('textarea.tn-free-editor') && input.selectionStart < input.selectionEnd) {
      this.characterTextSnapshot = { text: input.value, from: input.selectionStart, to: input.selectionEnd, sourceFile: this.app.workspace.getActiveFile(), sourceLabel: input.closest('.tn-free-card')?.querySelector('.tn-free-card-label')?.textContent || '' };
      return this.characterTextSnapshot;
    }
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
    const range = selection.getRangeAt(0), element = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    // Creation only needs the selected label. Read mode never needs source offsets
    // and must not borrow a previous editor's selection from another text box.
    if (!element?.closest?.('.view-content') || element.closest('.cm-editor,input,textarea,.modal-container')) return null;
    const text = selection.toString().trim();
    if (!text) return null;
    this.characterTextSnapshot = { text, from: 0, to: text.length, sourceFile: this.app.workspace.getActiveFile(), sourceLabel: element.closest('.tn-free-card')?.querySelector('.tn-free-card-label')?.textContent || '' };
    return this.characterTextSnapshot;
  },
  characterNotebook() {
    const plugin = this.app.plugins?.getPlugin?.('classic-notebook');
    return typeof plugin?.createNotebookPage === 'function' && typeof plugin?.getNotebookPageParents === 'function' ? plugin : null;
  },
  characterSelection() {
    const snapshot = this.captureCharacterReadingSelection() || this.characterTextSnapshot || this.currentSelection() || this.characterNotebook()?.captureNotebookTextSelection();
    return snapshot && characterPlainText(snapshot.text.slice(snapshot.from, snapshot.to)) ? snapshot : null;
  },
  async showCharacterCreate(snapshot) {
    if (!this.characterNotebook()) { new Notice('Für Char-Seiten mit Unterkategorien bitte Classic Notebook aktivieren oder aktualisieren.'); return; }
    const sourceFile = snapshot.sourceFile || this.app.workspace.getActiveFile();
    try {
      const settings = await this.loadData() || {};
      new CharacterCreateModal(this, { ...snapshot, sourceFile }, settings).open();
    } catch (error) { new Notice(error.message || 'Der Dialog konnte nicht geöffnet werden.'); }
  },
  existingCharacterPage(section, name) {
    const path = (section ? section + '/' : '') + name.replace(/\.(?:md|canvas)$/i, '');
    return this.app.vault.getFiles().find(file => ['md', 'canvas'].includes(file.extension) && file.path.replace(/\.(?:md|canvas)$/i, '').toLocaleLowerCase() === path.toLocaleLowerCase()) || null;
  },
  async createCharacterPage({ name, section, choice, selectedText, sourceFile, existing }) {
    const api = this.characterNotebook(); if (!api) throw new Error('Classic Notebook ist nicht mehr aktiv. Bitte erneut öffnen.');
    section = String(section || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    name = String(name || '').trim().replace(/\.(?:md|canvas)$/i, '');
    if (!characterValidName(name) || !section || section.split('/').some(part => !characterValidName(part))) throw new Error('Bitte einen gültigen Namen und Abschnitt ohne Sonderzeichen wie / oder : im Namen eingeben.');
    const duplicate = this.existingCharacterPage(section, name);
    if (duplicate) {
      if (duplicate !== existing) throw new Error('Diese Seite wurde inzwischen angelegt. Du kannst sie jetzt öffnen.');
      await api.openPage(duplicate); return duplicate;
    }
    if (existing) throw new Error('Die vorhandene Seite wurde verschoben oder gelöscht. Bitte erneut prüfen.');
    if (!choice || !['root', 'existing', 'new'].includes(choice.kind)) throw new Error('Bitte eine eindeutige Unterkategorie wählen.');
    let parentPath = choice.kind === 'existing' ? choice.parent.path : null;
    if (parentPath && !api.getNotebookPageParents(section).some(parent => parent.path === parentPath)) throw new Error('Die Unterkategorie wurde inzwischen geändert. Bitte neu auswählen.');
    const newCategory = choice.kind === 'new' ? characterCategoryLabel(choice.title) : null;
    if (choice.kind === 'new' && !characterValidName(newCategory)) throw new Error('Bitte einen gültigen Namen für die Unterkategorie eingeben.');
    const folder = this.app.vault.getAbstractFileByPath(section);
    if (folder && !(folder instanceof TFolder)) throw new Error('Der Abschnitt ist bereits als Datei vorhanden.');
    if (!folder) await this.app.vault.createFolder(section);
    let categoryTitle = choice.kind === 'existing' ? choice.parent.title : '';
    if (newCategory) {
      // Reuse a category created while the dialog was open rather than duplicating it.
      const current = characterCategoryChoice(newCategory, api.getNotebookPageParents(section));
      if (current.kind === 'existing' && characterCategoryKey(current.parent.title) === characterCategoryKey(newCategory)) {
        parentPath = current.parent.path; categoryTitle = current.parent.title;
      } else {
        categoryTitle = '------- ' + newCategory + ' -------';
        const parent = await api.createNotebookPage({ section, title: categoryTitle, kind: 'canvas' }); parentPath = parent.path;
      }
    }
    const link = file => this.app.fileManager?.generateMarkdownLink ? this.app.fileManager.generateMarkdownLink(file, section + '/' + name + '.canvas', '', file.basename)
      : '[[' + file.path.replace(/\.md$/i, '') + '|' + file.basename.replace(/[\[\]|]/g, '') + ']]';
    const categoryFile = parentPath ? this.app.vault.getAbstractFileByPath(parentPath) : null;
    let text = '**Name:** ' + name + '\n\n';
    if (categoryFile) text += '**Kategorie:** ' + link(categoryFile) + '\n\n';
    if (sourceFile && this.app.vault.getAbstractFileByPath(sourceFile.path) === sourceFile) text += '**Erwähnt in:** ' + link(sourceFile) + '\n\n';
    text += '## Notizen\n\n';
    const file = await api.createNotebookPage({ section, title: name, parentPath, text, aliases: [name, selectedText].filter(Boolean), kind: 'canvas' });
    const settings = await this.loadData() || {};
    await this.saveData({ ...settings, characterFolder: section, lastCharacterCategory: categoryTitle });
    await api.openPage(file);
    return file;
  }
};

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


const PRESETS = [
  { id: 'gm-note', name: 'GM Notiz', color: '#5B9BD5', bold: true, size: null },
  { id: 'important', name: 'Wichtig', color: '#FF0000', bold: true, size: null },
  { id: 'important-large', name: 'Wichtig 2!!', color: '#FF0000', bold: true, size: '1.2em' }
];

module.exports = class GMNoteShortcuts extends Plugin {
  onload() {
    const plugin = this, { ViewPlugin } = require('@codemirror/view');
    this.setupCharacterSelection();
    this.setupTodoCommands();
    this.registerEditorExtension(notebookImportedFormatExtension());
    this.registerEditorExtension(ViewPlugin.fromClass(class {
      constructor(view) { this.view = view; this.capture(view); }
      update(update) { if (update.selectionSet || update.docChanged || update.focusChanged) this.capture(update.view); }
      capture(view) {
        if (!view.hasFocus) return;
        const range = view.state.selection.main;
        plugin.selectionSnapshot = range.empty ? null : { view, from: range.from, to: range.to, text: view.state.doc.toString(), sourceFile: plugin.app.workspace.getActiveFile?.(), canvasNode: plugin.canvasNodeForEditor(view.dom) };
      }
      destroy() { if (plugin.selectionSnapshot?.view === this.view && !plugin.selectionSnapshot.canvasNode) plugin.selectionSnapshot = null; }
    }));
    for (const preset of PRESETS) this.addCommand({
      id: preset.id, name: preset.name,
      checkCallback: checking => {
        const snapshot = this.currentSelection();
        if (!snapshot) return false;
        if (!checking) this.applyPreset(preset, snapshot);
        return true;
      }
    });
    this.addCommand({ id: 'create-character', name: 'Char anlegen', checkCallback: checking => {
      const snapshot = this.characterSelection();
      if (!snapshot) return false;
      if (!checking) void this.showCharacterCreate(snapshot);
      return true;
    } });
    this.registerEvent(this.app.workspace.on('file-open', () => { this.selectionSnapshot = null; this.characterTextSnapshot = null; }));
  }
  currentSelection() {
    const snapshot = this.selectionSnapshot;
    if (!snapshot || snapshot.from >= snapshot.to) return null;
    if (snapshot.canvasNode?.canvas.readonly) return null;
    if (snapshot.view?.dom.isConnected) return snapshot.view.state.doc.toString() === snapshot.text && !snapshot.view.state.readOnly ? snapshot : null;
    const { canvas, node } = snapshot.canvasNode || {};
    return node && canvas.nodes.get(node.id) === node && node.text === snapshot.text && !canvas.readonly ? snapshot : null;
  }
  canvasNodeForEditor(dom) {
    for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
      const canvas = leaf.view.canvas;
      if (!canvas?.nodes?.values) continue;
      for (const node of canvas.nodes.values()) if (node.nodeEl?.contains(dom) && typeof node.setText === 'function') return { canvas, node };
    }
    return null;
  }
  applyPreset(preset, snapshot) {
    try {
      if (snapshot !== this.currentSelection()) throw new Error('Bitte den Text erneut markieren.');
      const change = notebookColorEdit(snapshot.text, snapshot.from, snapshot.to, preset.color, preset);
      const text = snapshot.text.slice(0, change.from) + change.insert + snapshot.text.slice(change.to);
      const view = snapshot.view;
      if (view?.dom.isConnected && view.state.doc.toString() === snapshot.text) {
        // Keep the selection around its visible contents so another preset can replace it directly.
        const first = change.insert.indexOf('>'), last = change.insert.lastIndexOf('</span>');
        const anchor = change.from + (first >= 0 ? first + 1 : 0);
        const head = change.from + (last >= 0 ? last : change.insert.length);
        view.dispatch({ changes: change, selection: { anchor, head }, scrollIntoView: true });
        view.focus();
        this.selectionSnapshot = { ...snapshot, text, from: anchor, to: head };
      } else {
        const { canvas, node } = snapshot.canvasNode;
        node.setText(text); canvas.requestSave(); this.selectionSnapshot = null;
      }
    } catch (error) { new Notice(error.message); }
  }
  onunload() { this.selectionSnapshot = null; this.characterTextSnapshot = null; }
};
Object.assign(module.exports.prototype, characterCommandMethods);
Object.assign(module.exports.prototype, todoCommandMethods);
