import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireInstallLock } from "../src/install-lock.ts";
import { blocker } from "./blocker.ts";
import {
	bottomLine,
	clickExtensionAction,
	extensionDetails,
	extensionList,
	openSettings,
	type Piu,
	panelText,
	selectExtension,
	startPiu,
} from "./harness.ts";
import { eventually } from "./process.ts";

const script = { replies: [] };

test("Config rejects unknown Extension names and fields, and protects chat and input", async () => {
	for (const [extensions, path] of [
		[{ missing: { enabled: false } }, "extensions.missing"],
		[{ model: { typo: false } }, "extensions.model.typo"],
		[{ chat: { enabled: false } }, "extensions.chat.enabled"],
		[{ input: { enabled: false } }, "extensions.input.enabled"],
	] as const) {
		await expect(startPiu({ script, config: { extensions } })).rejects.toThrow(
			path,
		);
	}
});

test("A disabled Extension does not show its Module, even with Module settings", async () => {
	await using piu = await startPiu({
		script,
		config: {
			extensions: { model: { enabled: false } },
			modules: { "model.current": {} },
		},
	});
	const frame = await piu.waitForFrame((frame) => frame.includes("/ commands"));
	expect(bottomLine(frame)).not.toContain("faux-1");
});

async function extensions(piu: Piu, row: string) {
	const name = extensionName(row);
	await openSettings(piu);
	piu.mockInput.pressKey("\x1b[6;5~");
	await piu.waitForFrame(
		(frame) =>
			extensionList(piu, frame)
				.split("\n")
				.some((line) => line.slice(2).replace(/ \*$/, "") === name) &&
			frame.includes("Save [ctrl+s]"),
	);
	return selectExtension(piu, name);
}

const extensionName = (row: string) => row.split("  ")[0] ?? row;

async function click(piu: Piu, _details: string, row: string, action: string) {
	await selectExtension(piu, extensionName(row));
	const toggle = { "[x]": "Disable", "[ ]": "Enable" }[action];
	const label = toggle
		? `${toggle}${row.includes("package:") ? " package" : ""}`
		: action;
	return clickExtensionAction(piu, label);
}

const save = (piu: Piu) => piu.mockInput.pressKey("s", { ctrl: true });

async function restarted(piu: Piu) {
	await eventually(() => piu.exits.length > 0, "the Restart");
	expect(piu.exits[0]?.restartArgs).toBeDefined();
}

async function applied(piu: Piu) {
	save(piu);
	await restarted(piu);
}

const boltVersion = "1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off)";

function fakeBackend(dir: string, version: string, compile = "exit 0") {
	const command = join(dir, "backend");
	writeFileSync(
		command,
		`#!/bin/sh
for arg; do last=$arg; done
if [ "$last" = --version ]; then echo '${version}'; exit 0; fi
if [ "$1" = compile ]; then
  echo compile >> "$PI_CODING_AGENT_DIR/compile-calls"
  ${compile}
fi
if [ "$1" = remove ]; then
  printf '%s\\n' "$@" > "$PI_CODING_AGENT_DIR/remove-args"
  exit 0
fi
exec env "$@"
`,
		{ mode: 0o700 },
	);
	return command;
}

function looseFile(dir: string) {
	const extensions = join(dir, "agent", "extensions");
	mkdirSync(extensions, { recursive: true });
	writeFileSync(join(extensions, "loose.ts"), "export default () => {};");
}
const read = (path: string) => readFileSync(path, "utf8");

