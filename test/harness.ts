import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonObject } from "@earendil-works/pi-ai";
import { testRender } from "@opentui/solid";
import { createApp } from "../src/app.tsx";

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
	extensionCommands?: string[];
	tokensPerSecond?: number;
	tokenSize?: number;
};

function withBackend(backend: object, config: unknown) {
	const { backend: override, ...rest } = (config ?? {}) as {
		backend?: object;
	};
	return { ...rest, backend: { ...backend, ...override } };
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

export async function startPiu(options: {
	script: FauxScript;
	args?: string[];
	extraBackendArgs?: string[];
	persistSession?: boolean;
	cwd?: string;
	promptTemplates?: Record<string, string>;
	dir?: string;
	config?: unknown;
	extensionsDir?: string;
	width?: number;
	height?: number;
}) {
	const dir = options.dir ?? mkdtempSync(join(tmpdir(), "piu-test-"));
	const scriptPath = join(dir, "script.json");
	writeFileSync(scriptPath, JSON.stringify(options.script));
	// why: Pi waits retry.baseDelayMs before an automatic retry and refuses to compact a session shorter than keepRecentTokens, so tests shrink both.
	mkdirSync(join(dir, "agent"), { recursive: true });
	writeFileSync(
		join(dir, "agent", "settings.json"),
		JSON.stringify({
			retry: { baseDelayMs: 20 },
			compaction: { keepRecentTokens: 1 },
		}),
	);

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
			piBin,
			...(options.persistSession ? [] : ["--no-session"]),
			"--no-skills",
			"-e",
			fauxBackend,
			...(options.extraBackendArgs ?? []),
		],
	};
	const configPath = join(dir, "config.json");
	writeFileSync(
		configPath,
		typeof options.config === "string"
			? options.config
			: JSON.stringify(withBackend(backend, options.config)),
	);

	const removeDir = () => {
		if (!options.dir) rmSync(dir, { recursive: true, force: true });
	};

	let view: Awaited<ReturnType<typeof createApp>>;
	try {
		view = await createApp({
			configPath,
			extensionsDir: options.extensionsDir ?? join(dir, "extensions"),
			cwd: options.cwd,
			args: options.args ?? ["--model", "faux/faux-1"],
		});
	} catch (error) {
		removeDir();
		throw error;
	}
	const setup = await testRender(view, {
		width: options.width ?? 160,
		height: options.height ?? 30,
		// why: without the kitty protocol a terminal sends Shift+Enter as a plain Enter; the real renderer enables it by default.
		kittyKeyboard: true,
	});

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
		async [Symbol.asyncDispose]() {
			await setup.dispose();
			removeDir();
		},
	};
}
