import { readFileSync, rmSync, writeFileSync } from "node:fs";
import type { BackendInstall } from "./backend-install.ts";
import { compareVersions, isVersion } from "./releases.ts";
import { HANDOFF_ENV } from "./restart.ts";

const receiptFile = (env: NodeJS.ProcessEnv) => {
	const handoff = env[HANDOFF_ENV];
	return handoff ? `${handoff}.backend-update.json` : undefined;
};

export function saveUpdateReceipt(
	env: NodeJS.ProcessEnv,
	install: BackendInstall,
	from: string,
) {
	const file = receiptFile(env);
	if (file)
		writeFileSync(
			file,
			JSON.stringify({ id: install.id, from, to: install.version }),
			{ mode: 0o600 },
		);
}

export function readUpdateReceipt(
	env: NodeJS.ProcessEnv,
	install: BackendInstall,
) {
	const file = receiptFile(env);
	if (!file) return undefined;
	try {
		const receipt: unknown = JSON.parse(readFileSync(file, "utf8"));
		if (
			typeof receipt !== "object" ||
			receipt === null ||
			!("id" in receipt) ||
			!("from" in receipt) ||
			!("to" in receipt)
		)
			return undefined;
		if (
			receipt.id !== install.id ||
			receipt.to !== install.version ||
			typeof receipt.from !== "string" ||
			!isVersion(receipt.from) ||
			compareVersions(receipt.from, install.version) >= 0
		)
			return undefined;
		return { from: receipt.from, clear: () => rmSync(file, { force: true }) };
	} catch {
		return undefined;
	}
}
