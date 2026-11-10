import type { Dialog, DialogAnswer } from "./pi-state.ts";

export type ChannelPayload = Readonly<Record<string, unknown>> & {
	readonly v: 1;
};

export type ChannelRequest = {
	readonly id: string;
	readonly channel: string;
	readonly payload: ChannelPayload;
};

export type Channel = {
	readonly requests: readonly ChannelRequest[];
	answer(id: string, value: unknown): void;
	cancel(id: string): void;
};

const RESERVED = "opentui:";

export const channelTitle = (extension: string, channel: string) =>
	`${RESERVED}${extension}/${channel}`;

export function parseChannelRequest(
	title: string,
	prefill: string | undefined,
	routable: ReadonlySet<string>,
):
	| { kind: "plain" }
	| { kind: "invalid" }
	| {
			kind: "channel";
			extension: string;
			channel: string;
			payload: ChannelPayload;
	  } {
	if (!title.startsWith(RESERVED)) return { kind: "plain" };
	if (!routable.has(title)) return { kind: "invalid" };
	const address = title.slice(RESERVED.length);
	const slash = address.indexOf("/");
	const extension = address.slice(0, slash);
	const channel = address.slice(slash + 1);
	let payload: unknown;
	try {
		payload = JSON.parse(prefill ?? "");
	} catch {
		return { kind: "invalid" };
	}
	if (!isPayload(payload)) return { kind: "invalid" };
	return { kind: "channel", extension, channel, payload };
}

function isPayload(value: unknown): value is ChannelPayload {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		"v" in value &&
		value.v === 1
	);
}

export function channelFor(
	extension: string,
	dialogs: () => readonly Dialog[],
	answerDialog: (id: string, answer: DialogAnswer) => void,
): Channel {
	return {
		get requests() {
			return dialogs().flatMap((dialog) =>
				dialog.method === "channel" && dialog.extension === extension
					? [
							{
								id: dialog.id,
								channel: dialog.channel,
								payload: dialog.payload,
							},
						]
					: [],
			);
		},
		answer: (id, value) => answerDialog(id, { value: JSON.stringify(value) }),
		cancel: (id) => answerDialog(id, { cancelled: true }),
	};
}
