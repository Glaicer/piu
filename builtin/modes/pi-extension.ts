import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
	CONFIG_DIR_NAME,
	type CustomEntry,
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	parseFrontmatter,
} from "@earendil-works/pi-coding-agent";
import { BUILD_MODE, MODE_STATUS_KEY } from "./protocol.ts";

type Thinking = ReturnType<ExtensionAPI["getThinkingLevel"]>;
type Mode = {
	name: string;
	model?: string;
	thinking?: Thinking;
	tools?: string[];
	instructions: string;
};
type Base = { model?: string; thinking: Thinking; tools: string[] };
type State = { active?: { name: string; base: Base } };
type Active = { mode: Mode; base: Base; allowedTools?: readonly string[] };

const TYPE = "mode-state";
const LEVELS: readonly string[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];
const RESERVED = new Set(["build", ":next"]);

function parseMode(path: string): Mode {
	const name = basename(path, ".md");
	if (!name.trim() || /\p{Cc}/u.test(name)) {
		throw new Error("the file name must be a printable mode name");
	}
	if (name !== name.trim()) {
		throw new Error("the file name must not start or end with whitespace");
	}
	if (name.toLowerCase().endsWith(" (current)")) {
		throw new Error(`"${name}" clashes with the picker's current marker`);
	}
	if (RESERVED.has(name.toLowerCase())) {
		throw new Error(`"${name}" is reserved`);
	}
	const { frontmatter: fm, body } = parseFrontmatter(
		readFileSync(path, "utf8"),
	);
	if (
		fm.model !== undefined &&
		(typeof fm.model !== "string" ||
			fm.model.indexOf("/") <= 0 ||
			fm.model.endsWith("/"))
	) {
		throw new Error("model: expected provider/id");
	}
	if (fm.thinking !== undefined && !LEVELS.includes(fm.thinking as string)) {
		throw new Error(`thinking: expected one of ${LEVELS.join(", ")}`);
	}
	if (
		fm.tools !== undefined &&
		!(Array.isArray(fm.tools) && fm.tools.every((t) => typeof t === "string"))
	) {
		throw new Error("tools: expected a list of tool names");
	}
	return {
		name: name === "plan" ? "Plan" : name,
		model: fm.model as string | undefined,
		thinking: fm.thinking as Thinking | undefined,
		tools: fm.tools as string[] | undefined,
		instructions: body,
	};
}

function loadModes(ctx: ExtensionContext) {
	const dirs = [join(getAgentDir(), "modes")];
	if (ctx.isProjectTrusted())
		dirs.push(join(ctx.cwd, CONFIG_DIR_NAME, "modes"));
	const modes = new Map<string, Mode>();
	for (const dir of dirs) {
		let files: string[];
		try {
			files = readdirSync(dir).filter((file) => file.endsWith(".md"));
		} catch {
			continue;
		}
		for (const file of files) {
			try {
				const mode = parseMode(join(dir, file));
				modes.set(mode.name.toLowerCase(), mode);
			} catch (error) {
				ctx.ui.notify(
					`Skipped mode ${join(dir, file)}: ${(error as Error).message}`,
					"warning",
				);
			}
		}
	}
	return new Map(
		[...modes].sort(([, a], [, b]) => a.name.localeCompare(b.name)),
	);
}

function parseState(data: unknown): State {
	if (typeof data !== "object" || data === null) return {};
	const { active } = data as { active?: unknown };
	if (typeof active !== "object" || active === null) return {};
	const { name, base } = active as { name?: unknown; base?: unknown };
	if (typeof name !== "string" || !name) return {};
	if (typeof base !== "object" || base === null) return {};
	const saved = base as {
		model?: unknown;
		thinking?: unknown;
		tools?: unknown;
	};
	if (saved.model !== undefined && typeof saved.model !== "string") return {};
	if (typeof saved.thinking !== "string" || !LEVELS.includes(saved.thinking)) {
		return {};
	}
	if (
		!Array.isArray(saved.tools) ||
		!saved.tools.every((tool) => typeof tool === "string")
	) {
		return {};
	}
	return {
		active: {
			name,
			base: {
				model: saved.model,
				thinking: saved.thinking as Thinking,
				tools: saved.tools,
			},
		},
	};
}

