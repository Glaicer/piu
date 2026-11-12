import { selectsSession, selectsSessionWithValue } from "./cli-args.ts";

export const RESTART_EXIT_CODE = 75;
export const HANDOFF_ENV = "PIU_HANDOFF";

// why: the original session choice (`-c`, `--session X`, `--fork X`) would pick another session than the one active at the restart, and Pi refuses `--fork` or `--session-id` next to `--session`; with no session file the Backend is in no-session mode and must stay there.
export function restartArgs(
	args: readonly string[],
	sessionFile: string | null,
) {
	const kept: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (selectsSession.has(arg)) continue;
		if (selectsSessionWithValue.has(arg)) {
			i++;
			continue;
		}
		kept.push(arg);
	}
	return sessionFile ? [...kept, "--session", sessionFile] : kept;
}
