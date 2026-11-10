import type { SyntaxStyle } from "@opentui/core";
import { createMemo, For, Index } from "solid-js";
import type { Extension, ModuleContext } from "../../src/module.ts";
import type { PiMessage, ServiceRow } from "../../src/pi-state.ts";
import type { Theme } from "../../src/theme.ts";
import { BackendCard } from "./backend-card.tsx";
import { createSyntaxStyle, Markdown } from "./markdown.tsx";
import { Thinking } from "./thinking.tsx";
import {
	type ToolCallBlock,
	ToolCard,
	type ToolResultMessage,
} from "./tool-card.tsx";

function Messages(props: { context: ModuleContext }) {
	const theme = props.context.theme;
	const pi = props.context.pi;
	const syntaxStyle = createSyntaxStyle(theme);
	const resultFor = (id: string) =>
		pi.messages.find(
			(message): message is ToolResultMessage =>
				message.role === "toolResult" && message.toolCallId === id,
		);
	props.context.onCleanup(() => syntaxStyle.destroy());
	return (
		<>
			<For each={pi.messages}>
				{(message, index) => (
					<>
						<ServiceRows context={props.context} position={index()} />
						{message.role === "assistant" ? (
							<Index each={message.content}>
								{(block, blockIndex) => (
									<AssistantBlock
										block={block()}
										resultFor={resultFor}
										abandoned={
											message.stopReason === "error" ||
											message.stopReason === "aborted"
										}
										streaming={
											message === pi.streamingMessage &&
											blockIndex === message.content.length - 1
										}
										syntaxStyle={syntaxStyle}
										theme={theme}
									/>
								)}
							</Index>
						) : (
							message.role === "user" && (
								<text fg={theme.accent}>{`> ${messageText(message)}`}</text>
							)
						)}
					</>
				)}
			</For>
			<ServiceRows context={props.context} position={pi.messages.length} />
			<BackendCard context={props.context} />
		</>
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
	resultFor: (toolCallId: string) => ToolResultMessage | undefined;
	abandoned: boolean;
	streaming: boolean;
	syntaxStyle: SyntaxStyle;
	theme: Theme;
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
				<Thinking text={text()} theme={props.theme} />
			) : type() === "text" ? (
				<Markdown
					text={text()}
					streaming={props.streaming}
					syntaxStyle={props.syntaxStyle}
					theme={props.theme}
				/>
			) : type() === "toolCall" ? (
				<ToolCard
					call={toolCall}
					result={() => {
						const id = toolCall()?.id;
						return id === undefined ? undefined : props.resultFor(id);
					}}
					abandoned={props.abandoned}
					theme={props.theme}
				/>
			) : null}
		</>
	);
}

function messageText(message: PiMessage): string {
	if (!("content" in message)) return "";
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("");
}

export default {
	modules: [
		{
			id: "messages",
			followsOutput: true,
			render: (context) => <Messages context={context} />,
		},
	],
} satisfies Extension;
