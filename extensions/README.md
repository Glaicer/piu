# Personal Extensions

Everything in this folder except this README is git-ignored, so `git pull` never touches your code. Each subfolder is one Extension, discovered the same way as the ones in `builtin/`. A folder name that also exists in `builtin/` stops startup with an error naming both paths.

## Writing one

Create `extensions/<name>/index.tsx` with a default export listing the Modules:

```tsx
import type { Extension, ModuleContext } from "../../src/module.ts";

function Hello(props: { context: ModuleContext }) {
	return <text>{`Hello ${props.context.settings.name}`}</text>;
}

export default {
	modules: [{ id: "hello", render: (context) => <Hello context={context} /> }],
} satisfies Extension;
```

An Extension can also export `commands: [{ name, description, run(context) }]`. They appear in the prompt's `/` autocomplete and run locally instead of going to the model, and they exist exactly when the Extension is enabled. A command name must be unique across Extensions, and it hides a Backend command of the same name.

A Module is addressed as `<name>.<module id>`, here `greeter.hello` if the folder is `greeter`. Read colors from `context.theme`, Pi's live state from `context.pi`, and register timers or subscriptions with `context.onCleanup`.

## Enabling it

An Extension is enabled exactly when one of its Modules is in the Placement, and its code is not loaded otherwise. Put it in your personal `config.json` at the repo root:

```json
{
	"placement": { "side": ["greeter.hello"] },
	"modules": { "greeter.hello": { "name": "Ada" } }
}
```

`modules["<name>.<module id>"]` holds that Module's settings, which arrive as `context.settings`. A key there that is not in the Placement is a startup error.