export default function modes(pi: ExtensionAPI) {
	let active: Active | undefined;
	let changing = false;

	function availableNames(modes: Map<string, Mode>) {
		return [BUILD_MODE, ...modes.values().map((mode) => mode.name)];
	}

	function allowedToolsFor(mode: Mode, ctx: ExtensionContext) {
		if (mode.tools === undefined) return undefined;
		const known = new Set(pi.getAllTools().map((tool) => tool.name));
		const unknown = mode.tools.filter((tool) => !known.has(tool));
		if (unknown.length) {
			ctx.ui.notify(
				`Mode ${mode.name}: no such tools: ${unknown.join(", ")}`,
				"warning",
			);
		}
		return [...new Set(mode.tools.filter((tool) => known.has(tool)))];
	}

	function refuseBusy(ctx: ExtensionContext) {
		ctx.ui.notify(
			"Cannot change the agent mode while the agent is working",
			"warning",
		);
	}

	async function setModel(ref: string | undefined, ctx: ExtensionContext) {
		if (
			!ref ||
			(ctx.model && `${ctx.model.provider}/${ctx.model.id}` === ref)
		) {
			return;
		}
		const slash = ref.indexOf("/");
		const model = ctx.modelRegistry.find(
			ref.slice(0, slash),
			ref.slice(slash + 1),
		);
		if (!model) ctx.ui.notify(`Model ${ref} was not found`, "warning");
		else if (!(await pi.setModel(model))) {
			ctx.ui.notify(`No access to model ${ref}`, "warning");
		}
	}

	async function apply(
		mode: Mode | undefined,
		base: Base,
		ctx: ExtensionContext,
	) {
		const allowed = mode && allowedToolsFor(mode, ctx);
		await setModel(mode?.model ?? base.model, ctx);
		pi.setThinkingLevel(mode?.thinking ?? base.thinking);
		// why: the candidate loadout must stay broader than the whitelist so the hook's intersection is always an explicit selectedTools edit; on a no-op edit Pi treats the live loadout as authoritative and a later setActiveTools() from an installed extension can widen the run beyond the whitelist.
		pi.setActiveTools(
			allowed === undefined
				? base.tools
				: pi.getAllTools().map((tool) => tool.name),
		);
		active = mode && { mode, base, allowedTools: allowed };
		ctx.ui.setStatus(MODE_STATUS_KEY, mode?.name ?? BUILD_MODE);
	}

	async function switchTo(
		name: string,
		ctx: ExtensionContext,
		modes: Map<string, Mode>,
	) {
		const current = active?.mode.name ?? BUILD_MODE;
		const key = name.toLowerCase();
		if (key === current.toLowerCase()) return;
		const isBuild = key === BUILD_MODE.toLowerCase();
		const mode = isBuild ? undefined : modes.get(key);
		if (!isBuild && !mode) {
			ctx.ui.notify(
				`Unknown mode ${name}. Available: ${availableNames(modes).join(", ")}`,
				"error",
			);
			return;
		}
		const base = active?.base ?? {
			model: ctx.model && `${ctx.model.provider}/${ctx.model.id}`,
			thinking: pi.getThinkingLevel(),
			tools: pi.getActiveTools(),
		};
		await apply(mode, base, ctx);
		pi.appendEntry<State>(
			TYPE,
			mode ? { active: { name: mode.name, base } } : {},
		);
	}

	pi.registerCommand("mode", {
		description: "Switch the agent mode",
		handler: async (args, ctx) => {
			const modes = loadModes(ctx);
			if (changing) {
				ctx.ui.notify("A mode change is already in progress", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				refuseBusy(ctx);
				return;
			}
			changing = true;
			try {
				const names = availableNames(modes);
				const trimmed = args.trim();
				if (!trimmed) {
					const current =
						names.find((name) => name === active?.mode.name) ?? BUILD_MODE;
					const labels = names.map((name) =>
						name === current ? `${name} (current)` : name,
					);
					const chosen = await ctx.ui.select("Agent mode", labels);
					if (chosen === undefined) return;
					if (!ctx.isIdle()) {
						refuseBusy(ctx);
						return;
					}
					const name = names[labels.indexOf(chosen)];
					if (name) await switchTo(name, ctx, modes);
					return;
				}
				if (trimmed.toLowerCase() === ":next") {
					const at = names.indexOf(active?.mode.name ?? BUILD_MODE);
					const next = names[(at + 1) % names.length] ?? BUILD_MODE;
					await switchTo(next, ctx, modes);
					return;
				}
				await switchTo(trimmed, ctx, modes);
			} finally {
				changing = false;
			}
		},
	});

	pi.on("before_agent_start", (event) => {
		const { sections, selectedTools } = event.systemPromptOptions;
		if (active?.mode.instructions) sections.mode = active.mode.instructions;
		else delete sections.mode;
		const allowed = active?.allowedTools;
		if (allowed === undefined) return;
		const keep = new Set(allowed);
		for (let at = selectedTools.length - 1; at >= 0; at--) {
			const tool = selectedTools[at];
			if (tool === undefined || !keep.has(tool)) selectedTools.splice(at, 1);
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const saved = parseState(
			ctx.sessionManager
				.getBranch()
				.filter(
					(entry): entry is CustomEntry<State> =>
						entry.type === "custom" && entry.customType === TYPE,
				)
				.at(-1)?.data,
		).active;
		active = undefined;
		if (!saved) {
			ctx.ui.setStatus(MODE_STATUS_KEY, BUILD_MODE);
			return;
		}
		const mode = loadModes(ctx).get(saved.name.toLowerCase());
		if (mode) {
			await apply(mode, saved.base, ctx);
			return;
		}
		ctx.ui.notify(
			`Mode ${saved.name} no longer exists; restored its base settings`,
			"warning",
		);
		await apply(undefined, saved.base, ctx);
		pi.appendEntry<State>(TYPE, {});
	});
}
