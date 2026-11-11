import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// why: the blocking command ends when the test says so (or when the folder goes), so no wall-clock sleep decides the order of events; the tag leads the command, which a Panel cuts at the end, so the tag stays readable.
export function blocker(tag = "block") {
	const dir = mkdtempSync(join(tmpdir(), "piu-block-"));
	const command = `: ${tag}; while [ -d ${dir} ] && [ ! -e ${dir}/release ]; do sleep 0.05; done`;
	return {
		command,
		step: { toolCalls: [{ name: "bash", args: { command } }] },
		release: () => writeFileSync(join(dir, "release"), ""),
		[Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }),
	};
}
