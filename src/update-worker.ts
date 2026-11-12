import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { detectInstall } from "./backend-install.ts";
import { acquireInstallLock } from "./install-lock.ts";
import { compareVersions } from "./releases.ts";
import { planBackendUpdate, pnpmGroups } from "./update-install.ts";
import {
	parseUpdateRequest,
	type UpdateRequest,
	type UpdateResult,
} from "./update-protocol.ts";

// why: the worker outlives a closed piu, retaining the OS lock until its installer and verification finish.
process.stdout.on("error", () => {});
const send = (record: object) =>
	process.stdout.write(`${JSON.stringify(record)}\n`);

function cleanOutput(text: string) {
	return stripVTControlCharacters(text).replace(/\p{Cc}/gu, (char) =>
		"\t\r\n".includes(char) ? char : "",
	);
}

function progress(text: string) {
	const line = cleanOutput(text)
		.split(/[\r\n]/)
		.filter((part) => part.trim())
		.at(-1);
	if (line) send({ progress: line.slice(-180) });
}

async function update(request: UpdateRequest): Promise<UpdateResult> {
	const options = { cwd: request.cwd, env: { ...process.env } };
	const plan = await planBackendUpdate(
		request.config,
		request.install,
		request.version,
		options,
	);
	const lease = acquireInstallLock(plan.root);
	const locked = { ...options, lease };
	try {
		const before = await detectInstall(request.config, locked);
		if (!before || before.family !== request.install.family)
			throw new Error("The Backend installation changed; retry /update");
		if (compareVersions(before.version, request.version) >= 0)
			return { updated: false, install: before };
		const fresh = await planBackendUpdate(
			request.config,
			before,
			request.version,
			options,
		);
		if (fresh.root !== plan.root || fresh.manager !== plan.manager)
			throw new Error("The installation origin changed; retry /update");
		if (fresh.manager === "pnpm") {
			const groups = pnpmGroups(fresh);
			if (groups.length !== 1 || groups[0] !== fresh.project)
				throw new Error(
					"More than one pnpm global install group contains this Backend; refusing to update",
				);
		}
		send({ progress: `Installing with ${plan.manager}` });
		await new Promise<void>((done, reject) => {
			const child = spawn(fresh.command, fresh.args, {
				cwd: fresh.root,
				env: fresh.env,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let tail = "";
			const output = (text: string) => {
				tail = (tail + cleanOutput(text)).slice(-4096);
				progress(tail);
			};
			child.stdout.setEncoding("utf8").on("data", output);
			child.stderr.setEncoding("utf8").on("data", output);
			child.once("error", reject);
			child.once("close", (code, signal) =>
				code === 0
					? done()
					: reject(
							new Error(`Installer failed (${signal ?? code}): ${tail.trim()}`),
						),
			);
		});
		send({ progress: "Verifying installed version" });
		// why: Pi-Bolt's package downloads and verifies the native build on its first --version run, which can exceed the ordinary startup probe timeout.
		const installed = await detectInstall(request.config, {
			...locked,
			env: fresh.env,
			timeoutMs: 30 * 60 * 1000,
			onStderr: progress,
		});
		if (
			!installed ||
			installed.family !== before.family ||
			compareVersions(installed.version, request.version) < 0 ||
			compareVersions(installed.version, before.version) <= 0
		) {
			throw new Error(
				"Installer finished, but the target Backend version was not installed",
			);
		}
		const after = await planBackendUpdate(
			request.config,
			installed,
			installed.version,
			options,
		);
		if (after.root !== plan.root || after.manager !== plan.manager)
			throw new Error("Installer changed the installation origin or location");
		return { updated: true, install: installed };
	} finally {
		lease.close();
	}
}

try {
	const request = parseUpdateRequest(await Bun.stdin.text());
	send({ result: await update(request) });
} catch (error) {
	send({ error: error instanceof Error ? error.message : String(error) });
	process.exitCode = 1;
}