function personal() {
	const dir = mkdtempSync(join(tmpdir(), "piu-extension-edits-"));
	const path = join(dir, "config.json");
	const folder = join(dir, "extensions", "editable");
	mkdirSync(folder, { recursive: true });
	const imported = join(dir, "index.log");
	writeFileSync(
		join(folder, "index.tsx"),
		`import { appendFileSync } from "node:fs";
		appendFileSync(${JSON.stringify(imported)}, "imported\\n");
		export default {
		modules: [{ id: "view", render: () => <text>Editable Module</text> }],
		commands: [{ name: "editable-command", run() {} }],
		channels: ["edit"],
	};`,
	);
	const marker = join(dir, "pi-extension.log");
	writeFileSync(
		join(folder, "pi-extension.ts"),
		`import { appendFileSync } from "node:fs";
		export default () => appendFileSync(${JSON.stringify(marker)}, "loaded\\n");`,
	);
	return {
		dir,
		path,
		folder,
		marker,
		imported,
		[Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }),
	};
}
const personalConfig = {
	placement: { agent: ["chat.messages", "editable.view"] },
	modules: { "editable.view": { example: true } },
	keybindings: {
		"command.editable-command": "alt+e",
		"command.model": "ctrl+l",
	},
	extensions: { background: { enabled: false } },
};

test("Bindings to unknown commands are ignored, and a disabled Extension is not imported for them", async () => {
	using fixture = personal();
	const { dir, imported } = fixture;
	await using piu = await startPiu({
		dir,
		script,
		config: {
			...personalConfig,
			keybindings: {
				...personalConfig.keybindings,
				"command.no-such-command": "alt+q",
			},
			extensions: { editable: { enabled: false } },
		},
	});
	const frame = await piu.waitForFrame((frame) => frame.includes("/ commands"));
	expect(frame).not.toContain("Editable Module");
	expect(existsSync(imported)).toBe(false);
});

test("Interface toggles in a draft, persists on Save, and restores placement after the next launch", async () => {
	using fixture = personal();
	const { dir, path, marker } = fixture;
	{
		await using piu = await startPiu({
			dir,
			script,
			config: personalConfig,
			height: 65,
		});
		await piu.waitForFrame(
			(frame) => frame.includes("Editable Module") && frame.includes("faux-1"),
		);
		expect(read(marker)).toBe("loaded\n");
		const before = read(path);
		const frame = await extensions(piu, "editable  personal");
		await click(piu, frame, "editable  personal", "[x]");
		await piu.waitForFrame((frame) =>
			/editable +personal +disabled.*changed/.test(
				extensionDetails(piu, frame),
			),
		);
		expect(read(path)).toBe(before);
		await applied(piu);
		expect(JSON.parse(read(path))).toMatchObject({
			...personalConfig,
			extensions: {
				...personalConfig.extensions,
				editable: { enabled: false },
			},
		});
	}
	{
		await using piu = await startPiu({
			dir,
			script,
			config: read(path),
			height: 65,
		});
		const ready = await piu.waitForFrame(
			(frame) => frame.includes("faux-1") && frame.includes("/ commands"),
		);
		expect(ready).not.toContain("Editable Module");
		expect(read(marker)).toBe("loaded\n");
		await piu.mockInput.typeText("/editable");
		const query = await piu.waitForFrame((frame) =>
			frame.includes("/editable"),
		);
		expect(query).not.toContain("/editable-command");
		piu.mockInput.pressKey("u", { ctrl: true });
		const frame = await extensions(piu, "editable  personal");
		await click(piu, frame, "editable  personal", "[ ]");
		await applied(piu);
		expect(JSON.parse(read(path)).extensions).toEqual(
			personalConfig.extensions,
		);
	}
	{
		await using piu = await startPiu({ dir, script, config: read(path) });
		const frame = await piu.waitForFrame(
			(frame) => frame.includes("Editable Module") && frame.includes("faux-1"),
		);
		expect(panelText(frame, 5)).toContain("Editable Module");
		await piu.mockInput.typeText("/editable");
		await piu.waitForFrame((frame) => frame.includes("/editable-command"));
		expect(read(marker)).toBe("loaded\nloaded\n");
	}
});

