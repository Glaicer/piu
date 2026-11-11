import { test } from "bun:test";
import { startPiu } from "./harness.ts";

const none = { replies: [] };

function focusedPanels(frame: string) {
	return [...frame.matchAll(/┌─ ([\w-]+) /g)].map((match) => match[1]);
}

async function focusedAfter(
	piu: Awaited<ReturnType<typeof startPiu>>,
	expected: string,
) {
	await piu.waitForFrame((f) => focusedPanels(f).join() === expected);
}

test("Tab moves the focus indication through the Panels in Layout order and wraps around", async () => {
	await using piu = await startPiu({ script: none });

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "status");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "agent");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "input");
});

test("Shift+Tab moves the focus the other way", async () => {
	await using piu = await startPiu({ script: none });

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab({ shift: true });
	await focusedAfter(piu, "agent");
	piu.mockInput.pressTab({ shift: true });
	await focusedAfter(piu, "status");
});

const sideHasModule = { placement: { side: ["reasoning.level"] } };

test("a Panel with something to show is part of the Tab order", async () => {
	await using piu = await startPiu({ script: none, config: sideHasModule });

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "status");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "side");
});

test("Tab skips a Panel hidden below its hideBelow width", async () => {
	await using piu = await startPiu({
		script: none,
		config: sideHasModule,
		width: 100,
	});

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "status");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "agent");
});

test("clicking inside a Panel focuses it and Tab continues from there", async () => {
	await using piu = await startPiu({ script: none });
	await focusedAfter(piu, "input");

	await piu.mockMouse.click(5, 3);
	await focusedAfter(piu, "agent");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "input");
});
