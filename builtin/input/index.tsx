import {
	type BoxRenderable,
	CliRenderEvents,
	type KeyEvent,
	RenderableEvents,
	ScrollBarRenderable,
	TextAttributes,
	type TextareaRenderable,
} from "@opentui/core";
import { Portal, useRenderer } from "@opentui/solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	onCleanup,
	Show,
} from "solid-js";
import { paintCard } from "../../src/card.ts";
import { defaultConfig } from "../../src/config.ts";
import { formatChord, matches, parseChord } from "../../src/keybindings.ts";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { type Entry, findTrigger, narrow } from "./autocomplete.ts";
import { Directory } from "./dir.tsx";
import { listFiles } from "./files.ts";

const MAX_LIST_ROWS = 8;
const MIN_LINES = 4;
const MAX_LINES = 16;

export const promptFieldId = "input.prompt.field";

const keyBindings = [
	{ name: "return", shift: true, action: "newline" as const },
];
const shiftEnter = { name: "return", ctrl: false, shift: true, meta: false };
const defaultNewline = parseChord(
	defaultConfig.keybindings["input.newline"] ?? "",
);

function Prompt(props: { context: ModuleContext }) {
	let field: TextareaRenderable | undefined;
	const history: string[] = [];
	let recalled = 0;

	const renderer = useRenderer();
	let syncingScrollbar = false;
	const scrollbar = new ScrollBarRenderable(renderer, {
		orientation: "vertical",
		width: 1,
		height: "100%",
		onChange: (position) => {
			if (!field || field.isDestroyed || syncingScrollbar) return;
			const viewport = field.editorView.getViewport();
			field.editorView.setViewport(
				viewport.offsetX,
				position,
				viewport.width,
				viewport.height,
				true,
			);
			field.requestRender();
			sync();
		},
	});
	scrollbar.focusable = false;
	const [focused, setFocused] = createSignal(true);
	// why: Shift+Enter is the textarea's own newline key and the default ctrl+j is only the fallback for terminals without the kitty protocol, so the hint names Shift+Enter unless the user has chosen another input.newline.
	const newlineKey = () => {
		const bound = props.context.keybindings["input.newline"];
		const remapped =
			bound !== undefined &&
			defaultNewline !== undefined &&
			formatChord(bound) !== formatChord(defaultNewline);
		return formatChord(remapped ? bound : shiftEnter);
	};
	const keyHints = () =>
		props.context.pi.working
			? "esc stop   alt+⏎ queue"
			: `⏎ send   ${newlineKey()} new line`;
	const [before, setBefore] = createSignal("");
	const [lineCount, setLineCount] = createSignal(1);
	const height = () => Math.max(MIN_LINES, Math.min(MAX_LINES, lineCount()));
	const [anchor, setAnchor] = createSignal(
		{ left: 0, top: 0, width: 0 },
		{
			equals: (a, b) =>
				a.left === b.left && a.top === b.top && a.width === b.width,
		},
	);
	const [editorRow, setEditorRow] = createSignal<BoxRenderable>();
	createEffect(() => {
		const row = editorRow();
		if (!row) return;
		row.height = height();
		// why: every numeric height write resets flexShrink to 0 in OpenTUI 0.8.3, so restore it after each growth to keep short terminals usable.
		row.flexShrink = 1;
	});
	createEffect(() => {
		scrollbar.trackOptions = {
			foregroundColor: props.context.theme.muted,
			backgroundColor: "transparent",
		};
	});
	// why: native layout updates the editor viewport after onSizeChange, so the scrollbar follows the completed frame rather than the previous viewport.
	const syncViewport = () => {
		if (!field || field.isDestroyed) return;
		const viewport = field.editorView.getViewport();
		const total = field.editorView.getTotalVirtualLineCount();
		setLineCount(total);
		setAnchor({ left: field.screenX, top: field.screenY, width: field.width });
		// why: OpenTUI fires onChange while range setters clamp the thumb too; mirroring native state must not move the editor's caret.
		syncingScrollbar = true;
		scrollbar.scrollSize = total;
		scrollbar.viewportSize = viewport.height;
		scrollbar.scrollPosition = viewport.offsetY;
		syncingScrollbar = false;
	};
	renderer.on(CliRenderEvents.FRAME, syncViewport);
	onCleanup(() => renderer.off(CliRenderEvents.FRAME, syncViewport));
	const [selected, setSelected] = createSignal(0);
	const [windowStart, setWindowStart] = createSignal(0);
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
		const app = new Map(
			props.context.commands.map((command) => [command.name, command] as const),
		);
		const commands = [
			...app.values(),
			...props.context.pi.commands.filter((command) => !app.has(command.name)),
		];
		// why: get_commands reports no argument hint, so only an app command can be known to take none.
		return narrow(commands, current.query, (command) => command.name).map(
			(command) => ({
				label: `/${command.name}`,
				detail: command.description,
				insert: `/${command.name} `,
				command: app.get(command.name),
			}),
		);
	});
	const open = () => !dismissed() && entries().length > 0;
	props.context.holdFocusKeys(open);
	createEffect(
		on(
			() => trigger()?.query,
			() => {
				setSelected(0);
				setWindowStart(0);
			},
		),
	);
	createEffect(() => {
		if (!trigger()) setDismissed(false);
	});
	// why: the window start is its own signal, so hovering a row that is already on screen selects it in place; deriving it from the selection would scroll the list under the pointer.
	const firstShown = () =>
		Math.min(windowStart(), Math.max(0, entries().length - MAX_LIST_ROWS));
	const shown = () =>
		entries().slice(firstShown(), firstShown() + MAX_LIST_ROWS);

	function reveal(at: number) {
		const start = firstShown();
		if (at < start) setWindowStart(at);
		else if (at >= start + MAX_LIST_ROWS) {
			setWindowStart(at - MAX_LIST_ROWS + 1);
		}
	}

	function sync() {
		if (field && field.plainText !== history[recalled])
			recalled = history.length;
		setBefore(field?.getTextRange(0, field.cursorOffset) ?? "");
	}

	function accept(entry: Entry) {
		const current = trigger();
		if (!field || !current) return;
		const typed = `${current.kind === "slash" ? "/" : "@"}${current.query}`;
		const command = entry.command;
		if (command?.takesArguments === false && field.plainText === typed) {
			field.setText("");
			// why: history should recall the command the list completed, not the prefix that found it.
			remember(`/${command.name}`);
			command.run();
			return;
		}
		const tail = /^\S*/.exec(field.plainText.slice(before().length))?.[0] ?? "";
		for (const _ of new Intl.Segmenter().segment(tail)) field.deleteChar();
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
			const next = Math.max(0, Math.min(list.length - 1, selected() + step));
			setSelected(next);
			reveal(next);
		} else if (
			event.name === "tab" ||
			(event.name === "return" && !event.shift && !event.meta)
		) {
			const entry = list[selected()];
			if (!entry) return;
			const typed = before();
			if (
				event.name === "return" &&
				entry.label.toLowerCase() === typed.toLowerCase()
			) {
				return;
			}
			event.preventDefault();
			accept(entry);
		}
	}

	function show(text: string) {
		field?.setText(text);
		field?.gotoBufferEnd();
	}

	createEffect(
		on(
			() => props.context.pi.editorText.seq,
			() => show(props.context.pi.editorText.text),
			{ defer: true },
		),
	);

	function restore(queued: readonly string[]) {
		if (!field || queued.length === 0) return;
		show([...queued, field.plainText].filter(Boolean).join("\n\n"));
	}

	function remember(text: string) {
		if (history.at(-1) !== text) history.push(text);
		recalled = history.length;
	}

	function take() {
		const value = field?.plainText ?? "";
		if (!value.trim()) return;
		remember(value);
		field?.setText("");
		return value;
	}

	function walkHistory(event: KeyEvent, step: -1 | 1) {
		if (!field || event.shift || event.meta || event.ctrl) return;
		if (field.plainText && field.plainText !== history[recalled]) return;
		if (field.editorView.getTotalVirtualLineCount() > 1) return;
		const next = recalled + step;
		if (next < 0 || next > history.length) return;
		event.preventDefault();
		recalled = next;
		show(history[recalled] ?? "");
	}

	function onKeyDown(event: KeyEvent) {
		if (event.name === "up" || event.name === "down") queueMicrotask(sync);
		const newline = props.context.keybindings["input.newline"];
		const bound = newline !== undefined && matches(newline, event);
		// why: the textarea itself turns a bare line feed (Ctrl+J without the kitty protocol) into a newline, so a remapped key has to swallow it.
		if (bound || event.name === "linefeed") {
			event.preventDefault();
			if (bound) field?.newLine();
			return;
		}
		if (open()) {
			routeList(event);
			if (event.defaultPrevented) return;
		}
		if (event.name === "escape" && props.context.pi.working) {
			event.preventDefault();
			void props.context.actions.abort().then(restore);
		}
		if (event.name === "up") walkHistory(event, -1);
		if (event.name === "down") walkHistory(event, 1);
		if (event.name === "return" && !event.shift) {
			event.preventDefault();
			const value = take();
			if (value === undefined) return;
			const { actions, pi } = props.context;
			const [, name = "", args = ""] =
				/^\/(\S+)(?:\s+([\s\S]*))?$/.exec(value.trim()) ?? [];
			const command = props.context.commands.find(
				(c) => c.name.toLowerCase() === name.toLowerCase(),
			);
			if (command) {
				command.run(args);
				return;
			}
			const accepted = event.meta
				? actions.followUp(value)
				: pi.working
					? actions.steer(value)
					: actions.prompt(value);
			void accepted.then((ok) => {
				if (!ok) restore([value]);
			});
		}
	}

	return (
		<box flexDirection="column" paddingTop={1}>
			<box ref={setEditorRow} flexDirection="row" minHeight={MIN_LINES}>
				<text
					width={2}
					flexShrink={0}
					fg={
						focused() ? props.context.theme.signal : props.context.theme.faint
					}
					attributes={TextAttributes.BOLD}
				>
					›
				</text>
				<textarea
					ref={(element: TextareaRenderable) => {
						field = element;
						setFocused(element.focused);
						element.on(RenderableEvents.FOCUSED, () => setFocused(true));
						element.on(RenderableEvents.BLURRED, () => setFocused(false));
					}}
					id={promptFieldId}
					focused
					height="100%"
					flexGrow={1}
					textColor={props.context.theme.text}
					cursorColor={props.context.theme.signal}
					cursorStyle={{ style: "block" }}
					focusedTextColor={props.context.theme.text}
					backgroundColor="transparent"
					focusedBackgroundColor="transparent"
					keyBindings={keyBindings}
					onKeyDown={onKeyDown}
					onContentChange={sync}
					onCursorChange={sync}
					onSizeChange={sync}
					onMouseScroll={sync}
				/>
				<box
					width={1}
					height="100%"
					ref={(node) => {
						node.add(scrollbar);
					}}
				/>
			</box>
			<box flexDirection="row" flexShrink={0} paddingLeft={2}>
				<text flexShrink={0} wrapMode="none" fg={props.context.theme.faint}>
					{"/ commands   @ files"}
				</text>
				<box
					flexGrow={1}
					flexShrink={1}
					flexDirection="row"
					justifyContent="flex-end"
					marginLeft={3}
				>
					<text
						flexShrink={1}
						wrapMode="none"
						truncate
						fg={props.context.theme.faint}
					>
						{keyHints()}
					</text>
				</box>
			</box>
			<Show when={open()}>
				<Portal
					mount={renderer.root}
					ref={(container) => {
						Object.assign(container, { position: "absolute", left: 0, top: 0 });
					}}
				>
					{/* why: the list spans the input Panel's frame (the padding and prompt mark left of the field, scrollbar and edge right of it) and ends above the heavy line, which sits a blank row above the field. */}
					<box
						position="absolute"
						left={anchor().left - 4}
						top={Math.max(0, anchor().top - shown().length - 4)}
						width={anchor().width + 6}
						height={shown().length + 2}
						zIndex={50}
						flexDirection="column"
						padding={1}
						renderBefore={paintCard(() => ({
							fill: props.context.theme.raised,
							edge: props.context.theme.border,
						}))}
					>
						<For each={shown()}>
							{(entry, at) => (
								<box
									flexDirection="row"
									height={1}
									backgroundColor={
										firstShown() + at() === selected()
											? props.context.theme.selection
											: undefined
									}
									// why: OpenTUI sends `over` to whatever lands under a resting pointer after each frame, which would select a row the user never pointed at.
									onMouseMove={() => setSelected(firstShown() + at())}
									onMouseDown={(event) => {
										event.preventDefault();
										accept(entry);
									}}
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
		{
			id: "prompt",
			minHeight: MIN_LINES + 2,
			render: (context) => <Prompt context={context} />,
		},
		{
			id: "dir",
			minHeight: 1,
			grow: true,
			render: (context) => <Directory context={context} />,
		},
	],
} satisfies Extension;
