import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { Portal, useRenderer } from "@opentui/solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { type Entry, findTrigger, narrow } from "./autocomplete.ts";
import { listFiles } from "./files.ts";

const MAX_LIST_ROWS = 8;

const keyBindings = [
	{ name: "return", shift: true, action: "newline" as const },
];

function Prompt(props: { context: ModuleContext }) {
	let field: TextareaRenderable | undefined;
	const history: string[] = [];
	let recalled = 0;
	let draft = "";

	const renderer = useRenderer();
	const [before, setBefore] = createSignal("");
	const [selected, setSelected] = createSignal(0);
	const [dismissed, setDismissed] = createSignal(false);
	const trigger = createMemo(() => findTrigger(before()));
	const [files, setFiles] = createSignal<readonly string[]>([]);
	const searching = () => trigger()?.kind === "file";
	createEffect(
		on(searching, (active) => {
			if (!active) return;
			void listFiles(props.context.cwd).then(setFiles);
		}),
	);
	const entries = createMemo((): Entry[] => {
		const current = trigger();
		if (current?.kind === "file") {
			return narrow(files(), current.query, (path) => path).map((path) => ({
				label: `@${path}`,
				insert: `@${path} `,
			}));
		}
		if (current?.kind !== "slash") return [];
		const own = new Set(props.context.commands.map((c) => c.name));
		const commands = [
			...props.context.commands,
			...props.context.pi.commands.filter((c) => !own.has(c.name)),
		];
		return narrow(commands, current.query, (command) => command.name).map(
			(command) => ({
				label: `/${command.name}`,
				detail: command.description,
				insert: `/${command.name} `,
			}),
		);
	});
	const open = () => !dismissed() && entries().length > 0;
	createEffect(
		on(
			() => trigger()?.query,
			() => setSelected(0),
		),
	);
	createEffect(() => {
		if (!trigger()) setDismissed(false);
	});
	const firstShown = () => Math.max(0, selected() - MAX_LIST_ROWS + 1);
	const shown = () =>
		entries().slice(firstShown(), firstShown() + MAX_LIST_ROWS);

	function sync() {
		setBefore(field?.getTextRange(0, field.cursorOffset) ?? "");
	}

	function accept(entry: Entry) {
		const current = trigger();
		if (!field || !current) return;
		const typed = `${current.kind === "slash" ? "/" : "@"}${current.query}`;
		for (const _ of new Intl.Segmenter().segment(typed)) {
			field.deleteCharBackward();
		}
		field.insertText(entry.insert);
		sync();
	}

	function routeList(event: KeyEvent) {
		const list = entries();
		if (event.name === "escape") {
			event.preventDefault();
			setDismissed(true);
		} else if (event.name === "up" || event.name === "down") {
			event.preventDefault();
			const step = event.name === "up" ? -1 : 1;
			setSelected((at) => Math.max(0, Math.min(list.length - 1, at + step)));
		} else if (
			event.name === "tab" ||
			(event.name === "return" && !event.shift && !event.meta)
		) {
			const entry = list[selected()];
			if (!entry) return;
			const typed = before();
			if (event.name === "return" && entry.label === typed) return;
			event.preventDefault();
			accept(entry);
		}
	}

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
		if (open()) {
			routeList(event);
			if (event.defaultPrevented) return;
		}
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
			const command = props.context.commands.find(
				(c) => `/${c.name}` === value.trim(),
			);
			if (command) command.run();
			else if (event.meta) void actions.followUp(value);
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
				onContentChange={sync}
				onCursorChange={sync}
			/>
			<Show when={open()}>
				<Portal
					mount={renderer.root}
					ref={(container) => {
						Object.assign(container, { position: "absolute", left: 0, top: 0 });
					}}
				>
					<box
						position="absolute"
						left={field?.screenX}
						top={Math.max(0, (field?.screenY ?? 0) - shown().length)}
						width={field?.width}
						height={shown().length}
						zIndex={50}
						flexDirection="column"
						backgroundColor={props.context.theme.surface}
					>
						<For each={shown()}>
							{(entry, at) => (
								<box
									flexDirection="row"
									height={1}
									backgroundColor={
										firstShown() + at() === selected()
											? props.context.theme.border
											: undefined
									}
								>
									<text
										flexShrink={0}
										wrapMode="none"
										fg={props.context.theme.accent}
									>{` ${entry.label}`}</text>
									<text
										flexShrink={1}
										wrapMode="none"
										truncate
										fg={props.context.theme.muted}
									>
										{entry.detail ? `  ${entry.detail}` : ""}
									</text>
								</box>
							)}
						</For>
					</box>
				</Portal>
			</Show>
		</box>
	);
}

export default {
	modules: [
		{ id: "prompt", render: (context) => <Prompt context={context} /> },
	],
} satisfies Extension;
