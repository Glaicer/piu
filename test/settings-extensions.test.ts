import { expect, test } from "bun:test";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Renderable, ScrollBoxRenderable } from "@opentui/core";
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

async function openExtensions(
	piu: Parameters<typeof openSettings>[0],
	ready: (frame: string) => boolean,
) {
	await openSettings(piu);
	piu.mockInput.pressKey("\x1b[6;5~");
	return waitForExtensions(piu, ready);
}

async function waitForExtensions(
	piu: Parameters<typeof openSettings>[0],
	ready: (view: string) => boolean,
) {
	const frame = await piu.waitForFrame((frame) => {
		const view = modalText(piu, frame);
		return (
			view.includes("Agentic") && view.includes("Interface") && ready(view)
		);
	});
	return modalText(piu, frame);
}

test("Extensions is the second built-in Settings tab", async () => {
	await using piu = await startPiu({ script, config: minimal, height: 32 });
	const global = await openSettings(piu);
	expect(global).toMatch(/Global +Extensions +Hotkeys/);
	expect(global).toMatch(/Theme +auto/);
	piu.mockInput.pressKey("\x1b[6;5~");
	await piu.waitForFrame(
		(frame) => frame.includes("Interface") && frame.includes("builtin:mcp"),
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
		const rows = [
			/active\s+file: extensions\/active\.ts\s+enabled/u,
			/index\s+file: extensions\/nested\/index\.js\s+enabled/u,
			/off\s+file: extensions\/off\.ts\s+disabled/u,
			/extensions\/third\s+package: \.\/pkg\s+disabled/u,
			/builtin:tool-search\s+builtin\s+enabled/u,
			/builtin:mcp\s+builtin\s+disabled/u,
		];
		const view = await openExtensions(piu, (frame) =>
			rows.every((row) => row.test(frame)),
		);
		expect(view).toMatch(/^Agentic\b/mu);
		for (const row of rows) expect(view).toMatch(row);
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
		const view = await openExtensions(piu, (frame) =>
			frame.includes("extensions/fallback.ts"),
		);
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
		const view = await openExtensions(
			piu,
			(frame) =>
				frame.includes("External extensions") && frame.includes("counter"),
		);
		expect(view).toMatch(/^Builtin extensions\b/mu);
		expect(view).toMatch(/^ {2}chat\s+builtin\s+enabled/mu);
		expect(view).toMatch(/^External extensions\b/mu);
		expect(view).toMatch(
			/^ {2}counter\s+personal\s+enabled\s+\+ Pi extension\s+not placed/mu,
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
			await piu.waitForFrame(
				(frame) =>
					frame.includes("External extensions") &&
					frame.includes("builtin:mcp"),
			),
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
	await openExtensions(piu, (frame) => frame.includes("builtin:mcp"));
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

function modalScrollBox(piu: Parameters<typeof openSettings>[0]) {
	const bounds = modalBounds(piu);
	if (!bounds) return undefined;
	const boxes: ScrollBoxRenderable[] = [];
	const walk = (node: Renderable) => {
		if (!node.visible) return;
		if (
			node instanceof ScrollBoxRenderable &&
			node.screenX >= bounds.left &&
			node.screenX + node.width <= bounds.left + bounds.width &&
			node.screenY >= bounds.top &&
			node.screenY + node.height <= bounds.top + bounds.height
		)
			boxes.push(node);
		for (const child of node.getChildren()) walk(child);
	};
	walk(piu.renderer.root);
	return boxes.find((box) => box.scrollHeight > box.viewport.height);
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
	const tabs = /Global +Extensions +Hotkeys/u;
	const scrolled = modalText(
		piu,
		await piu.waitForFrame((frame) => {
			const scrollbox = modalScrollBox(piu);
			const view = modalText(piu, frame);
			return (
				view.includes("ext-30") &&
				!view.includes("ext-01") &&
				tabs.test(view) &&
				!!scrollbox &&
				scrollbox.scrollTop > 0 &&
				scrollbox.verticalScrollBar.visible
			);
		}),
	);
	expect(scrolled).not.toContain("ext-01");
	expect(scrolled).toMatch(tabs);
	const scrollbox = modalScrollBox(piu);
	expect(scrollbox?.scrollTop).toBeGreaterThan(0);
	expect(scrollbox?.verticalScrollBar.visible).toBe(true);
	piu.mockInput.pressKey("\x1b[5;5~");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
	piu.mockInput.pressKey("\x1b[6;5~");
	const reset = await piu.waitForFrame(
		(frame) =>
			tabs.test(frame) && frame.includes("ext-01") && !frame.includes("ext-30"),
	);
	expect(reset).toContain("Global");
});

test("Agentic drops a package file its manifest excludes", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "piu-agent-"));
	try {
		await using piu = await startPiu({
			script,
			height: 40,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		mkdirSync(join(agentDir, "pkg", "extensions"), { recursive: true });
		writeFileSync(
			join(agentDir, "pkg", "package.json"),
			JSON.stringify({
				name: "pkg",
				pi: {
					extensions: ["./extensions/*.ts", "!./extensions/skip.ts"],
				},
			}),
		);
		writeFileSync(
			join(agentDir, "pkg", "extensions", "keep.ts"),
			emptyExtension,
		);
		writeFileSync(
			join(agentDir, "pkg", "extensions", "skip.ts"),
			emptyExtension,
		);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({ packages: ["./pkg"] }),
		);
		const view = await openExtensions(piu, (frame) =>
			frame.includes("extensions/keep"),
		);
		expect(view).toMatch(/extensions\/keep\s+package: \.\/pkg\s+enabled/u);
		expect(view).not.toContain("skip");
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});

test("Agentic finds an installed git package by its source without the ref", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "piu-agent-"));
	try {
		await using piu = await startPiu({
			script,
			height: 40,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		const root = join(agentDir, "git", "github.com", "example", "pi-tools");
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				name: "pi-tools",
				pi: { extensions: ["./src/tool.ts"] },
			}),
		);
		writeFileSync(join(root, "src", "tool.ts"), emptyExtension);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				packages: ["git:github.com/example/pi-tools@v1"],
			}),
		);
		const view = await openExtensions(piu, (frame) =>
			frame.includes("src/tool"),
		);
		expect(view).toMatch(
			/src\/tool\s+package: git:github\.com\/example\/pi-tools@v1\s+enabled/u,
		);
		expect(view).not.toContain("unavailable");
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});

