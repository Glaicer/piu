import { join } from "node:path";
import { createSignal } from "solid-js";
import { readJson, writeJson } from "./json-file.ts";
import { type ModelKey, sameModel } from "./model.ts";

type ReadResult = {
	favorites: ModelKey[];
	error?: string;
};

function isModelKey(item: unknown): item is ModelKey {
	return (
		typeof item === "object" &&
		item !== null &&
		"provider" in item &&
		"id" in item &&
		typeof item.provider === "string" &&
		typeof item.id === "string"
	);
}

function read(file: string): ReadResult {
	const result = readJson(file);
	if (result.error) return { favorites: [], error: result.error };
	if (result.value === undefined) return { favorites: [] };
	if (!Array.isArray(result.value))
		return { favorites: [], error: "expected a list of models" };
	if (!result.value.every(isModelKey))
		return { favorites: [], error: "the file contains an invalid model" };
	return {
		favorites: result.value.map(({ provider, id }) => ({ provider, id })),
	};
}

export function createModelFavorites(
	home: string,
	notify: (message: string) => void,
) {
	const file = join(home, "model-favorites.json");
	const initial = read(file);
	if (initial.error) notify(`Could not read favorites: ${initial.error}`);
	const [favorites, setFavorites] = createSignal(initial.favorites);
	return {
		has: (model: ModelKey) =>
			favorites().some((item) => sameModel(item, model)),
		toggle(model: ModelKey) {
			// why: another piu may have changed the file since this instance started, so merge against the file instead of the live list.
			const current = read(file);
			if (current.error) {
				notify(`Could not read favorites: ${current.error}`);
				return;
			}
			const next = current.favorites.filter((item) => !sameModel(item, model));
			if (!favorites().some((item) => sameModel(item, model))) {
				next.push({ provider: model.provider, id: model.id });
			}
			try {
				writeJson(file, next);
				setFavorites(next);
			} catch (error) {
				notify(`Could not save favorites: ${String(error)}`);
			}
		},
	};
}

export type ModelFavorites = ReturnType<typeof createModelFavorites>;
