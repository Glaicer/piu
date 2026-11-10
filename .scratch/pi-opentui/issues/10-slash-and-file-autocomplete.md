# 10: `/` and `@` autocomplete

**What to build:** Typing `/` in the input opens autocomplete over the Backend's commands (`get_commands`: extension commands, prompt templates, skills) merged with the app's own command registry. Choosing an entry inserts it, and running an app command executes it instead of sending it to the model. Typing `@` autocompletes file paths in the working folder.

**Blocked by:** 08

**Status:** done

- [x] With a test prompt template and a test extension command in the isolated Pi dir, `/` lists both plus a registered app command
- [x] Typing narrows the list, and Enter inserts the chosen entry
- [x] An app command runs locally and doesn't reach the model, while a prompt template expands and reaches the model
- [x] `@` lists files of a fixture folder, narrows as I type, and inserts the chosen path

## Comments

- From 08: an open autocomplete list must take Esc first, so Esc closes the list and does not abort the run. The input is a `<textarea>` with its own key routing in `onKeyDown`, where Enter, Up and Down are already taken (send/steer, history on the first or last visual line); the list needs them while it is shown.

Deviations from the ticket and decisions worth knowing:

- The app's command registry is `Extension.commands` (`Command = { name, description?, run(context) }` in `src/module.ts`). `resolvePlacement` collects them from the loaded Extensions, so a command exists exactly when its Extension is enabled, and two Extensions with the same command name are a startup error. Modules receive them bound as `context.commands`. The first two are `/model` and `/reasoning` (built-in `model` and `reasoning` Extensions), which open the same pickers as the status Modules; `src/picker.tsx` now exports `openPicker` and `PickerOptions` for that, and `PickerButton` takes `picker` instead of loose props.
- An app command wins over a Backend command of the same name: the list hides the Backend one and Enter runs the app one. An app command runs only when the whole message is `/name`; `/name arguments` goes to the Backend as plain text. No arguments are passed to `run` yet.
- Slash completion opens only while the cursor is in the first word of the message and it starts with `/`. `@` completes at the start of any word before the cursor. Matching is a case-insensitive substring, ranked exact, then prefix, then the rest.
- Keys while the list is open: Up/Down move, Tab inserts, Enter inserts unless the typed text already equals the selected entry (`/crash` + Enter still sends), Esc closes the list and does not abort. Esc after closing it, or any new trigger, behaves as before. The list reopens after Esc only once the token is gone and typed again.
- The list is drawn through a `Portal` (see AGENTS.md), not a Modal, so focus stays in the textarea. It shows 8 rows, above the textarea, and overlaps whatever is there.
- Files come from a breadth-first walk of the working folder (`builtin/input/files.ts`), rescanned each time `@` starts, capped at 5000 files, skipping dot-folders and `node_modules`. `.gitignore` is not honored (marked `shortcut:` in the code). The working folder is `createApp({ cwd })`, default `process.cwd()`, and also the Backend's spawn `cwd` and `context.cwd`.
- Known gaps: completing with the cursor inside a word (`/mo|del`) replaces only the text before the cursor and leaves `del` behind; `@` paths containing spaces are not completed (the token ends at whitespace); matching is case-insensitive but the exact-match rule for Enter and the local dispatch of an app command are case-sensitive, so `/MODEL` + Enter completes to `/model ` and a second Enter runs it; skills are listed because the code takes every `get_commands` entry, but no test registers one (the harness passes `--no-skills`).
- Also beyond the ticket: a duplicate command name across Extensions is a startup error (tested in `config.test.ts`), and Tab inserts like Enter (tested).
- Not done: picking a list row with the mouse (the ticket names none; the keyboard path is the only one), directories as `@` entries, and completing a path one segment at a time.
- Test support: `startPiu` takes `promptTemplates` (written into the temp agent dir) and `cwd`; the faux backend registers `script.extensionCommands`; `inputArea` moved from `input.test.ts` into the harness. The harness also passes `--no-skills`: without it the author's own skills filled the `/` list.
