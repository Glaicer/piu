// Manual check for the two open risks in ADR-0001; not part of `pnpm check`.
// Usage: bun scripts/pi-bolt-compat/run.ts
// PIU_COMPAT_BACKEND=<binary>   test another binary (default: pi-bolt)
// PIU_COMPAT_AGENT_DIR=<dir>    run with that Pi agent dir (default: the one Pi-Bolt picks, normally ~/.pi/agent)
// PIU_COMPAT_ARGS="<args>"       extra backend arguments, split on spaces (e.g. "-ne")
import { spawn } from "node:child_process";
import { join } from "node:path";
import { attachJsonlLineReader, serializeJsonLine } from "../../src/jsonl.ts";

const backendName = process.env.PIU_COMPAT_BACKEND ?? "pi-bolt";
const backend = Bun.which(backendName);
if (!backend) {
	console.log(`SKIP: ${backendName} is not installed (not on PATH).`);
	process.exit(0);
}

const READY_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 20_000;
const CLOSE_TIMEOUT_MS = 10_000;
const PROBE_MARKER = "PIU_PROBE_IMPLEMENTATION";
const fauxPath = join(import.meta.dir, "faux-provider.ts");
const probeToolPath = join(import.meta.dir, "probe-tool.ts");

type Run = Awaited<ReturnType<typeof runBackend>>;

async function runBackend(withProbeTool: boolean) {
	const extensionArgs = [
		"-e",
		fauxPath,
		...(withProbeTool ? ["-e", probeToolPath] : []),
	];
	const child = spawn(
		backend as string,
		[
			"--mode",
			"rpc",
			"--no-session",
			...(process.env.PIU_COMPAT_ARGS?.split(" ").filter(Boolean) ?? []),
			...extensionArgs,
			"--model",
			"faux/faux-1",
		],
		{
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				...(process.env.PIU_COMPAT_AGENT_DIR && {
					PI_CODING_AGENT_DIR: process.env.PIU_COMPAT_AGENT_DIR,
				}),
				PI_OFFLINE: "1",
			},
		},
	);

	const nonProtocolStdout: string[] = [];
	const toolResults: string[] = [];
	const toolStarts: string[] = [];
	const dialogRequests: string[] = [];
	let stderr = "";
	let promptError: string | undefined;
	let agentEnded: () => void = () => {};
	const agentEndedPromise = new Promise<void>((resolve) => {
		agentEnded = resolve;
	});
	let stateAnswered: () => void = () => {};
	const stateAnsweredPromise = new Promise<void>((resolve) => {
		stateAnswered = resolve;
	});
	const exited = new Promise<{ code: number | null; signal: string | null }>(
		(resolve) => child.on("exit", (code, signal) => resolve({ code, signal })),
	);

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});

	attachJsonlLineReader(child.stdout, (line) => {
		let record: Record<string, unknown>;
		try {
			const parsed: unknown = JSON.parse(line);
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				!("type" in parsed)
			) {
				throw new Error("not a protocol record");
			}
			record = parsed as Record<string, unknown>;
		} catch {
			nonProtocolStdout.push(line);
			return;
		}
		switch (record.type) {
			case "response":
				if (record.id === "state") stateAnswered();
				if (record.command === "prompt" && record.success === false) {
					promptError = String(record.error);
					agentEnded();
				}
				break;
			case "tool_execution_start":
				toolStarts.push(String(record.toolName));
				break;
			case "tool_execution_end":
				toolResults.push(JSON.stringify(record.result));
				break;
			case "extension_ui_request":
				dialogRequests.push(
					`${record.method}${record.title ? ` "${record.title}"` : ""}`,
				);
				child.stdin.write(
					serializeJsonLine({
						type: "extension_ui_response",
						id: record.id,
						cancelled: true,
					}),
				);
				break;
			case "agent_end":
				agentEnded();
				break;
		}
	});

	child.stdin.write(serializeJsonLine({ type: "get_state", id: "state" }));
	const started = await Promise.race([
		stateAnsweredPromise.then(() => true),
		exited.then(() => false),
		Bun.sleep(READY_TIMEOUT_MS).then(() => false),
	]);
	let timedOut = false;
	if (started) {
		child.stdin.write(
			serializeJsonLine({ type: "prompt", id: "go", message: "ask me" }),
		);
		timedOut = await Promise.race([
			Promise.race([agentEndedPromise, exited]).then(() => false),
			Bun.sleep(RUN_TIMEOUT_MS).then(() => true),
		]);
	}

	const closeStart = Date.now();
	child.stdin.end();
	const exit = await Promise.race([
		exited,
		Bun.sleep(CLOSE_TIMEOUT_MS).then(() => undefined),
	]);
	const closeMs = Date.now() - closeStart;
	if (!exit) child.kill("SIGKILL");

	return {
		started,
		nonProtocolStdout,
		toolResults,
		toolStarts,
		dialogRequests,
		stderrLines: stderr.split("\n").filter((l) => l.trim()),
		promptError,
		timedOut,
		exit,
		closeMs,
	};
}

