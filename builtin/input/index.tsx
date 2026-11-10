import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import type { Extension, ModuleContext } from "../../src/module.ts";

const keyBindings = [
	{ name: "return", shift: true, action: "newline" as const },
];

function Prompt(props: { context: ModuleContext }) {
	let field: TextareaRenderable | undefined;
	const history: string[] = [];
	let recalled = 0;
	let draft = "";

	function show(text: string) {
		field?.setText(text);
		field?.gotoBufferEnd();
	}

	function take() {
		const value = field?.plainText ?? "";
		if (!value.trim()) return;
		if (history.at(-1) !== value) history.push(value);
		recalled = history.length;
		draft = "";
		field?.setText("");
		return value;
	}

	function walkHistory(event: KeyEvent, step: -1 | 1) {
		if (!field || event.shift || event.meta || event.ctrl) return;
		const edge = step < 0 ? 0 : field.virtualLineCount - 1;
		const next = recalled + step;
		if (field.visualCursor.visualRow !== edge) return;
		if (next < 0 || next > history.length) return;
		event.preventDefault();
		if (recalled === history.length) draft = field.plainText;
		recalled = next;
		show(history[recalled] ?? draft);
	}

	function onKeyDown(event: KeyEvent) {
		if (event.name === "escape" && props.context.pi.working) {
			event.preventDefault();
			void props.context.actions.abort();
		}
		if (event.name === "up") walkHistory(event, -1);
		if (event.name === "down") walkHistory(event, 1);
		if (event.name === "return" && !event.shift) {
			event.preventDefault();
			const value = take();
			if (value === undefined) return;
			const { actions, pi } = props.context;
			if (event.meta) void actions.followUp(value);
			else if (pi.working) void actions.steer(value);
			else void actions.prompt(value);
		}
	}

	return (
		<box flexDirection="column">
			<text fg={props.context.theme.muted}>
				{props.context.pi.working ? "Working…" : " "}
			</text>
			<textarea
				ref={(element: TextareaRenderable) => {
					field = element;
				}}
				focused
				textColor={props.context.theme.text}
				keyBindings={keyBindings}
				onKeyDown={onKeyDown}
			/>
		</box>
	);
}

export default {
	modules: [
		{ id: "prompt", render: (context) => <Prompt context={context} /> },
	],
} satisfies Extension;
