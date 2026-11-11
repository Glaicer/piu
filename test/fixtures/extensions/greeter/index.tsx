import type { Extension, ModuleContext } from "../../../../src/module.ts";

globalThis.piuTestHooks.loaded.push("greeter");

function Hello(props: { context: ModuleContext }) {
	return <text>{`Hello ${props.context.settings.name}`}</text>;
}

export default {
	modules: [
		{ id: "hello", render: (context) => <Hello context={context} /> },
		{ id: "bye", render: () => <text>Bye</text> },
	],
} satisfies Extension;
