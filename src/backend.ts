import { spawn } from "node:child_process";
import type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@earendil-works/pi-coding-agent";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.ts";

export type BackendConfig = { command: string; args: string[] };
export type BackendRecord = JsonAgentSessionEvent | RpcExtensionUIRequest;
export type BackendHealth =
	| { status: "running" }
	| { status: "not-found"; command: string }
	| {
			status: "exited";
			code: number | null;
			signal: NodeJS.Signals | null;
			stderrTail: string;
	  };
export type Backend = ReturnType<typeof startBackend>;

const STDERR_TAIL_CHARS = 64 * 1024;

export function startBackend(
	config: BackendConfig,
	userArgs: string[],
	cwd?: string,
) {
	const child = spawn(
		config.command,
		[...config.args, "--mode", "rpc", ...userArgs],
		{ stdio: ["pipe", "pipe", "pipe"], cwd },
	);
	const listeners = new Set<(record: BackendRecord) => void>();
	const healthListeners = new Set<(health: BackendHealth) => void>();
	const pending = new Map<
		string,
		{ resolve: (response: RpcResponse) => void; reject: (error: Error) => void }
	>();
	let nextId = 0;
	let stderr = "";
	let failure: Error | undefined;
	let health: BackendHealth = { status: "running" };

	const settle = (next: BackendHealth) => {
		if (health.status !== "running") return;
		health = next;
		for (const listener of healthListeners) listener(next);
	};

	const fail = (error: Error) => {
		failure ??= error;
		for (const request of pending.values()) request.reject(failure);
		pending.clear();
	};
	const keepStderr = (text: string) => {
		stderr = (stderr + text).slice(-STDERR_TAIL_CHARS);
	};
	child.on("error", (error: NodeJS.ErrnoException) => {
		fail(error);
		if (error.code === "ENOENT") {
			settle({ status: "not-found", command: config.command });
		} else {
			keepStderr(`${error.message}\n`);
		}
	});
	child.on("exit", (code, signal) =>
		fail(new Error(`Backend exited (code ${code}, signal ${signal})`)),
	);
	// why: "close" fires after the stdio streams end, so the stderr tail is complete; a failed spawn emits "error" before "close", and the first terminal state wins.
	child.on("close", (code, signal) =>
		settle({ status: "exited", code, signal, stderrTail: stderr }),
	);
	child.stdin.on("error", fail);

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", keepStderr);

	attachJsonlLineReader(child.stdout, (line) => {
		let record: RpcResponse | BackendRecord;
		try {
			record = JSON.parse(line);
		} catch {
			return;
		}
		if (record.type === "response") {
			const request = record.id ? pending.get(record.id) : undefined;
			if (!request || !record.id) return;
			pending.delete(record.id);
			request.resolve(record);
			return;
		}
		for (const listener of listeners) listener(record);
	});

	const send = (record: RpcCommand | RpcExtensionUIResponse) => {
		child.stdin.write(serializeJsonLine(record));
	};

	return {
		send,
		request(command: RpcCommand): Promise<RpcResponse> {
			if (failure) return Promise.reject(failure);
			const id = `piu-${++nextId}`;
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				send({ ...command, id });
			});
		},
		onRecord(listener: (record: BackendRecord) => void): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		onHealth(listener: (health: BackendHealth) => void): () => void {
			healthListeners.add(listener);
			return () => healthListeners.delete(listener);
		},
		stop() {
			child.stdin.end();
		},
	};
}
