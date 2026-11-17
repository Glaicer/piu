import type { Tool } from "@earendil-works/pi-ai";
import {
	convertToLlm,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	CONTEXT_INJECTIONS_STATUS_KEY,
	CONTEXT_USAGE_COMMAND,
	CONTEXT_USAGE_DESCRIPTION,
	CONTEXT_USAGE_STATUS_KEY,
	type ContextBreakdown,
	type ContextInjections,
	type ContextTab,
	type ContextUsageSnapshot,
	type ContextUsageView,
	contextTotal,
	serializeContextInjections,
	serializeContextUsage,
} from "../../src/context-usage.ts";
import { collectInjections } from "./injections.ts";
import { alignContextBreakdown, estimateContext } from "./usage.ts";

type CapturedRequest = {
	readonly model: string;
	readonly categories: ContextBreakdown;
};

const UNAVAILABLE = "Context window unavailable.";

export default function contextUsage(pi: ExtensionAPI): void {
	let captured: CapturedRequest | undefined;
	let injections: ContextInjections | undefined;
	let hiddenTools: readonly string[] = [];
	let open = 0;
	let tab: ContextTab = "usage";
	let compacting = false;
	let compactSignal: AbortSignal | undefined;
	let compactAbort: (() => void) | undefined;

	const modelId = (ctx: ExtensionContext) =>
		ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;

	const forgetCompaction = () => {
		if (compactSignal && compactAbort)
			compactSignal.removeEventListener("abort", compactAbort);
		compactSignal = undefined;
		compactAbort = undefined;
	};

	function toolDeclarations(): Tool[] {
		const active = new Set(pi.getActiveTools());
		return pi
			.getAllTools()
			.filter(
				(tool) => active.has(tool.name) && !hiddenTools.includes(tool.name),
			)
			.map(({ name, description, parameters }) => ({
				name,
				description,
				parameters,
			}));
	}

	function sessionEstimate(ctx: ExtensionContext): ContextBreakdown {
		const messages = convertToLlm(
			ctx.sessionManager.buildSessionProjection().messages,
		);
		if (messages.some((message) => message.role === "system"))
			return estimateContext(messages);
		const tools = toolDeclarations();
		return estimateContext([
			{
				role: "system",
				content: ctx.getSystemPrompt(),
				...(tools.length > 0 ? { toolsAdded: tools } : {}),
				timestamp: 0,
			},
			...messages,
		]);
	}

	function snapshot(ctx: ExtensionContext): ContextUsageSnapshot | null {
		const model = modelId(ctx);
		const usage = ctx.getContextUsage();
		const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
		if (!model || contextWindow <= 0) return null;
		const recorded = captured?.model === model ? captured : undefined;
		const weights = recorded?.categories ?? sessionEstimate(ctx);
		const reported = usage?.tokens;
		const fromPi = typeof reported === "number" && reported > 0;
		const used = fromPi ? reported : contextTotal(weights);
		return {
			model,
			contextWindow,
			used,
			source: recorded ? "last-request" : "session-estimate",
			totalSource: fromPi ? "pi" : "estimate",
			categories: alignContextBreakdown(weights, used),
		};
	}

	function view(ctx: ExtensionContext): ContextUsageView {
		if (compacting) return { open, tab, kind: "compacting" };
		const current = snapshot(ctx);
		if (!current)
			return { open, tab, kind: "unavailable", reason: UNAVAILABLE };
		return { open, tab, kind: "ready", snapshot: current };
	}

	function trySetStatus(
		ctx: ExtensionContext,
		key: string,
		value: () => string | undefined,
	) {
		// why: a replaced session leaves the captured context stale, and Pi throws on it; the session events end that view anyway.
		try {
			ctx.ui.setStatus(key, value());
		} catch {
			// why: see above.
		}
	}

	function publish(ctx: ExtensionContext) {
		if (open === 0) return;
		trySetStatus(ctx, CONTEXT_USAGE_STATUS_KEY, () =>
			serializeContextUsage(view(ctx)),
		);
	}

	function publishInjections(ctx: ExtensionContext) {
		if (open === 0) return;
		trySetStatus(ctx, CONTEXT_INJECTIONS_STATUS_KEY, () =>
			injections ? serializeContextInjections(injections) : undefined,
		);
	}

	function clearStatuses(ctx: ExtensionContext) {
		trySetStatus(ctx, CONTEXT_USAGE_STATUS_KEY, () => undefined);
		trySetStatus(ctx, CONTEXT_INJECTIONS_STATUS_KEY, () => undefined);
	}

	function reset(_event: unknown, ctx: ExtensionContext) {
		forgetCompaction();
		compacting = false;
		captured = undefined;
		injections = undefined;
		tab = "usage";
		open = 0;
		clearStatuses(ctx);
	}

	async function openContext(
		args: string,
		ctx: ExtensionCommandContext,
	): Promise<void> {
		hiddenTools = ctx.getSystemPromptOptions().hiddenTools ?? [];
		tab = args.trim() === "injections" ? "injections" : "usage";
		open += 1;
		publishInjections(ctx);
		publish(ctx);
	}

	pi.on("session_start", reset);
	pi.on("session_tree", reset);
	pi.on("session_shutdown", reset);

	pi.on("before_agent_start", (event) => {
		hiddenTools = event.systemPromptOptions.hiddenTools ?? [];
	});

	// why: this is the only place that sees the exact transcript of a request, so the categories are taken here and kept as numbers, not as the transcript.
	pi.on("context_with_system", (event, ctx) => {
		const model = modelId(ctx);
		if (model)
			captured = {
				model,
				categories: estimateContext(convertToLlm(event.messages)),
			};
		// why: everything is read synchronously here, because later handlers share and can change these objects, and only strings and numbers are kept.
		injections = {
			items: collectInjections({
				request: event.messages,
				session: ctx.sessionManager.buildSessionProjection().messages,
				effectivePrompt: ctx.getSystemPrompt(),
				hiddenTools,
				tools: pi.getAllTools(),
			}),
		};
		publishInjections(ctx);
		publish(ctx);
	});

	pi.on("turn_end", (_event, ctx) => publish(ctx));
	pi.on("agent_settled", (_event, ctx) => publish(ctx));

	pi.on("model_select", (_event, ctx) => {
		if (captured && captured.model !== modelId(ctx)) captured = undefined;
		publish(ctx);
	});

	pi.on("session_before_compact", (event, ctx) => {
		forgetCompaction();
		compacting = true;
		const signal = event.signal;
		// why: a compaction can abort (Escape, overflow recovery) without a later session event, and an old signal must never update a newer session's view.
		const onAbort = () => {
			if (compactSignal !== signal) return;
			forgetCompaction();
			compacting = false;
			publish(ctx);
		};
		compactSignal = signal;
		compactAbort = onAbort;
		signal.addEventListener("abort", onAbort, { once: true });
		publish(ctx);
	});

	pi.on("session_compact", (_event, ctx) => {
		forgetCompaction();
		compacting = false;
		captured = undefined;
		publish(ctx);
	});

	pi.on("session_compact_failed", (_event, ctx) => {
		forgetCompaction();
		compacting = false;
		publish(ctx);
	});

	pi.registerCommand(CONTEXT_USAGE_COMMAND, {
		description: CONTEXT_USAGE_DESCRIPTION,
		handler: openContext,
	});
}
