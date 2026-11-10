import { createSignal } from "solid-js";
import type { Extension, ModuleContext } from "../../src/module.ts";

function Prompt(props: { context: ModuleContext }) {
	const [text, setText] = createSignal("");
	return (
		<input
			focused
			value={text()}
			textColor={props.context.theme.text}
			onInput={setText}
			onSubmit={() => {
				const value = text();
				if (!value.trim()) return;
				setText("");
				void props.context.actions.prompt(value);
			}}
		/>
	);
}

export default {
	modules: [
		{ id: "prompt", render: (context) => <Prompt context={context} /> },
	],
} satisfies Extension;
