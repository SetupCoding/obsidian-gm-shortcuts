# GM Shortcuts

Small Obsidian commands for selected text, character pages and shared TODOs. **Desktop beta 1.2.1 · MIT · Obsidian 1.14.5+.** The current plugin UI is German and appears as **GM Schnellbefehle**.

[Download](https://github.com/SetupCoding/obsidian-gm-shortcuts/releases/tag/1.2.1) · [Deutsche Anleitung](docs/README.de.md)

## Commands

Select text in an editable Markdown note or Canvas text card, open the normal command palette, then choose:

| Command | Result | Dependency |
| --- | --- | --- |
| GM Notiz | Blue and bold | None |
| Wichtig | Red and bold | None |
| Wichtig 2!! | Red, bold and 20% larger | None |
| Char anlegen | Create a character page in a selected category | Classic Notebook |
| TODO anlegen | Record the selection in the central TODO page with a source link | Classic Notebook |
| Char TODO | Associate the selected future action with a character and central TODO list | Classic Notebook |

Formatting uses portable inline HTML in Markdown. Native undo remains available. Text that changed while a dialog was open is checked before applying the action.

## Install

Copy release files `main.js`, `manifest.json` and `styles.css` into `<vault>/<config folder>/plugins/gm-note-shortcuts/`, reload Obsidian and enable **GM Schnellbefehle**. The config folder is normally `.obsidian`.

The three formatting commands work independently. Character/TODO commands use the optional [Classic Notebook](https://github.com/SetupCoding/obsidian-classic-notebook) integration. Install it for these commands. No default global shortcut is installed.

There is no telemetry, account requirement or plugin-initiated network access. Operations read and edit selected notes locally; settings are stored per vault. No personal adventure content is bundled. Try the beta in a disposable vault or copy first.

## Development and status

Use Node.js 22+; run `npm run build`, `npm run check` and `npm test`. No package installation is needed for these steps. For integration tests, check out Classic Notebook into the sibling `obsidian-classic-notebook` directory, build it, then run `npm run test:integration` here. Set `CLASSIC_NOTEBOOK_DIR` for a different location.

`shared/inline-text-formats.js` and `shared/color-edit.js` are generated companion copies. Their canonical authoring location is Classic Notebook's `shared/` directory. Keep this repository independently buildable; refresh the copies with Classic Notebook's shared sync action and test both plugins.

This release changes licensing and author/compatibility metadata; behavior is the same as 1.2.0. Automated standalone and integration tests run with simulated Obsidian objects. Windows is the development platform; mobile is unsupported. No community-directory approval or general cross-platform compatibility is claimed. [MIT license](LICENSE).

For a common source and tested installation into several vaults, use [Classic Notebook's multi-vault workflow](https://github.com/SetupCoding/obsidian-classic-notebook/blob/main/docs/VAULT-SYNC.md). It preserves separate vault-local settings and notes.
