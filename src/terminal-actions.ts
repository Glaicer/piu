import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliRenderer } from "@opentui/core";
import type { ToastKind } from "./toast.tsx";

export function terminalActions(
	renderer: CliRenderer,
	cwd: string,
	notify: (message: string, kind: ToastKind) => void,
) {
	let busy = false;
	const ignoreInterrupt = () => {};
	async function yieldTerminal<T>(run: () => Promise<T>) {
		if (busy) return;
		busy = true;
		process.on("SIGINT", ignoreInterrupt);
		try {
			await renderer.suspend();
			try {
				return await run();
			} finally {
				if (!renderer.isDestroyed) await renderer.resume();
			}
		} finally {
			process.off("SIGINT", ignoreInterrupt);
			busy = false;
		}
	}

	return {
		async editExternally(text: string) {
			try {
				return await yieldTerminal(async () => {
					const directory = await mkdtemp(join(tmpdir(), "piu-editor-"));
					try {
						const file = join(directory, "prompt.md");
						await writeFile(file, text, { mode: 0o600 });
						const editor =
							process.env.VISUAL?.trim() ||
							process.env.EDITOR?.trim() ||
							"nano";
						await new Promise<void>((resolve, reject) => {
							const child = spawn(
								"/bin/sh",
								["-c", `exec ${editor} "$1"`, "piu-editor", file],
								{
									cwd,
									stdio: "inherit",
								},
							);
							child.once("error", reject);
							child.once("exit", (code, signal) => {
								if (code === 0) resolve();
								else reject(new Error(`Editor exited with ${signal ?? code}`));
							});
						});
						return await readFile(file, "utf8");
					} finally {
						await rm(directory, { recursive: true, force: true });
					}
				});
			} catch (error) {
				notify(`Could not open external editor: ${String(error)}`, "error");
			}
		},
		suspend() {
			if (process.platform === "win32" || !process.stdin.isTTY) return;
			void yieldTerminal(
				() =>
					new Promise<void>((resolve, reject) => {
						process.once("SIGCONT", resolve);
						try {
							process.kill(0, "SIGTSTP");
						} catch (error) {
							process.off("SIGCONT", resolve);
							reject(error);
						}
					}),
			).catch((error) =>
				notify(`Could not suspend: ${String(error)}`, "error"),
			);
		},
	};
}
