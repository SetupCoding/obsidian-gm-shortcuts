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
