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
export type Backend = ReturnType<typeof startBackend>;

const STDERR_TAIL_CHARS = 64 * 1024;

export function startBackend(config: BackendConfig, userArgs: string[]) {
	const child = spawn(
		config.command,
		[...config.args, "--mode", "rpc", ...userArgs],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	const listeners = new Set<(record: BackendRecord) => void>();
	const pending = new Map<
		string,
		{ resolve: (response: RpcResponse) => void; reject: (error: Error) => void }
	>();
	let nextId = 0;
	let stderr = "";
	let failure: Error | undefined;

	const fail = (error: Error) => {
		failure ??= error;
		for (const request of pending.values()) request.reject(failure);
		pending.clear();
	};
	child.on("error", fail);
	child.on("exit", (code, signal) =>
		fail(new Error(`Backend exited (code ${code}, signal ${signal})`)),
	);
	child.stdin.on("error", fail);

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderr = (stderr + chunk).slice(-STDERR_TAIL_CHARS);
	});

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
		stderrTail: () => stderr,
		stop() {
			child.stdin.end();
		},
	};
}
