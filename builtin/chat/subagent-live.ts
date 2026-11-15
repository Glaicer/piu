import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { assistantEntries, serializeLive } from "../../src/subagents.ts";

const INTERVAL_MS = 200;

// why: runs inside a subagent's own Pi (the parent adds it through the child-launch event, builtin/chat/pi-extension.ts); Pi saves a message only when it ends, so this hands the parent the half-streamed one. It registers no tools or commands (ADR-0001) and swallows every error: a viewer must not disturb a subagent.
export default function (pi: ExtensionAPI) {
	const id = process.env.PI_SUBAGENT_AGENT_ID;
	const dir = process.env.PIU_SUBAGENT_LIVE_DIR;
	if (!id || !dir) return;
	const target = join(dir, `${id}.json`);
	let lastWrite = 0;

	function write(message: { role: string }) {
		const { timestamp, content } = message as {
			timestamp?: unknown;
			content?: unknown;
		};
		if (
			message.role !== "assistant" ||
			typeof timestamp !== "number" ||
			!Array.isArray(content)
		) {
			return;
		}
		lastWrite = Date.now();
		try {
			const temp = `${target}.tmp`;
			writeFileSync(
				temp,
				serializeLive({ timestamp, entries: assistantEntries(content) }),
			);
			renameSync(temp, target);
		} catch {}
	}

	pi.on("message_update", (event) => {
		if (Date.now() - lastWrite >= INTERVAL_MS) write(event.message);
	});
	pi.on("message_end", (event) => write(event.message));
}
