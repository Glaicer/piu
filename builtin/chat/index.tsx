import type { SyntaxStyle } from "@opentui/core";
import { createMemo, For, Index, onCleanup, Show } from "solid-js";
import type { Animate } from "../../src/animate.ts";
import type { BackgroundJob } from "../../src/background.ts";
import { paintCard } from "../../src/card.ts";
import { moduleModal } from "../../src/modal.tsx";
import type { Extension, ModuleContext } from "../../src/module.ts";
import type {
	PendingMessage,
	PiMessage,
	ServiceRow,
} from "../../src/pi-state.ts";
import type { Theme } from "../../src/theme.ts";
import { BackendCard } from "./backend-card.tsx";
import { createSyntaxStyle, Markdown } from "./markdown.tsx";
import { createSelection, type Selection } from "./selection.ts";
import { sessionCommands } from "./session-commands.tsx";
import { contentText } from "./sessions.ts";
import { SubagentCard } from "./subagent-card.tsx";
import { subagentModule } from "./subagent-view.tsx";
import { Thinking } from "./thinking.tsx";
import {
	type ToolCallBlock,
	ToolCard,
	type ToolResultMessage,
} from "./tool-card.tsx";

function Messages(props: { context: ModuleContext }) {
	const theme = props.context.theme;
	const pi = props.context.pi;
	const syntaxStyle = createMemo(() => {
		const style = createSyntaxStyle(theme);
		onCleanup(() => style.destroy());
		return style;
	});
	const groupedTools = createMemo(() => {
		const grouped = new Set<string>();
		const servicePositions = new Set(pi.serviceRows.map((row) => row.position));
		let previousTool = false;
		pi.messages.forEach((message, index) => {
			if (servicePositions.has(index)) previousTool = false;
			if (message.role === "user") previousTool = false;
			if (message.role !== "assistant") return;
			for (const block of message.content) {
				if (block.type === "toolCall" && previousTool) grouped.add(block.id);
				previousTool = block.type === "toolCall";
			}
		});
		return grouped;
	});
	const resultFor = (id: string) =>
		pi.messages.find(
			(message): message is ToolResultMessage =>
				message.role === "toolResult" && message.toolCallId === id,
		);
	const openSubagent = (id: string) =>
		props.context.actions.openModal(
			moduleModal(subagentModule(id), {
				width: "75%",
				height: "75%",
			}),
		);
	const selection = createSelection();
	props.context.onKey((event) => {
		if (event.name === "return") {
			if (selection.activate()) event.preventDefault();
		} else if (event.name === "up" || event.name === "down") {
			if (selection.move(event.name === "up" ? -1 : 1)) event.preventDefault();
		}
	});
	return (
		<box paddingX={1} paddingBottom={2}>
			<Show when={pi.messages.length === 0 && pi.pending.length === 0}>
				<box paddingX={2} paddingY={2}>
					<text fg={theme.text}>
						<b>What would you like to build?</b>
					</text>
					<text fg={theme.muted}>
						Ask a question, describe a change, or share an idea.
					</text>
				</box>
			</Show>
			<For each={pi.messages}>
				{(message, index) => (
					<>
						<ServiceRows context={props.context} position={index()} />
						{message.role === "assistant" ? (
							<Index each={message.content}>
								{(block, blockIndex) => (
									<AssistantBlock
										block={block()}
										groupedTools={groupedTools()}
										resultFor={resultFor}
										jobs={() => pi.backgroundJobs}
										abandoned={
											message.stopReason === "error" ||
											message.stopReason === "aborted"
										}
										streaming={
											message === pi.streamingMessage &&
											blockIndex === message.content.length - 1
										}
										final={
											message !== pi.streamingMessage &&
											blockIndex === finalTextIndex(message)
										}
										selection={selection}
										syntaxStyle={syntaxStyle()}
										theme={theme}
										animate={props.context.animate}
									/>
								)}
							</Index>
						) : (
							message.role === "user" && (
								<box
									renderBefore={paintCard(() => ({ fill: theme.raised }))}
									paddingX={2}
									paddingY={1}
									marginTop={1}
									flexDirection="row"
								>
									<text fg={theme.text} flexGrow={1} flexShrink={1}>
										<b>{messageText(message)}</b>
									</text>
									<text fg={theme.faint} flexShrink={0} marginLeft={1}>
										you
									</text>
								</box>
							)
						)}
					</>
				)}
			</For>
			<ServiceRows context={props.context} position={pi.messages.length} />
			<For each={pi.pending}>
				{(entry) => (
					<text
						fg={theme.muted}
					>{`${entry.text}  ${pendingLabel(entry)}`}</text>
				)}
			</For>
			<For each={pi.subagents}>
				{(agent) => (
					<SubagentCard
						agent={() => agent}
						selection={selection}
						theme={theme}
						onOpen={() => openSubagent(agent.id)}
					/>
				)}
			</For>
			<BackendCard context={props.context} selection={selection} />
		</box>
	);
}

