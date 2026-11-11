import { createSignal } from "solid-js";
import type { CommandContext, Presence } from "../src/module.ts";

const [note, setNote] = createSignal<Presence>("hidden");
const [takeover, setTakeover] = createSignal<Presence>("hidden");
const [follower, setFollower] = createSignal<Presence>("hidden");

export const hooks = {
	loaded: [] as string[],
	probe: {} as { actions?: CommandContext["actions"] },
	note,
	setNote,
	takeover,
	setTakeover,
	follower,
	setFollower,
};

// why: the harness copies a fixture Extension into a temp PIU_HOME, where a relative import of a test file no longer resolves, so fixtures reach the test through this global.
declare global {
	var piuTestHooks: typeof hooks;
}
globalThis.piuTestHooks = hooks;
