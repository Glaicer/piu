import { join } from "node:path";
import { readJson, writeJson } from "./json-file.ts";
import type { ModelKey } from "./model.ts";
import type { ThinkingLevel } from "./pi-state.ts";

type Selection = {
	model: ModelKey;
	thinkingLevel: ThinkingLevel;
};

type ReadResult = {
	selection?: Selection;
	error?: string;
};

const levels: readonly ThinkingLevel[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && levels.includes(value as ThinkingLevel);
}

function parse(value: unknown): Selection | undefined {
	if (
		typeof value !== "object" ||
		value === null ||
		!("model" in value) ||
		!("thinkingLevel" in value)
	)
		return;
	const model = value.model;
	if (
		typeof model !== "object" ||
		model === null ||
		!("provider" in model) ||
		!("id" in model) ||
		typeof model.provider !== "string" ||
		typeof model.id !== "string" ||
		!isThinkingLevel(value.thinkingLevel)
	)
		return;
	return {
		model: { provider: model.provider, id: model.id },
		thinkingLevel: value.thinkingLevel,
	};
}

export function createModelSelection(home: string) {
	const file = join(home, "model-selection.json");
	return {
		read(): ReadResult {
			const result = readJson(file);
			if (result.error) return { error: result.error };
			if (result.value === undefined) return {};
			const selection = parse(result.value);
			return selection
				? { selection }
				: { error: "expected a model and a thinking level" };
		},
		write(selection: Selection) {
			writeJson(file, selection);
		},
	};
}