test("Deleting shows both targets, cancel leaves them intact, and accepting clears personal references", async () => {
	using fixture = personal();
	const { dir, path, folder } = fixture;
	{
		await using piu = await startPiu({
			dir,
			script,
			height: 65,
			config: personalConfig,
		});
		const agentDir = join(dir, "agent");
		const file = join(agentDir, "loose.ts");
		writeFileSync(file, "export default () => {};");
		const settings = join(agentDir, "settings.json");
		const original = {
			...JSON.parse(read(settings)),
			extensions: ["./loose.ts"],
			lastChangelogVersion: "kept",
		};
		writeFileSync(settings, JSON.stringify(original));
		const initial = await extensions(piu, "editable  personal");
		const before = read(path);
		save(piu);
		await piu.renderOnce();
		expect(read(path)).toBe(before);
		expect(read(settings)).toBe(JSON.stringify(original));
		await click(piu, initial, "loose  file:", "Delete");
		const first = await piu.waitForFrame((frame) =>
			/loose +file:.*pending deletion/.test(extensionDetails(piu, frame)),
		);
		await click(piu, first, "editable  personal", "Delete");
		await piu.waitForFrame((frame) =>
			/editable +personal.*pending deletion/.test(extensionDetails(piu, frame)),
		);
		piu.mockInput.pressEscape();
		await piu.waitForFrame((frame) =>
			frame.includes("Discard unsaved Extension changes?"),
		);
		piu.mockInput.pressEnter();
		await piu.waitForFrame(
			(frame) =>
				!frame.includes("Discard unsaved") &&
				/editable +personal.*pending deletion/.test(
					extensionDetails(piu, frame),
				),
		);
		save(piu);
		const confirmation = (frame: string) =>
			frame.includes("Pi extension file: loose.ts") &&
			frame.includes("Personal Extension: editable");
		await piu.waitForFrame(confirmation);
		piu.mockInput.pressEnter();
		await piu.waitForFrame(
			(frame) =>
				!confirmation(frame) &&
				/editable +personal.*pending deletion/.test(
					extensionDetails(piu, frame),
				),
		);
		expect(existsSync(file)).toBe(true);
		expect(existsSync(folder)).toBe(true);
		expect(read(path)).toBe(before);
		expect(read(settings)).toBe(JSON.stringify(original));
		expect(piu.exits).toEqual([]);
		save(piu);
		await piu.waitForFrame(confirmation);
		piu.mockInput.pressArrow("down");
		piu.mockInput.pressEnter();
		await restarted(piu);
		expect(existsSync(file)).toBe(false);
		expect(existsSync(folder)).toBe(false);
		expect(JSON.parse(read(settings))).toEqual({ ...original, extensions: [] });
		expect(JSON.parse(read(path))).toMatchObject({
			placement: { agent: ["chat.messages"] },
			modules: {},
			keybindings: { "command.model": "ctrl+l" },
		});
		expect(JSON.parse(read(path)).keybindings).not.toHaveProperty(
			"command.editable-command",
		);
	}
	await using piu = await startPiu({ dir, script, config: read(path) });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
});

test("A Pi extension file is disabled and enabled without overwriting other settings or Pi's lock", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const path = join(dir, "agent", "settings.json");
	const launch = () => startPiu({ dir, script, height: 40 });
	let before: Record<string, unknown>;
	{
		await using piu = await launch();
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		looseFile(dir);
		before = { ...JSON.parse(read(path)), lastChangelogVersion: "kept" };
		writeFileSync(path, JSON.stringify(before));
		await extensions(piu, "loose  file:");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((frame) =>
			/loose +file:.*disabled.*changed/.test(extensionDetails(piu, frame)),
		);
		mkdirSync(`${path}.lock`);
		save(piu);
		await piu.waitForFrame((frame) =>
			frame.includes("Could not save Extensions"),
		);
		expect(read(path)).toBe(JSON.stringify(before));
		expect(existsSync(`${path}.lock`)).toBe(true);
		expect(piu.exits).toEqual([]);
		rmSync(`${path}.lock`, { recursive: true });
		await applied(piu);
		expect(JSON.parse(read(path))).toEqual({
			...before,
			extensions: ["-extensions/loose.ts"],
		});
	}
	await using piu = await launch();
	const disabled = await extensions(piu, "loose  file:");
	await click(piu, disabled, "loose  file:", "[ ]");
	await applied(piu);
	expect(JSON.parse(read(path))).toEqual({ ...before, extensions: [] });
});

