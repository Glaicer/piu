import type {
	JsonAgentSessionEvent,
	RpcSessionState,
} from "@earendil-works/pi-coding-agent";
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

export type ServiceRow = {
	readonly kind: "compaction" | "retry";
	readonly position: number;
	readonly status: "active" | "ok" | "failed";
	readonly text: string;
};

export type ThinkingLevel = RpcSessionState["thinkingLevel"];

export type ModelInfo = {
	readonly provider: string;
	readonly id: string;
	readonly name: string;
};

export type BackendCommand = {
	readonly name: string;
	readonly description?: string;
};

export type PiState = {
	readonly commands: readonly BackendCommand[];
	readonly model: ModelInfo | null;
	readonly models: readonly ModelInfo[];
	readonly thinkingLevel: ThinkingLevel;
	readonly thinkingLevels: readonly ThinkingLevel[];
	readonly messages: readonly PiMessage[];
	readonly serviceRows: readonly ServiceRow[];
	readonly streamingMessage: PiMessage | null;
	readonly working: boolean;
	readonly backendHealth: BackendHealth;
};

export type PiActions = {
	prompt(text: string): Promise<void>;
	steer(text: string): Promise<void>;
	followUp(text: string): Promise<void>;
	abort(): Promise<void>;
	setModel(model: ModelInfo): Promise<void>;
	setThinkingLevel(level: ThinkingLevel): Promise<void>;
	restartBackend(): void;
};

const ignoreDeadBackend = () => {};

