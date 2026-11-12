import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FauxScript, inputArea, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const none: FauxScript = { replies: [] };
const extensions = join(import.meta.dir, "fixtures/extensions");
const modelConfig = {
	placement: { status: ["model.current", "reasoning.level"] },
};

function locate(frame: string, text: string) {
	const rows = frame.split("\n");
	const row = rows.findLastIndex((line) => line.includes(text));
	if (row < 0) throw new Error(`"${text}" is not in the frame:\n${frame}`);
	return { x: (rows[row] ?? "").indexOf(text) + 1, y: row };
}

function count(frame: string, text: string) {
	return frame.split(text).length - 1;
}

async function clickText(piu: Piu, text: string) {
	const { x, y } = locate(piu.captureCharFrame(), text);
	await piu.mockMouse.click(x, y);
}

async function start(script: FauxScript = none) {
	const piu = await startPiu({ script, config: modelConfig });
	await piu.waitForFrame((f) => f.includes("faux-1"));
	return piu;
}

test("the model Modal filters available models as the user types", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame(
		(f) => f.includes("faux-2") && f.includes("Favorites"),
	);
	await piu.mockInput.typeText("faux-2");
	const filtered = await piu.waitForFrame(
		(f) => f.includes("Search: faux-2") && count(f, "faux-1") === 1,
	);
	expect(filtered).toContain("All");
	expect(count(filtered, "faux-1")).toBe(1);
});

test("the model picker shows and searches a model's display name", async () => {
	await using piu = await start({ replies: [], namedModel: true });
	await clickText(piu, "faux-1");
	await piu.waitForFrame(
		(f) => f.includes("Faux Reasoner") && f.includes("faux-2"),
	);
	await piu.mockInput.typeText("REASONER");
	await piu.waitForFrame(
		(f) =>
			f.includes("Search: REASONER") &&
			f.includes("Faux Reasoner") &&
			!f.includes("☆ faux-1"),
	);
});

test("the provider remains visible for a model with a long name", async () => {
	await using piu = await start({ replies: [], longModelName: true });
	await clickText(piu, "faux-1");
	const frame = await piu.waitForFrame((f) =>
		f.includes("A very long model name"),
	);
	const row =
		frame.split("\n").find((line) => line.includes("A very long model name")) ??
		"";
	expect(row).toContain("  faux");
	expect(row).toContain("faux-2");
});

test("the model command opens the searchable model Modal", async () => {
	await using piu = await start();
	await piu.mockInput.typeText("/model");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(f) =>
			f.includes("Search models") &&
			f.includes("Favorites") &&
			f.includes("faux-2"),
	);
});

test("the configured model shortcut opens the searchable model Modal", async () => {
	await using piu = await start();
	piu.mockInput.pressKey("l", { ctrl: true });
	await piu.waitForFrame(
		(f) =>
			f.includes("Search models") &&
			f.includes("Favorites") &&
			f.includes("faux-2"),
	);
});

test("the search query remains when switching model tabs", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("☆ faux-2"));
	await clickText(piu, "☆ faux-2");
	await piu.waitForFrame((f) => f.includes("★ faux-2"));
	await piu.mockInput.typeText("faux-");
	await piu.waitForFrame(
		(f) =>
			f.includes("Search: faux-") &&
			f.includes("☆ faux-1") &&
			f.includes("★ faux-2"),
	);
	await clickText(piu, "Favorites");
	await piu.waitForFrame(
		(f) =>
			f.includes("Search: faux-") &&
			!f.includes("☆ faux-1") &&
			f.includes("★ faux-2"),
	);
	await piu.mockInput.typeText("2");
	await piu.waitForFrame(
		(f) => f.includes("Search: faux-2") && f.includes("★ faux-2"),
	);
	await clickText(piu, "All");
	await piu.mockInput.pressBackspace();
	await piu.waitForFrame(
		(f) =>
			f.includes("Search: faux-") &&
			f.includes("☆ faux-1") &&
			f.includes("★ faux-2"),
	);
});

