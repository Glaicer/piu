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
import {
	clickExtensionAction,
	extensionDetails,
	extensionList,
	modalBounds,
	modalText,
	openSettings,
	selectExtension,
	startPiu,
} from "./harness.ts";

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

function listed(view: string, name: string) {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^\\s*[●○✕] ${escaped}( \\*)?(\\s|$)`, "mu").test(view);
}

function listedRows(view: string, name: string) {
	return view.split("\n").filter((line) => listed(line, name));
}

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
			["active", /^active {2}file: extensions\/active\.ts {2}enabled/u],
			["index", /^index {2}file: extensions\/nested\/index\.js {2}enabled/u],
			["off", /^off {2}file: extensions\/off\.ts {2}disabled/u],
			[
				"extensions/third",
				/^extensions\/third {2}package: \.\/pkg {2}disabled/u,
			],
			["builtin:tool-search", /^builtin:tool-search {2}builtin {2}enabled/u],
			["builtin:mcp", /^builtin:mcp {2}builtin {2}disabled/u],
		] as const;
		const view = await openExtensions(piu, (frame) =>
			rows.every(([name]) => listed(frame, name)),
		);
		expect(view).toMatch(/^Agentic\b/mu);
		expect(view).toContain("Interface");
		for (const [name, details] of rows)
			expect(await selectExtension(piu, name)).toMatch(details);
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
			listed(frame, "fallback"),
		);
		expect(view).not.toContain("marker");
		expect(await selectExtension(piu, "fallback")).toMatch(
			/^fallback {2}file: extensions\/fallback\.ts {2}enabled/u,
		);
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
		expect(view).toMatch(/^External extensions\b/mu);
		expect(view).not.toContain("pi-extension");
		const builtinRows = view.slice(
			view.indexOf("Builtin extensions"),
			view.indexOf("External extensions"),
		);
		expect(listed(builtinRows, "chat")).toBe(true);
		expect(
			listed(view.slice(view.indexOf("External extensions")), "counter"),
		).toBe(true);
		expect(await selectExtension(piu, "chat")).toMatch(
			/^chat {2}The conversation\b.* {2}builtin {2}enabled/u,
		);
		expect(await selectExtension(piu, "counter")).toMatch(
			/^counter {2}personal {2}enabled {2}\+ Pi extension {3}not placed/u,
		);
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
		await piu.waitForFrame((frame) => listed(frame, "fresh")),
	);
	expect(listed(view, "fresh")).toBe(true);
	expect(await selectExtension(piu, "fresh")).toMatch(
		/^fresh {2}file: extensions\/fresh\.ts {2}enabled/u,
	);
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
			const list = extensionList(piu, frame);
			return (
				list.includes("ext-30") &&
				!list.includes("ext-01") &&
				tabs.test(view) &&
				!!scrollbox &&
				scrollbox.scrollTop > 0 &&
				scrollbox.verticalScrollBar.visible
			);
		}),
	);
	expect(extensionList(piu, piu.captureCharFrame())).not.toContain("ext-01");
	expect(scrolled).toMatch(tabs);
	const scrollbox = modalScrollBox(piu);
	expect(scrollbox?.scrollTop).toBeGreaterThan(0);
	expect(scrollbox?.verticalScrollBar.visible).toBe(true);
	piu.mockInput.pressKey("\x1b[5;5~");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
	piu.mockInput.pressKey("\x1b[6;5~");
	const reset = await piu.waitForFrame(
		(frame) =>
			tabs.test(frame) &&
			extensionList(piu, frame).includes("ext-01") &&
			!extensionList(piu, frame).includes("ext-30"),
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
			listed(frame, "extensions/keep"),
		);
		expect(view).not.toContain("skip");
		expect(await selectExtension(piu, "extensions/keep")).toMatch(
			/^extensions\/keep {2}package: \.\/pkg {2}enabled/u,
		);
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
		await openExtensions(piu, (frame) => listed(frame, "src/tool"));
		expect(await selectExtension(piu, "src/tool")).toMatch(
			/^src\/tool {2}package: git:github\.com\/example\/pi-tools@v1 {2}enabled/u,
		);
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
		const one = (view: string) =>
			listedRows(view, "extensions/keep").length === 1;
		const disabled = /^extensions\/keep {2}package: \.\/linked {2}disabled/u;
		const enabled = /^extensions\/keep {2}package: \.\/pkg {2}enabled/u;
		expect(one(await openExtensions(piu, one))).toBe(true);
		expect(await selectExtension(piu, "extensions/keep")).toMatch(disabled);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				packages: ["./pkg", { source: "./linked", extensions: [] }],
			}),
		);
		piu.mockInput.pressKey("\x1b[5;5~");
		await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
		piu.mockInput.pressKey("\x1b[6;5~");
		expect(one(await waitForExtensions(piu, one))).toBe(true);
		expect(await selectExtension(piu, "extensions/keep")).toMatch(enabled);
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
		const view = await openExtensions(piu, (view) => listed(view, "alias"));
		expect(view).not.toContain("real");
		expect(await selectExtension(piu, "alias")).toMatch(
			/^alias {2}package: \.\/pkg {2}enabled/u,
		);
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
	const one = (view: string) =>
		listedRows(view, "extensions/keep").length === 1;
	expect(one(await openExtensions(piu, one))).toBe(true);
	expect(await selectExtension(piu, "extensions/keep")).toMatch(
		/^extensions\/keep {2}package: \.\/pkg {2}enabled/u,
	);
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
	expect(one(await waitForExtensions(piu, one))).toBe(true);
	expect(await selectExtension(piu, "extensions/keep")).toMatch(
		/^extensions\/keep {2}package: \.\/linked {2}disabled/u,
	);
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
	const view = await openExtensions(piu, (view) =>
		listed(view, "alias-dir/index"),
	);
	expect(view).not.toContain("real-dir/index");
	expect(await selectExtension(piu, "alias-dir/index")).toMatch(
		/^alias-dir\/index {2}package: \.\/pkg {2}enabled/u,
	);
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
	const reopened = await waitForExtensions(piu, (view) =>
		listed(view, "real-dir/index"),
	);
	expect(reopened).not.toContain("alias-dir/index");
	expect(await selectExtension(piu, "real-dir/index")).toMatch(
		/^real-dir\/index {2}package: \.\/pkg {2}enabled/u,
	);
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
		await openExtensions(piu, (frame) => listed(frame, "src/tool"));
		expect(await selectExtension(piu, "src/tool")).toMatch(
			/^src\/tool {2}package: https:\/\/github\.com\/example\/pi-tools\.git@v1 {2}enabled/u,
		);
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
		[
			"git:github.com/",
			/^git:github\.com\/ {2}package: git:github\.com\/ {2}unavailable/u,
		],
		[
			"git:github.com/.",
			/^git:github\.com\/\. {2}package: git:github\.com\/\. {2}unavailable/u,
		],
		[
			"git:github.com/org/..",
			/^git:github\.com\/org\/\.\. {2}package: git:github\.com\/org\/\.\. {2}unavailable/u,
		],
		[
			"extensions/repo-tool",
			/^extensions\/repo-tool {2}package: git:github\.com\/\.\.org\/repo {2}enabled/u,
		],
	] as const;
	const view = await openExtensions(piu, (view) =>
		expected.every(([name]) => listed(view, name)),
	);
	expect(view).not.toContain("host-tool");
	for (const [name, details] of expected)
		expect(await selectExtension(piu, name)).toMatch(details);
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
		const errors = [
			/extensions "file:\/\/host\/foo"/u,
			/packages "file:\/\/host\/bar"/u,
		];
		const rows = [
			["active", /^active {2}file: extensions\/active\.ts {2}enabled/u],
			[
				"package-tool",
				/^package-tool {2}package: \.\/package-tool\.ts {2}enabled/u,
			],
			["chat", /^chat {2}The conversation\b.* {2}builtin {2}enabled/u],
		] as const;
		const view = await openExtensions(
			piu,
			(view) =>
				errors.every((error) => error.test(view)) &&
				rows.every(([name]) => listed(view, name)),
		);
		for (const error of errors) expect(view).toMatch(error);
		for (const [name, details] of rows)
			expect(await selectExtension(piu, name)).toMatch(details);
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
		await openExtensions(piu, (frame) => listed(frame, "spaced"));
		expect(await selectExtension(piu, "spaced")).toMatch(
			/^spaced {2}file: extensions\/spaced\.ts {2}enabled/u,
		);
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test("Selecting an extension shows its origin, state and actions beside the list", async () => {
	await using piu = await startPiu({ script, height: 40 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const agentDir = join(piu.dir, "agent");
	mkdirSync(join(agentDir, "extensions"), { recursive: true });
	writeFileSync(join(agentDir, "extensions", "alpha.ts"), emptyExtension);
	writeFileSync(join(agentDir, "extensions", "beta.ts"), emptyExtension);
	writeFileSync(
		join(agentDir, "settings.json"),
		JSON.stringify({ extensions: ["-extensions/beta.ts"] }),
	);
	await openExtensions(
		piu,
		(view) => listed(view, "alpha") && listed(view, "beta"),
	);
	const list = extensionList(piu, piu.captureCharFrame());
	expect(list).toContain("● alpha");
	expect(list).toContain("○ beta");
	expect(list).not.toContain("file:");
	expect(extensionDetails(piu, piu.captureCharFrame())).toMatch(
		/^alpha {2}file: extensions\/alpha\.ts {2}enabled {2}Disable +Delete$/u,
	);
	expect(await selectExtension(piu, "beta")).toMatch(
		/^beta {2}file: extensions\/beta\.ts {2}disabled {2}Enable +Delete$/u,
	);
});

test("The details stay in view while the list scrolls to the selected extension", async () => {
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
	await piu.waitForFrame((frame) => listed(frame, "ext-01"));
	for (let step = 1; step < 30; step++) piu.mockInput.pressArrow("down");
	const frame = await piu.waitForFrame((frame) =>
		extensionDetails(piu, frame).startsWith("ext-30  "),
	);
	expect(extensionList(piu, frame)).toContain("ext-30");
	expect(extensionList(piu, frame)).not.toContain("ext-01");
	expect(modalText(piu, frame)).toContain("file: extensions/ext-30.ts");
	await clickExtensionAction(piu, "Disable");
	const changed = await piu.waitForFrame((frame) =>
		extensionDetails(piu, frame).includes("* changed"),
	);
	expect(extensionDetails(piu, changed)).toMatch(
		/^ext-30 .* disabled {3}\* changed/u,
	);
	expect(extensionList(piu, changed)).toContain("○ ext-30 *");
});

test("An Extension's details show the description from its package.json", async () => {
	const root = mkdtempSync(join(tmpdir(), "piu-extensions-"));
	try {
		cpSync(
			join(import.meta.dir, "fixtures/extensions/counter"),
			join(root, "counter"),
			{ recursive: true },
		);
		writeFileSync(
			join(root, "counter", "package.json"),
			JSON.stringify({ description: "Counts the turns" }),
		);
		await using piu = await startPiu({ script, height: 80, extensions: root });
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		await openExtensions(piu, (view) => listed(view, "counter"));
		expect(await selectExtension(piu, "counter")).toMatch(
			/^counter {2}Counts the turns {2}personal {2}enabled/u,
		);
		expect(await selectExtension(piu, "chat")).toMatch(
			/^chat {2}The conversation\b.* {2}builtin {2}enabled/u,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
