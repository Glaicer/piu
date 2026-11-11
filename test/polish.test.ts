import { expect, test } from "bun:test";
import { join } from "node:path";
import { panelText, startPiu } from "./harness.ts";
import { hooks } from "./hooks.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const agentPanel = (frame: string) => panelText(frame, 10, 0);
const statusPanel = (frame: string) =>
	panelText(frame, 10, frame.trimEnd().split("\n").length - 1 - 1);

test("a refused model switch shows Pi's error in a Toast and keeps the shown model", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		config: { placement: { side: ["probe.capture"] } },
		extensions: join(import.meta.dir, "fixtures/extensions"),
	});
	await piu.waitForFrame((f) => statusPanel(f).includes("faux-1"));

	await hooks.probe.actions?.setModel({
		provider: "faux",
		id: "missing",
		name: "Missing",
	});

	const frame = await piu.waitForFrame((f) =>
		f.includes("Model not found: faux/missing"),
	);
	expect(statusPanel(frame)).toContain("faux-1");
});

test("an extension_error shows a Toast naming the Pi extension and its error", async () => {
	await using piu = await startPiu({
		script: { replies: ["Fine"], failingHook: true },
	});

	await send(piu, "go");

	const frame = await piu.waitForFrame((f) => f.includes("hook exploded"));
	expect(frame).toContain("faux-backend");
});

test("a Pi extension command that changes the thinking level updates the shown level", async () => {
	await using piu = await startPiu({
		script: { replies: [], switchCommands: true },
		args: ["--model", "faux/faux-2"],
	});
	await piu.waitForFrame((f) => statusPanel(f).includes("Reasoning:"));
	expect(statusPanel(await piu.waitForFrame(() => true))).not.toContain(
		"Reasoning: high",
	);

	await send(piu, "/level-high");

	await piu.waitForFrame((f) => statusPanel(f).includes("Reasoning: high"));
});

test("a Pi extension command that changes the model updates the shown model once it finishes", async () => {
	await using piu = await startPiu({
		script: { replies: [], switchCommands: true },
	});
	await piu.waitForFrame((f) => statusPanel(f).includes("faux-1"));

	await send(piu, "/to-faux-2");

	await piu.waitForFrame((f) => statusPanel(f).includes("faux-2"));
});

test("an automatic compaction leaves the chat matching Pi's messages", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Answer one", "Answer two", "Summary one", "Summary two"],
			// why: the system prompt alone is about 1630 tokens, so this window is crossed only once the second turn is in the context.
			contextWindow: 1660,
		},
	});
	await send(piu, "First question");
	await piu.waitForFrame((f) => agentPanel(f).includes("Answer one"));
	await send(piu, "Second question");

	const frame = await piu.waitForFrame(
		(f) =>
			agentPanel(f).includes("Compacted context") &&
			!agentPanel(f).includes("Answer one"),
	);
	expect(agentPanel(frame)).toContain("Answer two");
});

test("/compact passes the text after its name to Pi as custom instructions", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Answer one", "Answer two", "Summary one", "Summary two"],
			echoCompactInstructions: true,
		},
	});
	await send(piu, "First");
	await piu.waitForFrame((f) => agentPanel(f).includes("Answer one"));
	await send(piu, "Second");
	await piu.waitForFrame((f) => agentPanel(f).includes("Answer two"));

	await send(piu, "/compact focus on the tests");

	await piu.waitForFrame((f) => f.includes("instructions: focus on the tests"));
});
