import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig } from "../src/config.ts";
import { findExtensions } from "../src/extensions.ts";
import { piuHome } from "../src/home.ts";
import { restoreEnv, startPiu } from "./harness.ts";

const extensions = join(import.meta.dir, "fixtures/extensions");
const none = { replies: [] };
const config = { placement: { side: ["counter.count"] } };

async function clickCounter(piu: Awaited<ReturnType<typeof startPiu>>) {
	const frame = await piu.waitForFrame((f) => f.includes("Count 0"));
	const rows = frame.split("\n");
	const y = rows.findIndex((row) => row.includes("Count 0"));
	await piu.mockMouse.click(rows[y]?.indexOf("Count 0") ?? 0, y);
}

test("PIU_HOME outside the repo supplies the config and an Extension that shares the app's Solid", async () => {
	await using piu = await startPiu({ script: none, extensions, config });

	await clickCounter(piu);

	await piu.waitForFrame((f) => f.includes("Count 1"));
});

test("without PIU_HOME the app reads $HOME/.piu", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config,
		homeFromHomeDir: true,
	});

	await clickCounter(piu);

	await piu.waitForFrame((f) => f.includes("Count 1"));
});

test("an Extension's pi-extension.ts in PIU_HOME/extensions is passed to the Backend", async () => {
	await using piu = await startPiu({ script: none, extensions, config });

	await piu.mockInput.typeText("/counter");

	await piu.waitForFrame((f) =>
		f.split("\n").some((row) => row.includes("/counter-ping ")),
	);
});

test("a missing ~/.piu means the default config and no personal Extensions", () => {
	const home = mkdtempSync(join(tmpdir(), "piu-test-"));
	const saved = { HOME: process.env.HOME, PIU_HOME: process.env.PIU_HOME };
	process.env.HOME = home;
	delete process.env.PIU_HOME;
	try {
		expect(piuHome()).toBe(join(home, ".piu"));
		const loaded = loadConfig(join(piuHome(), "config.json"));
		expect(loaded.backend).toEqual(defaultConfig.backend);
		expect(loaded.layout).toEqual(defaultConfig.layout);
		expect(loaded.placement).toEqual(defaultConfig.placement);
		expect(findExtensions([join(piuHome(), "extensions")]).size).toBe(0);
	} finally {
		restoreEnv(saved);
		rmSync(home, { recursive: true, force: true });
	}
});
