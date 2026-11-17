import { isRecord } from "./json.ts";

export const CONTEXT_USAGE_COMMAND = "piu-context-usage";
export const CONTEXT_USAGE_DESCRIPTION =
	"Show context window usage and the last request's injections";

// why: RPC has no push channel but setStatus, so the snapshot travels as a reserved status key and never reaches the status line.
export const CONTEXT_USAGE_STATUS_KEY = "opentui:context/state";

export const CONTEXT_INJECTIONS_STATUS_KEY = "opentui:context/injections";

export const CONTEXT_TABS = ["usage", "injections"] as const;

export type ContextTab = (typeof CONTEXT_TABS)[number];

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

export type ContextUsageView = {
	readonly open: number;
	readonly tab: ContextTab;
} & (
	| { readonly kind: "ready"; readonly snapshot: ContextUsageSnapshot }
	| { readonly kind: "compacting" }
	| { readonly kind: "unavailable"; readonly reason: string }
);

export const CONTEXT_INJECTION_GROUPS = [
	{ id: "system", label: "System prompt" },
	{ id: "tools", label: "Tools" },
	{ id: "messages", label: "Messages" },
] as const;

export type InjectionGroup = (typeof CONTEXT_INJECTION_GROUPS)[number]["id"];

export const REQUEST_ONLY_CHANGES = [
	"added",
	"changed",
	"removed",
	"forced",
] as const;

export type RequestOnlyChange = (typeof REQUEST_ONLY_CHANGES)[number];

export type ContextInjection = {
	readonly group: InjectionGroup;
	readonly name: string;
	readonly origin: string;
	readonly tokens: number;
	readonly text: string;
	readonly requestOnly?: RequestOnlyChange;
};

export type ContextInjections = { readonly items: readonly ContextInjection[] };

// why: Pi estimates four characters per token, so every number in the Modal is computed the same way.
export function charsToTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

function isInjectionGroup(value: unknown): value is InjectionGroup {
	return CONTEXT_INJECTION_GROUPS.some((group) => group.id === value);
}

function isRequestOnlyChange(value: unknown): value is RequestOnlyChange {
	return REQUEST_ONLY_CHANGES.some((change) => change === value);
}

function isContextTab(value: unknown): value is ContextTab {
	return CONTEXT_TABS.some((tab) => tab === value);
}

export function serializeContextInjections(value: ContextInjections): string {
	return JSON.stringify({ v: 1, items: value.items });
}

export function parseContextInjections(
	text: string | undefined,
): ContextInjections | null {
	if (!text) return null;
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.items))
		return null;
	const items: ContextInjection[] = [];
	for (const entry of value.items) {
		if (!isRecord(entry)) return null;
		const { group, name, origin, tokens, text: body, requestOnly } = entry;
		if (!isInjectionGroup(group)) return null;
		if (typeof name !== "string" || name.length === 0) return null;
		if (typeof origin !== "string") return null;
		if (!isCount(tokens)) return null;
		if (typeof body !== "string") return null;
		if (requestOnly !== undefined && !isRequestOnlyChange(requestOnly))
			return null;
		items.push({
			group,
			name,
			origin,
			tokens,
			text: body,
			...(requestOnly === undefined ? {} : { requestOnly }),
		});
	}
	return { items };
}

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
	const { open, tab, kind } = value;
	if (!isCount(open) || open === 0) return null;
	if (!isContextTab(tab)) return null;
	if (kind === "compacting") return { open, tab, kind };
	if (kind === "unavailable") {
		const reason = value.reason;
		if (typeof reason !== "string" || reason.length === 0) return null;
		return { open, tab, kind, reason };
	}
	if (kind !== "ready") return null;
	const snapshot = parseSnapshot(value.snapshot);
	return snapshot ? { open, tab, kind, snapshot } : null;
}
