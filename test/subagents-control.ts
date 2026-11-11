import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
	return {
		env: { PIU_STANDIN_SUBAGENTS: dir },
		say: (agent: string, ...content: (string | Block)[]) =>
			send({
				agent,
				message: {
					role: "assistant",
					content: content.map((block) =>
						typeof block === "string" ? { type: "text", text: block } : block,
					),
				},
			}),
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
