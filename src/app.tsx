import { join } from "node:path";
import { EditBufferRenderable, type MouseEvent } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { createAnimate } from "./animate.ts";
import { startBackend } from "./backend.ts";
import { prepareBackendLease } from "./backend-install.ts";
import { createBackendUpdate } from "./backend-update.ts";
import {
	startUpdateCheck,
	type UpdateCheckOptions,
} from "./backend-updates.ts";
import { changelogModal } from "./changelog.tsx";
import { type Config, loadConfig } from "./config.ts";
import { bridgeDialogs } from "./dialogs.tsx";
import { builtinDir, findExtensions, resolvePlacement } from "./extensions.ts";
import { createPanelFocus } from "./focus.ts";
import { piuHome } from "./home.ts";
import type { InstallLease } from "./install-lock.ts";
import { commandAction, matches } from "./keybindings.ts";
import { SlotView } from "./layout.tsx";
import { lifecycleCommands } from "./lifecycle-commands.ts";
import { createModals, ModalLayer } from "./modal.tsx";
import { createModelFavorites } from "./model-favorites.ts";
import { createModelSelection } from "./model-selection.ts";
import type { Command, CommandContext, PlacedModule } from "./module.ts";
import { createPiState } from "./pi-state.ts";
import { restartArgs } from "./restart.ts";
import { StartupError } from "./startup-error.ts";
import { createTheme } from "./theme.ts";
import { createToasts, ToastLayer } from "./toast.tsx";

export type ExitRequest = { readonly restartArgs?: readonly string[] };
const UPDATE_NOTICE_MS = 12_000;

// why: OpenTUI focuses the nearest focusable ancestor of a clicked element, which would take the keyboard away from the input; only a click on a text field may move the focus.
function keepFocus(event: MouseEvent) {
	for (let node = event.target; node; node = node.parent) {
		if (!node.focusable) continue;
		if (!(node instanceof EditBufferRenderable)) event.preventDefault();
		return;
	}
}

export async function createApp(options: {
	args: string[];
	cwd?: string;
	exit: (request: ExitRequest) => void;
	updateCheck?: UpdateCheckOptions;
	env?: NodeJS.ProcessEnv;
}) {
	const cwd = options.cwd ?? process.cwd();
	const home = piuHome();
	const config = loadConfig(join(home, "config.json"));
	const env = { ...process.env, ...options.env };
	const folders = findExtensions([builtinDir, join(home, "extensions")]);
	const { panels, commands, channelTitles, piExtensions } =
		await resolvePlacement(config, folders);
	for (const { name } of lifecycleCommands) {
		if (commands.some((command) => command.name === name)) {
			throw new StartupError(
				`Command "/${name}" is built into piu and cannot be defined by an Extension`,
			);
		}
	}
	let startupLease: InstallLease | undefined;
	try {
		startupLease = await prepareBackendLease(config.backend, { cwd, env });
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
			updateCheck={options.updateCheck ?? { fetch }}
			env={env}
			home={home}
		/>
	);
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
	updateCheck: UpdateCheckOptions;
	env: NodeJS.ProcessEnv;
	home: string;
	startupLease: InstallLease | undefined;
}) {
	const renderer = useRenderer();
	const theme = createTheme(renderer, props.config.theme);
	const animate = createAnimate(renderer, props.config.animations);
	const toasts = createToasts(renderer.clock);
	onCleanup(toasts.dispose);
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
	const modals = createModals();
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
	bridgeDialogs(pi, modals);
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
	const commandContext: CommandContext = {
		pi: pi.state,
		modelFavorites: createModelFavorites(props.home, (message) =>
			toasts.show(message, "error"),
		),
		actions: {
			...pi.actions,
			restartBackend: () => void retryBackend(),
			openModal: modals.open,
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
	const commands = [...props.commands, ...lifecycleCommands].map((command) => ({
		...command,
		run: (args = "") => command.run(commandContext, args),
	}));
	const context = {
		cwd: props.cwd,
		...commandContext,
		commands,
		keybindings: props.config.keybindings,
		animate,
		focus,
	};
	useKeyboard((event) => {
		if (modals.stack().length > 0) return;
		const action = Object.entries(props.config.keybindings).find(([, chord]) =>
			matches(chord, event),
		)?.[0];
		if (action === "focus.next" || action === "focus.previous") {
			if (focus.held()) return;
			event.preventDefault();
			focus.move(action === "focus.next" ? 1 : -1);
			return;
		}
		const command = commands.find((c) => commandAction(c.name) === action);
		if (command) {
			event.preventDefault();
			command.run();
			return;
		}
		focus.returnToInput(
			event,
			pi.state.working && pi.state.dialogs.length === 0 && !focus.held(),
		);
	});
	return (
		<box
			width="100%"
			height="100%"
			backgroundColor={theme.surface}
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
					border
					backgroundColor={theme.surface}
					borderColor={theme.accent}
					zIndex={201}
				>
					<text fg={theme.text}>{updateProgress()}</text>
				</box>
			</Show>
		</box>
	);
}
