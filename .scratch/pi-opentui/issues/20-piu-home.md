# 20: piu home

**What to build:** The personal config and Extensions live outside the repo, so `piu` works without a clone (and later as a compiled binary). The config is `~/.piu/config.json`, personal Extensions are in `~/.piu/extensions/`, and `PIU_HOME` replaces `~/.piu`. A missing folder or config means the default config. A personal Extension's imports of `solid-js`, `solid-js/store` and `@opentui/*` resolve to the app's own instances through `ensureRuntimePluginSupport()` from `@opentui/solid/runtime-plugin-support`, although that folder has no `node_modules`. The repo's `config.json` and `extensions/` go away, and the guide for writing an Extension moves to `docs/extensions.md`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] With `PIU_HOME` pointing at a temp dir outside the repo, a fixture `config.json` there changes the frame, and a `.tsx` Extension copied into its `extensions/` loads, renders, and reacts to state (proving it shares the app's Solid instance)
- [ ] Without `PIU_HOME`, the app reads `~/.piu/config.json` and `~/.piu/extensions/` (the path is computed from the home directory, not the repo), and a missing `~/.piu` starts with the default config
- [ ] An Extension's own `pi-extension.ts` under `PIU_HOME/extensions/` still reaches the Backend with `-e`
- [ ] The test harness goes through `PIU_HOME` only: `createApp` no longer takes `configPath` or `extensionsDir`, and the fixture Extensions are copied into the temp `PIU_HOME`
- [ ] The repo has no `config.json` or `extensions/` any more, `.gitignore` drops their rules, and `docs/extensions.md` explains writing an Extension, including that other npm packages go in the Extension's own folder
- [ ] AGENTS.md, the spec and GLOSSARY.md (if a term changes) describe the new locations. The AGENTS.md rule that fixture Extensions must live under `test/fixtures/` is updated to what turned out true

## Comments

- Decided after ticket 17: the author wants `piu` to ship as a compiled binary later, so users won't have the repo. The binary itself is after the MVP (spec Further Notes); this ticket moves only the locations and the module mapping, which work the same in development.
- Not verified: whether `ensureRuntimePluginSupport()` together with `@opentui/solid/preload` (in `bunfig.toml` and `bin/piu.ts`) also compiles Solid JSX in a `.tsx` file outside the repo. Today such a file fails to import (AGENTS.md). Check this first with one fixture; if it does not work, stop and report instead of working around it.
- The author's own `config.json` in the repo has to be moved to `~/.piu/config.json` by hand once; don't move or delete it without asking.
- The spec already describes the target state (stories 24 and 44, the two Extension roots, the test seam). Ticket 03's `extensionsDir` seam is what this replaces.
