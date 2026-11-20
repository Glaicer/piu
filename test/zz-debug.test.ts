import { test } from "bun:test";
import { inputArea, messageBar, panelBoxes, panelText, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const agentPanel = (frame: string) => panelText(frame, 10, 0);

test("debug tree", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Trunk reply", "Left reply", "Right reply"],
			branchBackCommand: true,
		},
		persistSession: true,
	});
	await send(piu, "Trunk prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Trunk reply"));
	await send(piu, "Left prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Left reply"));
	await send(piu, "/branch-back Right prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Right reply"));
	await send(piu, "/tree");
	const open = await piu.waitForFrame((f) => f.includes("Trunk prompt"));
	await piu.renderOnce();
	const frame = piu.captureCharFrame();
	console.log("BOXES", JSON.stringify(panelBoxes(piu).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height }))));
	const box = panelBoxes(piu).find((b) => frame.split("\n")[14]?.[80] !== undefined && b.y <= 14 && b.y + b.height > 14 && b.x <= 80 && b.x + b.width > 80);
	console.log("BOX AT 80,14", JSON.stringify(box && { id: box.id, x: box.x, y: box.y, w: box.width, h: box.height }));
	console.log("PANELTEXT(80,14):");
	console.log(JSON.stringify(panelText(frame, 80, 14)));
	console.log("OPEN FRAME:");
	console.log(open);
	console.log("LATEST FRAME:");
	console.log(frame);
}, 30000);

test("debug design", async () => {
	await using piu = await startPiu({
		script: { replies: ["First reply", "Second reply"] },
	});
	await piu.mockInput.typeText("A plain prompt");
	piu.mockInput.pressEnter();
	const first = await piu.waitForFrame((f) => f.includes("First reply"));
	const firstRow = panelText(first, 10)
		.split("\n")
		.find((line) => line.includes("A plain prompt"));
	const expected = messageBar("A plain prompt", firstRow?.length).trim();
	console.log("ROW LEN", firstRow?.length, "ROW", JSON.stringify(firstRow));
	console.log("EXPECTED LEN", expected.length, "EXPECTED", JSON.stringify(expected));
	console.log("BOXES", JSON.stringify(panelBoxes(piu).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height }))));
}, 30000);

test("debug scroll", async () => {
	const numberedLines = (prefix: string, count: number) =>
		Array.from({ length: count }, (_, i) => `${prefix} ${String(i).padStart(3, "0")}`).join("\n");
	await using piu = await startPiu({
		script: { replies: [numberedLines("Line", 120)] },
	});
	await send(piu, "Lines");
	const bottom = await piu.waitForFrame((f) => agentPanel(f).includes("Line 119"));
	await piu.renderOnce();
	const frame = piu.captureCharFrame();
	const lines = agentPanel(frame).split("\n");
	console.log("AGENT LINES", lines.length, JSON.stringify(lines.slice(-6)));
	console.log("BOXES", JSON.stringify(panelBoxes(piu).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height }))));
	console.log("FRAME:");
	console.log(frame);
}, 30000);
