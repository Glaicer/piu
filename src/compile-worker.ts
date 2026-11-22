import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { backendEnvironment, backendSubcommand } from "./backend-command.ts";
import { detectInstall, installRoot } from "./backend-install.ts";
import {
	type CompileRequest,
	type CompileResult,
	parseCompileRequest,
} from "./compile-protocol.ts";
import { acquireProbeLock } from "./install-lock.ts";

// why: `pi-bolt compile` replaces the executable, so the worker outlives a closed piu and holds the installation lock, the one /update takes, until the compile ends.
process.stdout.on("error", () => {});
const send = (record: object) =>
	process.stdout.write(`${JSON.stringify(record)}\n`);

async function compile(request: CompileRequest): Promise<CompileResult> {
	const options = { cwd: request.cwd, env: { ...process.env } };
	const found = installRoot(request.config, options);
	if (!found) throw new Error("Cannot find the configured Backend");
	const lease = await acquireProbeLock(found.root, () =>
		send({ progress: "Waiting for the Backend update to finish" }),
	);
	try {
		const install = await detectInstall(request.config, {
			...options,
			lease,
			timeoutMs: 30 * 60 * 1000,
		});
		if (install?.family !== "pi-bolt") return { status: "skipped" };
		send({ progress: "Compiling Pi-Bolt extensions" });
		const env = backendEnvironment(request.config, options.env);
		const [command = "", ...args] = backendSubcommand(
			request.config,
			request.cwd,
			env,
			["compile"],
		);
		const log = createWriteStream(request.log);
		const code = await new Promise<number | null>((done, reject) => {
			const child = spawn(command, args, {
				cwd: request.cwd,
				env,
				stdio: ["ignore", "pipe", "pipe"],
			});
			const output = (text: string) => {
				log.write(text);
				const line = stripVTControlCharacters(text)
					.split(/[\r\n]/)
					.filter((part) => part.trim())
					.at(-1);
				if (line) send({ progress: line.slice(-180) });
			};
			child.stdout.setEncoding("utf8").on("data", output);
			child.stderr.setEncoding("utf8").on("data", output);
			child.once("error", reject);
			child.once("close", done);
		});
		await new Promise((done) => log.end(done));
		return { status: code === 0 ? "compiled" : "failed" };
	} finally {
		lease.close();
	}
}

try {
	const request = parseCompileRequest(await Bun.stdin.text());
	send({ result: await compile(request) });
} catch (error) {
	send({ error: error instanceof Error ? error.message : String(error) });
	process.exitCode = 1;
}