test("Package Save patches only the extension filter and confirmed deletion calls the configured Backend", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const backendCommand = fakeBackend(dir, "1.5.0");
	const launch = () => startPiu({ dir, script, backendCommand, height: 65 });
	const agent = join(dir, "agent");
	const folder = join(agent, "npm", "node_modules", "fixture", "extensions");
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "tool.ts"), "export default () => {};");
	const source = "npm:fixture";
	const path = join(agent, "settings.json");
	const log = join(agent, "remove-args");
	const pkg = { source, skills: [], extensions: ["extensions/*.ts"] };
	const row = "extensions/tool  package:";
	const toggle = async (from: "[x]" | "[ ]") => {
		await using piu = await launch();
		const frame = await extensions(piu, row);
		await click(piu, frame, row, from);
		await applied(piu);
	};
	let original: Record<string, unknown>;
	{
		await using piu = await launch();
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		original = { ...JSON.parse(read(path)), packages: [pkg] };
		writeFileSync(path, JSON.stringify(original));
	}
	await toggle("[x]");
	expect(JSON.parse(read(path))).toEqual({
		...original,
		packages: [{ ...pkg, extensions: [] }],
	});
	await toggle("[ ]");
	expect(JSON.parse(read(path))).toEqual(original);
	await toggle("[x]");
	const edited = { ...pkg, extensions: [], prompts: [] };
	writeFileSync(path, JSON.stringify({ ...original, packages: [edited] }));
	await toggle("[ ]");
	expect(JSON.parse(read(path))).toEqual({
		...original,
		packages: [{ source, skills: [], prompts: [] }],
	});
	await using piu = await launch();
	const frame = await extensions(piu, row);
	await click(piu, frame, row, "Delete");
	save(piu);
	await piu.waitForFrame((frame) => frame.includes("Package: npm:fixture"));
	expect(existsSync(log)).toBe(false);
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await restarted(piu);
	expect(read(log)).toBe("remove\nnpm:fixture\n");
});

test("A single-file package is disabled by removing its entry and enabled back in place", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const path = join(dir, "agent", "settings.json");
	const row = "single  package: ./single.ts";
	let before: Record<string, unknown>;
	{
		await using piu = await startPiu({ dir, script, height: 40 });
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		writeFileSync(join(dir, "agent", "single.ts"), "export default () => {};");
		before = {
			...JSON.parse(read(path)),
			packages: [{ source: "./single.ts", skills: [] }, "npm:other"],
			lastChangelogVersion: "kept",
		};
		writeFileSync(path, JSON.stringify(before));
		const enabled = await extensions(piu, row);
		await click(piu, enabled, row, "[x]");
		await applied(piu);
		expect(JSON.parse(read(path))).toEqual({
			...before,
			packages: ["npm:other"],
		});
	}
	await using piu = await startPiu({ dir, script, height: 40 });
	const disabled = await extensions(piu, row);
	expect(disabled).toMatch(/single +package: \.\/single\.ts +disabled/);
	await click(piu, disabled, row, "[ ]");
	await applied(piu);
	expect(JSON.parse(read(path))).toEqual(before);
});

test("An Interface-only change restarts without compiling, even on Pi-Bolt", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const backendCommand = fakeBackend(dir, boltVersion);
	await using piu = await startPiu({ dir, script, backendCommand, height: 40 });
	const frame = await extensions(piu, "model  builtin");
	await click(piu, frame, "model  builtin", "[x]");
	await applied(piu);
	expect(existsSync(join(dir, "agent", "compile-calls"))).toBe(false);
});

