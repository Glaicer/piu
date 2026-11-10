Status: ready-for-agent

# Pi OpenTUI: a modular, clickable terminal interface for Pi

## Problem Statement

I use the Pi coding agent every day and I am happy with its agent side: tools, extensions, providers, sessions. Its terminal interface is what I no longer want. It is a single scrolling column of text driven almost entirely by the keyboard. I can't click things, nothing animates, I can't rearrange the screen, and only Pi's own TUI API can add pieces to it. That API is tied to Pi's renderer and goes no further than text lines, a footer and overlays. I want an interface made of independent areas that I can lay out, fill with small self-contained pieces (mine or anyone's), click, scroll each on its own, and that feels alive. I want it without giving up anything on the agent side, and without the interface stuttering while the agent works hard.

## Solution

A separate terminal application, `piu`, that runs beside the regular `pi`. It is built on OpenTUI with Solid and runs on Bun. It drives Pi as a **Backend** subprocess over Pi's RPC protocol (see ADR-0001). The Backend is a config value: stock `pi` by default, `pi-bolt` on my machine.

The screen is a **Layout**, a tree of **Slots**. A Slot is either a **Container** (child Slots in a row or column) or a **Panel** (Modules in a row or column that scrolls on its own). By default the main screen is two columns, 66% and 33%. The second column hides on narrow terminals, and in this version it is present but empty. The first column holds the agent Panel (Slot 1) and, below it, the input area (Slot 2): the prompt input plus a row of small Modules showing the current model, reasoning level and extension statuses. **Modals** are Slots drawn above the Layout at any position and size, centered by default. They serve the commands Pi's own TUI would normally handle (model picker, reasoning level, new session, resume, tree and fork, compact) and the dialogs Pi extensions raise. **Toasts** show short notices.

Everything shown in a Panel is a **Module** contributed by an **Extension**. That includes the chat and the input, which ship as built-in Extensions. An Extension can also carry a **Pi extension** that runs inside the Backend. The first such Extension is `ask_user_question`: it replaces the agent's question tool, and while a question is pending its question card replaces the input area, much like OpenCode does it. A typed default config ships with the repo. A personal JSON config, not committed, overrides it: backend, layout, which Modules go in which Panel and in what order, Module settings, keybindings, colors and animations.

## User Stories

### Launch and Backend

1. As a Pi user, I want to start the new interface with `piu` in a project folder, so that I get the new UI without changing how I start work.
2. As a Pi user, I want the regular `pi` to keep working unchanged next to `piu`, so that I can fall back to it any time.
3. As a Pi user, I want every argument after `piu` passed to the Backend unchanged (`-c`, `--model`, `--session`…), so that I don't learn a second set of flags.
4. As a Pi user, I want `piu` to use my existing Pi settings, credentials, sessions, models, skills, prompt templates and Pi extensions, so that the agent behaves exactly as it does in `pi`.
5. As a Pi-Bolt user, I want to switch the Backend to `pi-bolt` with one line in my personal config, so that the agent runs on the faster runtime.
6. As a new user of the published repo, I want the default Backend to be stock `pi`, so that I'm not asked for a program I never installed.
7. As a user, I want the interface to stay responsive (typing, clicking, scrolling, animations) while the agent streams or a tool call writes a large file, so that heavy agent work never freezes the screen.
8. As a user, I want a clear message telling me which config key to change when the Backend command is not found, so that I can fix it in seconds.
9. As a user, I want the interface to stay open when the Backend crashes, showing an error card with the last stderr lines and a Restart button, so that I don't lose my place.
10. As a user, I want Restart to continue the same session, so that the conversation survives a Backend crash.
11. As a user, I want features that only Pi-Bolt offers to stay silently absent on stock `pi`, so that the same config works on either Backend.

### Layout and Slots

12. As a user, I want the main screen split into a 66% first column and a 33% second column, so that the agent gets most of the space.
13. As a user, I want the second column to hide when the terminal is narrower than a configured threshold (120 columns by default), so that a small terminal still shows a usable agent view.
14. As a user, I want the layout to recompute when I resize the terminal, so that it always fits.
15. As a user, I want each Panel to scroll independently, so that scrolling the chat doesn't move anything else.
16. As a user, I want the mouse wheel to scroll the Panel under the pointer rather than the focused one, so that scrolling feels like a normal GUI.
17. As a layout author, I want a Slot's size to be fixed (cells), a percentage, or "take the rest", with an optional minimum size, so that I can describe both rigid and stretchy areas.
18. As a layout author, I want to hide any Slot below a terminal width, so that the layout adapts on more than the second column.
19. As a layout author, I want Containers to nest to any depth, so that I can build complex screens out of rows and columns.
20. As a layout author, I want a Panel to lay its Modules out in a row or a column, so that small status Modules can sit side by side.
21. As a layout author, I want a Module to be able to render nothing and take no space, so that Panels shrink when a Module has nothing to show.
22. As a layout author, I want a Module to be able to claim its Panel exclusively while visible, hiding its siblings, so that one piece can temporarily take over an area.

### Config

23. As a user, I want the repo to ship a typed default config, so that the app works with no setup.
24. As a user, I want a personal JSON config, ignored by git, that overrides the default, so that my changes survive `git pull`.
25. As a user, I want objects in my personal config to merge with the default key by key, while lists and the whole layout tree replace the default, so that the result is predictable.
26. As a user, I want Module placement (which Modules go in which Panel, in which order) kept separate from the layout tree, so that I can reorder one Panel with a single line without copying the layout.
27. As a user, I want to disable an Extension by removing its Modules from placement, so that turning things off needs no code.
28. As a user, I want to replace a built-in Module by putting another Module's id in its place, so that I can swap the chat or the input for my own.
29. As a user, I want my config validated once at startup with errors that name the exact field path, so that a typo doesn't turn into a mysterious blank screen.
30. As a user, I want an unknown Module id, an unknown Panel id in placement, or a malformed size reported as a startup error, so that mistakes are caught early.
31. As a user, I want per-Module settings in the config, so that Modules can be tuned without code changes.
32. As a user, I want keybindings in the config, so that I can remap shortcuts.
33. As a user, I want to turn all animations off in the config, so that I can choose speed over motion.

### Extensions and Modules

34. As an Extension author, I want to write an Extension as a folder of TypeScript that contributes Modules, so that adding UI is plain code.
35. As an Extension author, I want my Module to get Pi's live state through a reactive context (model, reasoning level, context usage, tokens and cost, messages, whether the agent is working), so that my Module updates by itself.
36. As an Extension author, I want actions on the context (prompt, abort, set model, set reasoning level, open a Modal, show a Toast), so that my Module can do things, not just show them.
37. As an Extension author, I want cleanup hooks on the context, so that the timers, requests and subscriptions my Module starts end when it is removed.
38. As an Extension author, I want to fetch from the network or read the system from my own Module code, so that I can show things like a Bitcoin price refreshed every minute.
39. As an Extension author, I want to ask the platform for an animation instead of running my own timers, so that all motion respects the global animation switch.
40. As an Extension author, I want to read colors only from theme tokens, so that my Module fits light and dark themes automatically.
41. As an Extension author, I want my Extension to optionally carry a Pi extension that the app loads into the Backend whenever my Extension is enabled, so that one package can add both a tool and its UI.
42. As an Extension author, I want a request/response channel between my Pi extension and my Modules that works on both Backends, so that the tool can ask the UI something and wait for the answer.
43. As an Extension author, I want my Pi extension to replace an installed tool by registering its own tool name and deactivating the old one, so that my UI-aware version is the one the model calls on either Backend.
44. As a user, I want my own Extensions in a git-ignored `extensions/` folder, separate from the repo's built-in `builtin/` folder, so that updates never touch my code.
45. As a user, I want a startup error naming both paths when one of my Extensions has the same name as a built-in one, so that nothing gets silently shadowed.
46. As a user, I want the chat, input, model, reasoning and status pieces to be built-in Extensions on the same contract as mine, so that I can disable or replace any of them.

### Agent Panel (chat)

47. As a user, I want my messages and the assistant's replies shown in the agent Panel as they stream, so that I can follow the agent live.
48. As a user, I want assistant text rendered as Markdown with highlighted code blocks, so that answers are readable.
49. As a user, I want long streaming answers to stay smooth, re-rendering only what changed, so that a 60,000-character answer doesn't eat a CPU core.
50. As a user, I want thinking blocks collapsed by default and expandable with a click, so that reasoning is available without clutter.
51. As a user, I want each tool call shown as a card with the tool name, its key argument, its status and its duration, so that I can scan what the agent did.
52. As a user, I want to click a tool card to expand its body (arguments and result), so that I can inspect details on demand.
53. As a user, I want compaction and automatic retries shown as one-line service rows, so that I understand pauses and context changes.
54. As a user, I want the agent Panel to keep scrolling with new output when I'm at the bottom, and to stay put when I've scrolled up, so that reading history isn't interrupted.
55. As a user, I want a visible working indicator while the agent runs, so that I know it hasn't stalled.

### Input area (Slot 2)

56. As a user, I want a multi-line prompt input where Enter sends and Shift+Enter inserts a newline, so that I can write long prompts.
57. As a user, I want Up and Down to walk my prompt history, so that I can resend or edit earlier prompts.
58. As a user, I want `/` to open autocomplete over extension commands, prompt templates, skills and this app's own commands, so that I discover and run commands quickly.
59. As a user, I want `@` to autocomplete file paths, so that I can reference files without typing them in full.
60. As a user, I want Enter while the agent is working to steer the current run and Alt+Enter to queue a follow-up, as in Pi, so that my muscle memory still works.
61. As a user, I want Esc while the agent is working to abort the run, so that I can stop it immediately.
62. As a user, I want the current model shown under the input and clickable to open the model picker, so that switching models is one click.
63. As a user, I want the current reasoning level shown under the input and clickable to change it, so that I can adjust effort quickly.
64. As a user, I want statuses set by Pi extensions shown under the input, so that extension state stays visible.

### Modals and built-in commands

65. As a user, I want a model picker Modal listing the Backend's available models, so that I can pick one with the mouse or keyboard.
66. As a user, I want a reasoning-level Modal listing the levels the current model supports, so that I only see valid choices.
67. As a user, I want a "new session" command, so that I can start fresh without restarting the app.
68. As a user, I want a "resume" Modal listing my sessions, so that I can switch to an earlier conversation.
69. As a user, I want a session tree Modal where I can pick an entry and fork from it, so that I can branch a conversation as in Pi.
70. As a user, I want a compact command, so that I can shrink the context on demand.
71. As a user, I want Modals centered by default and closable with Esc or a click outside, so that they behave like dialogs I know.
72. As a layout author, I want to open a Modal at any position and size whose content is any Slot, so that complex dialogs reuse the same building blocks.
73. As a user, I want keyboard focus trapped in the open Modal, so that typing doesn't leak into the input underneath.

### Pi extension dialogs and notices

74. As a user, I want `select`, `confirm`, `input` and `editor` dialogs from Pi extensions shown as Modals, so that extensions that ask me things keep working.
75. As a user, I want `notify` calls from Pi extensions shown as Toasts that disappear on their own, so that notices don't block me.
76. As a user, I want a Pi extension's `setTitle` to set the terminal title, so that the tab shows what's happening.
77. As a user, I want a pending extension dialog closed automatically when its tool call ends, the run ends, or I abort, so that no stale dialog stays on screen.

### ask_user_question

78. As a user, I want the agent's structured questions shown as a question card that replaces the input area while pending, so that answering feels native, not like a chain of menus.
79. As a user, I want one tab per question when the agent asks several, so that I can move between them freely.
80. As a user, I want to pick an option by click or keyboard, toggle several when the question is multi-select, and type my own answer instead, so that I'm never boxed in.
81. As a user, I want to review and submit all answers at once, so that I can fix a choice before sending.
82. As a user, I want to dismiss the card, which the agent receives as a cancellation, so that I can decline to answer.
83. As a user, I want the input to come back as soon as the questions are answered or dismissed, so that I can continue.
84. As a user, I want the regular `pi` to keep using my currently installed question tool, so that `piu`'s version only applies inside `piu`.

### Keyboard and mouse

85. As a user, I want every clickable action also reachable by keyboard, so that I can work without the mouse.
86. As a user, I want Tab and Shift+Tab to move focus between Panels, and arrows, Enter and Esc to work inside them, so that keyboard navigation is predictable.
87. As a user, I want a visible focus indication on the focused Panel, so that I know where my keys go.

### Animations and theme

88. As a user, I want a spinner or pulse while the agent works, so that activity is obvious.
89. As a user, I want Modals and Toasts to fade or slide in and out, so that the interface feels smooth.
90. As a user, I want tool cards and thinking blocks to expand and collapse smoothly, so that the layout doesn't jump.
91. As a user, I want smooth scrolling in Panels, so that following long output is comfortable.
92. As a user, I want a light and a dark theme chosen to match my terminal background, so that the app is readable in either.
93. As a user, I want to override theme color tokens in my personal config, so that I can tune colors.

## Implementation Decisions

### Runtime and Backend

- Runtime is Bun (OpenTUI 0.8.x needs Bun ≥ 1.3.14 or Node ≥ 26.4; the target machine has Bun 1.4.4 and Node 24). UI framework is `@opentui/solid`. Package manager is pnpm. Resolve current stable versions from the registry when adding dependencies and pin them.
- The Backend is a child process started as `<backend.command> <backend.args…> --mode rpc <Pi extension -e paths…> <user args…>`. The app talks to it through its own thin Backend client, not Pi's `RpcClient` (ADR-0001). The SDK is not used in-process.
- The default config's Backend is `pi`. The personal config on the author's machine sets `pi-bolt`.
- Pi-Bolt-only protocol features (`set_client_features`, `subagent_subscribe`) are optional. They are used only if the Backend accepts them. Nothing in this version depends on them.
- Wire `message_update` records are delta-only. The app keeps a reconstructed in-progress message per stream and replaces it with the authoritative content from `text_end` / `thinking_end` / `toolcall_end` and `message_end`.
- RPC framing is strict JSONL split on LF only (no generic line reader: `U+2028/2029` are valid inside JSON). The Backend client copies Pi's `jsonl.ts` reader for this, since it isn't exported, and keeps the Backend's stderr in memory without ever writing it to the terminal.
- A **Pi state store** is the single place that turns RPC events and responses into reactive state: messages, streaming state, model, reasoning level, available models and levels, session stats (`get_session_stats`: tokens, cost, `contextUsage`), extension statuses, pending extension dialogs, Backend health. Modules read it only through the Module context. Session stats refresh after each `message_end` and after model or session changes.
- Backend lifecycle: start, health (running, exited with code and stderr tail, not found), and restart with `-c` added so the same session continues.
- Pi's built-in TUI commands don't exist over RPC. The app implements its own: model picker, reasoning level, new session, resume, tree/fork, compact. Pi's `/settings` is not reimplemented. Slash autocomplete merges the Backend's `get_commands` with the app's own commands.

### Layout model

- A Slot is a tagged union, so illegal states can't be represented:
  - Container: `id`, `direction` (row | column), `children` (Slots), common sizing.
  - Panel: `id`, `direction` (row | column), common sizing. It owns an independent scroll area.
  - Common sizing: `size` = fixed cells | percentage | rest, optional `minSize`, optional `hideBelow` (terminal columns).
- A Panel's contents come from **Placement**, a map from Panel id to an ordered list of Module ids (`<extension>.<module>`). Placement is kept separate from the Layout tree on purpose: the personal config replaces the Layout tree wholesale, and a separate Placement lets a user reorder one Panel without copying the tree.
- Layout is computed by OpenTUI's flex layout (Yoga). Modals use absolute positioning above the Layout.
- Default Layout: a root row Container with column 1 (66%) and column 2 (33%, `hideBelow: 120`, empty Placement in this version). Column 1 is a column Container holding the agent Panel (rest) and the input-area Container: a Panel for the input (exclusive-capable, holding the question Module and the input Module) above a row Panel holding model, reasoning and status Modules.
- A Modal is a Slot plus position (default centered) and size. It traps focus, closes on Esc or an outside click, and can stack.
- Mouse-wheel events go to the Panel under the pointer. Keyboard focus moves between Panels with Tab/Shift+Tab. Inside the focused Panel, arrows, Enter and Esc are routed to its Modules.

### Config

- Two layers: a typed default config in the repo, and a personal config in JSON that git ignores. Merge rule: objects merge by key, while arrays and the `layout` tree replace.
- The merged config is validated once at startup against a schema. Errors name the field path and stop startup with a readable message. Cross-reference checks: every Placement key is a Panel id in the Layout, every Module id belongs to a discovered Extension, and Module settings keys refer to placed Modules.
- Config sections: `backend` (command, args), `layout`, `placement`, `modules` (per-Module settings), `keybindings`, `theme` (token overrides), `animations` (boolean), `breakpoints` if needed beyond per-Slot `hideBelow`.

### Extensions and Modules

- Two Extension roots: `builtin/` (shipped, committed) and `extensions/` (personal, git-ignored except a README explaining how to write one). Both are discovered the same way. A name that appears in both is a startup error naming both paths.
- An Extension is enabled exactly when at least one of its Modules appears in the merged Placement. An enabled Extension's Pi extension, if any, is passed to the Backend with `-e`.
- Module contract: an Extension exports Modules. Each Module has an `id`, an optional `title`, and a render function that receives the Module context and returns a Solid component. A Module can report itself invisible (it then takes no space) and can request exclusivity in its Panel while visible.
- Module context: reactive read-only Pi state (from the Pi state store); actions (prompt, steer, follow-up, abort, set model, set reasoning level, new session, open Modal, show Toast); `animate(...)` backed by OpenTUI's timeline, which honors the global animation switch; cleanup registration; theme tokens; the Module's settings from config. Modules do their own network and system access.
- Built-in Extensions in this version: chat (agent Panel), input, model, reasoning, status (extension `setStatus` values), ask-user-question. Toasts, Modals, the extension-dialog bridge and animations are platform, not Modules.
- **Extension channel**: a Pi extension sends a request by calling `ctx.ui.editor(title, prefill)` with the reserved title form `opentui:<extension>/<channel>` and a JSON payload carrying a version field (v1). The platform routes such requests to the owning Extension's handler instead of showing the default editor Modal. The handler's answer goes back as the dialog value (a JSON string), and a dismissal goes back as a cancelled response. Because the protocol never tells the client when Pi drops a dialog on its own, the platform closes pending dialogs on the owning tool call's `tool_execution_end`, on `agent_end`, and when the app sends `abort`.
- Other extension UI requests: `select`/`confirm`/`input`/`editor` (unreserved title) become Modals, `notify` becomes a Toast, `setStatus` feeds the status Module, `setTitle` sets the terminal title, `set_editor_text` sets the input's text. `setWidget` is accepted and stored but not shown in this version (column 2 is empty).
- Tool replacement: a Pi extension never registers a tool name another Pi extension may already have. On Pi-Bolt a duplicate name stops the Backend at startup (exit 1, ADR-0001), even though stock Pi lets the first registration win. To replace a tool, the Pi extension registers its own name and removes the old name from the active tools with `pi.setActiveTools()` if it is present. The old tool's prompt guidelines then leave the prompt too. Regular `pi` is unaffected, because the Pi extension loads only in `piu`.

### ask_user_question Extension

- Pi extension: registers the `ask_user` tool and deactivates an installed `ask_user_question` (see Tool replacement). It keeps the parameter shape the model already knows (1–4 questions, each with question text, short header, 2–4 options with label and optional description, `multiSelect`). In `piu` it sends all questions through one Extension-channel request and receives all answers in one JSON response. The response is turned into the tool result the model expects, and a cancellation becomes a "user declined" result.
- Module: invisible until a request arrives, then claims the input Panel exclusively and shows a question card. Tabs per question, options selectable by click or keys, multi-select toggles, a custom answer field, a review step with Submit, and dismiss. The input Module reappears when the card is gone.

### Rendering and animation

- Chat Markdown rendering is incremental: completed blocks are kept and only the trailing block(s) of a streaming message are re-rendered. Code-block highlighting is cached by language and text. This avoids the per-delta full re-lex that makes stock Pi's own TUI expensive.
- Animations in this version: working indicator, Modal and Toast enter and exit, tool-card and thinking expand and collapse, smooth Panel scrolling. All go through `animate`. With `animations: false` every animation jumps to its end state.

### Theme

- Semantic color tokens: text, muted, accent, success, warning, error, surface, border. Built-in light and dark themes are chosen by the terminal background. Token overrides come from config. Modules use only tokens.

### Tooling

- Tests on `bun test`. Typecheck with `tsc`. Lint and format with Biome. A git repository already exists (branch `main`).

## Testing Decisions

- A good test drives the app the way a user does (keys, mouse, terminal size, config file, the model's scripted replies) and checks what the user sees (the rendered frame text) or what Pi observably received (what reached the model, what a tool returned). Never assert on internal state, store shape or component structure. Delete any test that would still pass if the app rendered nothing.
- **Primary seam: the whole app against a real Backend with a scripted model.** The app boots in OpenTUI's `createTestRenderer` (fixed terminal size, `mockKeys`, `mockMouse`, captured frames). The Backend is a real `pi --mode rpc` from a pinned dev dependency (`@earendil-works/pi-coding-agent` 1.5.0). It is isolated from the developer's Pi setup with `PI_CODING_AGENT_DIR` pointing at a temp dir, plus `PI_OFFLINE=1` and `--no-session`. The model is the faux provider from `@earendil-works/pi-ai` (`fauxText`, `fauxThinking`, `fauxToolCall`, `setResponses`), registered by a test-only Pi extension passed with `-e`. Each test points `backend` in a fixture personal config at this setup, the same knob a user turns. No other injection point is introduced.
- To keep the suite fast, one Backend process is shared per test file and reset between tests with `new_session`.
- What the primary seam covers: Layout and breakpoint hiding, independent scrolling and wheel-under-pointer, config merge and validation errors, Extension discovery and name collisions, streaming chat with Markdown, thinking and tool cards, input with history, autocomplete, steer, follow-up and abort, every built-in command Modal, extension dialogs and Toasts, both halves of ask-user-question including channel round-trip, cancellation, replacing a test-installed `ask_user_question` (only ours active) and auto-closing of stale dialogs, Backend not-found, crash and restart (the faux extension can exit the process on cue).
- Tests run with `animations: false`. **Narrow seam for animation**: `animate` itself is tested on OpenTUI's controllable timeline. Intermediate frames must exist when enabled, and the end state must be immediate when disabled.
- **Manual Pi-Bolt check** (not in the regular suite, because not everyone has Pi-Bolt): a script that starts `pi-bolt --mode rpc` with the ask-user-question Pi extension and confirms that (a) our `ask_user` starts without a conflict and the compiled-in `ask_user_question` is inactive, and (b) the compiled-in Pi extensions that use Pi's own TUI API don't break or spam RPC mode.
- Prior art: none in this repo yet. Copy the patterns from OpenTUI's testing docs (`createTestRenderer`, `createMockMouse`) and Pi's checked examples: the RPC extension UI client example and the faux provider in `pi-ai`.

## Out of Scope

- Sandboxing the Backend with nono or nonopi, and the `piu` shell wrapper for it.
- Any Module in column 2: extension widgets, Pi-Bolt extension views, background processes, timer, context and token dashboard.
- Diff view for `edit`, images in messages, pasting images into the input.
- Subagent cards and live subagent streams (Pi-Bolt only).
- Replaceable per-message renderers (a second extension point for message types).
- Loading Extensions from anywhere other than `builtin/` and `extensions/`. No package distribution of Extensions.
- Reimplementing Pi's `/settings`, `/hotkeys`, `/login` and other built-in TUI commands not listed above.
- Pi extensions that need Pi's own TUI (`custom()`, `setFooter`, `setHeader`, `setEditorComponent`, autocomplete providers). They are no-ops over RPC.
- Publishing, licensing, release packaging.

## Further Notes

- Glossary terms used here are defined in the repo's `GLOSSARY.md` (Slot, Container, Panel, Layout, Placement, Modal, Config, Module, Extension, Pi extension, Backend, Toast). Use them as defined.
- ADR-0001 records why the Backend is an RPC subprocess rather than the in-process SDK, and what that costs.
- Ticket 02 settled the early risks. Pi-Bolt fails on a duplicate tool name (hence Tool replacement), and its compiled-in TUI-API Pi extensions are harmless in RPC mode. Still open: whether `pi.setActiveTools()` deactivates a compiled-in tool on Pi-Bolt as it does on stock Pi. Ticket 13 checks it.
- The first implementation ticket should be a walking skeleton: Bun app, Slot engine with config and validation, Backend lifecycle over RPC, chat as plain text, input sending prompts, all exercised through the primary test seam.
- The author's machine runs Pi through a `pi()` shell function (Pi-Bolt under nonopi). The test Backend must call the pinned dev-dependency `pi` binary directly, not the shell function.
