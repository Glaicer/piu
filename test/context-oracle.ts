import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { startPiu } from "./harness.ts";
import { hooks } from "./hooks.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

// why: Pi's own context usage is read through a fixture Pi command, so it needs `test/fixtures/pi-extensions/context-usage.ts` installed and the probe Extension placed.
export async function oracle(piu: Piu): Promise<{
	tokens: number | null;
	contextWindow: number;
}> {
	const path = `${join(piu.dir, "script.json")}.context-oracle.json`;
	rmSync(path, { force: true });
	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	await actions.prompt("/context-oracle");
	const deadline = Date.now() + 4000;
	while (!existsSync(path)) {
		if (Date.now() > deadline)
			throw new Error("The oracle command wrote no usage.");
		await Bun.sleep(10);
	}
	const value = JSON.parse(readFileSync(path, "utf8"));
	return { tokens: value.tokens ?? null, contextWindow: value.contextWindow };
}
