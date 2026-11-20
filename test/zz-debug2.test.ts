import { test } from "bun:test";
import { inputArea, panelText, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const agentPanel = (frame: string) => panelText(frame, 10, 0);

const treeRows = (frame: string) =>
	panelText(frame, 80, 14)
		.split("\n")
		.filter((line) => /^ +(Trunk|Left|Right) prompt/.test(line));

test("debug tree 2", async () => {
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
	for (let i = 0; i < 40; i++) {
		await piu.renderOnce();
		const frame = piu.captureCharFrame();
		const rows = treeRows(frame);
		if (i % 5 === 0) {
			console.log(
				`tick ${i} rows=${rows.length}`,
				JSON.stringify(rows),
				"hasPicker=",
				frame.includes("Right prompt") && frame.includes("esc"),
			);
		}
		await Bun.sleep(10);
	}
}, 30000);
