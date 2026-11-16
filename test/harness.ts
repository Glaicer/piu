import {
	copyFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { JsonObject } from "@earendil-works/pi-ai";
import {
	type ClipboardService,
	type ClipboardWriteOptions,
	type Renderable,
	RGBA,
	type ThemeMode,
} from "@opentui/core";
import type { ManualClock } from "@opentui/core/testing";
import { testRender } from "@opentui/solid";
import { stringWidth } from "bun";
import { promptFieldId } from "../builtin/input/index.tsx";
import { createApp, type ExitRequest } from "../src/app.tsx";
import type { UpdateCheckOptions } from "../src/backend-updates.ts";
import { panelIdPrefix } from "../src/layout.tsx";
import { modalIdPrefix } from "../src/modal.tsx";
import { darkTheme } from "../src/theme.ts";
import "./hooks.ts";

const piBin = join(import.meta.dir, "../node_modules/.bin/pi");
const fauxBackend = join(import.meta.dir, "fixtures/faux-backend.ts");

export type FauxStep = {
	thinking?: string;
	text?: string;
	toolCalls?: { name: string; args: JsonObject }[];
	error?: string;
};

export type FauxScript = {
	replies: (string | FauxStep)[];
	crash?: { code: number; stderr: string };
	compactCommand?: boolean;
	branchBackCommand?: boolean;
	extensionCommands?: string[];
	contextWindow?: number;
	sameIdProvider?: boolean;
	denyOtherOnFile?: boolean;
	namedModel?: boolean;
	emptyModelName?: boolean;
	longModelName?: boolean;
	manyModels?: boolean;
	colonModel?: boolean;
	altReasoningModel?: boolean;
	limitedReasoning?: boolean;
	failingHook?: boolean;
	switchCommands?: boolean;
	freshSessionCommand?: boolean;
	echoCompactInstructions?: boolean;
	uiTool?: boolean;
	statusOnStart?: string;
	tokensPerSecond?: number;
	tokenSize?: number;
};

function withBackend(backend: object, config: unknown) {
	const { backend: override, ...rest } = (config ?? {}) as {
		backend?: object;
	};
	return { animations: false, ...rest, backend: { ...backend, ...override } };
}

function cells(text: string, start: number, end: number) {
	const characters = [...text];
	if (stringWidth(text) === characters.length)
		return characters.slice(start, end).join("");
	let column = 0;
	let result = "";
	for (const { segment } of new Intl.Segmenter().segment(text)) {
		const width = stringWidth(segment);
		if (column >= start && column + width <= end) result += segment;
		column += width;
		if (column >= end) break;
	}
	return result;
}

// why: tests find titles, message bars and dividers by the glyphs that draw them, so a restyle changes this table and nothing else; Panels and Modals are found by layout (`panelBoxes`, `modalBoxes`).
export const glyphs = {
	topLeft: "┌",
	topRight: "┐",
	bottomLeft: "└",
	bottomRight: "┘",
	rule: "─",
	heavyRule: "━",
	divider: "│",
	bar: "▌",
};

// why: a Panel's left divider column is followed by one blank column before its content.
const frameLeft = 2;

export function modalTitle(name: string) {
	return ` ${name} `;
}

function boxesWithPrefix(renderer: Piu["renderer"], prefix: string) {
	const found: Renderable[] = [];
	const walk = (node: Renderable) => {
		if (!node.visible) return;
		if (node.id.startsWith(prefix) && node.width > 0 && node.height > 0)
			found.push(node);
		for (const child of node.getChildren()) walk(child);
	};
	walk(renderer.root);
	return found;
}

function modalBoxes(piu: Piu) {
	return boxesWithPrefix(piu.renderer, modalIdPrefix);
}

// why: a Modal has no contour and its dark-Theme fill is the Panels' surface colour, so tests find it by layout and check that it is filled where they look.
export function onModalFill(piu: Piu, x: number, y: number) {
	const inside = modalBoxes(piu).some(
		(box) =>
			x >= box.screenX &&
			x < box.screenX + box.width &&
			y >= box.screenY &&
			y < box.screenY + box.height,
	);
	const line = piu.captureSpans().lines[y];
	let column = 0;
	for (const span of line?.spans ?? []) {
		if (x < column + span.width)
			return inside && span.bg.equals(RGBA.fromHex(darkTheme.surface));
		column += span.width;
	}
	return false;
}

export function modalBounds(piu: Piu) {
	const top = modalBoxes(piu).at(-1);
	if (!top) return undefined;
	return {
		left: top.screenX,
		top: top.screenY,
		width: top.width,
		height: top.height,
	};
}

export function messageBar(text: string, width?: number) {
	// why: without a Panel content width, match only the padded prefix; `you` sits at the far right of the first row.
	const prefix = `   ${text}`;
	return width === undefined ? prefix : `${prefix.padEnd(width - 5)}you`;
}

type Piu = Awaited<ReturnType<typeof startPiu>>;
export type PanelBox = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	node: Renderable;
};

