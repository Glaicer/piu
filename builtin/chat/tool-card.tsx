import { createMemo } from "solid-js";
import type { Animate } from "../../src/animate.ts";
import type { BackgroundJob } from "../../src/background.ts";
import type { PiMessage } from "../../src/pi-state.ts";
import type { Theme } from "../../src/theme.ts";
import { createReveal } from "./reveal.ts";
import { type Selection, selectable } from "./selection.ts";

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

// why: a `bash` call that handed its job back to the model has a result long before the process ends, so the card follows the job's own status instead of the result's.
function launchedJobId(result: ToolResultMessage | undefined) {
	const details = result?.details as
		| { background?: unknown; id?: unknown }
		| undefined;
	return details?.background === true && typeof details.id === "string"
		? details.id
		: undefined;
}

export function ToolCard(props: {
	call: () => ToolCallBlock | undefined;
	result: () => ToolResultMessage | undefined;
	jobs: () => readonly BackgroundJob[];
	abandoned: boolean;
	animate: Animate;
	selection: Selection;
	theme: Theme;
}) {
	const reveal = createReveal(props.animate);
	const row = selectable(props.selection, reveal.toggle);
	const jobId = () => launchedJobId(props.result());
	const status = createMemo(() => {
		const result = props.result();
		if (!result) return props.abandoned ? "error" : "running";
		const id = jobId();
		if (id !== undefined) {
			return props.jobs().find((job) => job.id === id)?.status ?? "background";
		}
		return result.isError ? "error" : "done";
	});
	const color = () => {
		const current = status();
		if (current === "error" || current === "failed") return props.theme.error;
		if (current === "done") return props.theme.success;
		return current === "running" || current === "killed"
			? props.theme.warning
			: props.theme.muted;
	};
	const duration = () => {
		const ms = props.result()?.durationMs;
		return ms === undefined || jobId() !== undefined
			? ""
			: `  ${formatDuration(ms)}`;
	};
	const label = () => {
		const id = jobId();
		return id === undefined ? status() : `${id} ${status()}`;
	};
	const header = () => {
		const call = props.call();
		const argument = call ? keyArgument(call.arguments) : "";
		return `${row.selected() ? "› " : ""}${reveal.open() ? "▾" : "▸"} ${call?.name ?? ""} ${argument}`.trimEnd();
	};
	const body = () => {
		const call = props.call();
		const result = props.result();
		const args = JSON.stringify(call?.arguments, null, 2);
		return result ? `${args}\n\n${resultText(result)}` : args;
	};
	const shown = () => reveal.visible(body() ?? "");
	return (
		<box flexDirection="column" border borderColor={color()}>
			<box ref={row.ref} flexDirection="row" onMouseDown={row.activate}>
				<text fg={props.theme.text}>{header()}</text>
				<text fg={color()}>{`  ${label()}${duration()}`}</text>
			</box>
			{shown() !== undefined && <text fg={props.theme.muted}>{shown()}</text>}
		</box>
	);
}
