import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/solid";
import { createApp } from "../src/app.tsx";

const piBin = join(import.meta.dir, "../node_modules/.bin/pi");
const fauxBackend = join(import.meta.dir, "fixtures/faux-backend.ts");

export type FauxScript = {
	replies: string[];
	crash?: { code: number; stderr: string };
	tokensPerSecond?: number;
	tokenSize?: number;
};

function withBackend(backend: object, config: unknown) {
	const { backend: override, ...rest } = (config ?? {}) as {
		backend?: object;
	};
	return { ...rest, backend: { ...backend, ...override } };
}

export async function startPiu(options: {
	script: FauxScript;
	args?: string[];
	extraBackendArgs?: string[];
	persistSession?: boolean;
	dir?: string;
	config?: unknown;
	extensionsDir?: string;
	width?: number;
	height?: number;
}) {
	const dir = options.dir ?? mkdtempSync(join(tmpdir(), "piu-test-"));
	const scriptPath = join(dir, "script.json");
	writeFileSync(scriptPath, JSON.stringify(options.script));

	const backend = {
		command: "env",
		args: [
			`PI_CODING_AGENT_DIR=${join(dir, "agent")}`,
			"PI_OFFLINE=1",
			`PIU_FAUX_SCRIPT=${scriptPath}`,
			piBin,
			...(options.persistSession ? [] : ["--no-session"]),
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
			args: options.args ?? ["--model", "faux/faux-1"],
		});
	} catch (error) {
		removeDir();
		throw error;
	}
	const setup = await testRender(view, {
		width: options.width ?? 160,
		height: options.height ?? 30,
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
