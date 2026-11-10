# 03: Config and Extension discovery

**What to build:** A personal `config.json` (git-ignored) overrides the typed default `config.ts`: objects merge by key, while arrays and the `layout` tree replace. The merged config is validated once at startup, and any error names the exact field path and stops startup with a readable message. Switching the Backend to `pi-bolt` is one line. Extensions are discovered in `builtin/` and in the personal `extensions/` folder (git-ignored except a README explaining how to write one). A name in both folders is a startup error naming both paths. An Extension is enabled exactly when one of its Modules is in the Placement. Unknown Module ids and Placement keys that aren't Panel ids are startup errors. Per-Module settings reach the Module through its context.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A fixture `config.json` that reorders one Panel's Modules changes the order in the frame without copying the layout
- [ ] A fixture that replaces `layout` replaces the whole tree, and one that sets `backend.command` changes the Backend started
- [ ] Invalid configs (wrong type, unknown Module id, unknown Panel id in Placement) each produce a startup error containing the field path
- [ ] An Extension in `extensions/` is discovered and its Module rendered when placed, and is not loaded when not placed
- [ ] Same Extension name in `builtin/` and `extensions/` fails startup with both paths in the message
- [ ] A Module setting from config is visible in that Module's output
- [ ] `config.json` and `extensions/*` (except the README) are git-ignored
