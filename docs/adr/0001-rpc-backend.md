# Pi runs as an RPC subprocess, not in-process through the SDK

The interface drives Pi as a child process (`<backend> --mode rpc`, through the exported `RpcClient`) instead of embedding it with `createAgentSession()` in the same Bun process. The main reason is isolation: heavy Pi work, such as re-parsing a large tool call's arguments on every delta (about 30 s of CPU for a 200 KB `write` on stock Pi, measured in `pi -p` with no TUI), would otherwise block the event loop that draws animations and handles clicks. A second reason is that `pi` and `pi-bolt` speak the same protocol, so the backend is a config value (`pi` in the repo default, `pi-bolt` locally). Pi-Bolt cannot host the interface itself, because OpenTUI needs `bun:ffi`, which its default JIT-off build does not support.

## Considered Options

- **SDK in-process under Bun**: full API access (`SettingsManager`, `SessionManager`, a complete `ExtensionUIContext`, including extension autocomplete providers and `getEditorText`), one process. Rejected for the event-loop sharing above, and because it rules out Pi-Bolt as the agent runtime.
- **Compile the interface into Pi-Bolt**: blocked by `bun:ffi`.

## Consequences

- Only what the RPC protocol exposes is available. Pi's built-in TUI commands (`/model`, `/tree`, `/resume`, …) must be rebuilt as our own Modals, and extension UI calls that need a real terminal (`custom()`, `setFooter`, `setEditorComponent`, autocomplete providers) are no-ops.
- An Extension's Pi extension is loaded into the backend with `-e <path>`. On stock Pi, CLI paths load first and the first registration of a tool name wins, so ours overrides an installed one with the same name. Pi-Bolt's order for compiled-in extensions is unverified.
- Extensions talk between their Pi extension and their Modules through the `editor` dialog of the RPC extension-UI protocol, which works on both backends. The protocol does not tell the client when Pi drops a dialog on its own, so the interface must close pending dialogs itself.
- Features that exist only in Pi-Bolt (subagent streams, extension views) are optional and turn on only when the backend accepts them.
