import { expect, test } from "bun:test";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modalBounds, modalText, openSettings, startPiu } from "./harness.ts";

const script = { replies: [] };
const minimal = {
	placement: {
		agent: [],
		pinned: [],
		input: ["input.prompt"],
		status: [],
		bottom: [],
	},
};

const emptyExtension = "export default function () {}\n";

async function openExtensions(piu: Parameters<typeof openSettings>[0]) {
	await openSettings(piu);
	piu.mockInput.pressKey("\x1b[6;5~");
	const frame = await piu.waitForFrame(
		(frame) => frame.includes("Agentic") && frame.includes("Interface"),
	);
	return modalText(piu, frame);
}

test("Extensions is the second built-in Settings tab", async () => {
	await using piu = await startPiu({ script, config: minimal, height: 32 });
	const global = await openSettings(piu);
	expect(global).toMatch(/Global +Extensions +Hotkeys/);
	expect(global).toMatch(/Theme +auto/);
	piu.mockInput.pressKey("\x1b[6;5~");
	await piu.waitForFrame(
		(frame) => frame.includes("Agentic") && frame.includes("Interface"),
	);
	expect(modalText(piu, piu.captureCharFrame())).not.toContain("Animations");
});

test("Agentic shows user files, filtered installed packages and Pi built-ins", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "piu-agent-"));
	try {
		await using piu = await startPiu({
			script,
			height: 72,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		mkdirSync(join(agentDir, "extensions", "nested"), { recursive: true });
		mkdirSync(join(agentDir, "pkg", "extensions"), { recursive: true });
		writeFileSync(join(agentDir, "extensions", "active.ts"), emptyExtension);
		writeFileSync(
			join(agentDir, "extensions", "nested", "index.js"),
			emptyExtension,
		);
		writeFileSync(join(agentDir, "extensions", "off.ts"), emptyExtension);
		writeFileSync(
			join(agentDir, "pkg", "package.json"),
			JSON.stringify({
				name: "pkg",
				pi: { extensions: ["./extensions/*.ts"] },
			}),
		);
		writeFileSync(
			join(agentDir, "pkg", "extensions", "third.ts"),
			emptyExtension,
		);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				extensions: ["-extensions/off.ts", "-builtin:mcp"],
				packages: [{ source: "./pkg", extensions: [] }],
			}),
		);
		const view = await openExtensions(piu);
		expect(view).toMatch(/^Agentic\b/mu);
		expect(view).toMatch(/active\s+file: extensions\/active\.ts\s+enabled/u);
		expect(view).toMatch(
			/index\s+file: extensions\/nested\/index\.js\s+enabled/u,
		);
		expect(view).toMatch(/off\s+file: extensions\/off\.ts\s+disabled/u);
		expect(view).toMatch(/extensions\/third\s+package: \.\/pkg\s+disabled/u);
		expect(view).toMatch(/builtin:tool-search\s+builtin\s+enabled/u);
		expect(view).toMatch(/builtin:mcp\s+builtin\s+disabled/u);
		expect(view).toContain("Interface");
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});

