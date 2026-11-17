import { isRecord } from "./json.ts";

export const CONTEXT_USAGE_COMMAND = "piu-context-usage";
export const CONTEXT_USAGE_DESCRIPTION =
	"Show how much of the model's context window is in use";

// why: RPC has no push channel but setStatus, so the snapshot travels as a reserved status key and never reaches the status line.
export const CONTEXT_USAGE_STATUS_KEY = "opentui:context/state";

export const CONTEXT_CATEGORIES = [
	{ id: "system", label: "System prompt" },
	{ id: "tools", label: "Tool definitions" },
	{ id: "skills", label: "Skills" },
	{ id: "messages", label: "Messages" },
	{ id: "other", label: "Other" },
] as const;

export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number]["id"];

export type ContextBreakdown = Readonly<Record<ContextCategory, number>>;

// why: a context window is read at a glance, so the long counts lose their trailing digits the way Pi's own footer writes them; a count under a thousand stays exact.
export function formatTokens(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	if (tokens < 10_000)
		return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
	const millions = tokens / 1_000_000;
	const shown =
		millions < 10
			? millions.toFixed(1).replace(/\.0$/, "")
			: String(Math.round(millions));
	return `${shown}M`;
}

export function contextTotal(breakdown: ContextBreakdown): number {
	return CONTEXT_CATEGORIES.reduce((total, { id }) => total + breakdown[id], 0);
}

export type ContextUsageSnapshot = {
	readonly model: string;
	readonly contextWindow: number;
	readonly used: number;
	readonly source: "last-request" | "session-estimate";
	readonly totalSource: "pi" | "estimate";
	readonly categories: ContextBreakdown;
};

export type ContextUsageView = { readonly open: number } & (
	| { readonly kind: "ready"; readonly snapshot: ContextUsageSnapshot }
	| { readonly kind: "compacting" }
	| { readonly kind: "unavailable"; readonly reason: string }
);

export function serializeContextUsage(view: ContextUsageView): string {
	return JSON.stringify({ v: 1, ...view });
}

function isCount(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isWindow(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseBreakdown(value: unknown): ContextBreakdown | null {
	if (!isRecord(value)) return null;
	const counts: Partial<Record<ContextCategory, number>> = {};
	for (const { id } of CONTEXT_CATEGORIES) {
		const count = value[id];
		if (!isCount(count)) return null;
		counts[id] = count;
	}
	return counts as ContextBreakdown;
}

function parseSnapshot(value: unknown): ContextUsageSnapshot | null {
	if (!isRecord(value)) return null;
	const { model, contextWindow, used, source, totalSource } = value;
	if (typeof model !== "string" || model.length === 0) return null;
	if (!isWindow(contextWindow) || !isCount(used)) return null;
	if (source !== "last-request" && source !== "session-estimate") return null;
	if (totalSource !== "pi" && totalSource !== "estimate") return null;
	const categories = parseBreakdown(value.categories);
	if (!categories) return null;
	if (contextTotal(categories) !== used) return null;
	return { model, contextWindow, used, source, totalSource, categories };
}

export function parseContextUsage(
	text: string | undefined,
): ContextUsageView | null {
	if (!text) return null;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(value) || value.v !== 1) return null;
	const { open, kind } = value;
	if (!isCount(open) || open === 0) return null;
	if (kind === "compacting") return { open, kind };
	if (kind === "unavailable") {
		const reason = value.reason;
		if (typeof reason !== "string" || reason.length === 0) return null;
		return { open, kind, reason };
	}
	if (kind !== "ready") return null;
	const snapshot = parseSnapshot(value.snapshot);
	return snapshot ? { open, kind, snapshot } : null;
}
