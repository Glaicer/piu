import { expect, test } from "bun:test";
import { join } from "node:path";
import { ManualClock } from "@opentui/core/testing";
import {
	bottomLine,
	bottomPanel,
	inputArea,
	inputHints,
	modalTitle,
	panelBoxes,
	startPiu,
} from "./harness.ts";
import { hooks } from "./hooks.ts";

const extensions = join(import.meta.dir, "fixtures/hotkeys-extensions");
const none = { replies: [] };

type Piu = Awaited<ReturnType<typeof startPiu>>;

function counter(frame: string, who: "A" | "B") {
	return Number(new RegExp(`${who} action: (\\d+)`).exec(frame)?.[1]);
}

function pressAlt(piu: Piu, key: string) {
	piu.mockInput.pressKey(key, { meta: true });
}

async function rendered(piu: Piu) {
	await piu.renderOnce();
	return piu.captureCharFrame();
}

async function clickBottom(piu: Piu, text: string) {
	const frame = await piu.waitForFrame((f) => bottomLine(f).includes(text));
	const box = panelBoxes(piu).find((found) => found.id === bottomPanel);
	await piu.mockMouse.click(
		(box?.x ?? 0) + bottomLine(frame).indexOf(text) + 1,
		box?.y ?? 0,
	);
}

test("an Extension action works without a command", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { side: ["hotkeys-a.badge"] } },
	});

	await piu.waitForFrame((f) => f.includes("A action: 0"));
	pressAlt(piu, "m");
	await piu.waitForFrame((f) => f.includes("A action: 1"));
});

test("a personal scalar replaces the Extension default", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: {
			placement: { side: ["hotkeys-a.badge"] },
			keybindings: { "hotkeys-a.cycle": "alt+n" },
		},
	});

	await piu.waitForFrame((f) => f.includes("A action: 0"));
	pressAlt(piu, "m");
	expect(counter(await rendered(piu), "A")).toBe(0);
	pressAlt(piu, "n");
	await piu.waitForFrame((f) => f.includes("A action: 1"));
});

test("each shortcut in the array runs the action", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: {
			placement: { side: ["hotkeys-a.badge"] },
			keybindings: { "hotkeys-a.cycle": ["alt+n", "alt+p"] },
		},
	});

	await piu.waitForFrame((f) => f.includes("A action: 0"));
	pressAlt(piu, "m");
	expect(counter(await rendered(piu), "A")).toBe(0);
	pressAlt(piu, "n");
	await piu.waitForFrame((f) => f.includes("A action: 1"));
	pressAlt(piu, "p");
	await piu.waitForFrame((f) => f.includes("A action: 2"));
});

test("an empty array removes the Extension default", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: {
			placement: { side: ["hotkeys-a.badge"] },
			keybindings: { "hotkeys-a.cycle": [] },
		},
	});

	await piu.waitForFrame((f) => f.includes("A action: 0"));
	pressAlt(piu, "m");
	expect(counter(await rendered(piu), "A")).toBe(0);
});

test("an unknown action in a loaded Extension is rejected", async () => {
	await expect(
		startPiu({
			script: none,
			extensions,
			config: {
				placement: { side: ["hotkeys-a.badge"] },
				keybindings: { "hotkeys-a.cycl": "alt+m" },
			},
		}),
	).rejects.toThrow("keybindings.hotkeys-a.cycl");
});

test("an action in a missing Extension is rejected", async () => {
	await expect(
		startPiu({
			script: none,
			extensions,
			config: { keybindings: { "missing.cycle": "alt+m" } },
		}),
	).rejects.toThrow("keybindings.missing.cycle");
});

test("an unplaced Extension is not loaded for its hotkey", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: {
			keybindings: {
				"command.model": "alt+m",
				"hotkeys-unplaced.cycle": "alt+m",
			},
		},
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	expect(hooks.loaded).not.toContain("hotkeys-unplaced");
	pressAlt(piu, "m");
	await piu.waitForFrame((f) => f.includes("faux-2"));
});

test("a malformed action export names its Extension", async () => {
	const error = await startPiu({
		script: none,
		extensions,
		config: { placement: { side: ["invalid-action.badge"] } },
	}).then(
		() => undefined,
		(e: Error) => e,
	);

	expect(error?.message).toContain("invalid-action");
	expect(error?.message).toContain("keybindingActions");
});

test("Extension defaults follow Placement load order", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: {
			placement: { side: ["hotkeys-b.badge", "hotkeys-a.badge"] },
		},
	});

	await piu.waitForFrame(
		(f) => f.includes("A action: 0") && f.includes("B action: 0"),
	);
	pressAlt(piu, "m");
	const frame = await piu.waitForFrame((f) => f.includes("A action: 1"));
	expect(counter(frame, "B")).toBe(0);
});

test("personal order beats Extension order at dispatch", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: {
			placement: { side: ["hotkeys-b.badge", "hotkeys-a.badge"] },
			keybindings: {
				"hotkeys-a.cycle": "alt+m",
				"hotkeys-b.cycle": "alt+m",
			},
		},
	});

	await piu.waitForFrame(
		(f) => f.includes("A action: 0") && f.includes("B action: 0"),
	);
	pressAlt(piu, "m");
	const frame = await piu.waitForFrame((f) => f.includes("B action: 1"));
	expect(counter(frame, "A")).toBe(0);
});

test("Ctrl+X M opens the model picker without touching the prompt", async () => {
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.model": "ctrl+x m" } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("keep");
	piu.mockInput.pressKey("x", { ctrl: true });
	expect(await rendered(piu)).not.toContain("faux-2");
	piu.mockInput.pressKey("m");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));
	expect(inputArea(piu.captureCharFrame()).trim()).toBe("keep");
});

