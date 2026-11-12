import {
	appendFileSync,
	copyFileSync,
	existsSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const spec = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8"));
const args = process.argv.slice(3);
appendFileSync(
	join(spec.dir, "calls.jsonl"),
	`${JSON.stringify({ args, pid: process.pid })}\n`,
);
if (JSON.stringify(args) !== JSON.stringify(spec.expected))
	throw new Error(`Unexpected installer arguments: ${JSON.stringify(args)}`);
if (spec.manager === "bun" && process.env.BUN_INSTALL_GLOBAL_DIR !== spec.root)
	throw new Error("Wrong Bun installation");
if (spec.family === "pi-bolt" && process.env.PIBOLT_VARIANT !== "x64-jit")
	throw new Error("Lost build variant");
console.log("Downloading fixture release: 50%");
while (
	existsSync(spec.dir) &&
	existsSync(join(spec.dir, "hold")) &&
	!existsSync(join(spec.dir, "release"))
)
	await Bun.sleep(20);
if (!existsSync(spec.dir)) process.exit(1);
if (spec.outcome === "failure") {
	console.error("fixture: permission denied");
	process.exit(1);
}
if (spec.outcome === "unchanged") {
	console.log("Please run the installer manually");
	process.exit(0);
}
writeFileSync(
	join(spec.dir, "version-output"),
	spec.outcome === "wrong-family"
		? "9.9.9 (Pi-Bolt 9.9.9, linux-x64, JIT off)\n"
		: spec.outcome === "lower"
			? "1.0.0\n"
			: spec.version,
);
if (spec.rotate) {
	const next = `${spec.file}.next`;
	copyFileSync(spec.file, next);
	const manifestFile = join(dirname(dirname(spec.file)), "package.json");
	const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
	manifest.bin[spec.family] = "dist/cli.js.next";
	writeFileSync(manifestFile, JSON.stringify(manifest));
	const link = `${spec.command}.next`;
	symlinkSync(next, link);
	renameSync(link, spec.command);
	rmSync(spec.file);
}
console.log("Installed fixture release, integrity verified");
