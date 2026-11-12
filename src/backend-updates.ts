import type { BackendConfig } from "./backend.ts";
import { type BackendInstall, detectInstall } from "./backend-install.ts";
import { createVersionStore } from "./backend-versions.ts";
import {
	compareVersions,
	type ReleaseNote,
	releaseSource,
} from "./releases.ts";
import { readUpdateReceipt } from "./update-receipt.ts";

export type UpdateCheckOptions = { fetch: typeof fetch } | false;

type Hooks = {
	notify(message: string): void;
	showChangelog(markdown: string, onSeen: () => void): void;
};

function changelogMarkdown(
	name: string,
	from: string,
	to: string,
	pageUrl: string,
	notes: readonly ReleaseNote[] | undefined,
) {
	const title = `# ${name} updated: ${from} → ${to}`;
	if (!notes?.length) {
		return `${title}\n\nThe changelog could not be loaded. Read the release notes at ${pageUrl}`;
	}
	const sections = notes.map(
		(note) =>
			`## ${name} ${note.version}\n\n${note.body || "No release notes."}`,
	);
	return [title, ...sections].join("\n\n");
}

export function startUpdateCheck(
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
	const { signal } = abort;
	const offline = Boolean(
		options.env.PI_OFFLINE || options.env.PI_SKIP_VERSION_CHECK,
	);
	const store = createVersionStore(options.home);

	async function showChangelog(install: BackendInstall) {
		const receipt = readUpdateReceipt(options.env, install);
		const known = receipt?.from ?? store.get(install.id);
		const current = install.version;
		if (known === undefined || compareVersions(current, known) < 0) {
			store.set(install.id, current);
			return;
		}
		if (compareVersions(current, known) === 0) return;
		const source = releaseSource(install.family, options.fetch);
		const notes = offline
			? undefined
			: await source.notes(known, current, signal).catch(() => undefined);
		if (signal.aborted) return;
		hooks.showChangelog(
			changelogMarkdown(source.name, known, current, source.pageUrl, notes),
			() => {
				store.set(install.id, current);
				receipt?.clear();
			},
		);
	}

	async function announceUpdate(install: BackendInstall) {
		if (offline) return;
		const source = releaseSource(install.family, options.fetch);
		const latest = await source.latest(signal);
		if (signal.aborted || compareVersions(latest, install.version) <= 0) return;
		hooks.notify(
			`${source.name} update available: ${install.version} → ${latest}. Run /update`,
		);
	}

	void (async () => {
		const install = await detectInstall(options.config, options);
		if (!install || signal.aborted) return;
		void showChangelog(install).catch(() => {});
		await announceUpdate(install).catch(() => {});
	})().catch(() => {});
	return () => abort.abort();
}