export const sidePlacement = {
	agent: ["chat.messages"],
	side: ["model.current"],
};

// why: frame helpers take only the frame, so they read the layout of the app the running test started last; tests in a file run one at a time.
let current: Piu["renderer"] | undefined;

export function panelBoxes(piu?: Piu) {
	const renderer = piu?.renderer ?? current;
	if (!renderer) throw new Error("No app is running");
	return boxesWithPrefix(renderer, panelIdPrefix)
		.map((node) => ({
			id: node.id.slice(panelIdPrefix.length),
			x: node.screenX,
			y: node.screenY,
			width: node.width,
			height: node.height,
			node,
		}))
		.sort((a, b) => a.y - b.y || a.x - b.x);
}

function panelAt(column: number, row: number, piu?: Piu) {
	// why: a joined Container overlaps the Slot above by one row, and the later Panel is painted on top.
	return panelBoxes(piu).findLast(
		(box) =>
			column >= box.x &&
			column < box.x + box.width &&
			row >= box.y &&
			row < box.y + box.height,
	);
}

export function panelText(frame: string, column: number, row = 0) {
	const box = panelAt(column, row);
	if (!box) return "";
	return frame
		.split("\n")
		.slice(box.y + 1, box.y + box.height - 1)
		.map((text) => cells(text, box.x + frameLeft, box.x + box.width - 2))
		.join("\n");
}

// why: the Bottom line is a one-row Panel with no frame under the whole Layout, so it is read by its id and is not the input's Panel.
export const bottomPanel = "bottom";

export function bottomLine(frame: string) {
	const box = panelBoxes().find((found) => found.id === bottomPanel);
	if (!box) return "";
	return cells(frame.split("\n")[box.y] ?? "", box.x, box.x + box.width);
}

// why: the chat repeats every prompt, so history is asserted on the last Panel in the main column, not the whole frame.
export function inputTop() {
	return Math.max(
		...panelBoxes()
			.filter((box) => box.x === 0 && box.id !== bottomPanel)
			.map((box) => box.y),
	);
}

export function inputPanel(frame: string) {
	return panelText(frame, 10, inputTop() + 1);
}

function promptField() {
	const renderer = current;
	if (!renderer) throw new Error("No app is running");
	const node = renderer.root.findDescendantById(promptFieldId);
	for (let at: Renderable | null | undefined = node; at; at = at.parent)
		if (!at.visible) return undefined;
	return node;
}

// why: the prompt's Panel also holds the hint row and the question card, so this reads the text field's rows alone.
export function inputArea(frame: string) {
	const field = promptField();
	if (!field) return "";
	return frame
		.split("\n")
		.slice(field.screenY, field.screenY + field.height)
		.map((text) => cells(text, field.screenX, field.screenX + field.width))
		.join("\n");
}

// why: the prompt's hints are the row right under its text field, starting at the field's text column.
export function inputHints(frame: string) {
	const field = promptField();
	if (!field) return "";
	const panel = panelAt(field.screenX, field.screenY);
	if (!panel) return "";
	return cells(
		frame.split("\n")[field.screenY + field.height] ?? "",
		field.screenX,
		panel.x + panel.width - 1,
	);
}

export function working(frame: string) {
	return bottomLine(frame).includes("working");
}

