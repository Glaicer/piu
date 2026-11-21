import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	bottomLine,
	openSettings,
	type Piu,
	panelText,
	startPiu,
} from "./harness.ts";

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

async function extensions(piu: Piu, ready: string) {
	await openSettings(piu);
	piu.mockInput.pressKey("\x1b[6;5~");
	return piu.waitForFrame(
		(frame) => frame.includes(ready) && frame.includes("Save [ctrl+s]"),
	);
}

function click(piu: Piu, frame: string, row: string, action: string) {
	const lines = frame.split("\n");
	const y = lines.findIndex(
		(line) => line.includes(row) && line.includes(action),
	);
	const x = lines[y]?.lastIndexOf(action);
	if (x === undefined || x < 0) throw new Error(`No ${action} on ${row}`);
	return piu.mockMouse.click(x + 1, y);
}

const save = (piu: Piu) => piu.mockInput.pressKey("s", { ctrl: true });
const read = (path: string) => readFileSync(path, "utf8");

function personal() {
	const dir = mkdtempSync(join(tmpdir(), "piu-extension-edits-"));
	const path = join(dir, "config.json");
	const folder = join(dir, "extensions", "editable");
	mkdirSync(folder, { recursive: true });
	writeFileSync(
		join(folder, "index.tsx"),
		`export default {
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
			/editable +personal +disabled.*changed/.test(frame),
		);
		expect(read(path)).toBe(before);
		save(piu);
		await piu.waitForFrame((frame) =>
			frame.includes("Changes take effect after Restart"),
		);
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
		save(piu);
		await piu.waitForFrame((frame) =>
			frame.includes("Changes take effect after Restart"),
		);
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
			/loose +file:.*pending deletion/.test(frame),
		);
		await click(piu, first, "editable  personal", "Delete");
		await piu.waitForFrame((frame) =>
			/editable +personal.*pending deletion/.test(frame),
		);
		piu.mockInput.pressEscape();
		await piu.waitForFrame((frame) =>
			frame.includes("Discard unsaved Extension changes?"),
		);
		piu.mockInput.pressEnter();
		await piu.waitForFrame(
			(frame) =>
				!frame.includes("Discard unsaved") &&
				/editable +personal.*pending deletion/.test(frame),
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
				/editable +personal.*pending deletion/.test(frame),
		);
		expect(existsSync(file)).toBe(true);
		expect(existsSync(folder)).toBe(true);
		expect(read(path)).toBe(before);
		expect(read(settings)).toBe(JSON.stringify(original));
		save(piu);
		await piu.waitForFrame(confirmation);
		piu.mockInput.pressArrow("down");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((frame) =>
			frame.includes("Changes take effect after Restart"),
		);
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
	await using piu = await startPiu({ script, height: 40 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const dir = join(piu.dir, "agent");
	const path = join(dir, "settings.json");
	mkdirSync(join(dir, "extensions"));
	writeFileSync(
		join(dir, "extensions", "loose.ts"),
		"export default () => {};",
	);
	const before = { ...JSON.parse(read(path)), lastChangelogVersion: "kept" };
	writeFileSync(path, JSON.stringify(before));
	await extensions(piu, "loose  file:");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) =>
		/loose +file:.*disabled.*changed/.test(frame),
	);
	mkdirSync(`${path}.lock`);
	save(piu);
	await piu.waitForFrame((frame) =>
		frame.includes("Could not save Extensions"),
	);
	expect(read(path)).toBe(JSON.stringify(before));
	expect(existsSync(`${path}.lock`)).toBe(true);
	rmSync(`${path}.lock`, { recursive: true });
	save(piu);
	const disabled = await piu.waitForFrame(
		(frame) =>
			frame.includes("Changes take effect after Restart") &&
			/loose +file:.*disabled/.test(frame),
	);
	expect(JSON.parse(read(path))).toEqual({
		...before,
		extensions: ["-extensions/loose.ts"],
	});
	await click(piu, disabled, "loose  file:", "[ ]");
	save(piu);
	await piu.waitForFrame(
		(frame) =>
			/loose +file:.*enabled/.test(frame) && !frame.includes("Save [ctrl+s] *"),
	);
	expect(JSON.parse(read(path))).toEqual({ ...before, extensions: [] });
});

test("Package Save patches only the extension filter and confirmed deletion calls the configured Backend", async () => {
	using fixture = personal();
	const { dir } = fixture;
	const command = join(dir, "backend");
	writeFileSync(
		command,
		`#!/bin/sh
if [ "$1" = remove ]; then
  printf '%s\\n' "$@" > "$PI_CODING_AGENT_DIR/remove-args"
else
  exec env "$@"
fi
`,
		{ mode: 0o700 },
	);
	await using piu = await startPiu({
		dir,
		script,
		backendCommand: command,
		height: 65,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const agent = join(dir, "agent");
	const folder = join(agent, "npm", "node_modules", "fixture", "extensions");
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "tool.ts"), "export default () => {};");
	const source = "npm:fixture";
	const path = join(agent, "settings.json");
	const log = join(agent, "remove-args");
	const pkg = { source, skills: [] };
	const original = { ...JSON.parse(read(path)), packages: [pkg] };
	writeFileSync(path, JSON.stringify(original));
	const row = "extensions/tool  package:";
	const enabled = await extensions(piu, row);
	await click(piu, enabled, row, "[x]");
	save(piu);
	const disabled = await piu.waitForFrame(
		(frame) =>
			/extensions\/tool +package: npm:fixture +disabled/.test(frame) &&
			!frame.includes("* changed"),
	);
	expect(JSON.parse(read(path))).toEqual({
		...original,
		packages: [{ ...pkg, extensions: [] }],
	});
	await click(piu, disabled, row, "[ ]");
	save(piu);
	const restored = await piu.waitForFrame(
		(frame) =>
			/extensions\/tool +package: npm:fixture +enabled/.test(frame) &&
			!frame.includes("* changed"),
	);
	expect(JSON.parse(read(path))).toEqual(original);
	await click(piu, restored, row, "Delete");
	save(piu);
	await piu.waitForFrame((frame) => frame.includes("Package: npm:fixture"));
	expect(existsSync(log)).toBe(false);
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) =>
			!frame.includes("Delete extensions?") &&
			!frame.includes("* pending deletion"),
	);
	expect(read(log)).toBe("remove\nnpm:fixture\n");
});
