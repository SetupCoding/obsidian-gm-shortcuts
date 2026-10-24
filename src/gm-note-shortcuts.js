'use strict';
const { Plugin, Notice, Modal, TFolder } = require('obsidian');

// @include inline-text-formats
// @include color-edit
// @include character-command
// @include todo-command

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
