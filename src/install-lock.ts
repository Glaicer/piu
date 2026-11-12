import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

export type InstallLease = { root: string; close(): void };

class InstallBusyError extends Error {
	constructor() {
		super("Another update is already running for this Backend");
	}
}

export async function acquireProbeLock(root: string) {
	const deadline = Date.now() + 2000;
	while (true) {
		try {
			return acquireInstallLock(root);
		} catch (error) {
			if (!(error instanceof InstallBusyError) || Date.now() >= deadline)
				throw error;
			await setTimeout(25);
		}
	}
}

export function acquireInstallLock(root: string): InstallLease {
	// why: neither PIU_HOME nor TMPDIR may split locks for one installation, and probing a system prefix must not require writing to it.
	const dir = join(
		process.platform === "win32" ? tmpdir() : "/tmp",
		`piu-install-locks-${process.getuid?.() ?? "user"}`,
	);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const key = createHash("sha256").update(root).digest("hex");
	const db = new Database(join(dir, `${key}.sqlite`));
	let closed = false;
	try {
		db.exec("BEGIN IMMEDIATE");
	} catch (error) {
		db.close();
		if (
			error instanceof Error &&
			"code" in error &&
			error.code === "SQLITE_BUSY"
		)
			throw new InstallBusyError();
		throw error;
	}
	return {
		root,
		close() {
			if (closed) return;
			closed = true;
			db.exec("ROLLBACK");
			db.close();
		},
	};
}