test("Agentic falls back to the Backend home when the agent dir is unset", async () => {
	const home = mkdtempSync(join(tmpdir(), "piu-backend-home-"));
	try {
		await using piu = await startPiu({
			script,
			height: 60,
			backendEnv: { PI_CODING_AGENT_DIR: "", HOME: home },
			homeFromHomeDir: true,
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		mkdirSync(join(home, ".pi", "agent", "extensions"), { recursive: true });
		writeFileSync(
			join(home, ".pi", "agent", "extensions", "fallback.ts"),
			emptyExtension,
		);
		mkdirSync(join(piu.dir, "agent", "extensions"), { recursive: true });
		writeFileSync(
			join(piu.dir, "agent", "extensions", "marker.ts"),
			emptyExtension,
		);
		const view = await openExtensions(piu);
		expect(view).toMatch(
			/fallback\s+file: extensions\/fallback\.ts\s+enabled/u,
		);
		expect(view).not.toContain("marker");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("Interface separates built-in and external extensions without repeating their Pi part", async () => {
	const root = mkdtempSync(join(tmpdir(), "piu-extensions-"));
	try {
		cpSync(
			join(import.meta.dir, "fixtures/extensions/counter"),
			join(root, "counter"),
			{ recursive: true },
		);
		await using piu = await startPiu({
			script,
			height: 80,
			extensions: root,
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		const piExtension = join(
			piu.dir,
			"extensions",
			"counter",
			"pi-extension.ts",
		);
		writeFileSync(
			join(piu.dir, "agent", "settings.json"),
			JSON.stringify({
				retry: { baseDelayMs: 20 },
				compaction: { keepRecentTokens: 1, reserveTokens: 0 },
				extensions: [piExtension],
				packages: [{ source: piExtension }],
			}),
		);
		const view = await openExtensions(piu);
		expect(view).toMatch(/^Builtin extensions\b/mu);
		expect(view).toMatch(/^ {2}chat\s+builtin\s+enabled/mu);
		expect(view).toMatch(/^External extensions\b/mu);
		expect(view).toMatch(
			/^ {2}counter\s+personal\s+disabled\s+\+ Pi extension/mu,
		);
		expect(view).not.toContain("pi-extension");
		writeFileSync(
			join(piu.dir, "agent", "settings.json"),
			JSON.stringify({
				retry: { baseDelayMs: 20 },
				compaction: { keepRecentTokens: 1, reserveTokens: 0 },
				packages: [{ source: piExtension }],
			}),
		);
		piu.mockInput.pressKey("\x1b[5;5~");
		await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
		piu.mockInput.pressKey("\x1b[6;5~");
		const fromPackage = modalText(
			piu,
			await piu.waitForFrame((frame) => frame.includes("External extensions")),
		);
		expect(fromPackage).not.toContain("pi-extension");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Opening Extensions discovers a new file without running it or restarting the Backend", async () => {
	await using piu = await startPiu({ script, height: 40 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const log = join(piu.dir, "pids.jsonl");
	for (let attempt = 0; !existsSync(log) && attempt < 400; attempt++)
		await Bun.sleep(10);
	const before = readFileSync(log, "utf8");
	await openExtensions(piu);
	piu.mockInput.pressKey("\x1b[5;5~");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
	const marker = join(piu.dir, "marker.txt");
	mkdirSync(join(piu.dir, "agent", "extensions"), { recursive: true });
	writeFileSync(
		join(piu.dir, "agent", "extensions", "fresh.ts"),
		`import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\nexport default function () {}\n`,
	);
	piu.mockInput.pressKey("\x1b[6;5~");
	const view = modalText(
		piu,
		await piu.waitForFrame((frame) => frame.includes("fresh")),
	);
	expect(view).toMatch(/fresh\s+file: extensions\/fresh\.ts\s+enabled/u);
	expect(existsSync(marker)).toBe(false);
	expect(readFileSync(log, "utf8")).toBe(before);
});

test("the Agentic inventory reads metadata without running anything", () => {
	const source = readFileSync(
		join(import.meta.dir, "../src/extension-inventory.ts"),
		"utf8",
	);
	for (const forbidden of [
		"child_process",
		"Bun.spawn",
		"Bun.$",
		"execFile",
		"spawnSync",
	])
		expect(source).not.toContain(forbidden);
	expect(source).not.toMatch(/\bimport\s*\(/u);
});

function hasScrollBar(piu: Parameters<typeof openSettings>[0], frame: string) {
	const bounds = modalBounds(piu);
	if (!bounds) return false;
	return frame
		.split("\n")
		.slice(bounds.top, bounds.top + bounds.height)
		.some((row) =>
			/[█▀▄]/u.test(row.slice(bounds.left, bounds.left + bounds.width)),
		);
}

test("The Extensions list scrolls below fixed tabs and resets on tab switch", async () => {
	await using piu = await startPiu({ script, height: 24 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	mkdirSync(join(piu.dir, "agent", "extensions"), { recursive: true });
	for (let at = 1; at <= 30; at++)
		writeFileSync(
			join(
				piu.dir,
				"agent",
				"extensions",
				`ext-${String(at).padStart(2, "0")}.ts`,
			),
			emptyExtension,
		);
	await openSettings(piu);
	piu.mockInput.pressKey("\x1b[6;5~");
	const view = modalText(
		piu,
		await piu.waitForFrame((frame) => frame.includes("ext-01")),
	);
	expect(view).toContain("ext-01");
	const bounds = modalBounds(piu);
	if (!bounds) throw new Error("no Modal");
	for (
		let step = 0;
		step < 60 && !piu.captureCharFrame().includes("ext-30");
		step++
	) {
		await piu.mockMouse.scroll(bounds.left + 5, bounds.top + 9, "down");
		await piu.renderOnce();
	}
	const scrolled = await piu.waitForFrame((frame) => frame.includes("ext-30"));
	expect(scrolled).not.toContain("ext-01");
	expect(scrolled).toMatch(/Global +Extensions +Hotkeys/u);
	expect(hasScrollBar(piu, scrolled)).toBe(true);
	piu.mockInput.pressKey("\x1b[5;5~");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
	piu.mockInput.pressKey("\x1b[6;5~");
	const reset = await piu.waitForFrame(
		(frame) => frame.includes("ext-01") && !frame.includes("ext-30"),
	);
	expect(reset).toContain("Global");
});
