import {
	appendFileSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistantEntries, serializeLive } from "../src/subagents.ts";

type Block =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string }
	| { type: "toolCall"; id: string; name: string; arguments: object };

// why: the stand-in for @chthub/pi-subagents (test/fixtures/pi-extensions/subagents.ts) has no child processes; a test steers it through a control file the stand-in polls, so no wall-clock sleep decides the order of events.
export function subagentsControl() {
	const dir = mkdtempSync(join(tmpdir(), "piu-subagents-"));
	const file = join(dir, "control.jsonl");
	writeFileSync(file, "");
	const send = (command: object) =>
		appendFileSync(file, `${JSON.stringify(command)}\n`);
	const blocks = (content: (string | Block)[]) =>
		content.map((block) =>
			typeof block === "string" ? { type: "text", text: block } : block,
		);
	const launch = (agent: string) =>
		JSON.parse(readFileSync(join(dir, `launch-${agent}.json`), "utf8")) as {
			env: Record<string, string>;
			extensions: string[];
		};
	return {
		env: { PIU_STANDIN_SUBAGENTS: dir },
		launch,
		say: (agent: string, ...content: (string | Block)[]) =>
			send({ agent, message: { role: "assistant", content: blocks(content) } }),
		sayAt: (agent: string, timestamp: number, ...content: (string | Block)[]) =>
			send({
				agent,
				message: { role: "assistant", timestamp, content: blocks(content) },
			}),
		// why: plays the child's reporter (builtin/chat/subagent-live.ts): it writes the half-streamed message where the launch told the child to, the way the reporter does, through a temp file and a rename.
		live: (
			agent: string,
			timestamp: number,
			...content: (string | Block)[]
		) => {
			const target = join(
				launch(agent).env.PIU_SUBAGENT_LIVE_DIR as string,
				`${agent}.json`,
			);
			writeFileSync(
				`${target}.tmp`,
				serializeLive({
					timestamp,
					entries: assistantEntries(blocks(content)),
				}),
			);
			renameSync(`${target}.tmp`, target);
		},
		toolResult: (agent: string, toolCallId: string, output: string) =>
			send({
				agent,
				message: {
					role: "toolResult",
					toolCallId,
					toolName: "x",
					content: [{ type: "text", text: output }],
					isError: false,
				},
			}),
		status: (
			agent: string,
			status: "running" | "idle" | "done" | "failed" | "stopped",
			output = "",
		) => send({ agent, status, output }),
		[Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }),
	};
}
