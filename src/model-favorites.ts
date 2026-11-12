import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSignal } from "solid-js";
import type { ModelInfo } from "./pi-state.ts";

type ModelKey = Pick<ModelInfo, "provider" | "id">;

function read(file: string): ModelKey[] {
	try {
		const value: unknown = JSON.parse(readFileSync(file, "utf8"));
		if (!Array.isArray(value)) return [];
		return value.filter(
			(item): item is ModelKey =>
				typeof item === "object" &&
				item !== null &&
				typeof item.provider === "string" &&
				typeof item.id === "string",
		);
	} catch {
		return [];
	}
}

const same = (a: ModelKey, b: ModelKey) =>
	a.provider === b.provider && a.id === b.id;

export function createModelFavorites(
	home: string,
	notify: (message: string) => void,
) {
	const file = join(home, "model-favorites.json");
	const [favorites, setFavorites] = createSignal(read(file));
	return {
		has: (model: ModelKey) => favorites().some((item) => same(item, model)),
		toggle(model: ModelKey) {
			const current = read(file);
			const next = current.filter((item) => !same(item, model));
			if (!favorites().some((item) => same(item, model))) {
				next.push({ provider: model.provider, id: model.id });
			}
			try {
				mkdirSync(home, { recursive: true });
				const temp = `${file}.${crypto.randomUUID()}.tmp`;
				writeFileSync(temp, JSON.stringify(next));
				renameSync(temp, file);
				setFavorites(next);
			} catch (error) {
				notify(`Could not save favorites: ${String(error)}`);
			}
		},
	};
}

export type ModelFavorites = ReturnType<typeof createModelFavorites>;