test("An Agentic change on Pi restarts without compiling", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const backendCommand = fakeBackend(dir, "1.5.0");
	looseFile(dir);
	await using piu = await startPiu({ dir, script, backendCommand, height: 40 });
	const frame = await extensions(piu, "loose  file:");
	await click(piu, frame, "loose  file:", "[x]");
	await applied(piu);
	expect(existsSync(join(dir, "agent", "compile-calls"))).toBe(false);
});

test("An Agentic change on Pi-Bolt compiles once, shows it, then restarts", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const agent = join(dir, "agent");
	const backendCommand = fakeBackend(
		dir,
		boltVersion,
		`while [ -d "$PI_CODING_AGENT_DIR" ] && [ ! -e "$PI_CODING_AGENT_DIR/release" ]; do sleep 0.05; done; exit 0`,
	);
	looseFile(dir);
	await using piu = await startPiu({ dir, script, backendCommand, height: 40 });
	const frame = await extensions(piu, "loose  file:");
	await click(piu, frame, "loose  file:", "[x]");
	save(piu);
	await piu.waitForFrame((frame) =>
		frame.includes("Compiling Pi-Bolt extensions"),
	);
	expect(piu.exits).toEqual([]);
	writeFileSync(join(agent, "release"), "");
	await restarted(piu);
	expect(read(join(agent, "compile-calls"))).toBe("compile\n");
});

test("A failed compile warns with the log path and still restarts", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const backendCommand = fakeBackend(
		dir,
		boltVersion,
		"echo boom from the compiler; exit 1",
	);
	looseFile(dir);
	await using piu = await startPiu({ dir, script, backendCommand, height: 40 });
	const frame = await extensions(piu, "loose  file:");
	await click(piu, frame, "loose  file:", "[x]");
	save(piu);
	await piu.waitForFrame(
		(frame) =>
			frame.includes("Pi-Bolt compile failed") &&
			frame.includes("pi-bolt-compile.log"),
	);
	expect(piu.exits).toEqual([]);
	piu.mockInput.pressEnter();
	await restarted(piu);
	expect(read(join(dir, "pi-bolt-compile.log"))).toContain(
		"boom from the compiler",
	);
});

test("Compiling waits while the Backend update lock is held", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const backendCommand = fakeBackend(dir, boltVersion);
	looseFile(dir);
	await using piu = await startPiu({ dir, script, backendCommand, height: 40 });
	const frame = await extensions(piu, "loose  file:");
	const lease = acquireInstallLock(realpathSync(backendCommand));
	try {
		await click(piu, frame, "loose  file:", "[x]");
		save(piu);
		await piu.waitForFrame((frame) =>
			frame.includes("Waiting for the Backend update to finish"),
		);
		expect(existsSync(join(dir, "agent", "compile-calls"))).toBe(false);
	} finally {
		lease.close();
	}
	await restarted(piu);
	expect(read(join(dir, "agent", "compile-calls"))).toBe("compile\n");
});

test("While a turn runs, Restart waits for confirmation and declining keeps the saved change", async () => {
	using block = blocker();
	await using piu = await startPiu({
		script: { replies: [block.step, "Finished"] },
		height: 40,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await piu.mockInput.typeText("work");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => frame.includes("running"));
	const frame = await extensions(piu, "model  builtin");
	await click(piu, frame, "model  builtin", "[x]");
	save(piu);
	await piu.waitForFrame((frame) => frame.includes("A turn is running"));
	piu.mockInput.pressEnter();
	const declined = await piu.waitForFrame(
		(frame) =>
			frame.includes("Changes take effect after Restart") &&
			/^model .* {2}builtin {2}disabled/.test(extensionDetails(piu, frame)),
	);
	expect(piu.exits).toEqual([]);
	await click(piu, declined, "model  builtin", "[ ]");
	save(piu);
	await piu.waitForFrame((frame) => frame.includes("A turn is running"));
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await restarted(piu);
	block.release();
});
