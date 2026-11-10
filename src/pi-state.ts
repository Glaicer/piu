import type { JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { createStore, produce, reconcile } from "solid-js/store";
import type { Backend } from "./backend.ts";

export type PiMessage = Extract<
	JsonAgentSessionEvent,
	{ type: "message_start" }
>["message"];
type AssistantUpdate = Extract<
	JsonAgentSessionEvent,
	{ type: "message_update" }
>["assistantMessageEvent"];

export type PiState = { readonly messages: readonly PiMessage[] };

export type PiActions = { prompt(text: string): Promise<void> };

export function createPiState(backend: Backend) {
	const [state, setState] = createStore<{ messages: PiMessage[] }>({
		messages: [],
	});

	const unsubscribe = backend.onRecord((record) => {
		switch (record.type) {
			case "message_start":
				setState("messages", state.messages.length, record.message);
				break;
			case "message_update":
				setState(
					produce((draft) =>
						applyUpdate(draft.messages.at(-1), record.assistantMessageEvent),
					),
				);
				break;
			case "message_end":
				setState(
					"messages",
					state.messages.length - 1,
					reconcile(record.message),
				);
				break;
		}
	});

	const actions: PiActions = {
		async prompt(text) {
			await backend.request({ type: "prompt", message: text });
		},
	};

	const readonlyState: PiState = state;
	return { state: readonlyState, actions, dispose: unsubscribe };
}

function applyUpdate(message: PiMessage | undefined, update: AssistantUpdate) {
	if (message?.role !== "assistant") return;
	switch (update.type) {
		case "text_start":
			message.content[update.contentIndex] = { type: "text", text: "" };
			break;
		case "text_delta": {
			const block = message.content[update.contentIndex];
			if (block?.type === "text") block.text += update.delta;
			break;
		}
		case "text_end":
			message.content[update.contentIndex] = {
				type: "text",
				text: update.content,
			};
			break;
	}
}
