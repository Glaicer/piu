import {
	type Renderable,
	ScrollBoxRenderable,
	TextAttributes,
} from "@opentui/core";
import { createMemo, For } from "solid-js";
import type { Animate } from "../../src/animate.ts";
import { modalHintColumns } from "../../src/layout.tsx";
import type { Module } from "../../src/module.ts";
import type { PiState } from "../../src/pi-state.ts";
import type { SubagentEntry } from "../../src/subagents.ts";
import type { Theme } from "../../src/theme.ts";
import { createSelection, type Selection } from "./selection.ts";
import { statusColor } from "./subagent-card.tsx";
import { Thinking } from "./thinking.tsx";
import {
	type ToolCallBlock,
	ToolCard,
	type ToolResultMessage,
} from "./tool-card.tsx";

// why: reconcile keeps one store object per entry index, so an entry's kind never changes and its fields are read reactively below.
function Entry(props: {
	entry: SubagentEntry;
	selection: Selection;
	animate: Animate;
	theme: Theme;
}) {
	const { entry, theme } = props;
	switch (entry.kind) {
		case "user":
			return <text fg={theme.accent}>{`> ${entry.text}`}</text>;
		case "text":
			return (
				<box paddingX={1} marginTop={1}>
					<text fg={theme.text}>{entry.text}</text>
				</box>
			);
		case "thinking":
			return (
				<Thinking
					text={entry.text}
					animate={props.animate}
					selection={props.selection}
					theme={theme}
				/>
			);
		case "tool":
			return (
				<Tool
					entry={entry}
					animate={props.animate}
					selection={props.selection}
					theme={theme}
				/>
			);
	}
}

type ToolEntry = Extract<SubagentEntry, { kind: "tool" }>;

// why: the same card as in the main chat, fed from the entry; a child's tool call has no duration or background job to show.
function Tool(props: {
	entry: ToolEntry;
	selection: Selection;
	animate: Animate;
	theme: Theme;
}) {
	const call = createMemo<ToolCallBlock>(() => ({
		type: "toolCall",
		id: String(props.entry.n),
		name: props.entry.name,
		arguments: props.entry.arguments,
	}));
	const result = createMemo<ToolResultMessage | undefined>(() =>
		props.entry.result === undefined
			? undefined
			: {
					role: "toolResult",
					toolCallId: String(props.entry.n),
					toolName: props.entry.name,
					content: [{ type: "text", text: props.entry.result }],
					isError: props.entry.failed === true,
					timestamp: 0,
				},
	);
	return (
		<ToolCard
			call={call}
			result={result}
			jobs={() => []}
			abandoned={false}
			animate={props.animate}
			selection={props.selection}
			theme={props.theme}
		/>
	);
}

function scrollBoxOf(node: Renderable) {
	for (let next = node.parent; next; next = next.parent) {
		if (next instanceof ScrollBoxRenderable) return next;
	}
}

function SubagentView(props: {
	id: string;
	pi: PiState;
	animate: Animate;
	theme: Theme;
}) {
	const agent = () => props.pi.subagents.find((a) => a.id === props.id);
	const log = () => props.pi.subagentLogs[props.id] ?? [];
	const selection = createSelection();
	let box: Renderable | undefined;
	return (
		<box
			ref={(node: Renderable) => {
				box = node;
			}}
			flexDirection="column"
			paddingBottom={2}
			focusable
			focused
			onKeyDown={(event) => {
				const handled =
					event.name === "return"
						? selection.activate()
						: (event.name === "up" || event.name === "down") &&
							selection.move(event.name === "up" ? -1 : 1);
				if (handled) {
					event.preventDefault();
					return;
				}
				const scroll = box && scrollBoxOf(box);
				if (scroll?.handleKeyPress(event)) event.preventDefault();
			}}
		>
			<box flexDirection="row" paddingRight={modalHintColumns} marginBottom={1}>
				<text fg={props.theme.accent} attributes={TextAttributes.BOLD}>
					{`agent @${props.id}  ${agent()?.label ?? ""}`}
				</text>
				<text fg={statusColor(agent()?.status ?? "stopped", props.theme)}>
					{`  ${agent()?.status ?? "gone"}`}
				</text>
			</box>
			<For each={log()}>
				{(entry) => (
					<Entry
						entry={entry}
						selection={selection}
						animate={props.animate}
						theme={props.theme}
					/>
				)}
			</For>
		</box>
	);
}

export function subagentModule(id: string): Module {
	return {
		id: `subagent-${id}`,
		followsOutput: true,
		render: (context) => (
			<SubagentView
				id={id}
				pi={context.pi}
				animate={context.animateReveal}
				theme={context.theme}
			/>
		),
	};
}