test("keyboard tab switching keeps the search query", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("☆ faux-2"));
	await clickText(piu, "☆ faux-2");
	await piu.waitForFrame((f) => f.includes("★ faux-2"));
	await piu.mockInput.typeText("faux-");
	await piu.waitForFrame(
		(f) => f.includes("Search: faux-") && f.includes("☆ faux-1"),
	);
	piu.mockInput.pressTab();
	piu.mockInput.pressArrow("right");
	await piu.waitForFrame(
		(f) =>
			f.includes("Search: faux-") &&
			!f.includes("☆ faux-1") &&
			f.includes("★ faux-2"),
	);
	piu.mockInput.pressArrow("left");
	await piu.waitForFrame(
		(f) =>
			f.includes("Search: faux-") &&
			f.includes("☆ faux-1") &&
			f.includes("★ faux-2"),
	);
});

test("clicking the search field after moving to the list returns typing to the search", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame(
		(f) => f.includes("Search models") && f.includes("faux-2"),
	);
	piu.mockInput.pressTab();
	await clickText(piu, "Search models");
	await piu.mockInput.typeText("faux-2");
	const frame = await piu.waitForFrame((f) => f.includes("Search: faux-2"));
	expect(count(frame, "faux-1")).toBe(1);
});

test("clicking the search label returns focus to the search field", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame(
		(f) => f.includes("Search models") && f.includes("faux-2"),
	);
	piu.mockInput.pressTab();
	await clickText(piu, "Search:");
	await piu.mockInput.typeText("faux-2");
	const frame = await piu.waitForFrame((f) => f.includes("Search: faux-2"));
	expect(count(frame, "faux-1")).toBe(1);
});

test("F favorites the highlighted model and restores it on reopening", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame(
		(f) => f.includes("faux-2") && f.includes("Favorites"),
	);
	piu.mockInput.pressTab();
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressKey("f", { shift: true });
	await piu.waitForFrame((f) => f.includes("★ faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Favorites"));
	await clickText(piu, "faux-1");
	const reopened = await piu.waitForFrame(
		(f) => f.includes("★ faux-2") && count(f, "faux-1") === 1,
	);
	expect(count(reopened, "faux-1")).toBe(1);
});

test("clicking a star removes a model from the Favorites tab without choosing it", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("☆ faux-2"));
	await clickText(piu, "☆ faux-2");
	await piu.waitForFrame((f) => f.includes("★ faux-2"));
	await clickText(piu, "Favorites");
	await piu.waitForFrame(
		(f) => f.includes("★ faux-2") && !f.includes("☆ faux-1"),
	);
	await clickText(piu, "★ faux-2");
	const frame = await piu.waitForFrame(
		(f) =>
			f.includes("No favorites yet") &&
			f.includes("faux-1") &&
			!f.includes("faux-2"),
	);
	expect(frame).toContain("faux-1");
	expect(frame).not.toContain("faux-2");
});

test("typing f in search filters without favoriting a model", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("☆ faux-2"));
	await piu.mockInput.typeText("f");
	const frame = await piu.waitForFrame(
		(f) => f.includes("Search: f") && f.includes("☆ faux-2"),
	);
	expect(frame).not.toContain("★ faux-1");
	expect(frame).not.toContain("★ faux-2");
});

test("favorites distinguish the same model id from different providers", async () => {
	await using piu = await start({ replies: [], sameIdProvider: true });
	await clickText(piu, "faux-1");
	const opened = await piu.waitForFrame(
		(f) => f.includes("faux-1") && f.includes("other"),
	);
	const otherRow = opened
		.split("\n")
		.find((line) => line.includes("faux-1") && line.includes("other"));
	expect(otherRow).toBeDefined();
	const position = locate(opened, "other");
	const star = (otherRow ?? "").indexOf("☆");
	await piu.mockMouse.click(star, position.y);
	const updated = await piu.waitForFrame((f) =>
		f
			.split("\n")
			.some((line) => line.includes("★ faux-1") && line.includes("other")),
	);
	expect(
		updated
			.split("\n")
			.some((line) => line.includes("☆ faux-1") && line.includes("faux")),
	).toBe(true);
});

