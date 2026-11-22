import { spawn } from "node:child_process";
import { attachJsonlLineReader } from "./jsonl.ts";

export type WorkerRecord<T> =
	| { progress: string }
	| { error: string }
	| { result: T };

// why: a worker is detached, so it outlives a closed piu and keeps the installation lock until its job and verification finish.
export function runWorker<T>(
	script: string,
	request: unknown,
	options: {
		cwd: string;
		env: NodeJS.ProcessEnv;
		parse(line: string): WorkerRecord<T>;
		progress(message: string): void;
		name: string;
	},
) {
	return new Promise<T>((done, reject) => {
		const worker = spawn(process.execPath, [script], {
			cwd: options.cwd,
			env: options.env,
			detached: true,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let result: T | undefined;
		let error = "";
		let invalid = false;
		worker.stdin.on("error", reject);
		worker.stdin.end(JSON.stringify(request));
		worker.stderr.on("data", (chunk: Buffer) => {
			error = (error + chunk.toString()).slice(-4096);
		});
		attachJsonlLineReader(worker.stdout, (line) => {
			try {
				const record = options.parse(line);
				if ("progress" in record) options.progress(record.progress);
				if ("error" in record) error = record.error;
				if ("result" in record) result = record.result;
			} catch {
				invalid = true;
				error = `Invalid response from the ${options.name}`;
			}
		});
		worker.once("error", reject);
		worker.once("close", (code) =>
			code === 0 && result !== undefined && !invalid
				? done(result)
				: reject(
						new Error(
							error ||
								`${options.name[0]?.toUpperCase()}${options.name.slice(1)} failed (${code})`,
						),
					),
		);
	});
}
