# 20: piu home

**What to build:** The personal config and Extensions live outside the repo, so `piu` works without a clone (and later as a compiled binary). The config is `~/.piu/config.json`, personal Extensions are in `~/.piu/extensions/`, and `PIU_HOME` replaces `~/.piu`. A missing folder or config means the default config. A personal Extension's imports of `solid-js`, `solid-js/store` and `@opentui/*` resolve to the app's own instances through `ensureRuntimePluginSupport()` from `@opentui/solid/runtime-plugin-support`, although that folder has no `node_modules`. The repo's `config.json` and `extensions/` go away, and the guide for writing an Extension moves to `docs/extensions.md`.

**Blocked by:** 03

**Status:** done

- [x] With `PIU_HOME` pointing at a temp dir outside the repo, a fixture `config.json` there changes the frame, and a `.tsx` Extension copied into its `extensions/` loads, renders, and reacts to state (proving it shares the app's Solid instance)
- [x] Without `PIU_HOME`, the app reads `~/.piu/config.json` and `~/.piu/extensions/` (the path is computed from the home directory, not the repo), and a missing `~/.piu` starts with the default config
- [x] An Extension's own `pi-extension.ts` under `PIU_HOME/extensions/` still reaches the Backend with `-e`
- [x] The test harness goes through `PIU_HOME` only: `createApp` no longer takes `configPath` or `extensionsDir`, and the fixture Extensions are copied into the temp `PIU_HOME`
- [x] The repo has no `config.json` or `extensions/` any more, `.gitignore` drops their rules, and `docs/extensions.md` explains writing an Extension, including that other npm packages go in the Extension's own folder
- [x] AGENTS.md, the spec and GLOSSARY.md (if a term changes) describe the new locations. The AGENTS.md rule that fixture Extensions must live under `test/fixtures/` is updated to what turned out true

## Comments

- Decided after ticket 17: the author wants `piu` to ship as a compiled binary later, so users won't have the repo. The binary itself is after the MVP (spec Further Notes); this ticket moves only the locations and the module mapping, which work the same in development.
- Not verified: whether `ensureRuntimePluginSupport()` together with `@opentui/solid/preload` (in `bunfig.toml` and `bin/piu.ts`) also compiles Solid JSX in a `.tsx` file outside the repo. Today such a file fails to import (AGENTS.md). Check this first with one fixture; if it does not work, stop and report instead of working around it.
- The author's own `config.json` in the repo has to be moved to `~/.piu/config.json` by hand once; don't move or delete it without asking.
- The spec already describes the target state (stories 24 and 44, the two Extension roots, the test seam). Ticket 03's `extensionsDir` seam is what this replaces.
- Checked first: with `@opentui/solid/preload` in `bunfig.toml` and `ensureRuntimePluginSupport()` called, a `.tsx` Extension outside the repo (no `node_modules`) compiles, imports and shares the app's Solid; `test/piu-home.test.ts` proves it with a `counter` fixture whose own `createSignal` re-renders on click. Without the call the same fixture fails with `Cannot find package '@opentui/solid'`.
- The author's `config.json` was not in the repo when this ticket ran (nothing to move); it still has to be created at `~/.piu/config.json` by hand if the `pi-bolt` Backend is wanted.
- Deviation: `piuHome()` reads `process.env.HOME` before `os.homedir()`, because Bun's `homedir()` ignores a later change to `HOME`, which the harness needs. On POSIX that is the same value `homedir()` returns.
- Deviation: the harness option `extensionsDir` became `extensions` (a fixture folder that is _copied_ into `<PIU_HOME>/extensions`), and `homeFromHomeDir` puts `.piu` under a temp `$HOME` with `PIU_HOME` unset. A copied fixture can't import test files, so `loaded.ts`, `presence.ts` and `probe.ts` became `test/hooks.ts`, reached through `globalThis.piuTestHooks`.
- Deviation: the `stacker` fixture carries its own copy of `moduleModal`, because a personal Extension cannot import `src/`. **Gap for a later ticket:** an Extension has no public way to build a Modal request from a Module (`moduleModal` lives in `src/modal.tsx`); once `piu` is a binary, personal Extensions cannot open a Module Modal.
- Deviation: the "missing `~/.piu`" criterion is a unit test of `piuHome()`, `loadConfig` and `findExtensions` over an empty temp `$HOME`, not a full app start, because with no config the Backend would be the real `pi`.
- The automatic compaction test's `contextWindow` moved from 3300 to 3320: Pi's system prompt includes the cwd's `AGENTS.md`, which this ticket edited. Any `AGENTS.md` edit shifts it again (noted in `docs/agents/testing.md`); giving that test a cwd of its own would end that, left for later.
- The Backend-not-found card now says "in your piu config.json" instead of "in config.json".