test("Agentic lists one row for a package reached through a symlink", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "piu-agent-"));
	try {
		await using piu = await startPiu({
			script,
			height: 40,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		mkdirSync(join(agentDir, "pkg", "extensions"), { recursive: true });
		writeFileSync(
			join(agentDir, "pkg", "package.json"),
			JSON.stringify({
				name: "pkg",
				pi: { extensions: ["./extensions/keep.ts"] },
			}),
		);
		writeFileSync(
			join(agentDir, "pkg", "extensions", "keep.ts"),
			emptyExtension,
		);
		symlinkSync(join(agentDir, "pkg"), join(agentDir, "linked"), "dir");
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				packages: [{ source: "./linked", extensions: [] }, "./pkg"],
			}),
		);
		const rows = (view: string) =>
			view
				.split("\n")
				.filter((line) => line.trimStart().startsWith("extensions/keep "));
		const disabled = /extensions\/keep\s+package: \.\/linked\s+disabled/u;
		const enabled = /extensions\/keep\s+package: \.\/pkg\s+enabled/u;
		const ready = (state: RegExp) => (view: string) =>
			rows(view).length === 1 && state.test(view);
		const disabledFirst = await openExtensions(piu, ready(disabled));
		expect(rows(disabledFirst)).toEqual([expect.stringMatching(disabled)]);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				packages: ["./pkg", { source: "./linked", extensions: [] }],
			}),
		);
		piu.mockInput.pressKey("\x1b[5;5~");
		await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
		piu.mockInput.pressKey("\x1b[6;5~");
		const disabledLast = await waitForExtensions(piu, ready(enabled));
		expect(rows(disabledLast)).toEqual([expect.stringMatching(enabled)]);
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});

