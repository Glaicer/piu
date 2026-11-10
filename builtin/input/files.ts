import { readdir } from "node:fs/promises";
import { join } from "node:path";

const MAX_FILES = 5000;

// shortcut: .gitignore is not honored (only dot-folders and node_modules are skipped); switch to `git ls-files` when a repo's build output floods the list.
export async function listFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const queue = [""];
	while (queue.length > 0 && files.length < MAX_FILES) {
		const dir = queue.shift() ?? "";
		const entries = await readdir(join(root, dir), {
			withFileTypes: true,
		}).catch(() => []);
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const path = dir ? `${dir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) queue.push(path);
			else files.push(path);
		}
	}
	return files;
}
