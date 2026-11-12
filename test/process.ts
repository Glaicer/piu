import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { prepareFixture } from "./harness.ts";

const launcher = join(import.meta.dir, "../bin/piu.ts");
const decoder = new TextDecoder();

// why: a CSI/OSC sequence between two letters would split a word that the user sees whole, so the text a test searches has them removed.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const escapes = new RegExp(
	`${ESC}\\[[0-9;?<=>:]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
	"g",
);
const privateMode = new RegExp(`${ESC}\\[\\?([0-9;]+)([hl])`, "g");

export type PidEntry = { event: string; pid: number; ppid: number };

// why: a terminal is left clean when every private mode the app switched on is switched off again and the cursor is shown; the last DECSET/DECRST for each mode decides. Mode 2027 (grapheme clusters) is left on by OpenTUI itself on every exit, Ctrl+C included, and changes nothing a shell shows.
export function leftModes(raw: string) {
	const state = new Map<number, boolean>();
	for (const [, modes = "", flag] of raw.matchAll(privateMode)) {
		for (const mode of modes.split(";")) state.set(Number(mode), flag === "h");
	}
	const on = [...state].filter(
		([mode, set]) => set && mode !== 25 && mode !== 2027,
	);
	return { on: on.map(([mode]) => mode), cursorShown: state.get(25) === true };
}

export function alive(pid: number) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function eventually<T>(
	probe: () => T | undefined | false,
	what: string,
	timeoutMs = 8000,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		const value = probe();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
		await Bun.sleep(25);
	}
}

export function waitForPid(pidFile: string, what: string) {
	return eventually(
		() =>
			(existsSync(pidFile) &&
				Number.parseInt(readFileSync(pidFile, "utf8"), 10)) ||
			undefined,
		what,
	);
}

export function spawnPiu(
	fixture: ReturnType<typeof prepareFixture>,
	options: { args?: string[]; cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
	let output = "";
	const terminal = new Bun.Terminal({
		cols: 160,
		rows: 30,
		data: (_terminal, data) => {
			output += decoder.decode(data, { stream: true });
		},
	});
	const proc = Bun.spawn(
		[
			process.execPath,
			launcher,
			...(options.args ?? ["--model", "faux/faux-1"]),
		],
		{
			cwd: options.cwd ?? fixture.dir,
			env: {
				...process.env,
				...options.env,
				PIU_HOME: fixture.home,
				TERM: "xterm-256color",
			},
			terminal,
		},
	);
	const pidLog = join(fixture.dir, "pids.jsonl");
	const piu = {
		proc,
		get raw() {
			return output;
		},
		get text() {
			return output.replace(escapes, "");
		},
		type: (text: string) => terminal.write(text),
		submit: (text: string) => terminal.write(`${text}\r`),
		mark: () => output.length,
		waitForText: async (needle: string, from = 0) => {
			try {
				return await eventually(
					() => output.slice(from).replace(escapes, "").includes(needle),
					`"${needle}" in the terminal output`,
				);
			} catch (error) {
				throw new Error(
					`${error instanceof Error ? error.message : String(error)}\n${output.slice(from).replace(escapes, "").slice(-2500)}`,
				);
			}
		},
		starts(): PidEntry[] {
			// why: Pi loads its extensions again on /new, /resume and /fork, so the same Backend logs "start" more than once.
			const seen = new Set<number>();
			return piu.pids().filter((entry) => {
				if (entry.event !== "start" || seen.has(entry.pid)) return false;
				seen.add(entry.pid);
				return true;
			});
		},
		waitForStarts: (count: number) =>
			eventually(() => {
				const started = piu.starts();
				return started.length >= count && started;
			}, `${count} Backend start(s)`),
		pids(): PidEntry[] {
			try {
				return readFileSync(pidLog, "utf8")
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => JSON.parse(line));
			} catch {
				return [];
			}
		},
		[Symbol.asyncDispose]: async () => {
			if (proc.exitCode === null) proc.kill("SIGKILL");
			await proc.exited;
			terminal.close();
		},
	};
	return piu;
}