test("Agentic filters a package manifest before collapsing symlinked paths", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "piu-agent-"));
	try {
		await using piu = await startPiu({
			script,
			height: 40,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		mkdirSync(join(agentDir, "pkg"), { recursive: true });
		writeFileSync(
			join(agentDir, "pkg", "package.json"),
			JSON.stringify({
				name: "pkg",
				pi: { extensions: ["./real.ts", "./alias.ts", "-./real.ts"] },
			}),
		);
		writeFileSync(join(agentDir, "pkg", "real.ts"), emptyExtension);
		symlinkSync("real.ts", join(agentDir, "pkg", "alias.ts"));
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({ packages: ["./pkg"] }),
		);
		const expected = /alias\s+package: \.\/pkg\s+enabled/u;
		const view = await openExtensions(piu, (view) => expected.test(view));
		expect(view).toMatch(expected);
		expect(view).not.toContain("real");
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});

test("Agentic keeps extensions from a later package when an earlier one does not autoload them", async () => {
	await using piu = await startPiu({ script, height: 40 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const agentDir = join(piu.dir, "agent");
	mkdirSync(join(agentDir, "pkg", "extensions"), { recursive: true });
	writeFileSync(join(agentDir, "pkg", "extensions", "keep.ts"), emptyExtension);
	symlinkSync("pkg", join(agentDir, "linked"), "dir");
	writeFileSync(
		join(agentDir, "settings.json"),
		JSON.stringify({
			packages: [{ source: "./linked", autoload: false }, "./pkg"],
		}),
	);
	const rows = (view: string) =>
		view
			.split("\n")
			.filter((line) => line.trimStart().startsWith("extensions/keep "));
	const expected = /extensions\/keep\s+package: \.\/pkg\s+enabled/u;
	const view = await openExtensions(
		piu,
		(view) => rows(view).length === 1 && expected.test(view),
	);
	expect(rows(view)).toEqual([expect.stringMatching(expected)]);
	writeFileSync(
		join(agentDir, "settings.json"),
		JSON.stringify({
			packages: [
				{ source: "./linked", autoload: false, extensions: ["!**/keep.ts"] },
				"./pkg",
			],
		}),
	);
	piu.mockInput.pressKey("\x1b[5;5~");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
	piu.mockInput.pressKey("\x1b[6;5~");
	const excluded = /extensions\/keep\s+package: \.\/linked\s+disabled/u;
	const reopened = await waitForExtensions(
		piu,
		(view) => rows(view).length === 1 && excluded.test(view),
	);
	expect(rows(reopened)).toEqual([expect.stringMatching(excluded)]);
});

test("Agentic filters a package manifest before collapsing symlinked directories", async () => {
	await using piu = await startPiu({ script, height: 40 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const agentDir = join(piu.dir, "agent");
	const pkg = join(agentDir, "pkg");
	mkdirSync(join(pkg, "real-dir"), { recursive: true });
	writeFileSync(join(pkg, "real-dir", "index.ts"), emptyExtension);
	symlinkSync("real-dir", join(pkg, "alias-dir"), "dir");
	writeFileSync(
		join(pkg, "package.json"),
		JSON.stringify({
			pi: { extensions: ["./real-dir", "./alias-dir", "-./real-dir/index.ts"] },
		}),
	);
	writeFileSync(
		join(agentDir, "settings.json"),
		JSON.stringify({ packages: ["./pkg"] }),
	);
	const expected = /alias-dir\/index\s+package: \.\/pkg\s+enabled/u;
	const view = await openExtensions(piu, (view) => expected.test(view));
	expect(view).toMatch(expected);
	expect(view).not.toContain("real-dir/index");
	writeFileSync(
		join(agentDir, "settings.json"),
		JSON.stringify({ packages: [{ source: "./pkg" }] }),
	);
	writeFileSync(
		join(pkg, "package.json"),
		JSON.stringify({
			pi: {
				extensions: [
					"./real-dir",
					"./alias-dir",
					"!real-dir/index.ts",
					"+real-dir/index.ts",
				],
			},
		}),
	);
	piu.mockInput.pressKey("\x1b[5;5~");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
	piu.mockInput.pressKey("\x1b[6;5~");
	const restored = /real-dir\/index\s+package: \.\/pkg\s+enabled/u;
	const reopened = await waitForExtensions(piu, (view) => restored.test(view));
	expect(reopened).toMatch(restored);
	expect(reopened).not.toContain("alias-dir/index");
});

test("Agentic finds a git package whose source names the ref after .git", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "piu-agent-"));
	try {
		await using piu = await startPiu({
			script,
			height: 40,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		const root = join(agentDir, "git", "github.com", "example", "pi-tools");
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				name: "pi-tools",
				pi: { extensions: ["./src/tool.ts"] },
			}),
		);
		writeFileSync(join(root, "src", "tool.ts"), emptyExtension);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				packages: ["https://github.com/example/pi-tools.git@v1"],
			}),
		);
		const view = await openExtensions(piu, (frame) =>
			frame.includes("src/tool"),
		);
		expect(view).toMatch(
			/src\/tool\s+package: https:\/\/github\.com\/example\/pi-tools\.git@v1\s+enabled/u,
		);
		expect(view).not.toContain("unavailable");
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});

