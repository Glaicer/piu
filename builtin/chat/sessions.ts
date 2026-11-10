import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type SessionSummary = {
	readonly file: string;
	readonly title: string;
	readonly messages: number;
	readonly modified: Date;
};

type Block = { type?: string; text?: string };
type Line = {
	type?: string;
	name?: string;
	message?: { role?: string; content?: string | Block[] };
};

export function contentText(content: string | Block[] | undefined): string {
	if (typeof content === "string") return content;
	return (content ?? [])
		.map((block) => (block.type === "text" ? (block.text ?? "") : ""))
		.join("");
}

export function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function summarize(file: string, modified: Date, text: string) {
	let name: string | undefined;
	let firstPrompt: string | undefined;
	let messages = 0;
	for (const raw of text.split("\n")) {
		let line: Line;
		try {
			line = JSON.parse(raw);
		} catch {
			continue;
		}
		if (line.type === "session_info") name = line.name || name;
		if (line.type !== "message") continue;
		const role = line.message?.role;
		if (role === "user" || role === "assistant") messages++;
		if (role === "user" && firstPrompt === undefined) {
			firstPrompt = oneLine(contentText(line.message?.content));
		}
	}
	const title = name ?? firstPrompt;
	return title === undefined ? undefined : { file, title, messages, modified };
}

export async function listSessions(
	currentFile: string | null,
): Promise<SessionSummary[]> {
	if (currentFile === null) return [];
	const dir = join(currentFile, "..");
	const names = await readdir(dir).catch(() => []);
	const summaries = await Promise.all(
		names
			.filter((name) => name.endsWith(".jsonl"))
			.map(async (name) => {
				const file = join(dir, name);
				try {
					const [text, info] = await Promise.all([
						readFile(file, "utf8"),
						stat(file),
					]);
					return summarize(file, info.mtime, text);
				} catch {
					return undefined;
				}
			}),
	);
	return summaries
		.filter((summary) => summary !== undefined)
		.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}
