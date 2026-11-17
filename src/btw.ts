import { channelTitle } from "./channel.ts";

export const BTW_EXTENSION = "btw";
export const BTW_CHANNEL = "side";
export const BTW_CHANNEL_TITLE = channelTitle(BTW_EXTENSION, BTW_CHANNEL);
export const BTW_DESCRIPTION =
	"Ask a side question about this session; it stays out of the session's context";

// why: RPC has no push channel but setStatus, so the stream travels as a reserved status key and never reaches the status line.
export const BTW_STATUS_KEY = `opentui:${BTW_EXTENSION}/state`;

export type BtwExchange = {
	readonly n: number;
	readonly question: string;
	readonly answer: string;
};

export type BtwPending = {
	question: string;
	text: string;
	error?: string;
};

export type BtwThread = {
	readonly model: string;
	readonly streaming: boolean;
	readonly thread: readonly BtwExchange[];
	readonly pending?: BtwPending;
};

export type BtwReply =
	| { readonly v: 1; readonly question: string }
	| { readonly v: 1; readonly stop: true };

export function serializeBtwThread(thread: BtwThread): string {
	return JSON.stringify({ v: 1, ...thread });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePending(value: unknown): BtwPending | null | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) return null;
	const { question, text, error } = value;
	if (typeof question !== "string" || typeof text !== "string") return null;
	if (error !== undefined && typeof error !== "string") return null;
	return { question, text, ...(error === undefined ? {} : { error }) };
}

function parseJson(text: string | undefined): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export function parseBtwThread(text: string | undefined): BtwThread | null {
	const value = parseJson(text);
	if (!isRecord(value) || value.v !== 1) return null;
	const { model, streaming, thread } = value;
	if (typeof model !== "string" || typeof streaming !== "boolean") return null;
	if (!Array.isArray(thread)) return null;
	const exchanges: BtwExchange[] = [];
	for (const entry of thread) {
		if (!isRecord(entry)) return null;
		const { n, question, answer } = entry;
		if (
			typeof n !== "number" ||
			typeof question !== "string" ||
			typeof answer !== "string"
		)
			return null;
		exchanges.push({ n, question, answer });
	}
	const pending = parsePending(value.pending);
	if (pending === null) return null;
	return {
		model,
		streaming,
		thread: exchanges,
		...(pending === undefined ? {} : { pending }),
	};
}

export function parseBtwReply(text: string | undefined): BtwReply | null {
	const value = parseJson(text);
	if (!isRecord(value) || value.v !== 1) return null;
	if (value.stop === true) return { v: 1, stop: true };
	if (typeof value.question === "string" && value.question.trim())
		return { v: 1, question: value.question };
	return null;
}
