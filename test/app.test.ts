import { expect, test } from "bun:test";
import { startPiu } from "./harness.ts";

test("Enter sends the prompt and the agent Panel shows it with the full reply", async () => {
	await using piu = await startPiu({
		script: { replies: ["Hello from the faux model"] },
	});

	await piu.mockInput.typeText("Say hello");
	piu.mockInput.pressEnter();

	const frame = await piu.waitForFrame((f) =>
		f.includes("Hello from the faux model"),
	);
	expect(frame).toContain("> Say hello");
});

test("the reply grows across frames while it streams", async () => {
	const reply = "one two three four five six seven eight";
	await using piu = await startPiu({
		script: { replies: [reply], tokensPerSecond: 20, tokenSize: 1 },
	});

	await piu.mockInput.typeText("Count");
	piu.mockInput.pressEnter();

	const seen = new Set<string>();
	await piu.waitForFrame((frame) => {
		const line = frame.split("\n").find((l) => l.includes("│one"));
		if (line) seen.add(line);
		return frame.includes(reply);
	});
	expect(seen.size).toBeGreaterThanOrEqual(3);
});

test("arguments after piu reach the Backend", async () => {
	await using piu = await startPiu({
		script: { replies: ["Answered by {model}"] },
		args: ["--model", "faux/faux-2"],
	});

	await piu.mockInput.typeText("Which model?");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((frame) => frame.includes("Answered by faux-2"));
});

test("a wide terminal splits into a 66% first column and a 33% second column", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 150 });

	const frame = await piu.waitForFrame((f) => f.includes("┐┌"));
	const topBorder = frame.split("\n")[0] ?? "";
	const secondColumnStart = topBorder.indexOf("┐┌") + 1;
	const secondColumnWidth = topBorder.trimEnd().length - secondColumnStart;

	expect(Math.abs(secondColumnStart - 99)).toBeLessThanOrEqual(2);
	expect(Math.abs(secondColumnWidth - 50)).toBeLessThanOrEqual(2);
});

test("Placement in the config decides which Panel shows the chat", async () => {
	await using piu = await startPiu({
		script: { replies: ["Placed reply"] },
		config: {
			placement: { agent: [], side: ["chat.messages"] },
		},
		width: 150,
	});

	await piu.mockInput.typeText("Where are you?");
	piu.mockInput.pressEnter();

	const frame = await piu.waitForFrame((f) => f.includes("Placed reply"));
	const replyLine = frame.split("\n").find((l) => l.includes("Placed reply"));
	expect(replyLine?.indexOf("Placed reply")).toBeGreaterThan(100);
});
