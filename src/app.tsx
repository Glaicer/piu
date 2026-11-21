import { join } from "node:path";
import {
	type ClipboardService,
	EditBufferRenderable,
	type KeyEvent,
	type Renderable,
} from "@opentui/core";
import {
	useKeyboard,
	usePaste,
	useRenderer,
	useTerminalDimensions,
} from "@opentui/solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { createAnimate } from "./animate.ts";
import { startBackend } from "./backend.ts";
import { prepareBackendLease } from "./backend-install.ts";
import { createBackendUpdate } from "./backend-update.ts";
import {
	startUpdateCheck,
	type UpdateCheckOptions,
} from "./backend-updates.ts";
import { paintCard } from "./card.ts";
import { changelogModal } from "./changelog.tsx";
import {
	type Config,
	defaultConfig,
	fieldError,
	loadConfig,
	parseBindingValue,
} from "./config.ts";
import { useCopyOnSelect } from "./copy-on-select.ts";
import { bridgeDialogs } from "./dialogs.tsx";
import {
	type ExtensionInventoryOptions,
	readExtensionInventory,
} from "./extension-inventory.ts";
import { saveExtensions } from "./extension-settings.ts";
import {
	builtinDir,
	extensionActions,
	findExtensions,
	type LoadedKeybindingAction,
	moduleOwner,
	type ResolvedPlacement,
	resolvePlacement,
} from "./extensions.ts";
import { createPanelFocus, keepFocus } from "./focus.ts";
import { piuHome } from "./home.ts";
import type { InstallLease } from "./install-lock.ts";
import { createKeybindingRouter } from "./keybinding-router.ts";
import {
	canonicalAction,
	commandAction,
	type KeybindingAction,
	type Keybindings,
	type ResolvedKeybindings,
	resolveKeybindings,
	type Shortcut,
	sameShortcut,
	shiftEnter,
} from "./keybindings.ts";
import { SlotView } from "./layout.tsx";
import {
	lifecycleCommandAliases,
	lifecycleCommands,
} from "./lifecycle-commands.ts";
import { createModals, ModalLayer } from "./modal.tsx";
import { createModelFavorites } from "./model-favorites.ts";
import { createModelSelection } from "./model-selection.ts";
import type {
	Command,
	CommandContext,
	PlacedModule,
	SettingsTab,
} from "./module.ts";
import { createPiState } from "./pi-state.ts";
import { restartArgs } from "./restart.ts";
import { createSettings } from "./settings.tsx";
import { StartupError } from "./startup-error.ts";
import { terminalActions } from "./terminal-actions.ts";
import { createTheme } from "./theme.ts";
import { createToasts, ToastLayer } from "./toast.tsx";

export type ExitRequest = { readonly restartArgs?: readonly string[] };
const UPDATE_NOTICE_MS = 12_000;

export async function createApp(options: {
	args: string[];
	cwd?: string;
	exit: (request: ExitRequest) => void;
	updateCheck?: UpdateCheckOptions;
	clipboard?: ClipboardService;
	env?: NodeJS.ProcessEnv;
	notice?: (message: string) => void;
	motion?: boolean;
}) {
	const cwd = options.cwd ?? process.cwd();
	const home = piuHome();
	const config = loadConfig(join(home, "config.json"));
	const env = { ...process.env, ...options.env };
	const folders = findExtensions([builtinDir, join(home, "extensions")]);
	const placement = await resolvePlacement(config, folders);
	const { panels, settingsTabs, channelTitles, piExtensions } = placement;
	const commands = placement.commands.map(({ command }) => command);
	for (const name of [
		...lifecycleCommands.map((command) => command.name),
		...lifecycleCommandAliases.keys(),
	]) {
		if (commands.some((command) => command.name === name)) {
			throw new StartupError(
				`Command "/${name}" is built into piu and cannot be defined by an Extension`,
			);
		}
	}
	const keybindings = await prepareKeybindings(config, placement, folders);
	let startupLease: InstallLease | undefined;
	try {
		startupLease = await prepareBackendLease(config.backend, {
			cwd,
			env,
			notice: options.notice,
		});
	} catch (error) {
		throw new StartupError(
			error instanceof Error ? error.message : String(error),
		);
	}
	return () => (
		<App
			config={config}
			startupLease={startupLease}
			cliArgs={options.args}
			args={[...piExtensions.flatMap((path) => ["-e", path]), ...options.args]}
			exit={options.exit}
			channelTitles={channelTitles}
			cwd={cwd}
			panels={panels}
			commands={commands}
			keybindings={keybindings}
			keybindingActions={placement.keybindingActions}
			settingsTabs={settingsTabs}
			extensionInventory={{
				placedExtensions: new Set(
					Object.values(config.placement).flatMap((ids) =>
						ids.map(moduleOwner),
					),
				),
			}}
			motion={options.motion ?? true}
			updateCheck={options.updateCheck ?? { fetch }}
			clipboard={options.clipboard}
			env={env}
			home={home}
		/>
	);
}

