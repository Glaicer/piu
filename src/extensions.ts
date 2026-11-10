import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Placement } from "./config.ts";
import type { Extension, Module } from "./module.ts";

export const builtinDir = join(import.meta.dir, "../builtin");

export async function discoverModules(
	root: string,
): Promise<Map<string, Module>> {
	const modules = new Map<string, Module>();
	const folders = readdirSync(root, { withFileTypes: true }).filter((entry) =>
		entry.isDirectory(),
	);
	for (const folder of folders) {
		const extension: Extension = (
			await import(join(root, folder.name, "index.tsx"))
		).default;
		for (const module of extension.modules) {
			modules.set(`${folder.name}.${module.id}`, module);
		}
	}
	return modules;
}

export function resolvePlacement(
	placement: Placement,
	modules: ReadonlyMap<string, Module>,
): Map<string, Module[]> {
	return new Map(
		Object.entries(placement).map(([panelId, moduleIds]) => [
			panelId,
			moduleIds.map((moduleId) => {
				const module = modules.get(moduleId);
				if (!module) {
					throw new Error(`placement.${panelId}: unknown Module "${moduleId}"`);
				}
				return module;
			}),
		]),
	);
}
