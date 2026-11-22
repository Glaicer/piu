import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { stringWidth } from "bun";
import { bottomLine, inputPanel, startPiu } from "./harness.ts";

function workspace(name = "project") {
	const root = mkdtempSync(join(tmpdir(), "piu-dir-"));
	const cwd = join(root, name);
	mkdirSync(cwd);
	return {
		root,
		cwd,
		[Symbol.dispose]: () => rmSync(root, { recursive: true, force: true }),
	};
}

function git(cwd: string, ...args: string[]) {
	execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
}

const modelPart = "faux-1 · no reasoning    ";

function directoryLine(frame: string) {
	const line = bottomLine(frame).trim();
	if (!line.startsWith(modelPart)) return "";
	return line.slice(modelPart.length).replace(/ +[▰▱]{10} \S+$/, "");
}

test("the directory Module is on the bottom line, not in the input, and omits the branch outside Git", async () => {
	using project = workspace();
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 100,
	});
	const frame = await piu.waitForFrame((frame) =>
		directoryLine(frame).includes(basename(project.cwd)),
	);
	expect(directoryLine(frame)).toBe(basename(project.cwd));
	expect(inputPanel(frame)).toContain("/ commands   @ files");
	expect(inputPanel(frame)).not.toContain(basename(project.cwd));
});

test("the directory line shows the current branch even before the first commit", async () => {
	using project = workspace();
	git(project.cwd, "init", "--quiet", "--initial-branch=feature/composer");
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 100,
	});
	const frame = await piu.waitForFrame((frame) =>
		directoryLine(frame).includes(" · feature/composer"),
	);
	expect(directoryLine(frame)).toBe(
		`${basename(project.cwd)} · feature/composer`,
	);
});

test("the directory line refreshes after switching branches", async () => {
	using project = workspace();
	git(project.cwd, "init", "--quiet", "--initial-branch=before");
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 100,
	});
	await piu.waitForFrame((frame) => directoryLine(frame).includes(" · before"));
	git(project.cwd, "symbolic-ref", "HEAD", "refs/heads/after");
	const frame = await piu.waitForFrame((frame) =>
		directoryLine(frame).includes(" · after"),
	);
	expect(directoryLine(frame)).toBe(`${basename(project.cwd)} · after`);
});

test("long directory and branch names retain their endings on one line", async () => {
	using project = workspace("a-very-long-working-directory-tail");
	const branch = `feature/${"very-long-".repeat(8)}branch-tail`;
	git(project.cwd, "init", "--quiet", `--initial-branch=${branch}`);
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 100,
	});
	const frame = await piu.waitForFrame((frame) =>
		directoryLine(frame).includes("branch-tail"),
	);
	const line = directoryLine(frame);
	expect(line).toStartWith("…");
	expect(line).toContain("directory-tail · …");
	expect(line).toEndWith("branch-tail");
	expect(stringWidth(line)).toBeLessThanOrEqual(100 - 2 - modelPart.length - 1);
});

test("wide characters in directory and branch names fit the visible cells", async () => {
	using project = workspace("项目目录末尾");
	const branch = `feature/${"很多".repeat(10)}分支尾部`;
	git(project.cwd, "init", "--quiet", `--initial-branch=${branch}`);
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 80,
	});
	const frame = await piu.waitForFrame((frame) =>
		directoryLine(frame).includes("分支尾部"),
	);
	const line = directoryLine(frame);
	expect(line).toContain("末尾 · …");
	expect(line).toEndWith("分支尾部");
	expect(stringWidth(line)).toBeLessThanOrEqual(80 - 2 - modelPart.length - 1);
});

test("the directory Module can be placed without the prompt", async () => {
	using project = workspace();
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 100,
		config: {
			layout: { kind: "panel", id: "where", direction: "column", size: "rest" },
			placement: { where: ["input.dir"] },
		},
	});
	const frame = await piu.waitForFrame((frame) =>
		frame.includes(basename(project.cwd)),
	);
	expect(frame).not.toContain("/ commands   @ files");
});