const piuKeybindingDescriptions: Readonly<Record<string, string>> = {
	"focus.next": "Focus the next Panel",
	"focus.previous": "Focus the previous Panel",
	"input.newline": "Insert a newline",
	"chat.top": "Jump to the top of the chat",
	"chat.bottom": "Jump to the bottom of the chat",
	"input.external-editor": "Edit the prompt in an external editor",
	"input.paste": "Paste from the clipboard",
	"input.dequeue": "Restore queued messages to the prompt",
	"app.suspend": "Suspend piu",
	"model.next": "Cycle to the next model",
	"model.previous": "Cycle to the previous model",
	"reasoning.cycle": "Cycle the reasoning level",
	"chat.toggle-tools": "Toggle tool output",
	"chat.toggle-thinking": "Toggle thinking blocks",
	"chat.copy": "Copy the selection or last assistant message",
};

async function prepareKeybindings(
	config: Pick<Config, "keybindings" | "extensions">,
	placement: ResolvedPlacement,
	folders: ReadonlyMap<string, string>,
): Promise<ResolvedKeybindings> {
	const definitions = new Map<string, KeybindingAction>();
	const define = (action: KeybindingAction) => {
		if (definitions.has(action.id)) {
			const owner =
				action.source.kind === "extension"
					? `Extension "${action.source.name}"`
					: "piu";
			throw new StartupError(
				`${owner} keybindingActions: action "${action.id}" is already defined`,
			);
		}
		definitions.set(action.id, action);
	};
	for (const { command, extension } of placement.commands) {
		define({
			id: commandAction(command.name),
			description: command.description ?? `/${command.name}`,
			source: { kind: "extension", name: extension },
			defaults: [],
		});
	}
	for (const command of lifecycleCommands) {
		define({
			id: commandAction(command.name),
			description: command.description ?? `/${command.name}`,
			source: { kind: "piu" },
			defaults: [],
		});
	}
	for (const [id, description] of Object.entries(piuKeybindingDescriptions)) {
		define({ id, description, source: { kind: "piu" }, defaults: [] });
	}
	for (const action of placement.keybindingActions) {
		define(action);
	}
	for (const [id, spec] of Object.entries(defaultConfig.keybindings)) {
		const action = definitions.get(id);
		if (!action) continue;
		definitions.set(id, {
			...action,
			defaults: parseBindingValue(spec, id),
		});
	}

	const actions: KeybindingAction[] = [];
	const added = new Set<string>();
	for (const id of Object.keys(defaultConfig.keybindings)) {
		const action = definitions.get(id);
		if (!action) continue;
		actions.push(action);
		added.add(id);
	}
	for (const action of definitions.values()) {
		if (added.has(action.id)) continue;
		actions.push(action);
		added.add(action.id);
	}

	const known = new Set([
		...definitions.keys(),
		...Object.keys(defaultConfig.keybindings),
	]);
	let disabledCommands: Set<string> | undefined;
	for (const id of Object.keys(config.keybindings)) {
		if (known.has(canonicalAction(id))) continue;
		const dot = id.indexOf(".");
		const extension = dot > 0 ? id.slice(0, dot) : "";
		const name = dot > 0 ? id.slice(dot + 1) : "";
		const validName =
			name.length > 0 && !name.includes(".") && !/\s/.test(name);
		if (extension && extension !== "command") {
			if (!folders.has(extension)) {
				throw fieldError(
					`keybindings.${id}`,
					`unknown action, no Extension named "${extension}"`,
				);
			}
			if (validName && !placement.enabledExtensions.has(extension)) continue;
		}
		if (extension === "command" && validName) {
			if (!disabledCommands) {
				disabledCommands = new Set();
				// why: command IDs do not name their owner. Read disabled declarations only when an otherwise unknown binding needs them.
				for (const [name, dir] of folders)
					if (config.extensions[name]?.enabled === false)
						for (const action of await extensionActions(name, dir))
							disabledCommands.add(action);
			}
			if (disabledCommands.has(id)) continue;
		}
		throw fieldError(
			`keybindings.${id}`,
			`unknown action, expected one of: ${[...known].sort().join(", ")}`,
		);
	}
	return resolveKeybindings(actions, config.keybindings);
}

