#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";
import { HANDOFF_ENV, RESTART_EXIT_CODE } from "../src/restart.ts";

// why: the shell tracks this pid as the foreground job, so a full restart can't replace it; the app ends and this thin process starts the next one with the terminal handed over.
const handoffDir = mkdtempSync(join(tmpdir(), "piu-"));
const handoff = join(handoffDir, "restart.json");
let args = process.argv.slice(2);
let code = 1;

// why: Ctrl+C in a cooked terminal reaches the whole foreground group, so the app gets it directly.
process.on("SIGINT", () => {});

while (true) {
	rmSync(handoff, { force: true });
	const child = spawn(
		process.execPath,
		[join(import.meta.dir, "piu-app.ts"), ...args],
		{ stdio: "inherit", env: { ...process.env, [HANDOFF_ENV]: handoff } },
	);
	const forwarded = (["SIGTERM", "SIGHUP"] as const).map((signal) => {
		const handler = () => child.kill(signal);
		process.on(signal, handler);
		return [signal, handler] as const;
	});
	const [exitCode, signal] = await new Promise<
		[number | null, NodeJS.Signals | null]
	>((resolve) => {
		child.on("error", (error) => {
			console.error(`piu: cannot start the app: ${error.message}`);
			resolve([1, null]);
		});
		child.on("exit", (exitCode, signal) => resolve([exitCode, signal]));
	});
	for (const [name, handler] of forwarded) process.off(name, handler);
	if (exitCode === RESTART_EXIT_CODE) {
		try {
			args = JSON.parse(readFileSync(handoff, "utf8"));
			continue;
		} catch {
			console.error("piu: the restart request was lost");
			code = 1;
			break;
		}
	}
	code = exitCode ?? 128 + (signal ? constants.signals[signal] : 0);
	break;
}

rmSync(handoffDir, { recursive: true, force: true });
process.exit(code);
