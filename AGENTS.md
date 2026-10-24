# Source and distribution rules

- Develop this plugin in `src/`. Generate root runtime files with `npm run build`.
- `shared/inline-text-formats.js` and `shared/color-edit.js` are generated companion copies whose canonical authoring location is Classic Notebook's `shared/` directory. Do not independently edit these copies. Review the common source change, refresh the copies through Classic Notebook's shared sync action, and test both plugins.
- Keep this repository independently buildable. Do not add runtime dependencies on another checkout.
- Use Classic Notebook's documented multi-vault sync to install both plugins. Never patch installed vault copies or synchronize vault-local settings/notes between vaults.
- Run `npm test` and `npm run test:integration` with the intended Classic Notebook source checkout.
- Keep personal vault paths, configuration, notes, import profiles and backups out of Git.

# Authorship and writing

- The user is the sole author. Never add AI attribution, AI co-author trailers or generated-by credit to commits, pull requests, issues or comments.
- Do not use em dashes in commits, pull requests, issues or comments.
