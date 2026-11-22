import { isRecord } from "./json.ts";
import { readJson, writeJson } from "./json-file.ts";

// why: Pi has no "disabled" form for a package entry, so piu keeps the entry it replaced (or removed, for a single-file package that ignores filters) to put it back on enable.
export type StashedPackage = {
	entry: unknown;
	index: number;
	written?: unknown;
};

type Stash = Record<string, Record<string, StashedPackage>>;

function read(file: string): Stash {
	const { value } = readJson(file);
	if (!isRecord(value)) return {};
	const stash: Stash = {};
	for (const [settings, packages] of Object.entries(value)) {
		if (!isRecord(packages)) continue;
		const kept: Record<string, StashedPackage> = {};
		for (const [source, saved] of Object.entries(packages))
			if (
				isRecord(saved) &&
				"entry" in saved &&
				typeof saved.index === "number" &&
				Number.isInteger(saved.index)
			)
				kept[source] = {
					entry: saved.entry,
					index: saved.index,
					...("written" in saved ? { written: saved.written } : {}),
				};
		stash[settings] = kept;
	}
	return stash;
}

export function packageStash(file: string, settings: string) {
	return {
		all: (): Readonly<Record<string, StashedPackage>> =>
			read(file)[settings] ?? {},
		set(source: string, saved: StashedPackage | undefined) {
			const stash = read(file);
			const packages = { ...stash[settings] };
			if (saved) packages[source] = saved;
			else if (source in packages) delete packages[source];
			else return;
			if (Object.keys(packages).length > 0) stash[settings] = packages;
			else delete stash[settings];
			writeJson(file, stash, 2);
		},
	};
}
