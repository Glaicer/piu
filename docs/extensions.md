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
