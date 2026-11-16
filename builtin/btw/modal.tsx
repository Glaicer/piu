import {
	type InputRenderable,
	type KeyEvent,
	type Renderable,
	ScrollBoxRenderable,
	type SyntaxStyle,
	TextAttributes,
} from "@opentui/core";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { BtwExchange, BtwPending } from "../../src/btw.ts";
import type { ModalRequest } from "../../src/modal.tsx";
import type { Module, ModuleContext } from "../../src/module.ts";
import type { Theme } from "../../src/theme.ts";
import { createSyntaxStyle, Markdown } from "../chat/markdown.tsx";

const PANEL = "btw-side";
const EMPTY_HINT =
	"Ask a side question. It sees the whole session and stays out of its context.";

type ScrollBridge = { node?: Renderable };

function scrollBoxOf(node: Renderable) {
	for (let next = node.parent; next; next = next.parent) {
		if (next instanceof ScrollBoxRenderable) return next;
	}
}

function Question(props: { text: string; theme: Theme }) {
	return (
		<box paddingX={1} marginTop={1}>
			<text fg={props.theme.accent} attributes={TextAttributes.BOLD}>
				{`> ${props.text}`}
			</text>
		</box>
	);
}

function Answer(props: {
	text: string;
	streaming: boolean;
	error?: string;
	syntaxStyle: SyntaxStyle;
	theme: Theme;
}) {
	return (
		<>
			<Show when={props.text}>
				<box paddingX={1} marginTop={1}>
					<Markdown
						text={props.text}
						streaming={props.streaming}
						syntaxStyle={props.syntaxStyle}
						theme={props.theme}
					/>
				</box>
			</Show>
			<Show when={props.error}>
				<box paddingX={1} marginTop={1}>
					<text fg={props.theme.error}>{props.error}</text>
				</box>
			</Show>
		</>
	);
}

function Transcript(props: { context: ModuleContext; scroll: ScrollBridge }) {
	const { context } = props;
	const side = () => context.pi.btw;
	const thread = (): readonly BtwExchange[] => side()?.thread ?? [];
	const pending = (): BtwPending | undefined => side()?.pending;
	const syntaxStyle = createMemo(() => {
		const style = createSyntaxStyle(context.theme);
		onCleanup(() => style.destroy());
		return style;
	});
	return (
		<box
			ref={(node: Renderable) => {
				props.scroll.node = node;
			}}
			flexDirection="column"
			paddingRight={1}
		>
			<For each={thread()}>
				{(exchange) => (
					<box flexDirection="column">
						<Question text={exchange.question} theme={context.theme} />
						<Answer
							text={exchange.answer}
							streaming={false}
							syntaxStyle={syntaxStyle()}
							theme={context.theme}
						/>
					</box>
				)}
			</For>
			{(() => {
				const current = pending();
				return (
					current && (
						<box flexDirection="column">
							<Question text={current.question} theme={context.theme} />
							<Answer
								text={current.text}
								streaming={side()?.streaming ?? false}
								error={current.error}
								syntaxStyle={syntaxStyle()}
								theme={context.theme}
							/>
						</box>
					)
				);
			})()}
			<Show when={thread().length === 0 && !pending()}>
				<box paddingX={1} marginTop={1}>
					<text fg={context.theme.muted}>{EMPTY_HINT}</text>
				</box>
			</Show>
		</box>
	);
}

// why: a ref runs before Solid attaches its element to the Panel, so the scrollbox is looked up on each key instead of once at creation.
function scrollKeys(event: KeyEvent, scroll: ScrollBridge) {
	const box = scroll.node && scrollBoxOf(scroll.node);
	if (!box) return false;
	if (event.ctrl && (event.name === "home" || event.name === "end")) {
		box.scrollTo(event.name === "end" ? Infinity : 0);
		return true;
	}
	if (
		event.name === "up" ||
		event.name === "down" ||
		event.name === "pageup" ||
		event.name === "pagedown"
	)
		return box.handleKeyPress(event);
	return false;
}

function Composer(props: { context: ModuleContext; scroll: ScrollBridge }) {
	const { context } = props;
	const [typed, setTyped] = createSignal("");
	let field: InputRenderable | undefined;
	const streaming = () => context.pi.btw?.streaming ?? false;
	const submit = () => {
		const question = typed().trim();
		const request = context.channel.requests[0];
		if (!question || streaming() || !request) return;
		context.channel.answer(request.id, { v: 1, question });
		setTyped("");
		if (field) field.value = "";
	};
	return (
		<box flexDirection="column" flexShrink={0} paddingTop={1}>
			<box flexDirection="row">
				<text fg={context.theme.signal} attributes={TextAttributes.BOLD}>
					{" › "}
				</text>
				<input
					ref={(element: InputRenderable) => {
						field = element;
					}}
					focused
					flexGrow={1}
					placeholder={streaming() ? "answering…" : "ask a side question"}
					textColor={context.theme.text}
					focusedTextColor={context.theme.text}
					cursorColor={context.theme.signal}
					cursorStyle={{ style: "block" }}
					backgroundColor={context.theme.surface}
					focusedBackgroundColor={context.theme.surface}
					placeholderColor={context.theme.faint}
					onInput={setTyped}
					onSubmit={() => submit()}
					onKeyDown={(event) => {
						if (!scrollKeys(event, props.scroll)) return;
						event.preventDefault();
					}}
				/>
			</box>
			<text fg={context.theme.faint} wrapMode="none" truncate>
				{streaming() ? " esc stop" : " ⏎ ask   esc close"}
			</text>
		</box>
	);
}

function transcriptModule(model: string, scroll: ScrollBridge): Module {
	return {
		id: "btw.transcript",
		title: model ? `btw · ${model}` : "btw",
		followsOutput: true,
		render: (context) => <Transcript context={context} scroll={scroll} />,
	};
}

function composerModule(scroll: ScrollBridge): Module {
	return {
		id: "btw.composer",
		footer: true,
		render: (context) => <Composer context={context} scroll={scroll} />,
	};
}

export function btwModal(
	model: string,
	onDismiss: NonNullable<ModalRequest["onDismiss"]>,
): ModalRequest {
	const scroll: ScrollBridge = {};
	return {
		slot: { kind: "panel", id: PANEL, direction: "column", size: "rest" },
		panels: new Map([
			[
				PANEL,
				[
					{
						id: "btw.transcript",
						module: transcriptModule(model, scroll),
						settings: {},
					},
					{
						id: "btw.composer",
						module: composerModule(scroll),
						settings: {},
					},
				],
			],
		]),
		width: "80%",
		height: "80%",
		onDismiss,
	};
}
