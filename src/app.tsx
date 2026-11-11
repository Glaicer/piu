import { EditBufferRenderable, type MouseEvent } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { createEffect, onCleanup } from "solid-js";
import { createAnimate } from "./animate.ts";
import { startBackend } from "./backend.ts";
import { type Config, loadConfig } from "./config.ts";
import { bridgeDialogs } from "./dialogs.tsx";
import { builtinDir, findExtensions, resolvePlacement } from "./extensions.ts";
import { createPanelFocus } from "./focus.ts";
import { commandAction, matches } from "./keybindings.ts";
import { SlotView } from "./layout.tsx";
import { createModals, ModalLayer } from "./modal.tsx";
import type { Command, CommandContext, PlacedModule } from "./module.ts";
import { createPiState } from "./pi-state.ts";
import { createTheme } from "./theme.ts";
import { createToasts, ToastLayer } from "./toast.tsx";

// why: OpenTUI focuses the nearest focusable ancestor of a clicked element, which would take the keyboard away from the input; only a click on a text field may move the focus.
function keepFocus(event: MouseEvent) {
	for (let node = event.target; node; node = node.parent) {
		if (!node.focusable) continue;
		if (!(node instanceof EditBufferRenderable)) event.preventDefault();
		return;
	}
}

export async function createApp(options: {
	configPath: string;
	extensionsDir: string;
	args: string[];
	cwd?: string;
}) {
	const cwd = options.cwd ?? process.cwd();
	const config = loadConfig(options.configPath);
	const folders = findExtensions([builtinDir, options.extensionsDir]);
	const { panels, commands, channelTitles, piExtensions } =
		await resolvePlacement(config, folders);
	return () => (
		<App
			config={config}
			args={[...piExtensions.flatMap((path) => ["-e", path]), ...options.args]}
			channelTitles={channelTitles}
			cwd={cwd}
			panels={panels}
			commands={commands}
		/>
	);
}

function App(props: {
	config: Config;
	args: string[];
	channelTitles: readonly string[];
	cwd: string;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	commands: readonly Command[];
}) {
	const renderer = useRenderer();
	const theme = createTheme(renderer, props.config.theme);
	const animate = createAnimate(renderer, props.config.animations);
	const toasts = createToasts(animate, renderer.clock);
	onCleanup(toasts.dispose);
	const pi = createPiState(
		(extraArgs) =>
			startBackend(
				props.config.backend,
				[...extraArgs, ...props.args],
				props.cwd,
			),
		toasts.show,
		new Set(props.channelTitles),
	);
	onCleanup(pi.dispose);
	const modals = createModals(animate);
	bridgeDialogs(pi, modals);
	createEffect(() => {
		if (pi.state.title !== null) renderer.setTerminalTitle(pi.state.title);
	});
	const commandContext: CommandContext = {
		pi: pi.state,
		actions: { ...pi.actions, openModal: modals.open, showToast: toasts.show },
		theme,
	};
	const focus = createPanelFocus();
	const commands = props.commands.map((command) => ({
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
		if (modals.active().length > 0) return;
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
		</box>
	);
}
