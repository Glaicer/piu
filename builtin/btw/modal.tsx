import {
	type InputRenderable,
	type Renderable,
	type SyntaxStyle,
	TextAttributes,
} from "@opentui/core";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
} from "solid-js";
import type { Animate } from "../../src/animate.ts";
import type { BtwExchange, BtwPending } from "../../src/btw.ts";
import type { ModalRequest } from "../../src/modal.tsx";
import type { Module, ModuleContext } from "../../src/module.ts";
import { scrollKeys } from "../../src/scroll.ts";
import type { Theme } from "../../src/theme.ts";
import { createSyntaxStyle, Markdown } from "../chat/markdown.tsx";
import { createSelection, type Selection } from "../chat/selection.ts";
import { Thinking } from "../chat/thinking.tsx";

const PANEL = "btw-side";
const TRANSCRIPT = "btw.transcript";
const COMPOSER = "btw.composer";
const DOTS = 3;
const DOTS_CYCLE_MS = 1500;
const DOTS_FPS = 2;
const EMPTY_HINT =
	"Ask a side question. It sees the whole session and stays out of its context.";

type ScrollBridge = { node?: Renderable };

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
	thinking: string;
	text: string;
	streaming: boolean;
	error?: string;
	syntaxStyle: SyntaxStyle;
	theme: Theme;
	animate: Animate;
	selection: Selection;
}) {
	return (
		<>
			<Show when={props.thinking}>
				<Thinking
					text={props.thinking}
					animate={props.animate}
					selection={props.selection}
					theme={props.theme}
				/>
			</Show>
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
	const selection = createSelection();
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
							thinking={exchange.thinking}
							text={exchange.answer}
							streaming={false}
							syntaxStyle={syntaxStyle()}
							theme={context.theme}
							animate={context.animate}
							selection={selection}
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
								thinking={current.thinking}
								text={current.text}
								streaming={side()?.streaming ?? false}
								error={current.error}
								syntaxStyle={syntaxStyle()}
								theme={context.theme}
								animate={context.animate}
								selection={selection}
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

function Composer(props: { context: ModuleContext; scroll: ScrollBridge }) {
	const { context } = props;
	const [typed, setTyped] = createSignal("");
	let field: InputRenderable | undefined;
	const streaming = () => context.pi.btw?.streaming ?? false;
	const [dots, setDots] = createSignal(DOTS);
	// why: with animations off a loop never runs, so the placeholder keeps all its dots instead of freezing on one.
	createEffect(() => {
		if (!streaming()) return;
		const stop = context.animate({
			from: 0,
			to: DOTS,
			duration: DOTS_CYCLE_MS,
			loop: true,
			frameRate: DOTS_FPS,
			onUpdate: (value) => setDots((Math.floor(value) % DOTS) + 1),
		});
		onCleanup(() => {
			stop();
			setDots(DOTS);
		});
	});
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
					placeholder={
						streaming()
							? `answering${".".repeat(dots())}`
							: "ask a side question"
					}
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
						if (!scrollKeys(event, props.scroll.node)) return;
						event.preventDefault();
					}}
				/>
			</box>
			<box flexDirection="row" justifyContent="flex-end">
				<text fg={context.theme.faint} wrapMode="none" truncate>
					{streaming() ? "esc stop" : "⏎ ask   esc close"}
				</text>
			</box>
		</box>
	);
}

function transcriptModule(model: string, scroll: ScrollBridge): Module {
	return {
		id: TRANSCRIPT,
		title: model ? `btw · ${model}` : "btw",
		followsOutput: true,
		render: (context) => <Transcript context={context} scroll={scroll} />,
	};
}

function composerModule(scroll: ScrollBridge): Module {
	return {
		id: COMPOSER,
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
						id: TRANSCRIPT,
						module: transcriptModule(model, scroll),
						settings: {},
					},
					{
						id: COMPOSER,
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