test("Agentic does not scan the Git cache for a source without a repository", async () => {
	await using piu = await startPiu({ script, height: 40 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const agentDir = join(piu.dir, "agent");
	const host = join(agentDir, "git", "github.com");
	const hostExtensions = join(host, "extensions");
	const repoExtensions = join(host, "..org", "repo", "extensions");
	mkdirSync(hostExtensions, { recursive: true });
	mkdirSync(repoExtensions, { recursive: true });
	writeFileSync(join(hostExtensions, "host-tool.ts"), emptyExtension);
	writeFileSync(join(repoExtensions, "repo-tool.ts"), emptyExtension);
	writeFileSync(
		join(agentDir, "settings.json"),
		JSON.stringify({
			packages: [
				"git:github.com/",
				"git:github.com/.",
				"git:github.com/org/..",
				"git:github.com/..org/repo",
			],
		}),
	);
	const expected = [
		/git:github\.com\/\s+package: git:github\.com\/\s+unavailable/u,
		/git:github\.com\/\.\s+package: git:github\.com\/\.\s+unavailable/u,
		/git:github\.com\/org\/\.\.\s+package: git:github\.com\/org\/\.\.\s+unavailable/u,
		/extensions\/repo-tool\s+package: git:github\.com\/\.\.org\/repo\s+enabled/u,
	];
	const view = await openExtensions(piu, (view) =>
		expected.every((row) => row.test(view)),
	);
	for (const row of expected) expect(view).toMatch(row);
	expect(view).not.toContain("host-tool");
});

test("an unreadable Pi settings entry reports an error and keeps the rest of the tab", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "piu-agent-"));
	try {
		await using piu = await startPiu({
			script,
			height: 40,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		mkdirSync(join(agentDir, "extensions"), { recursive: true });
		writeFileSync(join(agentDir, "extensions", "active.ts"), emptyExtension);
		writeFileSync(join(agentDir, "package-tool.ts"), emptyExtension);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				extensions: ["file://host/foo"],
				packages: ["file://host/bar", "./package-tool.ts"],
			}),
		);
		const expected = [
			/extensions "file:\/\/host\/foo"/u,
			/packages "file:\/\/host\/bar"/u,
			/active\s+file: extensions\/active\.ts\s+enabled/u,
			/package-tool\s+package: \.\/package-tool\.ts\s+enabled/u,
			/^ {2}chat\s+builtin\s+enabled/mu,
		];
		const view = await openExtensions(piu, (view) =>
			expected.every((row) => row.test(view)),
		);
		for (const row of expected) expect(view).toMatch(row);
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});

test("Agentic keeps the agent dir exactly as the Backend environment spells it", async () => {
	const base = mkdtempSync(join(tmpdir(), "piu-agent-"));
	const agentDir = join(base, "agent ");
	try {
		await using piu = await startPiu({
			script,
			height: 40,
			backendEnv: { PI_CODING_AGENT_DIR: agentDir },
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		mkdirSync(join(agentDir, "extensions"), { recursive: true });
		writeFileSync(join(agentDir, "extensions", "spaced.ts"), emptyExtension);
		const view = await openExtensions(piu, (frame) =>
			frame.includes("extensions/spaced.ts"),
		);
		expect(view).toMatch(/spaced\s+file: extensions\/spaced\.ts\s+enabled/u);
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});
