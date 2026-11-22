import { join } from "node:path";
import type { BackendConfig } from "./backend.ts";
import { detectInstall } from "./backend-install.ts";
import { createVersionStore } from "./backend-versions.ts";
import { compareVersions, releaseSource } from "./releases.ts";
import {
	parseWorkerRecord,
	type UpdateRequest,
	type UpdateResult,
} from "./update-protocol.ts";
import { saveUpdateReceipt } from "./update-receipt.ts";
import { runWorker } from "./worker.ts";

type Hooks = {
	progress(message: string | undefined): void;
	notify(message: string, error?: boolean): void;
	restart(): void;
};

export function createBackendUpdate(
	options: {
		config: BackendConfig;
		cwd: string;
		home: string;
		env: NodeJS.ProcessEnv;
		fetch: typeof fetch;
	},
	hooks: Hooks,
) {
	const abort = new AbortController();
	let running = false;
	let disposed = false;
	async function run() {
		if (disposed) return;
		if (running) {
			hooks.notify("An update is already running");
			return;
		}
		running = true;
		try {
			const install = await detectInstall(options.config, options);
			if (!install) throw new Error("Cannot identify the configured Backend");
			const source = releaseSource(install.family, options.fetch);
			const title = `${source.name} ${install.version}`;
			hooks.progress(`Checking ${title} for updates`);
			const latest = await source.latest(abort.signal);
			if (disposed) return;
			if (compareVersions(latest, install.version) <= 0) {
				hooks.notify(`${title} is already up to date`);
				return;
			}
			const result = await runWorker<UpdateResult>(
				join(import.meta.dir, "update-worker.ts"),
				{
					config: options.config,
					install,
					version: latest,
					cwd: options.cwd,
				} satisfies UpdateRequest,
				{
					cwd: options.cwd,
					env: options.env,
					parse: parseWorkerRecord,
					progress: (message) => {
						if (!disposed)
							hooks.progress(`Updating ${title} → ${latest}\n${message}`);
					},
					name: "update worker",
				},
			);
			if (disposed) return;
			if (!result.updated) {
				hooks.notify(
					`${source.name} ${result.install.version} is already up to date`,
				);
				return;
			}
			const store = createVersionStore(options.home);
			const seen = store.get(install.id);
			const from =
				seen && compareVersions(seen, install.version) < 0
					? seen
					: install.version;
			store.set(result.install.id, from);
			// why: another instance can mark the shared version history as seen before this one's restart; its private launcher receipt keeps this changelog visible.
			saveUpdateReceipt(options.env, result.install, from);
			hooks.restart();
		} catch (error) {
			if (!disposed)
				hooks.notify(
					error instanceof Error ? error.message : String(error),
					true,
				);
		} finally {
			running = false;
			if (!disposed) hooks.progress(undefined);
		}
	}
	return {
		run: () => void run(),
		dispose() {
			disposed = true;
			abort.abort();
		},
	};
}
