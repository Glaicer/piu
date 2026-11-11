import { type Renderable, ScrollBoxRenderable } from "@opentui/core";
import { For } from "solid-js";
import type { Module } from "../../src/module.ts";
import type { PiState } from "../../src/pi-state.ts";
import type { SubagentEntry } from "../../src/subagents.ts";
import type { Theme } from "../../src/theme.ts";
import { statusColor } from "./subagent-card.tsx";

const RESULT_LINES = 6;

function resultPreview(result: string) {
	const lines = result.trimEnd().split("\n");
	return lines.length > RESULT_LINES
		? [...lines.slice(0, RESULT_LINES), "…"].join("\n")
		: lines.join("\n");
}

// why: reconcile keeps one store object per entry index, so an entry's kind never changes and its fields are read reactively below.
function Entry(props: { entry: SubagentEntry; theme: Theme }) {
	const { entry, theme } = props;
	switch (entry.kind) {
		case "user":
			return <text fg={theme.accent}>{`> ${entry.text}`}</text>;
		case "text":
			return <text fg={theme.text}>{entry.text}</text>;
		case "thinking":
			return <text fg={theme.muted}>{`Thinking: ${entry.text}`}</text>;
		case "tool":
			return <Tool entry={entry} theme={theme} />;
	}
}

type ToolEntry = Extract<SubagentEntry, { kind: "tool" }>;

function Tool(props: { entry: ToolEntry; theme: Theme }) {
	const theme = props.theme;
	const state = () => {
		if (props.entry.result === undefined) return "running";
		return props.entry.failed ? "error" : "done";
	};
	const color = () => {
		if (state() === "error") return theme.error;
		return state() === "done" ? theme.success : theme.warning;
	};
	return (
		<box flexDirection="column">
			<box flexDirection="row">
				<text
					fg={theme.text}
				>{`▸ ${props.entry.name} ${props.entry.args}`}</text>
				<text fg={color()}>{`  ${state()}`}</text>
			</box>
			{props.entry.result ? (
				<text fg={theme.muted}>{resultPreview(props.entry.result)}</text>
			) : null}
		</box>
	);
}

function scrollBoxOf(node: Renderable) {
	for (let next = node.parent; next; next = next.parent) {
		if (next instanceof ScrollBoxRenderable) return next;
	}
}

function SubagentView(props: { id: string; pi: PiState; theme: Theme }) {
	const agent = () => props.pi.subagents.find((a) => a.id === props.id);
	const log = () => props.pi.subagentLogs[props.id] ?? [];
	let box: Renderable | undefined;
	return (
		<box
			ref={(node: Renderable) => {
				box = node;
			}}
			flexDirection="column"
			focusable
			focused
			onKeyDown={(event) => {
				const scroll = box && scrollBoxOf(box);
				if (scroll?.handleKeyPress(event)) event.preventDefault();
			}}
		>
			<box flexDirection="row">
				<text
					fg={props.theme.accent}
				>{`agent @${props.id}  ${agent()?.label ?? ""}`}</text>
				<text fg={statusColor(agent()?.status ?? "stopped", props.theme)}>
					{`  ${agent()?.status ?? "gone"}`}
				</text>
			</box>
			<For each={log()}>
				{(entry) => <Entry entry={entry} theme={props.theme} />}
			</For>
		</box>
	);
}

export function subagentModule(id: string): Module {
	return {
		id: `subagent-${id}`,
		followsOutput: true,
		render: (context) => (
			<SubagentView id={id} pi={context.pi} theme={context.theme} />
		),
	};
}