export function statusArea(frame: string) {
	return panelText(frame, 10, inputTop() - 1);
}

export function focusedPanels(piu: Piu, frame: string) {
	const rows = frame.split("\n");
	const boxes = panelBoxes(piu);
	const named = boxes.flatMap((box) => {
		const name = cells(rows[box.y] ?? "", box.x + 1, box.x + box.width).match(
			/^ ([\w-]+) /,
		)?.[1];
		return name ? [name] : [];
	});
	const top = inputTop();
	const input = boxes.find((box) => box.x === 0 && box.y === top);
	for (
		let node = piu.renderer.currentFocusedRenderable;
		node;
		node = node.parent
	) {
		if (node === input?.node) {
			if (!named.includes("input")) named.push("input");
			break;
		}
	}
	return named;
}

// why: a terminal tells the renderer its background with an OSC 11 reply on stdin, and the renderer works out light or dark from its brightness.
function reportTerminalBackground(
	renderer: { stdin: NodeJS.ReadStream },
	mode: ThemeMode,
) {
	const level = mode === "light" ? "ffff" : "0000";
	renderer.stdin.emit(
		"data",
		Buffer.from(`\x1b]11;rgb:${level}/${level}/${level}\x07`),
	);
}

export function restoreEnv(saved: Record<string, string | undefined>) {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
}

export type FixtureOptions = {
	script: FauxScript;
	extraBackendArgs?: string[];
	persistSession?: boolean;
	promptTemplates?: Record<string, string>;
	installedPiExtensions?: string[];
	backendEnv?: Record<string, string>;
	appEnv?: Record<string, string>;
	backendCommand?: string;
	updateCheck?: UpdateCheckOptions;
	dir?: string;
	config?: unknown;
	extensions?: string;
	homeFromHomeDir?: boolean;
};

// why: the Backend, its agent dir and the personal Config live in a temp dir, so nothing a test starts, in this process or in a spawned `piu`, touches the developer's Pi.
export function prepareFixture(options: FixtureOptions) {
	const dir = options.dir ?? mkdtempSync(join(tmpdir(), "piu-test-"));
	const scriptPath = join(dir, "script.json");
	writeFileSync(scriptPath, JSON.stringify(options.script));
	// why: Pi waits retry.baseDelayMs before an automatic retry and refuses to compact a session shorter than keepRecentTokens, so tests shrink both; reserveTokens 0 lets a script's small contextWindow trigger an automatic compaction.
	mkdirSync(join(dir, "agent"), { recursive: true });
	writeFileSync(
		join(dir, "agent", "settings.json"),
		JSON.stringify({
			retry: { baseDelayMs: 20 },
			compaction: { keepRecentTokens: 1, reserveTokens: 0 },
		}),
	);

	if (options.installedPiExtensions) {
		mkdirSync(join(dir, "agent", "extensions"), { recursive: true });
		for (const path of options.installedPiExtensions) {
			copyFileSync(path, join(dir, "agent", "extensions", basename(path)));
		}
	}

	if (options.promptTemplates) {
		mkdirSync(join(dir, "agent", "prompts"), { recursive: true });
		for (const [name, body] of Object.entries(options.promptTemplates)) {
			writeFileSync(join(dir, "agent", "prompts", `${name}.md`), body);
		}
	}

	// why: Pi lists every model whose provider has credentials in the environment, so the developer's API keys would add real models to the picker.
	const credentialVars = Object.keys(process.env).filter((name) =>
		/API_KEY|_TOKEN|_SECRET/.test(name),
	);
	const backend = {
		command: options.backendCommand ?? "env",
		args: [
			`PI_CODING_AGENT_DIR=${join(dir, "agent")}`,
			...credentialVars.map((name) => `${name}=`),
			"PI_OFFLINE=1",
			`PIU_FAUX_SCRIPT=${scriptPath}`,
			`PIU_PID_LOG=${join(dir, "pids.jsonl")}`,
			...Object.entries(options.backendEnv ?? {}).map(
				([name, value]) => `${name}=${value}`,
			),
			piBin,
			...(options.persistSession ? [] : ["--no-session"]),
			"--no-skills",
			"-e",
			fauxBackend,
			...(options.extraBackendArgs ?? []),
		],
	};
	// why: PIU_HOME is a folder outside the repo, so a fixture Extension is copied in and runs where a user's would; with homeFromHomeDir the app finds it as $HOME/.piu instead.
	const home = options.homeFromHomeDir ? join(dir, ".piu") : dir;
	mkdirSync(home, { recursive: true });
	if (options.extensions) {
		cpSync(options.extensions, join(home, "extensions"), { recursive: true });
	}
	writeFileSync(
		join(home, "config.json"),
		typeof options.config === "string"
			? options.config
			: JSON.stringify(withBackend(backend, options.config)),
	);

	const removeDir = () => {
		if (!options.dir) rmSync(dir, { recursive: true, force: true });
	};
	return {
		dir,
		home,
		removeDir,
		setScript: (script: FauxScript) =>
			writeFileSync(scriptPath, JSON.stringify(script)),
	};
}

