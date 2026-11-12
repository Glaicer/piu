import { expect, test } from "bun:test";
import { startPiu } from "./harness.ts";

const REPLY = "hello selectable world";

async function chatWithReply(
	options: { clipboardError?: Error | "reports" } = {},
) {
	const piu = await startPiu({ script: { replies: [REPLY] }, ...options });
	await piu.mockInput.typeText("hi");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((f) => f.includes(REPLY));
	const rows = frame.split("\n");
	const row = rows.findIndex((text) => text.includes(REPLY));
	return { piu, row, column: (rows[row] ?? "").indexOf(REPLY) };
}

test("dragging over chat text copies exactly the dragged text", async () => {
	const { piu, row, column } = await chatWithReply();
	await using _ = piu;
	await piu.mockMouse.drag(column, row, column + 4, row);
	await piu.waitForFrame(() => piu.copied.length > 0);
	expect(piu.copied.map((write) => write.text)).toEqual(["hello"]);
	expect(piu.copied[0]?.options.destination).toBe("best-available");
});

test("a click or a zero-width drag copies nothing", async () => {
	const { piu, row, column } = await chatWithReply();
	await using _ = piu;
	await piu.mockMouse.click(column + 3, row);
	await piu.mockMouse.drag(column + 12, row, column + 12, row);
	await Bun.sleep(600);
	await piu.mockMouse.drag(column + 6, row, column + 15, row);
	await piu.waitForFrame(() => piu.copied.length > 0);
	expect(piu.copied.map((write) => write.text)).toEqual(["selectable"]);
});

test("a copy that throws says so in a Toast", async () => {
	const { piu, row, column } = await chatWithReply({
		clipboardError: new Error("no clipboard"),
	});
	await using _ = piu;
	await piu.mockMouse.drag(column, row, column + 4, row);
	await piu.waitForFrame((frame) => frame.includes("Could not copy"));
});

test("a copy that reports no destination worked says so in a Toast", async () => {
	const { piu, row, column } = await chatWithReply({
		clipboardError: "reports",
	});
	await using _ = piu;
	await piu.mockMouse.drag(column, row, column + 4, row);
	await piu.waitForFrame((frame) => frame.includes("Could not copy"));
});
