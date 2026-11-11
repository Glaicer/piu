import { expect, test } from "bun:test";
import { ManualClock } from "@opentui/core/testing";
import { testRender } from "@opentui/solid";
import { createAnimate } from "../src/animate.ts";

async function setup() {
	const clock = new ManualClock();
	const rendered = await testRender(() => <box />, {
		width: 10,
		height: 3,
		clock,
	});
	const step = async (ms: number) => {
		clock.advance(ms);
		await rendered.renderOnce();
	};
	return { ...rendered, step };
}

test("an enabled animation reports values between its ends before it completes", async () => {
	const { renderer, step, dispose } = await setup();
	const animate = createAnimate(renderer, true);
	const values: number[] = [];
	let completed = false;
	animate({
		from: 0,
		to: 10,
		duration: 100,
		onUpdate: (value) => values.push(value),
		onComplete: () => {
			completed = true;
		},
	});

	await step(50);
	expect(values.at(-1)).toBeGreaterThan(0);
	expect(values.at(-1)).toBeLessThan(10);
	expect(completed).toBe(false);

	await step(100);
	expect(values.at(-1)).toBe(10);
	expect(completed).toBe(true);
	await dispose();
});

test("a disabled animation reaches its end state without any time passing", async () => {
	const { renderer, dispose } = await setup();
	const animate = createAnimate(renderer, false);
	const values: number[] = [];
	let completed = false;
	animate({
		from: 0,
		to: 10,
		duration: 100,
		onUpdate: (value) => values.push(value),
		onComplete: () => {
			completed = true;
		},
	});

	expect(values).toEqual([10]);
	expect(completed).toBe(true);
	await dispose();
});

test("a cancelled animation stops reporting", async () => {
	const { renderer, step, dispose } = await setup();
	const animate = createAnimate(renderer, true);
	const values: number[] = [];
	const cancel = animate({
		from: 0,
		to: 10,
		duration: 100,
		onUpdate: (value) => values.push(value),
	});

	await step(40);
	cancel();
	const seen = values.length;
	await step(100);
	expect(values).toHaveLength(seen);
	await dispose();
});

test("a looping animation repeats while enabled and does nothing when disabled", async () => {
	const { renderer, step, dispose } = await setup();
	const values: number[] = [];
	createAnimate(
		renderer,
		false,
	)({
		from: 0,
		to: 4,
		duration: 100,
		loop: true,
		onUpdate: (value) => values.push(value),
	});
	await step(300);
	expect(values).toEqual([]);

	const stop = createAnimate(
		renderer,
		true,
	)({
		from: 0,
		to: 4,
		duration: 100,
		loop: true,
		onUpdate: (value) => values.push(value),
	});
	await step(50);
	await step(50);
	await step(50);
	expect(
		values.some((value, at) => at > 0 && value < (values[at - 1] ?? 0)),
	).toBe(true);
	stop();
	await dispose();
});
