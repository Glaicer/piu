import { expect, test } from "bun:test";
import { join } from "node:path";
import { RGBA } from "@opentui/core";
import { formatTokens } from "../src/context-usage.ts";
import { lightTheme } from "../src/theme.ts";
import { oracle } from "./context-oracle.ts";
import {
	bottomLine,
	bottomPanel,
	type FauxScript,
	panelBoxes,
	panelText,
	startPiu,
	working,
} from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const WINDOW = 8000;
const line = (frame: string) => bottomLine(frame).trim();
const agentPanel = (frame: string) => panelText(frame, 10, 0);
const meter = /[▰▱]{10} +\S+\/\S+$/;

function fixture(script: FauxScript) {
	return {
		script: { contextWindow: WINDOW, ...script },
		installedPiExtensions: [
			join(import.meta.dir, "fixtures/pi-extensions/context-usage.ts"),
		],
		extensions: join(import.meta.dir, "fixtures/extensions"),
		config: { placement: { status: ["probe.capture"] } },
	};
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

function gauge(tokens: number, window: number) {
	const filled = Math.round((10 * tokens) / window);
	return `${"▰".repeat(filled)}${"▱".repeat(10 - filled)}  ${formatTokens(tokens)}/${formatTokens(window)}`;
}

test("the context meter ends the bottom line with Pi's usage after a turn, in one muted colour", async () => {
	await using piu = await startPiu({
		...fixture({
			replies: [`${"More of the answer. ".repeat(200)}\n\nDone here.`],
		}),
		terminalBackground: "light",
		width: 100,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Done here.") && !working(frame),
	);
	const pi = await oracle(piu);
	expect(pi.tokens).toBeNumber();
	expect(pi.contextWindow).toBe(WINDOW);
	const expected = gauge(pi.tokens ?? 0, pi.contextWindow);
	expect(expected).toContain("▰");
	const frame = await piu.waitForFrame((f) => line(f).endsWith(expected));
	expect(line(frame)).toStartWith("faux-1 · no reasoning");

	const box = panelBoxes(piu).find((found) => found.id === bottomPanel);
	const spans = (piu.captureSpans().lines[box?.y ?? -1]?.spans ?? []).filter(
		(span) => /[▰▱]|\//.test(span.text) && !span.text.includes("faux"),
	);
	expect(spans.length).toBeGreaterThan(0);
	for (const span of spans)
		expect(span.fg.equals(RGBA.fromHex(lightTheme.barMuted))).toBe(true);
}, 20000);

test("working appears right before the context meter, which follows each model response during the turn", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: "sleep 1" } }] },
				"All done",
			],
		},
		width: 100,
	});
	const idle = await piu.waitForFrame((frame) => meter.test(line(frame)));
	const before = line(idle).match(meter)?.[0];
	await send(piu, "Go");
	const busy = await piu.waitForFrame(
		(frame) => working(frame) && line(frame).match(meter)?.[0] !== before,
	);
	expect(line(busy)).toMatch(/working +[▰▱]{10} +\S+\/128k$/);

	const done = await piu.waitForFrame(
		(f) => f.includes("All done") && !working(f),
	);
	expect(line(done)).toMatch(meter);
}, 20000);

test("after a compaction the context meter shows an unknown count until the next response", async () => {
	await using piu = await startPiu({
		script: { replies: ["First answer", "Summary of the chat"] },
		width: 100,
	});
	await piu.waitForFrame((frame) => meter.test(line(frame)));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("First answer") && !working(frame),
	);
	await send(piu, "/compact");
	const frame = await piu.waitForFrame((f) => line(f).endsWith("?/128k"));
	expect(line(frame)).toEndWith("▱▱▱▱▱▱▱▱▱▱  ?/128k");
}, 20000);
