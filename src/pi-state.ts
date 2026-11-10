import type { JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { createStore, produce, reconcile } from "solid-js/store";
import type { Backend, BackendHealth, BackendRecord } from "./backend.ts";

export type PiMessage = Extract<
	JsonAgentSessionEvent,
	{ type: "message_start" }
>["message"];
type AssistantUpdate = Extract<
	JsonAgentSessionEvent,
	{ type: "message_update" }
>["assistantMessageEvent"];

export type PiState = {
	readonly messages: readonly PiMessage[];
	readonly streaming: boolean;
	readonly backendHealth: BackendHealth;
};

export type PiActions = {
	prompt(text: string): Promise<void>;
	restartBackend(): void;
};

const ignoreDeadBackend = () => {};

export function createPiState(launch: (extraArgs: string[]) => Backend) {
	const [state, setState] = createStore<{
		messages: PiMessage[];
		streaming: boolean;
		backendHealth: BackendHealth;
	}>({ messages: [], streaming: false, backendHealth: { status: "running" } });

	let backend: Backend;
	let detach = () => {};

	function attach(extraArgs: string[]) {
		detach();
		backend = launch(extraArgs);
		const offRecords = backend.onRecord(applyRecord);
		const offHealth = backend.onHealth((health) =>
			setState("backendHealth", reconcile(health)),
		);
		detach = () => {
			offRecords();
			offHealth();
		};
		setState("streaming", false);
		setState("backendHealth", reconcile({ status: "running" }));
		backend
			.request({ type: "get_messages" })
			.then((response) => {
				if (response.command === "get_messages" && response.success) {
					setState("messages", reconcile(response.data.messages));
				}
			})
			.catch(ignoreDeadBackend);
	}

	function applyRecord(record: BackendRecord) {
		switch (record.type) {
			case "message_start":
				setState("messages", state.messages.length, record.message);
				setState("streaming", true);
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
				setState("streaming", false);
				break;
		}
	}

	attach([]);

	const actions: PiActions = {
		async prompt(text) {
			await backend
				.request({ type: "prompt", message: text })
				.catch(ignoreDeadBackend);
		},
		restartBackend() {
			if (state.backendHealth.status !== "exited") return;
			attach(["-c"]);
		},
	};

	const readonlyState: PiState = state;
	return {
		state: readonlyState,
		actions,
		dispose() {
			detach();
			backend.stop();
		},
	};
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
