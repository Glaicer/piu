import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelInfo, ThinkingLevel } from "./pi-state.ts";

type Selection = {
	model: Pick<ModelInfo, "provider" | "id">;
	thinkingLevel: ThinkingLevel;
};
const levels: readonly string[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && levels.includes(value);
}

export function createModelSelection(home: string) {
	const file = join(home, "model-selection.json");
	return {
		read(): Selection | undefined {
			try {
				const value: unknown = JSON.parse(readFileSync(file, "utf8"));
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
			} catch {
				return;
			}
		},
		write(selection: Selection) {
			mkdirSync(home, { recursive: true });
			const temp = `${file}.${crypto.randomUUID()}.tmp`;
			writeFileSync(temp, JSON.stringify(selection));
			renameSync(temp, file);
		},
	};
}
