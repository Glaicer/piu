import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPiu } from "./harness.ts";

const throwsOnLoad = join(import.meta.dir, "fixtures/throws-on-load.ts");
const notExecutable = join(import.meta.dir, "fixtures/not-executable.sh");

test("a missing Backend command shows a message naming backend.command", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		config: { backend: { command: "piu-no-such-backend" } },
	});

	const frame = await piu.waitForFrame((f) => f.includes("backend.command"));

	expect(frame).toContain("piu-no-such-backend");
});

test("a Backend command that cannot be executed shows an error card with the system's message", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		config: { backend: { command: notExecutable } },
	});

	const frame = await piu.waitForFrame((f) => f.includes("Restart"));

	expect(frame).toContain("permission denied");
});

test("a Backend that dies before answering any command shows an error card with its stderr", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		extraBackendArgs: ["-e", throwsOnLoad],
	});

	const frame = await piu.waitForFrame((f) => f.includes("Restart"));

	expect(frame).toContain("Backend exited with code 1");
	expect(frame).toContain("piu fixture refuses to load");
});

test("when the Backend exits mid-session the agent Panel keeps the conversation and shows an error card", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Fine so far"],
			crash: { code: 3, stderr: "kaboom: out of cheese\n" },
		},
	});
	await piu.mockInput.typeText("Hello");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Fine so far"));

	await piu.mockInput.typeText("/crash");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((f) => f.includes("Restart"));

	expect(frame).toContain("Backend exited with code 3");
	expect(frame).toContain("kaboom: out of cheese");
	expect(frame).toContain("Fine so far");
});

test("a prompt sent to a dead Backend leaves the error card in place", async () => {
	await using piu = await startPiu({
		script: { replies: [], crash: { code: 2, stderr: "gone\n" } },
	});
	await piu.mockInput.typeText("/crash");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Restart"));

	await piu.mockInput.typeText("Anyone there?");
	piu.mockInput.pressEnter();
	await Bun.sleep(100);
	await piu.renderOnce();
	const frame = piu.captureCharFrame();

	expect(frame).toContain("Backend exited with code 2");
	expect(frame).not.toContain("Anyone there?");
});

test("clicking Restart brings the Backend back with -c and the same session continues", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Context holds {messages}"],
			crash: { code: 3, stderr: "kaboom\n" },
		},
		persistSession: true,
	});
	await piu.mockInput.typeText("First");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Context holds 1"));
	await piu.mockInput.typeText("/crash");
	piu.mockInput.pressEnter();
	const crashed = await piu.waitForFrame((f) => f.includes("Restart"));

	const row = crashed.split("\n").findIndex((line) => line.includes("Restart"));
	const column = (crashed.split("\n")[row] ?? "").indexOf("Restart");
	await piu.mockMouse.click(column, row);
	await piu.waitForFrame((f) => !f.includes("Restart"));
	await piu.mockInput.typeText("Second");
	piu.mockInput.pressEnter();

	const frame = await piu.waitForFrame((f) => f.includes("Context holds 3"));
	expect(frame).toContain("> First");
	expect(frame).toContain("> Second");
	expect(frame.split("Context holds 1")).toHaveLength(2);
});

test("starting with -c shows the conversation of the session being continued", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-session-"));
	try {
		{
			await using first = await startPiu({
				dir,
				persistSession: true,
				script: { replies: ["Remembered reply"] },
			});
			await first.mockInput.typeText("Remember me");
			first.mockInput.pressEnter();
			await first.waitForFrame((f) => f.includes("Remembered reply"));
		}
		await using second = await startPiu({
			dir,
			persistSession: true,
			script: { replies: [] },
			args: ["--model", "faux/faux-1", "-c"],
		});

		const frame = await second.waitForFrame((f) =>
			f.includes("Remembered reply"),
		);

		expect(frame).toContain("> Remember me");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
