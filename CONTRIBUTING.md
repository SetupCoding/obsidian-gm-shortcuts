# Contributing

Small, focused fixes and reproducible bug reports are welcome. Discuss broad layout changes in an issue first.

Use Node.js 22.13 or newer. Build with `npm run build` and run `npm test`. Classic Notebook also uses `npm ci` and `npm run lint` for its documented release checks. Generated runtime files are committed: rebuild them when changing `src/` or `shared/`.

Use synthetic notes in tests and screenshots. Never include a real vault, `data.json`, import profiles, private document exports, absolute personal paths or credentials. Confirm that a regression test fails before the fix and passes afterward.

Keep core navigation working if an optional enhancement fails. Restore every patched method and event subscription on unload. Test disable/re-enable, stale asynchronous work and unsaved Canvas content when changing lifecycle code.

See the MIT license. Contributions must be compatible with it; comparison with another plugin does not permit copying incompatible source.

The common formatting modules are generated copies from Classic Notebook. See [AGENTS.md](AGENTS.md) before changing them. Use the shared deployment workflow to update installed vault copies after testing and committing source changes.
