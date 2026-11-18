# Personal Extensions

Personal Extensions live in `~/.piu/extensions/`, outside the repo, so updating `piu` never touches your code and you don't need a clone. `PIU_HOME` replaces `~/.piu`. Each subfolder is one Extension, discovered the same way as the ones in `builtin/`. A folder name that also exists in `builtin/` stops startup with an error naming both paths.

## Writing one

Create `~/.piu/extensions/<name>/index.tsx` with a default export listing the Modules:

```tsx
import type {
	Extension,
	ModuleContext,
} from "<path to your clone>/src/module.ts";

function Hello(props: { context: ModuleContext }) {
	return <text>{`Hello ${props.context.settings.name}`}</text>;
}

export default {
	modules: [{ id: "hello", render: (context) => <Hello context={context} /> }],
} satisfies Extension;
```

An Extension can also export `commands: [{ name, description, takesArguments, run(context, args) }]`. They appear in the prompt's `/` autocomplete and run locally instead of going to the model, and they exist exactly when the Extension is enabled. Picking one with Enter or Tab runs it at once when it takes no arguments (`takesArguments: false`) and the input holds nothing but that command; otherwise it is inserted as `/name ` for the user to finish. A command takes arguments unless it says otherwise, and a Backend command always does, because `get_commands` does not report whether it takes any. A command name must be unique across Extensions, and it hides a Backend command of the same name.

An Extension can declare keys of its own with `keybindingActions` on the same default export:

```tsx
keybindingActions: [
	{
		name: "next-mode",
		description: "Switch to the next mode",
		defaultBindings: ["alt+m"],
		run: (context) => context.actions.showToast("Next mode"),
	},
],
```

The full name of the action is `<extension>.<name>`, so this one is `modes.next-mode`. Its `defaultBindings` apply while the Extension is enabled, which is exactly while one of its Modules is in the Placement. Assign it in your personal `~/.piu/config.json` like any built-in action:

```json
{
	"keybindings": {
		"modes.next-mode": "alt+n"
	}
}
```

A value is one shortcut string or an array of them: `"ctrl+l"`, `["ctrl+l", "ctrl+x m"]`, or `[]`. An array replaces the default bindings, and `[]` removes them all. A shortcut is one key with modifiers or a sequence of two keys separated by a space, such as `"ctrl+x m"`; three or more keys are a startup error. `run` receives the same context as a command.

Piu's own defaults are assigned first, then the defaults of enabled Extensions in the order they loaded, then the personal Config in key order. When two actions claim the same shortcut, the later assignment wins and the earlier action keeps its other shortcuts; a single key and a sequence that starts with it conflict the same way. This is not a startup error. Commands stay addressable as `command.<name>`, and a command declared by an Extension has no default bindings.

Shift+Enter is the input's fixed newline key. It cannot be assigned to any action except `input.newline`, neither alone nor as a stroke in a sequence, and it cannot start a sequence even for `input.newline`. `input.newline` may add shortcuts, and `[]` removes them all while Shift+Enter keeps inserting a newline.

An Extension can add pages to `/settings` with `settingsTabs` on the same default export:

```tsx
settingsTabs: [
	{ title: "Greeter", render: ({ theme }) => <text fg={theme.text}>Hello</text> },
],
```

Tabs appear after the built-in tabs, in Extension load order, only while the Extension is enabled. `render` receives the same `CommandContext` as an Extension command. The Modal scrolls the page and mounts only the selected tab, so keep any state that should survive switching tabs outside the page. Use Ctrl+PgUp/PgDn to switch tabs or Shift+wheel over the strip to reveal more tabs.

An Extension can carry a Pi extension as `pi-extension.ts` in its folder. Whenever the Extension is enabled, the app passes it to the Backend with `-e`. It runs inside Pi, so it imports only types and code that doesn't need Solid. It never registers a tool name another Pi extension may already have (see ADR-0001). To talk to its Modules it calls `ctx.ui.editor("opentui:<name>/<channel>", JSON.stringify({ v: 1, ... }))` for a channel the Extension lists in `channels: [...]`. That request never opens a Modal: it appears in `context.channel.requests` of the Extension's Modules, and `context.channel.answer(id, value)` returns `JSON.stringify(value)` to the editor call, while `cancel(id)` makes it return `undefined`. A request for an undeclared channel, or whose payload isn't JSON with `v: 1`, is cancelled at once. `builtin/ask-user-question` is the example.

The `import type` line only gives your editor the types and is erased at run time, so it can point anywhere or be left out. At run time your imports of `solid-js`, `solid-js/store` and `@opentui/*` resolve to the app's own copies, although the folder has no `node_modules`; this is what keeps your signals reactive in the app's renderer. Any other npm package your Extension needs goes in the Extension's own folder (`~/.piu/extensions/<name>/package.json` and `node_modules`). The app's internals (`src/`) are not importable once `piu` is a compiled binary, so use only what the Module context gives you.

A Module is addressed as `<name>.<module id>`, here `greeter.hello` if the folder is `greeter`. Read colors from `context.theme`, Pi's live state from `context.pi`, and register timers or subscriptions with `context.onCleanup`.

## Enabling it

An Extension is enabled exactly when one of its Modules is in the Placement, and its code is not loaded otherwise. Put it in your personal `~/.piu/config.json`:

```json
{
	"placement": { "side": ["greeter.hello"] },
	"modules": { "greeter.hello": { "name": "Ada" } }
}
```

`modules["<name>.<module id>"]` holds that Module's settings, which arrive as `context.settings`. A key there that is not in the Placement is a startup error.