// why: the real clipboard is the developer's own and OSC 52 throws in the test renderer, so every app in a test gets this recorder.
export function recordingClipboard(failure?: Error | "reports") {
	const writes: { text: string; options: ClipboardWriteOptions }[] = [];
	const service = {
		async writeText(text: string, options: ClipboardWriteOptions) {
			writes.push({ text, options });
			if (failure instanceof Error) throw failure;
			return {
				host: { status: failure ? "unsupported" : "written" },
				terminal: {
					status: failure ? "local-failure" : "not-attempted",
					capability: "unknown",
				},
			};
		},
		async dispose() {},
	} as unknown as ClipboardService;
	return { service, writes };
}

export async function startPiu(
	options: FixtureOptions & {
		args?: string[];
		cwd?: string;
		width?: number;
		height?: number;
		kittyKeyboard?: boolean;
		clock?: ManualClock;
		terminalBackground?: ThemeMode;
		clipboardError?: Error | "reports";
	},
) {
	const { dir, home, removeDir } = prepareFixture(options);
	const clipboard = recordingClipboard(options.clipboardError);
	const savedEnv = { HOME: process.env.HOME, PIU_HOME: process.env.PIU_HOME };
	if (options.homeFromHomeDir) {
		process.env.HOME = dir;
		delete process.env.PIU_HOME;
	} else {
		process.env.PIU_HOME = home;
	}
	const exits: ExitRequest[] = [];
	let view: Awaited<ReturnType<typeof createApp>>;
	try {
		view = await createApp({
			cwd: options.cwd ?? dir,
			args: options.args ?? ["--model", "faux/faux-1"],
			exit: (request) => exits.push(request),
			updateCheck: options.updateCheck ?? false,
			env: options.appEnv,
			clipboard: clipboard.service,
		});
	} catch (error) {
		removeDir();
		throw error;
	} finally {
		restoreEnv(savedEnv);
	}
	const setup = await testRender(view, {
		width: options.width ?? 160,
		height: options.height ?? 30,
		// why: without the kitty protocol a terminal sends Shift+Enter as a plain Enter; the real renderer enables it by default.
		kittyKeyboard: options.kittyKeyboard ?? true,
		clock: options.clock,
	});

	current = setup.renderer;

	if (options.terminalBackground) {
		reportTerminalBackground(setup.renderer, options.terminalBackground);
	}

	async function waitForFrame(
		predicate: (frame: string) => boolean,
		timeoutMs = 4000,
	): Promise<string> {
		const deadline = Date.now() + timeoutMs;
		while (true) {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			if (predicate(frame)) return frame;
			if (Date.now() > deadline) {
				throw new Error(`Timed out waiting for frame. Last frame:\n${frame}`);
			}
			await Bun.sleep(10);
		}
	}

	return {
		...setup,
		dir,
		exits,
		copied: clipboard.writes,
		waitForFrame,
		reportTerminalBackground: (mode: ThemeMode) =>
			reportTerminalBackground(setup.renderer, mode),
		async [Symbol.asyncDispose]() {
			await setup.dispose();
			if (current === setup.renderer) current = undefined;
			removeDir();
		},
	};
}
