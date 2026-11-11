import { expect, test } from "bun:test";
import { join } from "node:path";
import { blocker } from "./blocker.ts";
import { inputArea, panelText, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const agentPanel = (frame: string) => panelText(frame, 10);
const lines = (frame: string, text: string) =>
	agentPanel(frame)
		.split("\n")
		.filter((line) => line.includes(text));
const slowInput = join(import.meta.dir, "fixtures/pi-extensions/slow-input.ts");
const slowCompact = join(
	import.meta.dir,
	"fixtures/pi-extensions/slow-compact.ts",
);

async function send(piu: Piu, text: string, options?: { alt?: boolean }) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter(options?.alt ? { meta: true } : undefined);
}

async function startBlocked(
	replies: Parameters<typeof startPiu>[0]["script"]["replies"],
	block: ReturnType<typeof blocker>,
	options?: Partial<Parameters<typeof startPiu>[0]>,
) {
	const piu = await startPiu({
		...options,
		script: { ...options?.script, replies: [block.step, ...replies] },
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("running"));
	return piu;
}

test("a steer sent while a command blocks the run shows at once as queued, then turns into the plain message", async () => {
	using block = blocker();
	await using piu = await startBlocked(["Steered with {lastUser}"], block);

	await send(piu, "turn left");

	const waiting = await piu.waitForFrame((f) =>
		lines(f, "turn left").some((line) => line.includes("queued")),
	);
	expect(waiting).toContain("running");
	expect(waiting).not.toContain("Steered with");
	expect(lines(waiting, "turn left")).toHaveLength(1);

	block.release();
	const started = await piu.waitForFrame((f) =>
		lines(f, "> turn left").some((line) => !line.includes("queued")),
	);
	expect(lines(started, "turn left")).toHaveLength(1);
	await piu.waitForFrame((f) => f.includes('Steered with "turn left"'));
});

test("Alt+Enter shows the message as a queued follow-up, and the model gets it once after the run", async () => {
	using block = blocker();
	await using piu = await startBlocked(
		["First run done", "Followed with {lastUser}"],
		block,
	);

	await send(piu, "then summarize", { alt: true });

	const waiting = await piu.waitForFrame((f) =>
		lines(f, "then summarize").some((line) => line.includes("follow-up")),
	);
	expect(waiting).not.toContain("First run done");

	block.release();
	const settled = await piu.waitForFrame(
		(f) =>
			f.includes('Followed with "then summarize"') && !f.includes("queued"),
	);
	expect(lines(settled, "> then summarize")).toHaveLength(1);
	expect(lines(settled, "Followed with")).toHaveLength(1);
});

test("several queued messages stay separate and in the order they were sent, even with identical text", async () => {
	using block = blocker();
	await using piu = await startBlocked(
		["Got {lastUser}", "Got {lastUser}", "Got {lastUser}"],
		block,
	);

	await send(piu, "again");
	await send(piu, "second one");
	await send(piu, "again");

	const waiting = await piu.waitForFrame(
		(f) => lines(f, "queued").length === 3,
	);
	const queued = lines(waiting, "queued").map((line) => line.trim());
	expect(queued[0]).toStartWith("> again");
	expect(queued[1]).toStartWith("> second one");
	expect(queued[2]).toStartWith("> again");

	block.release();
	const settled = await piu.waitForFrame(
		(f) =>
			lines(f, "Got").length === 3 &&
			!f.includes("queued") &&
			f.includes("Working") === false,
	);
	expect(lines(settled, "> again")).toHaveLength(2);
	expect(lines(settled, "> second one")).toHaveLength(1);
});

test("Esc drops the queued message from the chat, puts its text back in the input, and the model never gets it", async () => {
	using block = blocker();
	await using piu = await startBlocked(["Never {lastUser}"], block);

	await send(piu, "steer me");
	await piu.waitForFrame((f) => lines(f, "steer me").length === 1);

	piu.mockInput.pressEscape();
	const restored = await piu.waitForFrame((f) =>
		inputArea(f).includes("steer me"),
	);
	expect(lines(restored, "steer me")).toHaveLength(0);
	expect(restored).not.toContain("queued");
	block.release();
	await Bun.sleep(300);
	await piu.renderOnce();
	expect(piu.captureCharFrame()).not.toContain("Never");
});

test("a prompt template in a queued message ends as one expanded message with nothing left waiting", async () => {
	using block = blocker();
	await using piu = await startBlocked(["Got {lastUser}"], block, {
		promptTemplates: { greet: "Hello $1, welcome" },
	});

	await send(piu, "/greet Ann");
	await piu.waitForFrame((f) =>
		lines(f, "/greet Ann").some((line) => line.includes("queued")),
	);

	block.release();
	const started = await piu.waitForFrame(
		(f) => lines(f, "> Hello Ann, welcome").length === 1,
	);
	expect(lines(started, "queued")).toHaveLength(0);
	expect(lines(started, "/greet Ann")).toHaveLength(0);
});

test("a message the Backend refuses leaves the chat, shows the error and goes back to the input", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				"Answer one",
				"Answer two",
				"Summary one",
				"Summary two",
				"Got {lastUser}",
			],
		},
		installedPiExtensions: [slowCompact],
	});
	await send(piu, "First");
	await piu.waitForFrame((f) => agentPanel(f).includes("Answer one"));
	await send(piu, "Second");
	await piu.waitForFrame((f) => agentPanel(f).includes("Answer two"));
	await send(piu, "/compact");
	await piu.waitForFrame((f) => f.includes("Compacting context"));

	await send(piu, "refused text");
	await piu.mockInput.typeText("typed later");

	const frame = await piu.waitForFrame(
		(f) => f.includes("Cannot submit a prompt") && !f.includes("[sending]"),
	);
	expect(lines(frame, "> refused text")).toHaveLength(0);

	await piu.waitForFrame((f) => f.includes("Compacted context"));
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) =>
		f.includes('Got "refused text\\n\\ntyped later"'),
	);
});

test("a slow Backend does not delay the message in the chat", async () => {
	await using piu = await startPiu({
		script: { replies: ["Reply to {lastUser}"] },
		installedPiExtensions: [slowInput],
	});

	await send(piu, "hello there");

	const waiting = await piu.waitForFrame(
		(f) => lines(f, "> hello there").length === 1,
		400,
	);
	expect(waiting).not.toContain("Reply to");
	const done = await piu.waitForFrame((f) =>
		f.includes('Reply to "hello there"'),
	);
	expect(lines(done, "> hello there")).toHaveLength(1);
});

test("queued messages leave the chat when the Backend dies, which shows its own error", async () => {
	using block = blocker();
	await using piu = await startBlocked([], block, {
		script: { replies: [], crash: { code: 3, stderr: "kaboom\n" } },
	});

	await send(piu, "stranded");
	await piu.waitForFrame((f) => lines(f, "stranded").length === 1);
	await send(piu, "/crash");

	const frame = await piu.waitForFrame((f) => f.includes("Backend exited"));
	expect(lines(frame, "stranded")).toHaveLength(0);
	expect(frame).not.toContain("queued");
});

test("a new session starts without the previous session's waiting messages", async () => {
	using block = blocker();
	await using piu = await startBlocked(["Got {lastUser}"], block);

	await send(piu, "stale");
	await piu.waitForFrame((f) => lines(f, "stale").length === 1);
	await send(piu, "/new");

	const frame = await piu.waitForFrame((f) => !agentPanel(f).includes("Go"));
	expect(frame).not.toContain("queued");
	expect(lines(frame, "stale")).toHaveLength(0);
});
