import { dlopen } from "bun:ffi";

// why: Bun.Terminal starts a child in the runner's session with no controlling terminal, so a runner that dies (timeout, Ctrl+C, kill) hangs nobody up and piu waits forever. A session of its own whose controlling terminal is the pty gets SIGHUP when the pty closes, as under a real terminal. Neither Bun nor Node can call setsid or TIOCSCTTY, and macOS has no setsid command, so libc is called directly; bin/piu.ts then runs in this same process, so the test's pid is still the launcher's.
const darwin = process.platform === "darwin";
const libc = dlopen(darwin ? "/usr/lib/libSystem.B.dylib" : "libc.so.6", {
	setsid: { args: [], returns: "i32" },
	ioctl: { args: ["i32", "u64", "i32"], returns: "i32" },
});
const TIOCSCTTY = darwin ? 0x20007461 : 0x540e;

if (libc.symbols.setsid() < 0) throw new Error("setsid failed");
if (libc.symbols.ioctl(0, TIOCSCTTY, 0) < 0) {
	throw new Error("cannot make the pseudo-terminal the controlling terminal");
}
await import("../bin/piu.ts");
