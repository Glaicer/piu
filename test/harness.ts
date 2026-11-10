import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/solid";
import { createApp } from "../src/app.tsx";
import { defaultConfig, type Placement } from "../src/config.ts";

const piBin = join(import.meta.dir, "../node_modules/.bin/pi");
const fauxBackend = join(import.meta.dir, "fixtures/faux-backend.ts");

export type FauxScript = {
	replies: string[];
	tokensPerSecond?: number;
	tokenSize?: number;
};

export async function startPiu(options: {
	script: FauxScript;
	args?: string[];
	placement?: Placement;
	width?: number;
}) {
	const dir = mkdtempSync(join(tmpdir(), "piu-test-"));
	const scriptPath = join(dir, "script.json");
	writeFileSync(scriptPath, JSON.stringify(options.script));

	const view = await createApp({
		config: {
			...defaultConfig,
			placement: options.placement ?? defaultConfig.placement,
			backend: {
				command: "env",
				args: [
					`PI_CODING_AGENT_DIR=${join(dir, "agent")}`,
					"PI_OFFLINE=1",
					`PIU_FAUX_SCRIPT=${scriptPath}`,
					piBin,
					"--no-session",
					"-e",
					fauxBackend,
				],
			},
		},
		args: options.args ?? ["--model", "faux/faux-1"],
	});
	const setup = await testRender(view, {
		width: options.width ?? 160,
		height: 30,
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
		waitForFrame,
		async [Symbol.asyncDispose]() {
			await setup.dispose();
			rmSync(dir, { recursive: true, force: true });
		},
	};
}