test("a refused model change leaves the saved personal selection untouched", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-selection.json");
	const saved = JSON.stringify({
		model: { provider: "faux", id: "faux-1" },
		thinkingLevel: "off",
	});
	try {
		writeFileSync(file, saved);
		await using piu = await startPiu({
			dir,
			script: { replies: [], sameIdProvider: true, denyOtherOnFile: true },
			config: modelConfig,
		});
		await piu.waitForFrame((f) => f.includes("faux-1"));
		await clickText(piu, "faux-1");
		await piu.waitForFrame((f) => f.includes("other"));
		writeFileSync(join(dir, "script.json.deny"), "");
		await clickText(piu, "other");
		await piu.waitForFrame(
			(f) => f.includes("No API key") && f.includes("faux-1"),
		);
		expect(readFileSync(file, "utf8")).toBe(saved);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("empty favorites and no search matches have distinct messages", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("☆ faux-2"));
	await clickText(piu, "Favorites");
	await piu.waitForFrame((f) => f.includes("No favorites yet"));
	await clickText(piu, "All");
	await piu.mockInput.typeText("no-such-model");
	await piu.waitForFrame((f) => f.includes("No matching models"));
	piu.mockInput.pressEnter();
	await piu.mockInput.typeText("x");
	const frame = await piu.waitForFrame(
		(f) =>
			f.includes("Search: no-such-modelx") && f.includes("No matching models"),
	);
	expect(frame).toContain("Favorites");
});

test("filtering keeps the highlighted model when it still matches", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressTab();
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressTab();
	await piu.mockInput.typeText("faux");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("faux-2") && !f.includes("faux-1"));
});

test("keyboard navigation scrolls the model list to the highlighted row", async () => {
	await using piu = await start({ replies: [], manyModels: true });
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("extra-00"));
	await piu.mockInput.typeText("extra-");
	await piu.waitForFrame(
		(f) => f.includes("Search: extra-") && f.includes("extra-00"),
	);
	piu.mockInput.pressTab();
	for (let i = 0; i < 19; i++) piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("extra-19"));
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(f) => f.includes("extra-19") && !f.includes("Search:"),
	);
});

