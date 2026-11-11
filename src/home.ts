import { homedir } from "node:os";
import { join } from "node:path";

export function piuHome() {
	// why: Bun's homedir() reads HOME once at startup, so a later change to process.env.HOME (tests) would be ignored.
	return process.env.PIU_HOME || join(process.env.HOME || homedir(), ".piu");
}
