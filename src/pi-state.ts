import type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcSessionState,
	SessionTreeNode,
} from "@earendil-works/pi-coding-agent";
import { batch } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import type { Backend, BackendHealth, BackendRecord } from "./backend.ts";
import {
	BACKGROUND_STATUS_KEY,
	type BackgroundJob,
	parseJobs,
} from "./background.ts";
import { type ChannelPayload, parseChannelRequest } from "./channel.ts";
import {
	parseLog,
	parseRoster,
	SUBAGENTS_STATUS_KEY,
	type Subagent,
	type SubagentEntry,
	subagentIdOfLogKey,
} from "./subagents.ts";
import type { ToastKind } from "./toast.tsx";

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

export type PendingMessage = {
	readonly id: number;
	readonly text: string;
	readonly mode: "prompt" | "steer" | "followUp";
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

export type SessionTree = {
	readonly tree: readonly SessionTreeNode[];
	readonly leafId: string | null;
};

export type Dialog = {
	readonly id: string;
	readonly title: string;
} & (
	| { readonly method: "select"; readonly options: readonly string[] }
	| { readonly method: "confirm"; readonly message: string }
	| { readonly method: "input"; readonly placeholder?: string }
	| { readonly method: "editor"; readonly prefill?: string }
	| {
			readonly method: "channel";
			readonly extension: string;
			readonly channel: string;
			readonly payload: ChannelPayload;
	  }
);

export type DialogAnswer =
	| { readonly value: string }
	| { readonly confirmed: boolean }
	| { readonly cancelled: true };

export type EditorText = { readonly seq: number; readonly text: string };

export type PiState = {
	readonly sessionFile: string | null;
	readonly commands: readonly BackendCommand[];
	readonly model: ModelInfo | null;
	readonly models: readonly ModelInfo[];
	readonly thinkingLevel: ThinkingLevel;
	readonly thinkingLevels: readonly ThinkingLevel[];
	readonly messages: readonly PiMessage[];
	readonly serviceRows: readonly ServiceRow[];
	readonly pending: readonly PendingMessage[];
	readonly streamingMessage: PiMessage | null;
	readonly working: boolean;
	readonly backendHealth: BackendHealth;
	readonly dialogs: readonly Dialog[];
	readonly statuses: Readonly<Record<string, string>>;
	readonly backgroundJobs: readonly BackgroundJob[];
	readonly subagents: readonly Subagent[];
	readonly subagentLogs: Readonly<Record<string, readonly SubagentEntry[]>>;
	readonly title: string | null;
	readonly editorText: EditorText;
};

export type PiActions = {
	prompt(text: string): Promise<boolean>;
	steer(text: string): Promise<boolean>;
	followUp(text: string): Promise<boolean>;
	answerDialog(id: string, answer: DialogAnswer): void;
	abort(): Promise<readonly string[]>;
	setModel(model: ModelInfo): Promise<void>;
	setThinkingLevel(level: ThinkingLevel): Promise<void>;
	newSession(): Promise<void>;
	switchSession(sessionFile: string): Promise<void>;
	fork(entryId: string): Promise<void>;
	compact(instructions?: string): Promise<void>;
	sessionTree(): Promise<SessionTree>;
	restartBackend(): void;
};

const ignoreDeadBackend = () => {};

export function createPiState(
	launch: (extraArgs: string[]) => Backend,
	notify: (message: string, kind: ToastKind) => void,
	channelTitles: ReadonlySet<string>,
) {
	const [state, setState] = createStore<{
		sessionFile: string | null;
		commands: BackendCommand[];
		model: ModelInfo | null;
		models: ModelInfo[];
		thinkingLevel: ThinkingLevel;
		thinkingLevels: ThinkingLevel[];
		messages: PiMessage[];
		serviceRows: ServiceRow[];
		pending: PendingMessage[];
		streamingMessage: PiMessage | null;
		working: boolean;
		backendHealth: BackendHealth;
		dialogs: Dialog[];
		statuses: Record<string, string>;
		backgroundJobs: BackgroundJob[];
		subagents: Subagent[];
		subagentLogs: Record<string, SubagentEntry[]>;
		title: string | null;
		editorText: EditorText;
	}>({
		sessionFile: null,
		commands: [],
		model: null,
		models: [],
		thinkingLevel: "off",
		thinkingLevels: ["off"],
		messages: [],
		serviceRows: [],
		pending: [],
		streamingMessage: null,
		working: false,
		backendHealth: { status: "running" },
		dialogs: [],
		statuses: {},
		backgroundJobs: [],
		subagents: [],
		subagentLogs: {},
		title: null,
		editorText: { seq: 0, text: "" },
	});

	let backend: Backend;
	let detach = () => {};
	const runningTools = new Set<string>();
	// why: the protocol never says which tool call raised a dialog, so a dialog belongs to the tool calls running when it arrived and closes once all of them have ended; one raised with no tool running lasts until the run ends.
	const dialogOwners = new Map<string, ReadonlySet<string>>();
	// why: Pi answers a dialog with its default value once its timeout passes and never tells the client.
	const dialogTimers = new Map<string, Timer>();

	function clearRun() {
		setState("streamingMessage", null);
		setState("working", false);
		setState("serviceRows", []);
		clearPending(() => true);
	}

	let lastPendingId = 0;
	// why: Pi answers a send only after it has queued it, and the message can start before that answer is read, so the end of a run drops only the entries whose answer has arrived.
	const unconfirmed = new Set<number>();
	const inFlight = new Set<Promise<boolean>>();

	function clearPending(shouldClear: (entry: PendingMessage) => boolean) {
		const cleared = new Set(
			state.pending.filter(shouldClear).map(({ id }) => id),
		);
		if (cleared.size === 0) return;
		for (const id of cleared) unconfirmed.delete(id);
		setState("pending", (pending) =>
			pending.filter(({ id }) => !cleared.has(id)),
		);
	}

	// why: Pi removes a queued message when it starts and queues the expanded text of a skill or prompt template, so an exact text match comes first and the oldest entry stands in when the text differs.
	function startPending(text: string) {
		const started =
			state.pending.find((entry) => entry.text === text) ?? state.pending[0];
		if (started) clearPending(({ id }) => id === started.id);
	}

	function clearSubagents() {
		setState("subagents", []);
		setState("subagentLogs", reconcile({}));
	}

	function clearExtensionUi() {
		runningTools.clear();
		closeDialogs(() => true);
		setState("statuses", reconcile({}));
		setState("backgroundJobs", []);
		clearSubagents();
	}

	function closeDialogs(shouldClose: (id: string) => boolean) {
		const closing = state.dialogs.filter((dialog) => shouldClose(dialog.id));
		if (closing.length === 0) return;
		const ids = new Set(closing.map((dialog) => dialog.id));
		for (const id of ids) {
			dialogOwners.delete(id);
			clearTimeout(dialogTimers.get(id));
			dialogTimers.delete(id);
		}
		setState("dialogs", (dialogs) =>
			dialogs.filter((dialog) => !ids.has(dialog.id)),
		);
	}

	function answerDialog(id: string, answer: DialogAnswer) {
		if (!state.dialogs.some((dialog) => dialog.id === id)) return;
		closeDialogs((dialogId) => dialogId === id);
		backend.send({ type: "extension_ui_response", id, ...answer });
	}

	function attach(extraArgs: string[]) {
		detach();
		backend = launch(extraArgs);
		const offRecords = backend.onRecord(applyRecord);
		const offHealth = backend.onHealth((health) => {
			setState("backendHealth", reconcile(health));
			setState("working", false);
			setState("backgroundJobs", []);
			clearSubagents();
			clearPending(() => true);
		});
		detach = () => {
			offRecords();
			offHealth();
		};
		clearRun();
		clearExtensionUi();
		setState("backendHealth", reconcile({ status: "running" }));
		void loadMessages();
		backend
			.request({ type: "get_available_models" })
			.then((response) => {
				if (response.command === "get_available_models" && response.success) {
					setState("models", reconcile(response.data.models.map(toModelInfo)));
				}
			})
			.catch(ignoreDeadBackend);
		void loadCommands();
		void refreshSession();
	}

	async function loadMessages(options?: { unlessStreaming?: boolean }) {
		const session = backend;
		try {
			const response = await session.request({ type: "get_messages" });
			if (session !== backend) return false;
			if (options?.unlessStreaming && state.streamingMessage) return false;
			if (response.command === "get_messages" && response.success) {
				setState("messages", reconcile(response.data.messages));
				return true;
			}
		} catch {
			ignoreDeadBackend();
		}
		return false;
	}

	// why: a reply to get_messages cannot say whether a stream began before it was made, and replacing messages mid-stream would make message_end overwrite the wrong entry, so a reload that meets a stream waits for the run to settle.
	let compactionStale = false;
	async function syncAfterCompaction() {
		compactionStale = true;
		if (await loadMessages({ unlessStreaming: true })) {
			compactionStale = false;
			reanchorRows();
		}
	}

	async function loadCommands() {
		const session = backend;
		try {
			const response = await session.request({ type: "get_commands" });
			if (session !== backend) return;
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
		} catch {
			ignoreDeadBackend();
		}
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
				const { model, thinkingLevel, sessionFile } = stateResponse.data;
				setState("sessionFile", sessionFile ?? null);
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
				clearPending(({ id }) => !unconfirmed.has(id));
				if (compactionStale) void syncAfterCompaction();
				break;
			case "thinking_level_changed":
				setState("thinkingLevel", record.level);
				break;
			case "extension_error":
				notify(
					`${extensionName(record.extensionPath)}: ${record.error}`,
					"error",
				);
				break;
			case "message_start":
				batch(() => {
					if (record.message.role === "user") {
						startPending(userText(record.message.content));
					}
					setState("messages", state.messages.length, record.message);
					setState("streamingMessage", record.message);
				});
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
			case "tool_execution_start":
				runningTools.add(record.toolCallId);
				break;
			case "tool_execution_end":
				runningTools.delete(record.toolCallId);
				closeDialogs((id) => {
					const owners = dialogOwners.get(id);
					return (
						owners !== undefined &&
						owners.size > 0 &&
						[...owners].every((toolCallId) => !runningTools.has(toolCallId))
					);
				});
				break;
			case "agent_end":
				runningTools.clear();
				closeDialogs(() => true);
				break;
			case "extension_ui_request":
				applyUiRequest(record);
				break;
			case "compaction_start":
				startRow("compaction", `Compacting context (${record.reason})…`);
				break;
			case "compaction_end":
				finishRow("compaction", compactionOutcome(record));
				if (record.result) void syncAfterCompaction();
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

	function applyUiRequest(
		record: Extract<BackendRecord, { type: "extension_ui_request" }>,
	) {
		switch (record.method) {
			case "select":
				openDialog(
					{
						id: record.id,
						method: "select",
						title: record.title,
						options: record.options,
					},
					record.timeout,
				);
				break;
			case "confirm":
				openDialog(
					{
						id: record.id,
						method: "confirm",
						title: record.title,
						message: record.message,
					},
					record.timeout,
				);
				break;
			case "input":
				openDialog(
					{
						id: record.id,
						method: "input",
						title: record.title,
						placeholder: record.placeholder,
					},
					record.timeout,
				);
				break;
			case "editor": {
				const request = parseChannelRequest(
					record.title,
					record.prefill,
					channelTitles,
				);
				if (request.kind === "invalid") {
					backend.send({
						type: "extension_ui_response",
						id: record.id,
						cancelled: true,
					});
				} else if (request.kind === "channel") {
					const { extension, channel, payload } = request;
					openDialog({
						id: record.id,
						method: "channel",
						title: record.title,
						extension,
						channel,
						payload,
					});
				} else {
					openDialog({
						id: record.id,
						method: "editor",
						title: record.title,
						prefill: record.prefill,
					});
				}
				break;
			}
			case "notify":
				notify(record.message, record.notifyType ?? "info");
				break;
			case "setStatus": {
				if (record.statusKey === BACKGROUND_STATUS_KEY) {
					setState("backgroundJobs", reconcile(parseJobs(record.statusText)));
					break;
				}
				if (record.statusKey === SUBAGENTS_STATUS_KEY) {
					setState("subagents", reconcile(parseRoster(record.statusText)));
					break;
				}
				const logOf = subagentIdOfLogKey(record.statusKey);
				if (logOf !== undefined) {
					setState(
						"subagentLogs",
						logOf,
						reconcile(parseLog(record.statusText), { key: "n" }),
					);
					break;
				}
				setState(
					"statuses",
					produce((statuses) => {
						if (record.statusText)
							statuses[record.statusKey] = record.statusText;
						else delete statuses[record.statusKey];
					}),
				);
				break;
			}
			case "setTitle":
				setState("title", record.title);
				break;
			case "set_editor_text":
				setEditorText(record.text);
				break;
		}
	}

	function openDialog(dialog: Dialog, timeout?: number) {
		dialogOwners.set(dialog.id, new Set(runningTools));
		setState("dialogs", state.dialogs.length, dialog);
		if (!timeout) return;
		const timer = setTimeout(
			() => closeDialogs((id) => id === dialog.id),
			timeout,
		);
		dialogTimers.set(dialog.id, timer);
	}

	function setEditorText(text: string) {
		setState("editorText", { seq: state.editorText.seq + 1, text });
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

	async function replaceSession(
		command: Extract<
			RpcCommand,
			{ type: "new_session" | "switch_session" | "fork" }
		>,
	) {
		clearExtensionUi();
		const response = await backend.request(command).catch(ignoreDeadBackend);
		if (!response) return;
		if (!response.success) {
			notify(response.error, "error");
			return;
		}
		if (
			(response.command === "new_session" ||
				response.command === "switch_session" ||
				response.command === "fork") &&
			response.data.cancelled
		) {
			return;
		}
		clearRun();
		await Promise.all([loadMessages(), loadCommands(), refreshSession()]);
		return response;
	}

	// why: Pi drops compacted messages from get_messages, so rows anchored past the new end would never render; the finished compaction row moves to the end, where the compaction happened.
	function reanchorRows() {
		const end = state.messages.length;
		for (const [index, row] of state.serviceRows.entries()) {
			if (row.position > end) setState("serviceRows", index, { position: end });
		}
		const compaction = state.serviceRows.findLastIndex(
			(row) => row.kind === "compaction",
		);
		if (state.serviceRows[compaction]?.status === "ok") {
			setState("serviceRows", compaction, { position: end });
		}
	}

	attach([]);

	// why: `prompt` with streamingBehavior starts a run when Pi is idle and queues otherwise, so a message sent in the gap before `agent_start` arrives is not lost; the `steer` and `follow_up` commands would be refused there.
	function send(text: string, mode: PendingMessage["mode"]): Promise<boolean> {
		const entry: PendingMessage = { id: ++lastPendingId, text, mode };
		unconfirmed.add(entry.id);
		setState("pending", state.pending.length, entry);
		const drop = () => clearPending(({ id }) => id === entry.id);
		const sent = backend
			.request({
				type: "prompt",
				message: text,
				streamingBehavior: mode === "prompt" ? undefined : mode,
			})
			.then((response) => {
				unconfirmed.delete(entry.id);
				if (!response.success) {
					drop();
					notify(response.error, "error");
					return false;
				}
				if (
					response.command === "prompt" &&
					response.data?.disposition === "handled"
				) {
					drop();
					// why: Pi has no model-change event, and a Pi extension command that switches the model has finished by the time its prompt is answered "handled".
					void refreshSession();
				}
				return true;
			})
			// why: a dead Backend is already shown by the error card, so only Pi's own refusal hands the text back to the input.
			.catch(() => {
				drop();
				return true;
			});
		inFlight.add(sent);
		void sent.finally(() => inFlight.delete(sent));
		return sent;
	}

	async function refuseToToast(command: RpcCommand) {
		const response = await backend.request(command).catch(ignoreDeadBackend);
		if (response && !response.success) notify(response.error, "error");
	}

	const actions: PiActions = {
		prompt: (text) => send(text, "prompt"),
		steer: (text) => send(text, "steer"),
		followUp: (text) => send(text, "followUp"),
		answerDialog,
		async abort() {
			for (const { id } of state.dialogs) answerDialog(id, { cancelled: true });
			// why: Pi queues a message some time after reading it, so a clear_queue sent at once could overtake the message the user just sent and let it run after the abort.
			await Promise.all(inFlight);
			// why: Pi continues queued messages after an abort, so the queue is emptied first and its text goes back to the caller.
			const cleared = await backend
				.request({ type: "clear_queue" })
				.catch(ignoreDeadBackend);
			clearPending(({ id, mode }) => mode !== "prompt" && !unconfirmed.has(id));
			await backend.request({ type: "abort" }).catch(ignoreDeadBackend);
			return cleared?.success && cleared.command === "clear_queue"
				? [...cleared.data.steering, ...cleared.data.followUp]
				: [];
		},
		async setModel({ provider, id }) {
			await refuseToToast({ type: "set_model", provider, modelId: id });
			await refreshSession();
		},
		async setThinkingLevel(level) {
			await refuseToToast({ type: "set_thinking_level", level });
			await refreshSession();
		},
		async newSession() {
			await replaceSession({ type: "new_session" });
		},
		async switchSession(sessionFile) {
			await replaceSession({
				type: "switch_session",
				sessionPath: sessionFile,
			});
		},
		async fork(entryId) {
			const response = await replaceSession({ type: "fork", entryId });
			if (response?.command === "fork") setEditorText(response.data.text);
		},
		async compact(instructions) {
			await backend
				.request({ type: "compact", customInstructions: instructions })
				.catch(ignoreDeadBackend);
		},
		async sessionTree() {
			const response = await backend
				.request({ type: "get_tree" })
				.catch(ignoreDeadBackend);
			if (response?.command === "get_tree" && response.success) {
				return response.data;
			}
			return { tree: [], leafId: null };
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
			closeDialogs(() => true);
			detach();
			backend.stop();
		},
	};
}

function userText(content: Extract<PiMessage, { role: "user" }>["content"]) {
	if (typeof content === "string") return content;
	return content
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("");
}

function extensionName(path: string) {
	const parts = path.split("/").filter(Boolean);
	const file = (parts.pop() ?? path).replace(/\.[cm]?[jt]sx?$/, "");
	return file === "index" ? (parts.pop() ?? file) : file;
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
