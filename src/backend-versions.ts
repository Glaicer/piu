import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isVersion } from "./releases.ts";

type Versions = Record<string, string>;

function read(file: string): Versions {
	try {
		const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] =>
					typeof entry[1] === "string" && isVersion(entry[1]),
			),
		);
	} catch {
		return {};
	}
}

export function createVersionStore(home: string) {
	const file = join(home, "backend-versions.json");
	return {
		get: (id: string): string | undefined => read(file)[id],
		set(id: string, version: string) {
			mkdirSync(dirname(file), { recursive: true });
			// why: a rename never leaves a half-written file for a piu that starts at the same moment, and each write re-reads the file so another install's entry is kept.
			const temp = `${file}.${process.pid}.tmp`;
			writeFileSync(temp, JSON.stringify({ ...read(file), [id]: version }));
			renameSync(temp, file);
		},
	};
}