export function createPiState(launch: (extraArgs: string[]) => Backend) {
	const [state, setState] = createStore<{
		commands: BackendCommand[];
		model: ModelInfo | null;
		models: ModelInfo[];
		thinkingLevel: ThinkingLevel;
		thinkingLevels: ThinkingLevel[];
		messages: PiMessage[];
		serviceRows: ServiceRow[];
		streamingMessage: PiMessage | null;
		working: boolean;
		backendHealth: BackendHealth;
	}>({
		commands: [],
		model: null,
		models: [],
		thinkingLevel: "off",
		thinkingLevels: ["off"],
		messages: [],
		serviceRows: [],
		streamingMessage: null,
		working: false,
		backendHealth: { status: "running" },
	});

	let backend: Backend;
	let detach = () => {};

	function attach(extraArgs: string[]) {
		detach();
		backend = launch(extraArgs);
		const offRecords = backend.onRecord(applyRecord);
		const offHealth = backend.onHealth((health) => {
			setState("backendHealth", reconcile(health));
			setState("working", false);
		});
		detach = () => {
			offRecords();
			offHealth();
		};
		setState("streamingMessage", null);
		setState("working", false);
		setState("serviceRows", []);
		setState("backendHealth", reconcile({ status: "running" }));
		backend
			.request({ type: "get_messages" })
			.then((response) => {
				if (response.command === "get_messages" && response.success) {
					setState("messages", reconcile(response.data.messages));
				}
			})
			.catch(ignoreDeadBackend);
		backend
			.request({ type: "get_available_models" })
			.then((response) => {
				if (response.command === "get_available_models" && response.success) {
					setState("models", reconcile(response.data.models.map(toModelInfo)));
				}
			})
			.catch(ignoreDeadBackend);
		backend
			.request({ type: "get_commands" })
			.then((response) => {
				if (response.command === "get_commands" && response.success) {
					setState(
						"commands",
						reconcile(
							response.data.commands.map(({ name, description }) => ({
								name,
								description,
							})),
						),
					);
				}
			})
			.catch(ignoreDeadBackend);
		void refreshSession();
	}

	async function refreshSession() {
		const session = backend;
		try {
			const [stateResponse, levelsResponse] = await Promise.all([
				session.request({ type: "get_state" }),
				session.request({ type: "get_available_thinking_levels" }),
			]);
			if (session !== backend) return;
			if (stateResponse.command === "get_state" && stateResponse.success) {
				const { model, thinkingLevel } = stateResponse.data;
				setState("model", reconcile(model ? toModelInfo(model) : null));
				setState("thinkingLevel", thinkingLevel);
			}
			if (
				levelsResponse.command === "get_available_thinking_levels" &&
				levelsResponse.success
			) {
				setState("thinkingLevels", reconcile(levelsResponse.data.levels));
			}
		} catch {
			ignoreDeadBackend();
		}
	}

	function applyRecord(record: BackendRecord) {
		switch (record.type) {
			case "agent_start":
				setState("working", true);
				break;
			case "agent_settled":
				setState("working", false);
				break;
			case "message_start":
				setState("messages", state.messages.length, record.message);
				setState("streamingMessage", record.message);
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
				setState("streamingMessage", null);
				break;
			case "compaction_start":
				startRow("compaction", `Compacting context (${record.reason})…`);
				break;
			case "compaction_end":
				finishRow("compaction", compactionOutcome(record));
				break;
			case "auto_retry_start":
				startRow(
					"retry",
					`Retrying (${record.attempt}/${record.maxAttempts}) in ${record.delayMs}ms: ${record.errorMessage}`,
				);
				break;
			case "auto_retry_end":
				finishRow(
					"retry",
					record.success
						? {
								status: "ok",
								text: `Retry succeeded (attempt ${record.attempt})`,
							}
						: {
								status: "failed",
								text: `Retry failed: ${record.finalError ?? "unknown error"}`,
							},
				);
				break;
		}
	}

	function startRow(kind: ServiceRow["kind"], text: string) {
		const active = state.serviceRows.findIndex(
			(row) => row.kind === kind && row.status === "active",
		);
		if (active >= 0) {
			setState("serviceRows", active, { text });
			return;
		}
		setState("serviceRows", state.serviceRows.length, {
			kind,
			position: state.messages.length,
			status: "active",
			text,
		});
	}

	function finishRow(
		kind: ServiceRow["kind"],
		outcome: { status: "ok" | "failed"; text: string },
	) {
		const active = state.serviceRows.findIndex(
			(row) => row.kind === kind && row.status === "active",
		);
		if (active >= 0) setState("serviceRows", active, outcome);
	}

	attach([]);

	// why: `prompt` with streamingBehavior starts a run when Pi is idle and queues otherwise, so a message sent in the gap before `agent_start` arrives is not lost; the `steer` and `follow_up` commands would be refused there.
	const send = (
		text: string,
		streamingBehavior?: "steer" | "followUp",
	): Promise<void> =>
		backend
			.request({ type: "prompt", message: text, streamingBehavior })
			.then(() => {})
			.catch(ignoreDeadBackend);

	const actions: PiActions = {
		prompt: (text) => send(text),
		steer: (text) => send(text, "steer"),
		followUp: (text) => send(text, "followUp"),
		async abort() {
			await backend.request({ type: "abort" }).catch(ignoreDeadBackend);
		},
		async setModel({ provider, id }) {
			await backend
				.request({ type: "set_model", provider, modelId: id })
				.catch(ignoreDeadBackend);
			await refreshSession();
		},
		async setThinkingLevel(level) {
			await backend
				.request({ type: "set_thinking_level", level })
				.catch(ignoreDeadBackend);
			await refreshSession();
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

function toModelInfo(model: {
	provider: string;
	id: string;
	name: string;
}): ModelInfo {
	return { provider: model.provider, id: model.id, name: model.name };
}

function compactionOutcome(
	record: Extract<BackendRecord, { type: "compaction_end" }>,
): { status: "ok" | "failed"; text: string } {
	if (record.aborted) return { status: "failed", text: "Compaction aborted" };
	if (!record.result) {
		return {
			status: "failed",
			text: record.errorMessage ?? "Compaction failed",
		};
	}
	const { tokensBefore, estimatedTokensAfter } = record.result;
	const after =
		estimatedTokensAfter === undefined ? "?" : `~${estimatedTokensAfter}`;
	return {
		status: "ok",
		text: `Compacted context (${tokensBefore} → ${after} tokens)`,
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
		case "thinking_start":
			message.content[update.contentIndex] = { type: "thinking", thinking: "" };
			break;
		case "thinking_delta": {
			const block = message.content[update.contentIndex];
			if (block?.type === "thinking") block.thinking += update.delta;
			break;
		}
		case "thinking_end":
			message.content[update.contentIndex] = {
				type: "thinking",
				thinking: update.content,
			};
			break;
		case "toolcall_start":
			message.content[update.contentIndex] = {
				type: "toolCall",
				id: update.id,
				name: update.toolName,
				arguments: {},
			};
			break;
		case "toolcall_end":
			message.content[update.contentIndex] = update.toolCall;
			break;
	}
}
