import type { BoxRenderable, InputRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	onCleanup,
	untrack,
} from "solid-js";
import type { ModuleContext } from "../../src/module.ts";
import type { Question, Reply } from "./protocol.ts";

type Answer = { readonly labels: readonly string[]; readonly custom: string };

const empty: Answer = { labels: [], custom: "" };

const answered = (answer: Answer) =>
	answer.custom !== "" || answer.labels.length > 0;

const summary = (answer: Answer) =>
	answer.custom !== ""
		? answer.custom
		: answer.labels.length > 0
			? answer.labels.join(", ")
			: "(not answered)";

export function Card(props: {
	context: ModuleContext;
	id: string;
	questions: readonly Question[];
}) {
	const { context, id, questions } = props;
	const { theme } = context;
	const renderer = useRenderer();
	const previous = renderer.currentFocusedRenderable;
	onCleanup(() => {
		if (previous && !previous.isDestroyed) previous.focus();
	});

	const several = questions.length > 1;
	const review = questions.length;
	const [tab, setTab] = createSignal(0);
	const [row, setRow] = createSignal(0);
	const [editing, setEditing] = createSignal(false);
	const [answers, setAnswers] = createSignal<readonly Answer[]>(
		questions.map(() => empty),
	);
	let field: InputRenderable | undefined;

	const question = createMemo(() => questions[tab()]);
	const customRow = createMemo(() => question()?.options.length ?? 0);
	const typing = createMemo(() => tab() < review && row() === customRow());

	const dismiss = () => context.channel.cancel(id);
	const submit = () =>
		context.channel.answer(id, {
			answers: answers().map((a) =>
				a.custom !== "" ? [a.custom] : [...a.labels],
			),
		} satisfies Reply);
	const update = (at: number, answer: Answer) =>
		setAnswers((all) => all.map((a, i) => (i === at ? answer : a)));

	const goTo = (next: number) => {
		const at = Math.max(0, Math.min(several ? review : 0, next));
		setEditing(false);
		setTab(at);
		setRow(0);
	};
	const edit = (at: number) => {
		goTo(at);
		setEditing(true);
	};
	const advance = () =>
		!several ? submit() : goTo(editing() ? review : tab() + 1);

	const choose = (at: number, option: string) => {
		const current = questions[at];
		const answer = answers()[at] ?? empty;
		field?.setText("");
		if (!current?.multiSelect) {
			update(at, { labels: [option], custom: "" });
			return;
		}
		const labels = answer.custom !== "" ? [] : answer.labels;
		update(at, {
			labels: labels.includes(option)
				? labels.filter((label) => label !== option)
				: current.options
						.map((o) => o.label)
						.filter((label) => label === option || labels.includes(label)),
			custom: "",
		});
	};
	const select = (at: number, option: string) => {
		choose(at, option);
		if (!questions[at]?.multiSelect) advance();
	};

	const lastRow = () => (tab() === review ? review : customRow());
	const move = (step: number) =>
		setRow((at) => Math.max(0, Math.min(lastRow(), at + step)));

	const onKeyDown = (event: { name: string; preventDefault(): void }) => {
		const { name } = event;
		if (name === "escape") dismiss();
		else if (name === "up") move(-1);
		else if (name === "down") move(1);
		else if (!typing() && name === "left") goTo(tab() - 1);
		else if (!typing() && name === "right") goTo(tab() + 1);
		else if (tab() === review) {
			if (name === "return") {
				if (row() < review) edit(row());
				else submit();
			}
		} else if (name === "space" && !typing()) {
			const option = question()?.options[row()];
			if (option) choose(tab(), option.label);
		} else if (name === "return") {
			const option = question()?.options[row()];
			if (option && !question()?.multiSelect) select(tab(), option.label);
			else if (option || answers()[tab()]?.custom) advance();
		} else return;
		event.preventDefault();
	};

	const marker = (at: number, label: string) => {
		const picked =
			answers()[at]?.custom === "" && answers()[at]?.labels.includes(label);
		return questions[at]?.multiSelect
			? picked
				? "[x]"
				: "[ ]"
			: picked
				? "(x)"
				: "( )";
	};

	const customMarker = () => {
		const [open, close] = question()?.multiSelect ? "[]" : "()";
		return `${open}${answers()[tab()]?.custom ? "x" : " "}${close}`;
	};

	// why: the card sits in a Panel that shrinks when the terminal is short, so the rows live in a clipped box and the selected one is scrolled into view by hand; a scrollbox collapses to nothing inside a Panel sized to its content.
	const rows = new Map<number, BoxRenderable>();
	const [visibleRows, setVisibleRows] = createSignal(Number.POSITIVE_INFINITY);
	const [scrolled, setScrolled] = createSignal(0);
	const [layoutPasses, setLayoutPasses] = createSignal(0);
	let content: BoxRenderable | undefined;
	// why: OpenTUI calls onSizeChange before the rows inside have their final layout, so the scroll position is worked out once the layout pass is over.
	const reveal = () => {
		const element = rows.get(row());
		const visible = visibleRows();
		if (!element || !content || visible <= 0) return;
		const y = element.screenY - content.screenY;
		const top = row() === 0 ? 0 : y;
		const bottom = y + element.height;
		const last = Math.max(0, content.height - visible);
		setScrolled((offset) =>
			Math.min(
				last,
				top < offset
					? top
					: bottom > offset + visible
						? bottom - visible
						: offset,
			),
		);
	};
	createEffect(
		on([tab, row, visibleRows, layoutPasses], () => queueMicrotask(reveal)),
	);
	createEffect(on(tab, () => setScrolled(0), { defer: true }));

	const line = (at: number, selected: () => boolean, children: unknown) => (
		<box
			ref={(element: BoxRenderable) => {
				rows.set(at, element);
				element.onSizeChange = () => setLayoutPasses((count) => count + 1);
				onCleanup(() => {
					if (rows.get(at) === element) rows.delete(at);
				});
			}}
			flexDirection="row"
			backgroundColor={selected() ? theme.border : undefined}
		>
			<text fg={theme.accent}>{selected() ? " ▸" : "  "}</text>
			{children}
		</box>
	);

	return (
		<box
			flexDirection="column"
			focusable
			focused={!typing()}
			onKeyDown={onKeyDown}
		>
			<box
				flexShrink={1}
				overflow="hidden"
				onSizeChange={function (this: BoxRenderable) {
					setVisibleRows(this.height);
				}}
			>
				<box
					flexShrink={0}
					onSizeChange={() => setLayoutPasses((count) => count + 1)}
					ref={(element: BoxRenderable) => {
						content = element;
						createEffect(() => {
							element.translateY = -scrolled();
						});
					}}
				>
					{!several && (
						<text fg={theme.accent}>{` ${questions[0]?.header}`}</text>
					)}
					{several && (
						<box flexDirection="row">
							<For each={[...questions.map((q) => q.header), "Review"]}>
								{(header, at) => (
									<box
										onMouseDown={(event) => {
											event.preventDefault();
											goTo(at());
										}}
										backgroundColor={at() === tab() ? theme.border : undefined}
									>
										<text
											fg={at() === tab() ? theme.accent : theme.muted}
										>{` ${header}${at() < review && answered(answers()[at()] ?? empty) ? " ✓" : ""} `}</text>
									</box>
								)}
							</For>
						</box>
					)}
					{tab() < review ? (
						<>
							<text fg={theme.text}>{` ${question()?.question}`}</text>
							<For each={question()?.options}>
								{(option, at) =>
									line(
										at(),
										() => at() === row(),
										<box
											flexDirection="row"
											onMouseOver={() => setRow(at())}
											onMouseDown={(event) => {
												event.preventDefault();
												setRow(at());
												select(tab(), option.label);
											}}
										>
											<text fg={theme.text}>
												{` ${marker(tab(), option.label)} ${option.label}`}
											</text>
											<text fg={theme.muted}>
												{option.description ? `  ${option.description}` : ""}
											</text>
										</box>,
									)
								}
							</For>
							{line(
								customRow(),
								typing,
								<>
									<text fg={theme.text}>{` ${customMarker()} `}</text>
									{/* why: a keyed field per question, or its text leaks into the next tab */}
									<For each={[tab()]}>
										{(at) => (
											<input
												ref={(element: InputRenderable) => {
													field = element;
												}}
												focused={typing()}
												value={untrack(() => answers()[at]?.custom ?? "")}
												placeholder="Type your own answer"
												flexGrow={1}
												textColor={theme.text}
												onInput={(value: string) => {
													setRow(customRow());
													update(at, { labels: [], custom: value.trim() });
												}}
												onMouseDown={() => setRow(customRow())}
												onKeyDown={onKeyDown}
											/>
										)}
									</For>
								</>,
							)}
						</>
					) : (
						<>
							<text fg={theme.text}>{" Review your answers"}</text>
							<For each={questions}>
								{(q, at) =>
									line(
										at(),
										() => at() === row(),
										<box
											flexDirection="row"
											onMouseDown={(event) => {
												event.preventDefault();
												edit(at());
											}}
										>
											<text fg={theme.muted}>{` ${q.header}: `}</text>
											<text fg={theme.text}>
												{summary(answers()[at()] ?? empty)}
											</text>
										</box>,
									)
								}
							</For>
							{line(
								review,
								() => row() === review,
								<box
									onMouseDown={(event) => {
										event.preventDefault();
										submit();
									}}
								>
									<text fg={theme.accent}>{" Submit"}</text>
								</box>,
							)}
						</>
					)}
				</box>
			</box>
			<box
				flexShrink={0}
				onMouseDown={(event) => {
					event.preventDefault();
					dismiss();
				}}
			>
				<text fg={theme.muted}>{" Dismiss (Esc)"}</text>
			</box>
		</box>
	);
}
