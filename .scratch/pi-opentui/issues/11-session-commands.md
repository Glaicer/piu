# 11: Session commands

**What to build:** The app's own replacements for Pi's TUI-only commands. New session starts a fresh conversation. Resume opens a Modal listing sessions and switches to the chosen one. Tree opens a Modal of the session tree, and picking an entry forks from it. Compact shrinks the context. All are reachable from `/` autocomplete.

**Blocked by:** 09, 10

**Status:** done

- [x] New session clears the agent Panel, and the next prompt starts a new session in Backend state
- [x] With two sessions in the isolated Pi dir (sessions enabled for this test), Resume lists both and switching shows the other's messages
- [x] Tree shows the entries of a branched session, and forking from an earlier entry shows the conversation up to that entry
- [x] Compact triggers compaction and shows its service row

## Comments

- From 01: the spec wants one Backend per test file, reset between tests with `new_session`. Until now every test boots its own app and Backend (about 0.4 s each). Once New session exists, the harness can share one app per file and reset through it.
- From 06: there is no highlight cache. A remounted message highlights its code again, so Tree and Resume, which re-render whole histories, pay for every code block each time. Watch that cost; the way in is noted in 06's comments (build `MarkdownRenderable` imperatively with a `treeSitterClient`).
- From 07: the Pi state store does not reload `get_messages` after `compaction_end`, so service rows can be anchored to messages Pi has compacted away. A failed attempt that Pi drops on retry stays in the message list (it renders nothing). Compactions and retries from before a resume get no row. The Compact command should leave the message list matching Pi's.
- From 09: build a Modal with `moduleModal` from `src/modal.tsx` and a list with `Picker` from `src/picker.tsx` (see `builtin/model`). The picker handles mouse and keys but not filtering or type-ahead, which a long session list may want.
- From 10: add the four commands as `commands` of an Extension (`{ name, description, run(context) }`, see `builtin/model` for `/model`), and they show up in `/` autocomplete and run locally. `run` gets no arguments yet; `/compact [instructions]` needs the prompt to pass the text after the name (today it matches only a bare `/name`). The `/` list matches substrings, so a long session list may want the same in its Modal.

- Done in `builtin/chat` (`session-commands.tsx`, `session-tree.ts`, `sessions.ts`) as `/new`, `/resume`, `/tree` and `/compact`, with `newSession`, `switchSession`, `fork`, `compact` and `sessionTree` actions and `sessionFile` in the Pi state store. The commands live in the `chat` Extension, not their own: an Extension's commands load only when one of its Modules is in the Placement, so a command-only Extension would never appear in `/`.
- Resume has no Pi command to ask, so it reads the `*.jsonl` files in the folder of the current `sessionFile`. That means only the current folder's sessions, and an empty list (the Modal does not open) under `--no-session`.
- Tree lists the user prompts only, indented where the conversation branches, because Pi's `fork` accepts only user prompts. `fork` keeps the history _before_ the picked prompt, so "the conversation up to that entry" excludes the picked prompt itself. Pi's own TUI puts that prompt's text back into the editor; this is not wired (see the `From 11:` comment in 12).
- A fork through RPC is always linear, so the Tree test branches a session with a fixture command that calls `ctx.navigateTree` (`branchBackCommand` in `test/harness.ts`).
- Compact reloads `get_messages` after the RPC call and re-anchors service rows (rows past the new end clamp to it, the finished compaction row moves to the end). Automatic compaction still does not reload the list.
- Not done: `/compact [instructions]` (the prompt still matches only a bare `/name`), a shared app per test file (From 01), a filter in the Resume and Tree Modals, and measuring re-highlight cost on Resume (From 06; Resume remounts every code block).
- Two tests in `autocomplete.test.ts` assumed `/model` and `/reasoning` were the first app commands in the `/` list; the new commands come first, so they now type `/re` and expect `/resume` after Down.
- Not done: the Tree does not open on the current leaf (`get_tree` returns `leafId`; the Modal starts on the first row), and it shows no assistant or compaction entries.
