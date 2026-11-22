import type { BackendConfig } from "./backend.ts";
import { isRecord } from "./json.ts";
import type { WorkerRecord } from "./worker.ts";

export type CompileRequest = {
	config: BackendConfig;
	cwd: string;
	log: string;
};
export type CompileResult = { status: "skipped" | "compiled" | "failed" };

export function parseCompileRequest(text: string): CompileRequest {
	const request: unknown = JSON.parse(text);
	const config = isRecord(request) ? request.config : undefined;
	if (
		!isRecord(request) ||
		!isRecord(config) ||
		typeof config.command !== "string" ||
		!config.command ||
		!Array.isArray(config.args) ||
		!config.args.every((arg) => typeof arg === "string") ||
		typeof request.cwd !== "string" ||
		typeof request.log !== "string"
	)
		throw new Error("Invalid compile request");
	return {
		config: { command: config.command, args: config.args },
		cwd: request.cwd,
		log: request.log,
	};
}

export function parseCompileRecord(line: string): WorkerRecord<CompileResult> {
	const record: unknown = JSON.parse(line);
	if (isRecord(record) && Object.keys(record).length === 1) {
		if (typeof record.progress === "string")
			return { progress: record.progress };
		if (typeof record.error === "string") return { error: record.error };
		const result = record.result;
		if (
			isRecord(result) &&
			(result.status === "skipped" ||
				result.status === "compiled" ||
				result.status === "failed")
		)
			return { result: { status: result.status } };
	}
	throw new Error("Invalid response from the compile worker");
}