function printLines(label: string, lines: string[]) {
	console.log(`  ${label}: ${lines.length === 0 ? "none" : ""}`);
	for (const line of lines) console.log(`    | ${line.slice(0, 300)}`);
}

function describeRun(run: Run) {
	console.log(`  tools executed: ${run.toolStarts.join(", ") || "none"}`);
	if (run.promptError) console.log(`  prompt error: ${run.promptError}`);
	if (run.timedOut) console.log("  TIMED OUT waiting for agent_end");
	for (const r of run.toolResults) console.log(`  result: ${r.slice(0, 300)}`);
	printLines("extension UI requests", run.dialogRequests);
}

console.log(
	`Backend: ${backend} (${Bun.spawnSync([backend, "--version"]).stdout.toString().trim()})`,
);
console.log(
	`Agent dir: ${process.env.PIU_COMPAT_AGENT_DIR ?? process.env.PI_CODING_AGENT_DIR ?? "default (~/.pi/agent)"}`,
);

console.log("\n[control] only the faux provider, no probe tool");
const control = await runBackend(false);
describeRun(control);
const controlHasCompiledIn = control.dialogRequests.some((r) =>
	r.startsWith("select"),
);
console.log(
	controlHasCompiledIn
		? "  => the compiled-in ask_user_question is loaded in this run"
		: "  => NO compiled-in ask_user_question in this run; the check below proves nothing",
);

console.log(
	"\n(a) tool precedence: the same, plus an -e probe Pi extension tool of that name",
);
const probed = await runBackend(true);
describeRun(probed);
const conflict = probed.stderrLines.find((l) => l.includes("conflicts with"));
const reached = !probed.started
	? `nothing: the backend did not start${conflict ? " (tool name conflict, see stderr below)" : ""}`
	: probed.toolResults.some((r) => r.includes(PROBE_MARKER))
		? controlHasCompiledIn
			? "the -e probe Pi extension (precedence holds)"
			: "the -e probe Pi extension, but no compiled-in tool competed, so this proves nothing"
		: probed.dialogRequests.some((r) => r.startsWith("select"))
			? "the compiled-in implementation (the -e one lost)"
			: "neither (the tool was missing)";
console.log(`  model call reached: ${reached}`);
printLines("startup errors on stderr (probed run)", probed.stderrLines);

console.log("\n(b) compiled-in Pi extensions in --mode rpc (control run)");
printLines("non-protocol stdout lines", control.nonProtocolStdout);
printLines("stderr lines", control.stderrLines);

console.log("\n(c) stdin close");
for (const [name, run] of [
	["control", control],
	["probed", probed],
] as const) {
	console.log(
		run.exit
			? `  ${name}: exited ${run.closeMs} ms after stdin closed (code ${run.exit.code}, signal ${run.exit.signal})`
			: `  ${name}: DID NOT EXIT within 10 s of stdin closing (killed)`,
	);
}
