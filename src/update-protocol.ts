import type { BackendConfig } from "./backend.ts";
import type { BackendInstall } from "./backend-install.ts";
import { isVersion } from "./releases.ts";

export type UpdateRequest = {
	config: BackendConfig;
	install: BackendInstall;
	version: string;
	cwd: string;
};
export type UpdateResult = { updated: boolean; install: BackendInstall };
type WorkerRecord =
	| { progress: string }
	| { error: string }
	| { result: UpdateResult };

function object(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function isInstall(value: unknown): value is BackendInstall {
	const install = object(value);
	return Boolean(
		install &&
			(install.family === "pi" || install.family === "pi-bolt") &&
			typeof install.version === "string" &&
			isVersion(install.version) &&
			typeof install.id === "string" &&
			install.id.startsWith(`${install.family}:`),
	);
}

function strings(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.every((entry: unknown) => typeof entry === "string")
	);
}

export function parseUpdateRequest(text: string): UpdateRequest {
	const request = object(JSON.parse(text));
	const config = object(request?.config);
	if (
		!request ||
		!config ||
		typeof config.command !== "string" ||
		!config.command ||
		!strings(config.args) ||
		!isInstall(request.install) ||
		typeof request.version !== "string" ||
		!isVersion(request.version) ||
		typeof request.cwd !== "string" ||
		!request.cwd
	)
		throw new Error("Invalid update request");
	return {
		config: { command: config.command, args: config.args },
		install: request.install,
		version: request.version,
		cwd: request.cwd,
	};
}

export function parseWorkerRecord(text: string): WorkerRecord {
	const record = object(JSON.parse(text));
	if (record && Object.keys(record).length === 1) {
		if (typeof record.progress === "string")
			return { progress: record.progress };
		if (typeof record.error === "string") return { error: record.error };
		const result = object(record.result);
		if (
			result &&
			typeof result.updated === "boolean" &&
			isInstall(result.install)
		)
			return { result: { updated: result.updated, install: result.install } };
	}
	throw new Error("Invalid response from the update worker");
}