test("shared prefix can also open reasoning", async () => {
	await using piu = await startPiu({
		script: none,
		config: {
			keybindings: {
				"command.model": "ctrl+x m",
				"command.reasoning": "ctrl+x t",
			},
		},
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("m");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));

	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("t");
	await piu.waitForFrame((f) =>
		f.split("\n").some((text) => /^\s+off\s+$/.test(text)),
	);
});

test("Ctrl+X and an unmatched letter follow the normal path", async () => {
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.model": "ctrl+x m" } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("z");
	const frame = await rendered(piu);
	expect(inputArea(frame).trim()).toBe("z");
	expect(frame).not.toContain("faux-2");
});

test("miss returns the editing stroke before the letter", async () => {
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.model": "ctrl+k m" } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("abc");
	await piu.waitForFrame((f) => inputArea(f).includes("abc"));
	piu.mockInput.pressKey("HOME");
	piu.mockInput.pressKey("k", { ctrl: true });
	piu.mockInput.pressKey("q");
	const frame = await rendered(piu);
	expect(inputArea(frame).trim()).toBe("q");
});

test("the unmatched second stroke still runs a single shortcut", async () => {
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.reasoning": "g m" } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("g");
	piu.mockInput.pressKey("l", { ctrl: true });
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));
	expect(inputArea(piu.captureCharFrame()).trim()).toBe("g");
});

test("timeout replays the prefix once", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.model": "g m" } },
		clock,
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("g");
	expect(inputArea(await rendered(piu)).trim()).toBe("");
	clock.advance(999);
	expect(inputArea(await rendered(piu)).trim()).toBe("");
	clock.advance(1);
	expect(inputArea(await rendered(piu)).trim()).toBe("g");
	clock.advance(1000);
	expect(inputArea(await rendered(piu)).trim()).toBe("g");

	piu.mockInput.pressKey("m");
	const frame = await rendered(piu);
	expect(inputArea(frame).trim()).toBe("gm");
	expect(frame).not.toContain("faux-2");
});

test("escape cancels without replay or running its own action", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		config: {
			keybindings: {
				"command.settings": "escape",
				"command.model": "ctrl+x m",
			},
		},
		clock,
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressEscape();
	expect(await rendered(piu)).not.toContain(modalTitle("Settings"));
	clock.advance(1000);
	expect(await rendered(piu)).not.toContain(modalTitle("Settings"));
	expect(inputArea(piu.captureCharFrame()).trim()).toBe("");

	await piu.mockInput.typeText("ok");
	await piu.waitForFrame((f) => inputArea(f).includes("ok"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => f.includes(modalTitle("Settings")));
});

test("escape discards a printable prefix instead of typing it", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.reasoning": "g m" } },
		clock,
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("g");
	piu.mockInput.pressEscape();
	clock.advance(1000);
	expect(inputArea(await rendered(piu)).trim()).toBe("");
});

test("a Modal suppresses global shortcuts", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { side: ["hotkeys-a.badge"] } },
	});

	await piu.waitForFrame(
		(f) => f.includes("A action: 0") && f.includes("faux-1"),
	);
	await piu.mockInput.typeText("/model");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes(modalTitle("Models")));
	pressAlt(piu, "m");
	expect(counter(await rendered(piu), "A")).toBe(0);

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes(modalTitle("Models")));
	pressAlt(piu, "m");
	await piu.waitForFrame((f) => f.includes("A action: 1"));
});

test("opening a Modal discards a pending stroke", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.reasoning": "g m" } },
		clock,
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("g");
	await clickBottom(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes(modalTitle("Models")));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes(modalTitle("Models")));
	clock.advance(1000);
	const frame = await rendered(piu);
	expect(inputArea(frame).trim()).toBe("");
});

test("first assigned newline shortcut is shown and runs", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
		config: { keybindings: { "input.newline": ["ctrl+x n", "alt+n"] } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("one");
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("n");
	await piu.mockInput.typeText("two");
	await piu.waitForFrame(
		(f) => inputArea(f).includes("one") && inputArea(f).includes("two"),
	);
	expect(inputHints(piu.captureCharFrame()).endsWith("ctrl+x n new line")).toBe(
		true,
	);
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Model got "one\\ntwo"'));
});

test("empty newline list keeps native Shift+Enter and hides Ctrl+J", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
		config: { keybindings: { "input.newline": [] } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	expect(inputHints(piu.captureCharFrame()).endsWith("⇧⏎ new line")).toBe(true);

	await piu.mockInput.typeText("a");
	piu.mockInput.pressKey("j", { ctrl: true });
	await piu.mockInput.typeText("b");
	piu.mockInput.pressEnter({ shift: true });
	await piu.mockInput.typeText("c");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Model got "ab\\nc"'));
});

test("a newline sequence swallows a printable first stroke", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
		config: { keybindings: { "input.newline": ["g shift+return"] } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("a");
	piu.mockInput.pressKey("g");
	piu.mockInput.pressEnter({ shift: true });
	await piu.mockInput.typeText("b");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((f) => f.includes("Model got"));
	expect(frame).toContain('Model got "a\\nb"');
});

test("Shift+Enter can finish a newline sequence", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
		config: { keybindings: { "input.newline": ["ctrl+x shift+return"] } },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("a");
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressEnter({ shift: true });
	await piu.mockInput.typeText("b");
	piu.mockInput.pressEnter({ shift: true });
	await piu.mockInput.typeText("c");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Model got "a\\nb\\nc"'));
});
