import { createMemo, createSignal } from "solid-js";
import type { PiMessage } from "../../src/pi-state.ts";
import type { Theme } from "../../src/theme.ts";

export type ToolCallBlock = Extract<
	Extract<PiMessage, { role: "assistant" }>["content"][number],
	{ type: "toolCall" }
>;
export type ToolResultMessage = Extract<PiMessage, { role: "toolResult" }>;

const KEY_ARGUMENTS = [
	"path",
	"file_path",
	"command",
	"pattern",
	"query",
	"url",
];
const MAX_KEY_ARGUMENT_CHARS = 80;

function keyArgument(args: ToolCallBlock["arguments"]): string {
	const strings = Object.entries(args).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string",
	);
	const [, value] =
		KEY_ARGUMENTS.map((key) => strings.find(([name]) => name === key)).find(
			Boolean,
		) ??
		strings[0] ??
		[];
	const line = (value ?? "").split("\n")[0] ?? "";
	return line.length > MAX_KEY_ARGUMENT_CHARS
		? `${line.slice(0, MAX_KEY_ARGUMENT_CHARS - 1)}…`
		: line;
}

function formatDuration(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function resultText(result: ToolResultMessage): string {
	return result.content
		.map((block) => (block.type === "text" ? block.text : "[image]"))
		.join("\n");
}

export function ToolCard(props: {
	call: () => ToolCallBlock | undefined;
	result: () => ToolResultMessage | undefined;
	abandoned: boolean;
	theme: Theme;
}) {
	const [open, setOpen] = createSignal(false);
	const status = createMemo(() => {
		const result = props.result();
		if (!result) return props.abandoned ? "error" : "running";
		return result.isError ? "error" : "done";
	});
	const color = () => {
		const current = status();
		if (current === "error") return props.theme.error;
		return current === "done" ? props.theme.success : props.theme.warning;
	};
	const duration = () => {
		const ms = props.result()?.durationMs;
		return ms === undefined ? "" : `  ${formatDuration(ms)}`;
	};
	const header = () => {
		const call = props.call();
		const argument = call ? keyArgument(call.arguments) : "";
		return `${open() ? "▾" : "▸"} ${call?.name ?? ""} ${argument}`.trimEnd();
	};
	const body = () => {
		const call = props.call();
		const result = props.result();
		const args = JSON.stringify(call?.arguments, null, 2);
		return result ? `${args}\n\n${resultText(result)}` : args;
	};
	return (
		<box flexDirection="column" border borderColor={color()}>
			<box flexDirection="row" onMouseDown={() => setOpen(!open())}>
				<text fg={props.theme.text}>{header()}</text>
				<text fg={color()}>{`  ${status()}${duration()}`}</text>
			</box>
			{open() && <text fg={props.theme.muted}>{body()}</text>}
		</box>
	);
}
