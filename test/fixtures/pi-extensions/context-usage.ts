import { existsSync, writeFileSync } from "node:fs";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const oraclePath = () => `${process.env.PIU_FAUX_SCRIPT}.context-oracle.json`;

export default function contextUsageFixture(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event) => {
		if (process.env.PIU_CONTEXT_SKILLS === "1")
			event.systemPromptOptions.sections.skills = "k".repeat(4096);
		// why: Pi applies a before_agent_start `systemPrompt` after `context_with_system`, so only the tool set can be emptied for the snapshot; no tool declarations leave a known zero weight.
		if (process.env.PIU_CONTEXT_MINIMAL === "1")
			event.systemPromptOptions.selectedTools = [];
	});

	// why: a compaction that waits for a file lets the test open `/context` while it is in progress instead of racing a fixed delay.
	pi.on("session_before_compact", async (event) => {
		if (process.env.PIU_CONTEXT_COMPACTION_GATE !== "1") return;
		const script = process.env.PIU_FAUX_SCRIPT ?? "";
		writeFileSync(`${script}.context-compacting`, "");
		while (
			!event.signal.aborted &&
			existsSync(script) &&
			!existsSync(`${script}.context-release`)
		) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	});

	pi.on("message_end", (event) => {
		const total = Number(process.env.PIU_CONTEXT_USAGE_TOTAL ?? "");
		if (!total) return;
		const message = event.message;
		if (message.role !== "assistant" || message.stopReason !== "stop") return;
		message.usage = {
			input: total,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: total,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		};
		return { message };
	});

	// why: the request carries more than the saved session, which is how the test tells our `context_with_system` snapshot apart from a read of the session branch.
	pi.on("context", (event) => {
		if (process.env.PIU_CONTEXT_TRANSIENT !== "1") return;
		const last = event.messages.findLast((message) => message.role === "user");
		if (!last) return;
		const text =
			typeof last.content === "string"
				? last.content
				: last.content
						.map((block) => (block.type === "text" ? block.text : ""))
						.join("");
		last.content = `${text}\nREQUEST_ONLY_${"x".repeat(8192)}`;
	});

	// why: the installed `context` command stands in for a package that registers the same slash name; invoking it would be visible as a notification, so the test can tell which side ran.
	pi.registerCommand("context", {
		description: "Installed context command",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Installed context command invoked", "info");
		},
	});

	pi.registerCommand("context-oracle", {
		description: "Write Pi's own context usage for the test",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			writeFileSync(
				oraclePath(),
				JSON.stringify(ctx.getContextUsage() ?? null),
			);
		},
	});
}