function ServiceRows(props: { context: ModuleContext; position: number }) {
	const theme = props.context.theme;
	const color = (status: ServiceRow["status"]) => {
		if (status === "failed") return theme.error;
		return status === "ok" ? theme.success : theme.warning;
	};
	return (
		<For
			each={props.context.pi.serviceRows.filter(
				(row) => row.position === props.position,
			)}
		>
			{(row) => <text fg={color(row.status)}>{`· ${row.text}`}</text>}
		</For>
	);
}

type AssistantBlockData = Extract<
	PiMessage,
	{ role: "assistant" }
>["content"][number];

function AssistantBlock(props: {
	block: AssistantBlockData;
	groupedTools: ReadonlySet<string>;
	resultFor: (toolCallId: string) => ToolResultMessage | undefined;
	jobs: () => readonly BackgroundJob[];
	abandoned: boolean;
	streaming: boolean;
	final: boolean;
	selection: Selection;
	syntaxStyle: SyntaxStyle;
	theme: Theme;
	animate: Animate;
}) {
	// why: text_end replaces the block object; switching on the type alone keeps the renderable mounted so finished code is not re-highlighted.
	const type = createMemo(() => props.block.type);
	const text = () => {
		const block = props.block;
		if (block.type === "thinking") return block.thinking;
		return block.type === "text" ? block.text : "";
	};
	const toolCall = (): ToolCallBlock | undefined => {
		const block = props.block;
		return block.type === "toolCall" ? block : undefined;
	};
	return (
		<>
			{type() === "thinking" ? (
				<Thinking
					text={text()}
					animate={props.animate}
					selection={props.selection}
					theme={props.theme}
				/>
			) : type() === "text" ? (
				<box paddingX={1} marginTop={1}>
					{props.final && (
						<box
							height={1}
							marginBottom={1}
							border={["top"]}
							borderColor={props.theme.border}
						/>
					)}
					<Markdown
						text={text()}
						streaming={props.streaming}
						syntaxStyle={props.syntaxStyle}
						theme={props.theme}
					/>
				</box>
			) : type() === "toolCall" ? (
				<ToolCard
					grouped={props.groupedTools.has(toolCall()?.id ?? "")}
					call={toolCall}
					result={() => {
						const id = toolCall()?.id;
						return id === undefined ? undefined : props.resultFor(id);
					}}
					jobs={props.jobs}
					abandoned={props.abandoned}
					animate={props.animate}
					selection={props.selection}
					theme={props.theme}
				/>
			) : null}
		</>
	);
}

// why: the faux model reports "stop" even for a reply with tool calls, and Pi itself continues on the presence of tool calls, so they decide what is final.
function finalTextIndex(message: Extract<PiMessage, { role: "assistant" }>) {
	const { content } = message;
	if (message.stopReason !== "stop") return -1;
	if (content.some((block) => block.type === "toolCall")) return -1;
	return content.findLastIndex((block) => block.type === "text");
}

const PENDING_LABELS = {
	prompt: "[sending]",
	steer: "[queued: steering]",
	followUp: "[queued: follow-up]",
} as const;

function pendingLabel(entry: PendingMessage) {
	return PENDING_LABELS[entry.mode];
}

function messageText(message: PiMessage): string {
	return "content" in message ? contentText(message.content) : "";
}

export default {
	modules: [
		{
			id: "messages",
			followsOutput: true,
			render: (context) => <Messages context={context} />,
		},
	],
	commands: sessionCommands,
} satisfies Extension;
