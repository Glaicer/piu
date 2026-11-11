export const SUBAGENTS_STATUS_KEY = "opentui:subagents/roster";

const LOG_KEY_PREFIX = "opentui:subagents/log/";

export const subagentLogKey = (id: string) => `${LOG_KEY_PREFIX}${id}`;

export const subagentIdOfLogKey = (key: string) =>
	key.startsWith(LOG_KEY_PREFIX) ? key.slice(LOG_KEY_PREFIX.length) : undefined;

export const subagentStatuses = [
	"running",
	"idle",
	"done",
	"failed",
	"stopped",
] as const;

export type Subagent = {
	readonly id: string;
	readonly label: string;
	readonly status: (typeof subagentStatuses)[number];
};

type EntryBase = { readonly n: number };

export type SubagentEntry = EntryBase &
	(
		| { readonly kind: "user"; readonly text: string }
		| { readonly kind: "text"; readonly text: string }
		| { readonly kind: "thinking"; readonly text: string }
		| {
				readonly kind: "tool";
				readonly name: string;
				readonly args: string;
				readonly result?: string;
				readonly failed?: boolean;
		  }
	);

const MAX_ENTRIES = 300;
const MAX_TEXT_CHARS = 4000;
const MAX_ARGS_CHARS = 200;
const MAX_RESULT_CHARS = 1000;

const clip = (text: string, limit: number) =>
	text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

function blocksText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) =>
			block?.type === "text" && typeof block.text === "string"
				? block.text
				: "",
		)
		.filter(Boolean)
		.join("\n");
}

// why: the installed @chthub/pi-subagents 0.5.0 keeps each child's conversation only in the child's own session file, which Pi writes one whole message at a time, so a log is rebuilt from that file; docs/session-format.md describes it.
export function transcriptFromSession(text: string): SubagentEntry[] {
	const entries: SubagentEntry[] = [];
	const tools = new Map<string, number>();
	for (const line of text.split("\n")) {
		let record: {
			type?: unknown;
			message?: { role?: unknown; content?: unknown } & Record<string, unknown>;
		};
		try {
			record = JSON.parse(line);
		} catch {
			continue;
		}
		const message = record.type === "message" ? record.message : undefined;
		if (!message) continue;
		if (message.role === "user") {
			entries.push({
				n: entries.length,
				kind: "user",
				text: clip(blocksText(message.content), MAX_TEXT_CHARS),
			});
		} else if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block?.type === "text" && typeof block.text === "string") {
					entries.push({
						n: entries.length,
						kind: "text",
						text: clip(block.text, MAX_TEXT_CHARS),
					});
				} else if (
					block?.type === "thinking" &&
					typeof block.thinking === "string"
				) {
					entries.push({
						n: entries.length,
						kind: "thinking",
						text: clip(block.thinking, MAX_TEXT_CHARS),
					});
				} else if (block?.type === "toolCall") {
					tools.set(String(block.id), entries.length);
					entries.push({
						n: entries.length,
						kind: "tool",
						name: String(block.name),
						args: clip(JSON.stringify(block.arguments ?? {}), MAX_ARGS_CHARS),
					});
				}
			}
		} else if (message.role === "toolResult") {
			const at = tools.get(String(message.toolCallId));
			const call = at === undefined ? undefined : entries[at];
			if (call?.kind === "tool") {
				entries[at as number] = {
					...call,
					result: clip(blocksText(message.content), MAX_RESULT_CHARS),
					failed: message.isError === true,
				};
			}
		}
	}
	return entries.slice(-MAX_ENTRIES);
}

type RosterSnapshot = { readonly v: 1; readonly agents: readonly Subagent[] };
type LogSnapshot = {
	readonly v: 1;
	readonly entries: readonly SubagentEntry[];
};

export const serializeRoster = (agents: readonly Subagent[]) =>
	JSON.stringify({ v: 1, agents } satisfies RosterSnapshot);

export const serializeLog = (entries: readonly SubagentEntry[]) =>
	JSON.stringify({ v: 1, entries } satisfies LogSnapshot);

function parseSnapshot(text: string | undefined): Record<string, unknown> {
	if (!text) return {};
	try {
		const parsed = JSON.parse(text);
		return parsed?.v === 1 ? parsed : {};
	} catch {
		return {};
	}
}

export function parseRoster(text: string | undefined): Subagent[] {
	const { agents } = parseSnapshot(text);
	if (!Array.isArray(agents)) return [];
	return agents.filter(
		(agent): agent is Subagent =>
			typeof agent?.id === "string" &&
			typeof agent.label === "string" &&
			subagentStatuses.includes(agent.status),
	);
}

const entryKinds = ["user", "text", "thinking", "tool"];

export function parseLog(text: string | undefined): SubagentEntry[] {
	const { entries } = parseSnapshot(text);
	if (!Array.isArray(entries)) return [];
	return entries.filter(
		(entry): entry is SubagentEntry =>
			typeof entry?.n === "number" && entryKinds.includes(entry.kind),
	);
}