function App(props: {
	config: Config;
	cliArgs: string[];
	args: string[];
	exit: (request: ExitRequest) => void;
	channelTitles: readonly string[];
	cwd: string;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	commands: readonly Command[];
	keybindings: ResolvedKeybindings;
	keybindingActions: readonly LoadedKeybindingAction[];
	settingsTabs: readonly SettingsTab[];
	extensionInventory: Pick<ExtensionInventoryOptions, "placedExtensions">;
	motion: boolean;
	updateCheck: UpdateCheckOptions;
	clipboard: ClipboardService | undefined;
	env: NodeJS.ProcessEnv;
	home: string;
	startupLease: InstallLease | undefined;
}) {
	const renderer = useRenderer();
	const { mode, ...overrides } = props.config.theme;
	const toasts = createToasts(renderer.clock);
	const modals = createModals();
	const catalog = props.keybindings.actions;
	const [keybindings, setKeybindings] = createSignal(props.keybindings);
	const [personal, setPersonal] = createSignal<Keybindings>(
		props.config.keybindings,
	);
	const applyKeybindings = (next: Keybindings) => {
		setPersonal(next);
		setKeybindings(resolveKeybindings(catalog, next));
	};
	const path = join(props.home, "config.json");
	const extensionLocation = {
		path,
		cwd: props.cwd,
		backend: props.config.backend,
		env: props.env,
		folders: () => findExtensions([builtinDir, join(props.home, "extensions")]),
	};
	const settings = createSettings({
		path,
		clock: renderer.clock,
		mode,
		animations: props.config.animations,
		tabs: props.settingsTabs,
		keybindings,
		personal,
		applyKeybindings,
		readExtensions: () => {
			const personalConfig = loadConfig(path);
			return readExtensionInventory({
				...extensionLocation,
				folders: extensionLocation.folders(),
				placedExtensions: props.extensionInventory.placedExtensions,
				disabledExtensions: new Set(
					Object.entries(personalConfig.extensions)
						.filter(([, value]) => value.enabled === false)
						.map(([name]) => name),
				),
			});
		},
		saveExtensions: (edits, committed) =>
			saveExtensions(extensionLocation, edits, committed),
		notify: (message) => toasts.show(message, "error"),
	});
	const theme = createTheme(renderer, overrides, settings.mode);
	const animate = createAnimate(renderer, props.motion);
	const instant = createAnimate(renderer, false);
	onCleanup(toasts.dispose);
	const clipboard = useCopyOnSelect(renderer, props.clipboard, toasts.show);
	let nextLease = props.startupLease;
	let disposed = false;
	const startup = Promise.withResolvers<void>();
	if (!nextLease) startup.resolve();
	const leases = new Set<InstallLease>();
	if (nextLease) leases.add(nextLease);
	const releaseLease = (lease: InstallLease) => {
		lease.close();
		leases.delete(lease);
	};
	onCleanup(() => {
		disposed = true;
		startup.resolve();
		for (const lease of leases) releaseLease(lease);
	});
	const pi = createPiState({
		launch: (extraArgs) => {
			const backend = startBackend(
				props.config.backend,
				[...extraArgs, ...props.args],
				props.cwd,
			);
			const lease = nextLease;
			nextLease = undefined;
			if (lease) {
				const release = () => {
					releaseLease(lease);
					startup.resolve();
				};
				// why: the launcher can change after --version, so protect the actual RPC launch through its first response, not just the preceding probe.
				void backend.request({ type: "get_state" }).then(release, release);
			}
			return backend;
		},
		notify: toasts.show,
		channelTitles: new Set(props.channelTitles),
		selection: createModelSelection(props.home),
		args: [...props.config.backend.args, ...props.cliArgs],
	});
	onCleanup(pi.dispose);
	const updateCheck = props.updateCheck;
	let stopUpdateCheck: (() => void) | undefined;
	onCleanup(() => stopUpdateCheck?.());
	if (updateCheck) {
		// why: a slow Pi-Bolt RPC start can hold the probe lease past its wait; begin the startup check once the first launch has released it.
		void startup.promise.then(() => {
			if (disposed) return;
			stopUpdateCheck = startUpdateCheck(
				{
					config: props.config.backend,
					cwd: props.cwd,
					home: props.home,
					env: props.env,
					fetch: updateCheck.fetch,
				},
				{
					notify: (message) => toasts.show(message, "info", UPDATE_NOTICE_MS),
					showChangelog: (markdown, onSeen) =>
						modals.open(changelogModal(markdown, onSeen)),
				},
			);
		});
	}
	bridgeDialogs(pi, modals, () => renderer.height);
	createEffect(() => {
		if (pi.state.title !== null) renderer.setTerminalTitle(pi.state.title);
	});
	// why: a second command while the first is shutting down would start a second piu or Backend; the Backend and the terminal are released before the process ends, so the next piu never shares either.
	let leaving = false;
	let retrying = false;
	async function retryBackend() {
		if (retrying || leaving || pi.state.backendHealth.status !== "exited")
			return;
		retrying = true;
		try {
			const lease = await prepareBackendLease(props.config.backend, props);
			if (disposed || leaving) {
				lease?.close();
				return;
			}
			if (lease) leases.add(lease);
			nextLease = lease;
			pi.actions.restartBackend();
			if (nextLease) {
				releaseLease(nextLease);
				nextLease = undefined;
			}
		} catch (error) {
			toasts.show(
				error instanceof Error ? error.message : String(error),
				"error",
			);
		} finally {
			retrying = false;
		}
	}
	const [updateProgress, setUpdateProgress] = createSignal<string>();
	const updater = updateCheck
		? createBackendUpdate(
				{
					config: props.config.backend,
					cwd: props.cwd,
					home: props.home,
					env: props.env,
					fetch: updateCheck.fetch,
				},
				{
					progress: setUpdateProgress,
					notify: (message, error) =>
						toasts.show(message, error ? "error" : "info", UPDATE_NOTICE_MS),
					restart: () => void leave(true),
				},
			)
		: undefined;
	onCleanup(() => updater?.dispose());
	async function leave(restart: boolean) {
		if (leaving) return;
		leaving = true;
		updater?.dispose();
		const sessionFile = restart ? await pi.currentSessionFile() : null;
		await pi.dispose();
		renderer.destroy();
		await renderer.closed;
		props.exit(
			restart ? { restartArgs: restartArgs(props.cliArgs, sessionFile) } : {},
		);
	}
	const { editExternally, suspend } = terminalActions(
		renderer,
		props.cwd,
		toasts.show,
	);
	function copyMessage() {
		const current = renderer.currentFocusedRenderable;
		const selected =
			renderer.getSelection()?.getSelectedText() ||
			(current instanceof EditBufferRenderable
				? current.getSelectedText()
				: "");
		if (selected) {
			void clipboard.copy(selected);
			return;
		}
		for (let index = pi.state.messages.length - 1; index >= 0; index--) {
			const message = pi.state.messages[index];
			if (message?.role !== "assistant") continue;
			const text = message.content
				.flatMap((block) => (block.type === "text" ? [block.text] : []))
				.join("\n");
			if (!text.trim()) continue;
			void clipboard.copy(text);
			return;
		}
	}
	const commandContext: CommandContext = {
		pi: pi.state,
		modelFavorites: createModelFavorites(props.home, (message) =>
			toasts.show(message, "error"),
		),
		actions: {
			...pi.actions,
			editExternally,
			readClipboard: clipboard.read,
			restartBackend: () => void retryBackend(),
			openModal: modals.open,
			openSettings: (tab) => settings.open(commandContext, tab),
			showToast: toasts.show,
			quit: () => void leave(false),
			restart: () => void leave(true),
			updateBackend: updater
				? updater.run
				: () => toasts.show("Release checks are switched off", "error"),
		},
		theme,
	};
	const focus = createPanelFocus();
	const [tools, setTools] = createSignal<boolean>();
	const [thinking, setThinking] = createSignal<boolean>();
	const globalActions: Readonly<Record<string, () => void>> = {
		"app.suspend": suspend,
		"model.next": () => void pi.actions.cycleModel(1),
		"model.previous": () => void pi.actions.cycleModel(-1),
		"reasoning.cycle": () => void pi.actions.cycleThinking(),
		"chat.toggle-tools": () => setTools((open) => !open),
		"chat.toggle-thinking": () => setThinking((open) => !open),
		"chat.copy": copyMessage,
	};
	const commands = [...props.commands, ...lifecycleCommands].map((command) => ({
		...command,
		run: (args = "") => command.run(commandContext, args),
	}));
	const commandById = new Map(
		commands.map((command) => [commandAction(command.name), command] as const),
	);
	const actionById = new Map(
		props.keybindingActions.map((action) => [action.id, action] as const),
	);
	const focusedActions = new Set<{
		id: string;
		target: () => Renderable | undefined;
		run: () => void;
	}>();
	const currentFocused = () => {
		const current = renderer.currentFocusedRenderable;
		return current !== null && !current.isDestroyed ? current : undefined;
	};
	const focusedAction = (id: string) => {
		const current = currentFocused();
		if (!current) return undefined;
		for (const entry of focusedActions) {
			if (entry.id === id && entry.target() === current) return entry;
		}
		return undefined;
	};
	const runKeybinding = (
		action: string,
		shortcut: Shortcut,
		event: KeyEvent,
	) => {
		// why: the textarea's own Shift+Enter must keep inserting a newline even when input.newline also lists it.
		if (
			shortcut.length === 1 &&
			sameShortcut(shortcut, [shiftEnter] as const)
		) {
			return false;
		}
		if (action === "focus.next" || action === "focus.previous") {
			if (focus.held()) return false;
			focus.move(action === "focus.next" ? 1 : -1);
			return true;
		}
		if (action === "chat.top" || action === "chat.bottom") {
			if (!focus.jumpChat(action === "chat.bottom")) return false;
			return true;
		}
		const global = globalActions[action];
		if (global) {
			global();
			return true;
		}
		const command = commandById.get(action);
		if (command) {
			command.run();
			return true;
		}
		const declared = actionById.get(action);
		if (declared) {
			declared.run(commandContext);
			return true;
		}
		let focused = focusedAction(action);
		if (!focused && action === "input.newline" && shortcut.length === 1) {
			focus.returnToInput(event, false);
			focused = focusedAction(action);
		}
		if (!focused) return false;
		focused.run();
		return true;
	};
	const canUseSequence = (action: string) => {
		if (action === "focus.next" || action === "focus.previous") {
			return !focus.held();
		}
		if (
			action === "input.newline" ||
			[...focusedActions].some((entry) => entry.id === action)
		) {
			return focusedAction(action) !== undefined;
		}
		return true;
	};
	const router = createKeybindingRouter({
		clock: renderer.clock,
		bindings: () => keybindings().effective,
		enabled: () => modals.stack().length === 0,
		canUseSequence,
		run: runKeybinding,
		fallback: (event) =>
			focus.returnToInput(
				event,
				pi.state.working && pi.state.dialogs.length === 0 && !focus.held(),
			),
		replay: (event) => renderer.keyInput.processParsedKey(event),
	});
	useKeyboard(router.onKey);
	usePaste(() => router.flush());
	createEffect(() => {
		if (modals.stack().length > 0) router.cancel();
	});
	onCleanup(router.cancel);
	const context = {
		cwd: props.cwd,
		...commandContext,
		chatDisplay: { tools, thinking },
		pageChat: focus.pageChat,
		commands,
		keybindings,
		registerFocusedAction: (
			id: string,
			target: () => Renderable | undefined,
			run: () => void,
		) => {
			const entry = { id, target, run };
			focusedActions.add(entry);
			return () => {
				focusedActions.delete(entry);
			};
		},
		animate,
		animateReveal: (options: Parameters<typeof animate>[0]) =>
			(settings.animations() ? animate : instant)(options),
		focus,
		terminal: useTerminalDimensions(),
	};
	return (
		<box
			width="100%"
			height="100%"
			backgroundColor={theme.background}
			onMouseDown={keepFocus}
		>
			<SlotView
				slot={props.config.layout}
				parentDirection="column"
				panels={props.panels}
				context={context}
			/>
			<ModalLayer modals={modals} context={context} />
			<ToastLayer toasts={toasts} theme={theme} />
			<Show when={updateProgress()}>
				<box
					position="absolute"
					right={2}
					bottom={2}
					width={60}
					padding={1}
					paddingX={2}
					renderBefore={paintCard(() => ({
						fill: theme.raised,
						edge: theme.accent,
					}))}
					zIndex={201}
				>
					<text fg={theme.text}>{updateProgress()}</text>
				</box>
			</Show>
		</box>
	);
}
