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
import { SubagentCard, type SubagentRow } from "./subagent-card.tsx";
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
	const subagentCalls = createMemo(() => {
		if (!pi.subagents.length) return new Map<string, SubagentRow>();
		const results = new Map(
			pi.messages
				.filter((message) => message.role === "toolResult")
				.map((message) => [message.toolCallId, message]),
		);
		const calls = pi.messages.flatMap((message) =>
			message.role === "assistant"
				? message.content.filter(
						(block): block is ToolCallBlock =>
							block.type === "toolCall" &&
							(block.name === "agent_spawn" || block.name === "agent_send"),
					)
				: [],
		);
		const spawns = new Map<string, string>();
		const claimed = new Set<string>();
		for (const call of calls) {
			if (call.name !== "agent_spawn") continue;
			const result = results.get(call.id);
			const details = result?.details;
			if (
				details &&
				typeof details === "object" &&
				"agentId" in details &&
				typeof details.agentId === "string"
			) {
				spawns.set(call.id, details.agentId);
				claimed.add(details.agentId);
			}
		}
		const active = new Map<string, SubagentRow & { callId: string }>();
		for (const call of calls) {
			const result = results.get(call.id);
			let id: unknown;
			let instruction: unknown;
			if (call.name === "agent_spawn") {
				id = spawns.get(call.id);
				instruction = call.arguments.prompt;
				if (!id && !result) {
					const matches = pi.subagents.filter(
						(agent) =>
							agent.label === call.arguments.label && !claimed.has(agent.id),
					);
					if (matches.length === 1) {
						id = matches[0]?.id;
						if (typeof id === "string") claimed.add(id);
					}
				}
			} else if (call.name === "agent_send" && !result?.isError) {
				id =
					typeof call.arguments.to === "string"
						? call.arguments.to.replace(/^@/, "")
						: undefined;
				instruction = call.arguments.message;
			}
			const agent = pi.subagents.find((agent) => agent.id === id);
			if (agent && typeof instruction === "string") {
				active.set(agent.id, {
					agent,
					instruction,
					name: call.name,
					callId: call.id,
				});
			}
		}
		return new Map([...active.values()].map((row) => [row.callId, row]));
	});
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
										subagentCalls={subagentCalls()}
										openSubagent={openSubagent}
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
										animate={props.context.animateReveal}
									/>
								)}
							</Index>
						) : (
							message.role === "user" && (
								<UserMessage message={message} theme={theme} />
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
			<BackendCard context={props.context} selection={selection} />
		</box>
	);
}

function UserMessage(props: {
	message: Extract<PiMessage, { role: "user" }>;
	theme: Theme;
}) {
	const text = () => contentText(props.message.content);
	// why: Pi expands /skill before RPC delivers the message; only the chat projection strips the instructions.
	const skill = createMemo(() =>
		text().match(
			/^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/,
		),
	);
	const request = () => skill()?.[2];
	const theme = props.theme;
	const author = () => (
		<text fg={theme.faint} flexShrink={0} marginLeft={1}>
			you
		</text>
	);
	const prompt = (value: string) => (
		<text fg={theme.text} flexGrow={1} flexShrink={1}>
			<b>{value}</b>
		</text>
	);
	return (
		<box
			renderBefore={paintCard(() => ({ fill: theme.raised }))}
			paddingX={2}
			paddingY={1}
			marginTop={1}
			flexDirection={skill() ? "column" : "row"}
		>
			<Show
				when={skill()}
				fallback={
					<>
						{prompt(text())}
						{author()}
					</>
				}
			>
				<Show when={request()}>
					<box flexDirection="row">
						{prompt(request() ?? "")}
						{author()}
					</box>
					<box height={1} border={["top"]} borderColor={theme.border} />
				</Show>
				<box flexDirection="row" justifyContent="space-between">
					<text fg={theme.surface} bg={theme.chip} wrapMode="none" truncate>
						<b>{` ${skill()?.[1]} `}</b>
					</text>
					<Show when={!request()}>{author()}</Show>
				</box>
			</Show>
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
			{(row) => (
				<text
					fg={color(row.status)}
					marginTop={row.kind === "interruption" ? 1 : 0}
				>{`· ${row.text}`}</text>
			)}
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
	subagentCalls: ReadonlyMap<string, SubagentRow>;
	openSubagent: (id: string) => void;
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
	const subagent = () => props.subagentCalls.get(toolCall()?.id ?? "");
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
				<Show
					when={subagent()}
					fallback={
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
					}
				>
					<SubagentCard
						row={subagent}
						grouped={props.groupedTools.has(toolCall()?.id ?? "")}
						selection={props.selection}
						theme={props.theme}
						onOpen={() => {
							const entry = subagent();
							if (entry) props.openSubagent(entry.agent.id);
						}}
					/>
				</Show>
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
