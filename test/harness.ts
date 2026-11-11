import {
	copyFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { JsonObject } from "@earendil-works/pi-ai";
import type { ThemeMode } from "@opentui/core";
import type { ManualClock } from "@opentui/core/testing";
import { testRender } from "@opentui/solid";
import { createApp } from "../src/app.tsx";
import "./hooks.ts";

const piBin = join(import.meta.dir, "../node_modules/.bin/pi");
const fauxBackend = join(import.meta.dir, "fixtures/faux-backend.ts");

export type FauxStep = {
	thinking?: string;
	text?: string;
	toolCalls?: { name: string; args: JsonObject }[];
	error?: string;
};

export type FauxScript = {
	replies: (string | FauxStep)[];
	crash?: { code: number; stderr: string };
	compactCommand?: boolean;
	branchBackCommand?: boolean;
	extensionCommands?: string[];
	contextWindow?: number;
	failingHook?: boolean;
	switchCommands?: boolean;
	echoCompactInstructions?: boolean;
	uiTool?: boolean;
	statusOnStart?: string;
	tokensPerSecond?: number;
	tokenSize?: number;
};

function withBackend(backend: object, config: unknown) {
	const { backend: override, ...rest } = (config ?? {}) as {
		backend?: object;
	};
	return { animations: false, ...rest, backend: { ...backend, ...override } };
}

export function panelText(frame: string, column: number, row = 0) {
	const rows = frame.split("\n");
	let top = row;
	while (top > 0 && (rows[top] ?? "").lastIndexOf("┌", column) < 0) top--;
	const border = rows[top] ?? "";
	const left = border.lastIndexOf("┌", column);
	const right = border.indexOf("┐", column);
	const bottom = rows.findIndex(
		(text, index) => index > top && [...text][left] === "└",
	);
	return rows
		.slice(top + 1, bottom)
		.map((text) => [...text].slice(left + 1, right - 1).join(""))
		.join("\n");
}

// why: the chat repeats every prompt, so history is asserted on the input Panel alone, found as the Panel just above the 3-row status Panel at the bottom.
export function inputArea(frame: string) {
	const lastRow = frame.trimEnd().split("\n").length - 1;
	return panelText(frame, 10, lastRow - 4);
}

// why: a terminal tells the renderer its background with an OSC 11 reply on stdin, and the renderer works out light or dark from its brightness.
function reportTerminalBackground(
	renderer: { stdin: NodeJS.ReadStream },
	mode: ThemeMode,
) {
	const level = mode === "light" ? "ffff" : "0000";
	renderer.stdin.emit(
		"data",
		Buffer.from(`\x1b]11;rgb:${level}/${level}/${level}\x07`),
	);
}

export function restoreEnv(saved: Record<string, string | undefined>) {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
}

export async function startPiu(options: {
	script: FauxScript;
	args?: string[];
	extraBackendArgs?: string[];
	persistSession?: boolean;
	cwd?: string;
	promptTemplates?: Record<string, string>;
	installedPiExtensions?: string[];
	backendEnv?: Record<string, string>;
	dir?: string;
	config?: unknown;
	extensions?: string;
	homeFromHomeDir?: boolean;
	width?: number;
	height?: number;
	kittyKeyboard?: boolean;
	clock?: ManualClock;
	terminalBackground?: ThemeMode;
}) {
	const dir = options.dir ?? mkdtempSync(join(tmpdir(), "piu-test-"));
	const scriptPath = join(dir, "script.json");
	writeFileSync(scriptPath, JSON.stringify(options.script));
	// why: Pi waits retry.baseDelayMs before an automatic retry and refuses to compact a session shorter than keepRecentTokens, so tests shrink both; reserveTokens 0 lets a script's small contextWindow trigger an automatic compaction.
	mkdirSync(join(dir, "agent"), { recursive: true });
	writeFileSync(
		join(dir, "agent", "settings.json"),
		JSON.stringify({
			retry: { baseDelayMs: 20 },
			compaction: { keepRecentTokens: 1, reserveTokens: 0 },
		}),
	);

	if (options.installedPiExtensions) {
		mkdirSync(join(dir, "agent", "extensions"), { recursive: true });
		for (const path of options.installedPiExtensions) {
			copyFileSync(path, join(dir, "agent", "extensions", basename(path)));
		}
	}

	if (options.promptTemplates) {
		mkdirSync(join(dir, "agent", "prompts"), { recursive: true });
		for (const [name, body] of Object.entries(options.promptTemplates)) {
			writeFileSync(join(dir, "agent", "prompts", `${name}.md`), body);
		}
	}

	// why: Pi lists every model whose provider has credentials in the environment, so the developer's API keys would add real models to the picker.
	const credentialVars = Object.keys(process.env).filter((name) =>
		/API_KEY|_TOKEN|_SECRET/.test(name),
	);
	const backend = {
		command: "env",
		args: [
			`PI_CODING_AGENT_DIR=${join(dir, "agent")}`,
			...credentialVars.map((name) => `${name}=`),
			"PI_OFFLINE=1",
			`PIU_FAUX_SCRIPT=${scriptPath}`,
			...Object.entries(options.backendEnv ?? {}).map(
				([name, value]) => `${name}=${value}`,
			),
			piBin,
			...(options.persistSession ? [] : ["--no-session"]),
			"--no-skills",
			"-e",
			fauxBackend,
			...(options.extraBackendArgs ?? []),
		],
	};
	// why: PIU_HOME is a folder outside the repo, so a fixture Extension is copied in and runs where a user's would; with homeFromHomeDir the app finds it as $HOME/.piu instead.
	const home = options.homeFromHomeDir ? join(dir, ".piu") : dir;
	mkdirSync(home, { recursive: true });
	if (options.extensions) {
		cpSync(options.extensions, join(home, "extensions"), { recursive: true });
	}
	writeFileSync(
		join(home, "config.json"),
		typeof options.config === "string"
			? options.config
			: JSON.stringify(withBackend(backend, options.config)),
	);

	const removeDir = () => {
		if (!options.dir) rmSync(dir, { recursive: true, force: true });
	};

	const savedEnv = { HOME: process.env.HOME, PIU_HOME: process.env.PIU_HOME };
	if (options.homeFromHomeDir) {
		process.env.HOME = dir;
		delete process.env.PIU_HOME;
	} else {
		process.env.PIU_HOME = home;
	}
	let view: Awaited<ReturnType<typeof createApp>>;
	try {
		view = await createApp({
			cwd: options.cwd ?? dir,
			args: options.args ?? ["--model", "faux/faux-1"],
		});
	} catch (error) {
		removeDir();
		throw error;
	} finally {
		restoreEnv(savedEnv);
	}
	const setup = await testRender(view, {
		width: options.width ?? 160,
		height: options.height ?? 30,
		// why: without the kitty protocol a terminal sends Shift+Enter as a plain Enter; the real renderer enables it by default.
		kittyKeyboard: options.kittyKeyboard ?? true,
		clock: options.clock,
	});

	if (options.terminalBackground) {
		reportTerminalBackground(setup.renderer, options.terminalBackground);
	}

	async function waitForFrame(
		predicate: (frame: string) => boolean,
		timeoutMs = 4000,
	): Promise<string> {
		const deadline = Date.now() + timeoutMs;
		while (true) {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			if (predicate(frame)) return frame;
			if (Date.now() > deadline) {
				throw new Error(`Timed out waiting for frame. Last frame:\n${frame}`);
			}
			await Bun.sleep(10);
		}
	}

	return {
		...setup,
		dir,
		waitForFrame,
		reportTerminalBackground: (mode: ThemeMode) =>
			reportTerminalBackground(setup.renderer, mode),
		async [Symbol.asyncDispose]() {
			await setup.dispose();
			removeDir();
		},
	};
}