test("the selected model and reasoning survive a new launch", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const project = join(dir, "project");
	mkdirSync(project);
	try {
		{
			await using piu = await startPiu({
				dir,
				script: none,
				config: modelConfig,
			});
			await piu.waitForFrame((f) => f.includes("faux-1"));
			await clickText(piu, "faux-1");
			await piu.waitForFrame((f) => f.includes("faux-2"));
			await clickText(piu, "faux-2");
			await piu.waitForFrame(
				(f) => f.includes("faux-2") && !f.includes("faux-1"),
			);
			await clickText(piu, "Reasoning: off");
			await piu.waitForFrame((f) => f.includes("high"));
			await clickText(piu, "high");
			await piu.waitForFrame((f) => f.includes("Reasoning: high"));
		}
		{
			await using piu = await startPiu({
				dir,
				cwd: project,
				args: [],
				script: { replies: ["Answered by {model} with {reasoning}"] },
				config: modelConfig,
			});
			await piu.waitForFrame(
				(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
			);
			await piu.mockInput.typeText("Hi");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) => f.includes("Answered by faux-2 with high"));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("an immediate first prompt waits for the personal model and reasoning", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: [],
			script: { replies: ["Answered by {model} with {reasoning}"] },
			config: modelConfig,
		});
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with high"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("CLI overrides do not replace the personal model default", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		{
			await using piu = await startPiu({
				dir,
				args: ["--model", "faux/faux-1", "--thinking", "off"],
				script: { replies: ["Answered by {model}"] },
				config: modelConfig,
			});
			await piu.waitForFrame(
				(f) => f.includes("faux-1") && f.includes("Reasoning: off"),
			);
			await piu.mockInput.typeText("Hi");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) => f.includes("Answered by faux-1"));
		}
		{
			await using piu = await startPiu({
				dir,
				args: [],
				script: { replies: ["Answered by {model}"] },
				config: modelConfig,
			});
			await piu.waitForFrame(
				(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
			);
			await piu.mockInput.typeText("Hi");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) => f.includes("Answered by faux-2"));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a thinking suffix in backend.args models takes precedence over the personal level", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: [],
			extraBackendArgs: ["--models", "faux/faux-2:low"],
			script: { replies: ["Answered by {model} with {reasoning}"] },
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2") && f.includes("Reasoning: low"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with low"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a backend.args suffix does not override the saved level when CLI chooses the model", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: ["--model", "faux/faux-3"],
			extraBackendArgs: ["--models", "faux/faux-2:medium,faux/faux-3"],
			script: {
				replies: ["Answered by {model} with {reasoning}"],
				altReasoningModel: true,
			},
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-3") && f.includes("Reasoning: high"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-3 with high"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a --model suffix applies even when --models comes later", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "low",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: ["--models", "faux/faux-1"],
			extraBackendArgs: ["--model", "faux/faux-2:high"],
			script: { replies: ["Answered by {model} with {reasoning}"] },
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with high"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a scoped suffix does not override the saved level when --model has no suffix", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: ["--models", "faux/faux-3:high"],
			extraBackendArgs: ["--model", "faux/faux-2"],
			script: {
				replies: ["Answered by {model} with {reasoning}"],
				altReasoningModel: true,
			},
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with high"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a scoped suffix only counts for the model the Backend selects", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: [],
			extraBackendArgs: ["--models", "faux/faux-2,faux/faux-3:high"],
			script: {
				replies: ["Answered by {model} with {reasoning}"],
				altReasoningModel: true,
			},
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with high"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("CLI thinking applies to the restored personal model", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: ["--thinking", "low"],
			script: { replies: ["Answered by {model} with {reasoning}"] },
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2") && f.includes("Reasoning: low"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with low"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a colon in a CLI model id is not mistaken for a thinking override", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			args: ["--model", "faux/faux-2:free"],
			script: {
				replies: ["Answered by {model} with {reasoning}"],
				colonModel: true,
			},
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2:free") && f.includes("Reasoning: high"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) =>
			f.includes("Answered by faux-2:free with high"),
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a resumed session keeps its model and reasoning without changing the personal default", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-selection.json");
	const saved = JSON.stringify({
		model: { provider: "faux", id: "faux-1" },
		thinkingLevel: "off",
	});
	try {
		{
			await using piu = await startPiu({
				dir,
				persistSession: true,
				script: { replies: ["first"] },
				config: modelConfig,
			});
			await piu.waitForFrame((f) => f.includes("faux-1"));
			await clickText(piu, "faux-1");
			await piu.waitForFrame((f) => f.includes("faux-2"));
			await clickText(piu, "faux-2");
			await piu.waitForFrame(
				(f) => f.includes("faux-2") && !f.includes("faux-1"),
			);
			await clickText(piu, "Reasoning: off");
			await piu.waitForFrame((f) => f.includes("high"));
			await clickText(piu, "high");
			await piu.waitForFrame((f) => f.includes("Reasoning: high"));
			await piu.mockInput.typeText("first");
			piu.mockInput.pressEnter();
			await piu.waitForFrame(
				(f) => f.includes("> first") && f.includes("first"),
			);
		}
		writeFileSync(file, saved);
		{
			await using piu = await startPiu({
				dir,
				persistSession: true,
				args: ["--continue"],
				script: { replies: ["continued by {model} with {reasoning}"] },
				config: modelConfig,
			});
			await piu.waitForFrame(
				(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
			);
			await piu.mockInput.typeText("second");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) =>
				f.includes("continued by faux-2 with high"),
			);
			expect(readFileSync(file, "utf8")).toBe(saved);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a new named session uses the personal model default", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(
			join(dir, "model-selection.json"),
			JSON.stringify({
				model: { provider: "faux", id: "faux-2" },
				thinkingLevel: "high",
			}),
		);
		await using piu = await startPiu({
			dir,
			persistSession: true,
			args: ["--session-id", "new-session"],
			script: { replies: ["Answered by {model} with {reasoning}"] },
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with high"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a starred model is available after restarting in another project", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const project = join(dir, "project");
	mkdirSync(project);
	try {
		{
			await using piu = await startPiu({
				dir,
				script: none,
				config: modelConfig,
			});
			await piu.waitForFrame((f) => f.includes("faux-1"));
			await clickText(piu, "faux-1");
			await piu.waitForFrame((f) => f.includes("☆ faux-2"));
			await clickText(piu, "☆ faux-2");
			await piu.waitForFrame((f) => f.includes("★ faux-2"));
		}
		{
			await using piu = await startPiu({
				dir,
				cwd: project,
				script: none,
				config: modelConfig,
			});
			await piu.waitForFrame((f) => f.includes("faux-1"));
			await clickText(piu, "faux-1");
			const frame = await piu.waitForFrame((f) => f.includes("★ faux-2"));
			expect(count(frame, "faux-1")).toBe(1);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("temporarily unavailable favorites survive changes to available models", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-favorites.json");
	try {
		writeFileSync(file, JSON.stringify([{ provider: "other", id: "offline" }]));
		await using piu = await startPiu({
			dir,
			script: none,
			config: modelConfig,
		});
		await piu.waitForFrame((f) => f.includes("faux-1"));
		await clickText(piu, "faux-1");
		await piu.waitForFrame((f) => f.includes("☆ faux-2"));
		await clickText(piu, "☆ faux-2");
		await piu.waitForFrame((f) => f.includes("★ faux-2"));
		expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([
			{ provider: "other", id: "offline" },
			{ provider: "faux", id: "faux-2" },
		]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("two instances keep their live models and save favorites independently of the selection", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		{
			await using first = await startPiu({
				dir,
				script: none,
				config: modelConfig,
			});
			await first.waitForFrame((f) => f.includes("faux-1"));
			await using second = await startPiu({
				dir,
				script: none,
				config: modelConfig,
			});
			await second.waitForFrame((f) => f.includes("faux-1"));
			await clickText(second, "faux-1");
			await second.waitForFrame((f) => f.includes("faux-2"));
			await clickText(second, "faux-2");
			await second.waitForFrame(
				(f) => f.includes("faux-2") && !f.includes("faux-1"),
			);
			const firstFrame = await first.waitForFrame((f) => f.includes("faux-1"));
			expect(firstFrame).not.toContain("faux-2");
			await clickText(first, "faux-1");
			await first.waitForFrame((f) => f.includes("☆ faux-2"));
			await clickText(first, "☆ faux-2");
			await first.waitForFrame((f) => f.includes("★ faux-2"));
		}
		{
			await using piu = await startPiu({
				dir,
				args: [],
				script: none,
				config: modelConfig,
			});
			await piu.waitForFrame((f) => f.includes("faux-2"));
			await clickText(piu, "faux-2");
			await piu.waitForFrame((f) => f.includes("★ faux-2"));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a stale unstarred view still adds a favorite chosen in another instance", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		await using first = await startPiu({
			dir,
			script: none,
			config: modelConfig,
		});
		await first.waitForFrame((f) => f.includes("faux-1"));
		await using second = await startPiu({
			dir,
			script: none,
			config: modelConfig,
		});
		await second.waitForFrame((f) => f.includes("faux-1"));
		await clickText(first, "faux-1");
		await first.waitForFrame((f) => f.includes("☆ faux-2"));
		await clickText(second, "faux-1");
		await second.waitForFrame((f) => f.includes("☆ faux-2"));
		await clickText(second, "☆ faux-2");
		await second.waitForFrame((f) => f.includes("★ faux-2"));
		await clickText(first, "☆ faux-2");
		await first.waitForFrame((f) => f.includes("★ faux-2"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("an unavailable saved model reports an error without erasing the default", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-selection.json");
	const saved = JSON.stringify({
		model: { provider: "faux", id: "unavailable" },
		thinkingLevel: "high",
	});
	try {
		writeFileSync(file, saved);
		await using piu = await startPiu({
			dir,
			args: [],
			script: { replies: ["Answered by {model}"] },
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("Could not restore model") && f.includes("faux-1"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-1"));
		expect(readFileSync(file, "utf8")).toBe(saved);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a corrupt personal selection is reported and left untouched", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-selection.json");
	const saved = "{not json";
	try {
		writeFileSync(file, saved);
		await using piu = await startPiu({
			dir,
			args: [],
			script: { replies: ["Answered by {model}"] },
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) =>
				f.includes("Could not read model selection") && f.includes("faux-1"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-1"));
		expect(readFileSync(file, "utf8")).toBe(saved);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("an unsupported saved reasoning level is clamped by the Backend", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-selection.json");
	const saved = JSON.stringify({
		model: { provider: "faux", id: "faux-1" },
		thinkingLevel: "high",
	});
	try {
		writeFileSync(file, saved);
		await using piu = await startPiu({
			dir,
			args: [],
			script: { replies: ["Answered by {model} with {reasoning}"] },
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-1") && f.includes("Reasoning: off"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame(
			(f) =>
				f.includes("Answered by faux-1 with off") &&
				f.includes("Reasoning: off"),
		);
		expect(readFileSync(file, "utf8")).toBe(saved);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a saved level unsupported by the model is clamped to the nearest level", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-selection.json");
	const saved = JSON.stringify({
		model: { provider: "faux", id: "faux-2" },
		thinkingLevel: "max",
	});
	try {
		writeFileSync(file, saved);
		await using piu = await startPiu({
			dir,
			args: [],
			script: {
				replies: ["Answered by {model} with {reasoning}"],
				limitedReasoning: true,
			},
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("faux-2") && f.includes("Reasoning: high"),
		);
		await piu.mockInput.typeText("Hi");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Answered by faux-2 with high"));
		expect(readFileSync(file, "utf8")).toBe(saved);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a failed personal selection write is shown without undoing the Backend selection", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		mkdirSync(join(dir, "model-selection.json"));
		await using piu = await startPiu({
			dir,
			script: none,
			config: modelConfig,
		});
		await piu.waitForFrame((f) => f.includes("faux-1"));
		await clickText(piu, "faux-1");
		await piu.waitForFrame((f) => f.includes("faux-2"));
		await clickText(piu, "faux-2");
		await piu.waitForFrame(
			(f) =>
				f.includes("Could not save model selection") && f.includes("faux-2"),
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a failed favorites write is shown and does not mark the model saved", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	try {
		writeFileSync(join(dir, "model-favorites.json"), "[]");
		await using piu = await startPiu({
			dir,
			script: none,
			config: modelConfig,
		});
		await piu.waitForFrame((f) => f.includes("faux-1"));
		await clickText(piu, "faux-1");
		await piu.waitForFrame((f) => f.includes("☆ faux-2"));
		chmodSync(dir, 0o500);
		try {
			await clickText(piu, "☆ faux-2");
			const frame = await piu.waitForFrame(
				(f) => f.includes("Could not save favorites") && f.includes("☆ faux-2"),
			);
			expect(frame).not.toContain("★ faux-2");
		} finally {
			chmodSync(dir, 0o700);
		}
	} finally {
		chmodSync(dir, 0o700);
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a corrupt favorites file is reported and not overwritten", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-favorites.json");
	const saved = "{not json";
	try {
		writeFileSync(file, saved);
		await using piu = await startPiu({
			dir,
			script: none,
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("Could not read favorites") && f.includes("faux-1"),
		);
		await clickText(piu, "faux-1");
		await piu.waitForFrame((f) => f.includes("Search models"));
		await clickText(piu, "☆ faux-1");
		await piu.waitForFrame(
			(f) => f.includes("Could not read favorites") && f.includes("☆ faux-1"),
		);
		expect(readFileSync(file, "utf8")).toBe(saved);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("a favorites entry of the wrong shape is reported and not overwritten", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-model-"));
	const file = join(dir, "model-favorites.json");
	const saved = JSON.stringify([
		{ provider: "faux", id: "faux-1" },
		{ provider: 42 },
	]);
	try {
		writeFileSync(file, saved);
		await using piu = await startPiu({
			dir,
			script: none,
			config: modelConfig,
		});
		await piu.waitForFrame(
			(f) => f.includes("Could not read favorites") && f.includes("faux-1"),
		);
		await clickText(piu, "faux-1");
		await piu.waitForFrame((f) => f.includes("Search models"));
		await clickText(piu, "☆ faux-1");
		await piu.waitForFrame(
			(f) => f.includes("Could not read favorites") && f.includes("☆ faux-1"),
		);
		expect(readFileSync(file, "utf8")).toBe(saved);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20000);

test("search text stays out of the prompt and Esc returns the keyboard to it", async () => {
	await using piu = await start();
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("Search models"));
	await piu.mockInput.typeText("faux-2");
	await piu.waitForFrame((f) => f.includes("Search: faux-2"));
	expect(inputArea(piu.captureCharFrame())).not.toContain("faux-2");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Search models"));
	await piu.mockInput.typeText("after");
	await piu.waitForFrame((f) => inputArea(f).includes("after"));
});

test("clicking the model opens a centered Modal of the Backend's models, and picking one switches the Backend", async () => {
	await using piu = await start({ replies: ["Answered by {model}"] });

	await clickText(piu, "faux-1");
	const open = await piu.waitForFrame((f) => f.includes("faux-2"));
	const rows = open.split("\n");
	const center = locate(open, "faux-2");
	expect(Math.abs(center.y - rows.length / 2)).toBeLessThan(6);
	expect(Math.abs(center.x - 80)).toBeLessThan(30);

	await clickText(piu, "faux-2");
	const closed = await piu.waitForFrame(
		(f) => f.includes("faux-2") && !f.includes("faux-1"),
	);
	expect(closed).toContain("faux-2");

	await piu.mockInput.typeText("Hi");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Answered by faux-2"));
});

test("the reasoning picker lists only the levels the current model supports, and picking one updates it", async () => {
	await using piu = await start();

	await clickText(piu, "Reasoning: off");
	const plain = await piu.waitForFrame((f) => count(f, "off") === 2);
	expect(plain).not.toContain("high");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => count(f, "off") === 1);
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	await clickText(piu, "faux-2");
	await piu.waitForFrame((f) => !f.includes("faux-1"));

	await clickText(piu, "Reasoning: off");
	const levels = await piu.waitForFrame((f) => f.includes("high"));
	expect(levels).toContain("minimal");
	await clickText(piu, "high");
	await piu.waitForFrame(
		(f) => f.includes("Reasoning: high") && !f.includes("minimal"),
	);
});

test("Esc closes the Modal", async () => {
	await using piu = await start();

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	const closed = await piu.waitForFrame((f) => !f.includes("faux-2"));
	expect(closed).toContain("faux-1");
});

test("a click outside closes the Modal without picking anything", async () => {
	await using piu = await start();

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	await piu.mockMouse.click(3, 3);
	const closed = await piu.waitForFrame((f) => !f.includes("faux-2"));
	expect(closed).toContain("faux-1");
});

test("typing while a Modal is open leaves the input underneath unchanged", async () => {
	await using piu = await start();
	await piu.mockInput.typeText("draft");
	await piu.waitForFrame((f) => f.includes("draft"));

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	await piu.mockInput.typeText("xyz");
	piu.mockInput.pressBackspace();
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));

	const frame = piu.captureCharFrame();
	expect(frame).toContain("draft");
	expect(frame).not.toContain("xyz");

	await piu.mockInput.typeText("!");
	await piu.waitForFrame((f) => f.includes("draft!"));
});

test("Esc closes the Modal and does not abort a running agent", async () => {
	await using piu = await start({
		replies: [
			{ toolCalls: [{ name: "bash", args: { command: "sleep 1" } }] },
			"Finished the run",
		],
	});
	await piu.mockInput.typeText("Go");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Working"));

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));

	await piu.waitForFrame((f) => f.includes("Finished the run"));
});

test("a Modal opened from a Modal stacks, and Esc closes only the top one", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { status: ["stacker.opener"] } },
	});

	await piu.waitForFrame((f) => f.includes("open outer"));
	await clickText(piu, "open outer");
	await piu.waitForFrame((f) => f.includes("OUTER"));
	await clickText(piu, "open inner");
	const stacked = await piu.waitForFrame((f) => f.includes("INNER"));
	const inner = locate(stacked, "INNER");
	expect(inner.y).toBeLessThan(6);
	expect(inner.x).toBeLessThan(12);

	piu.mockInput.pressEscape();
	const outerOnly = await piu.waitForFrame((f) => !f.includes("INNER"));
	expect(outerOnly).toContain("OUTER");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("OUTER"));
});

test("typing is held back from the input even when nothing in the Modal takes keys", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { status: ["stacker.opener"] } },
	});
	await piu.mockInput.typeText("draft");
	await piu.waitForFrame((f) => f.includes("draft"));

	await clickText(piu, "open outer");
	await piu.waitForFrame((f) => f.includes("OUTER"));
	await piu.mockInput.typeText("xyz");
	await piu.mockInput.pasteBracketedText("pasted");
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("OUTER"));

	await piu.mockInput.typeText("!");
	const frame = await piu.waitForFrame((f) => f.includes("draft!"));
	expect(frame).not.toContain("xyz");
	expect(frame).not.toContain("pasted");
});

test("the model picker works from the keyboard: Down moves, Enter picks", async () => {
	await using piu = await start({ replies: ["Answered by {model}"] });

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("faux-2") && !f.includes("faux-1"));

	await piu.mockInput.typeText("Hi");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Answered by faux-2"));
});

test("a click outside a stacked Modal closes only the top one", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { status: ["stacker.opener"] } },
	});
	await piu.waitForFrame((f) => f.includes("open outer"));
	await clickText(piu, "open outer");
	await piu.waitForFrame((f) => f.includes("OUTER"));
	await clickText(piu, "open inner");
	await piu.waitForFrame((f) => f.includes("INNER"));

	await piu.mockMouse.click(100, 25);
	const frame = await piu.waitForFrame((f) => !f.includes("INNER"));
	expect(frame).toContain("OUTER");
});
