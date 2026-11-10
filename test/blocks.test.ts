import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function clickOn(piu: Piu, frame: string, label: string) {
	const rows = frame.split("\n");
	const row = rows.findIndex((line) => line.includes(label));
	expect(row).toBeGreaterThanOrEqual(0);
	await piu.mockMouse.click((rows[row] ?? "").indexOf(label), row);
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

test("thinking is a collapsed label until it is clicked, and a second click hides it again", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ thinking: "Weighing walrus options carefully", text: "The answer" },
			],
		},
	});

	await send(piu, "Hmm");
	const collapsed = await piu.waitForFrame((f) => f.includes("The answer"));
	expect(collapsed).toContain("Thinking");
	expect(collapsed).not.toContain("walrus");

	await clickOn(piu, collapsed, "Thinking");
	const expanded = await piu.waitForFrame((f) => f.includes("walrus"));
	expect(expanded).toContain("Weighing walrus options carefully");

	await clickOn(piu, expanded, "Thinking");
	await piu.waitForFrame((f) => !f.includes("walrus"));
});

test("a tool call is a card that runs, finishes with a duration, and opens and closes on click", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [
						{
							name: "bash",
							args: { command: "sleep 0.6; echo zebra-$((1+1))" },
						},
					],
				},
				"Finished the job",
			],
		},
	});

	await send(piu, "Run it");
	const running = await piu.waitForFrame((f) => f.includes("running"));
	expect(running).toContain("bash");
	expect(running).toContain("sleep 0.6");

	const finished = await piu.waitForFrame((f) =>
		f.includes("Finished the job"),
	);
	expect(finished).not.toContain("running");
	expect(finished).toMatch(/done\s+\d+(\.\d+)?m?s/);
	expect(finished).not.toContain("zebra-2");

	await clickOn(piu, finished, "bash");
	const open = await piu.waitForFrame((f) => f.includes("zebra-2"));
	expect(open).toContain("sleep 0.6");

	await clickOn(piu, open, "bash");
	await piu.waitForFrame((f) => !f.includes("zebra-2"));
});

test("a failing tool call shows an error status and its message", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [
						{ name: "read", args: { path: "/nonexistent/narwhal.txt" } },
					],
				},
				"Could not read it",
			],
		},
	});

	await send(piu, "Read it");
	const frame = await piu.waitForFrame((f) => f.includes("Could not read it"));

	expect(frame).toContain("read");
	expect(frame).toContain("/nonexistent/narwhal.txt");
	expect(frame).toContain("error");
	expect(frame).not.toContain("done");
});

test("a compaction leaves a one-line service row between the messages", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Answer one", "Answer two", "Summary one", "Summary two"],
			compactCommand: true,
		},
	});
	await send(piu, "First");
	await piu.waitForFrame((f) => f.includes("Answer one"));
	await send(piu, "Second");
	await piu.waitForFrame((f) => f.includes("Answer two"));

	await send(piu, "/compact-now");
	const frame = await piu.waitForFrame((f) => f.includes("Compacted"));

	const lines = frame.split("\n");
	const row = lines.findIndex((line) => line.includes("Compacted"));
	expect(lines[row]).toMatch(/Compacted context \(\d+ → ~?\d+ tokens\)/);
	expect(lines.findIndex((line) => line.includes("Answer two"))).toBeLessThan(
		row,
	);
});

test("an automatic retry leaves a service row, and a recovered turn says so", async () => {
	await using piu = await startPiu({
		script: { replies: [{ error: "529 overloaded" }, "Recovered fine"] },
	});

	await send(piu, "Try");
	const frame = await piu.waitForFrame(
		(f) => f.includes("Recovered fine") && f.includes("Retry succeeded"),
	);

	expect(frame).toContain("Retry succeeded");
});

test("a retry that runs out of attempts shows the final error", async () => {
	const failure = { error: "529 overloaded" };
	await using piu = await startPiu({
		script: { replies: [failure, failure, failure, failure] },
	});

	await send(piu, "Try");
	const frame = await piu.waitForFrame((f) => f.includes("Retry failed"));

	expect(frame).toContain("529 overloaded");
});

test("a tool call in a turn that failed before running it shows an error, not a running card", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [{ name: "read", args: { path: "/never/ran.txt" } }],
					error: "400 invalid request",
				},
			],
		},
	});

	await send(piu, "Go");
	const frame = await piu.waitForFrame((f) => f.includes("/never/ran.txt"));
	await Bun.sleep(300);
	await piu.renderOnce();

	expect(piu.captureCharFrame()).toContain("error");
	expect(piu.captureCharFrame()).not.toContain("running");
	expect(frame).toContain("read");
});

test("a resumed session shows its tool cards as finished", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-session-"));
	try {
		{
			await using first = await startPiu({
				dir,
				persistSession: true,
				script: {
					replies: [
						{
							toolCalls: [{ name: "bash", args: { command: "echo $((6*7))" } }],
						},
						"Wrapped up",
					],
				},
			});
			await send(first, "Compute");
			await first.waitForFrame((f) => f.includes("Wrapped up"));
		}
		await using second = await startPiu({
			dir,
			persistSession: true,
			script: { replies: [] },
			args: ["--model", "faux/faux-1", "-c"],
		});

		const frame = await second.waitForFrame((f) => f.includes("Wrapped up"));

		expect(frame).toContain("bash");
		expect(frame).toContain("echo $((6*7))");
		expect(frame).toMatch(/done/);
		expect(frame).not.toContain("running");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
