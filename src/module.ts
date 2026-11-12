import type { KeyEvent } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import type { Accessor } from "solid-js";
import type { Animate } from "./animate.ts";
import type { Channel } from "./channel.ts";
import type { Keybindings } from "./keybindings.ts";
import type { ModalRequest } from "./modal.tsx";
import type { PiActions, PiState } from "./pi-state.ts";
import type { Theme } from "./theme.ts";
import type { ToastKind } from "./toast.tsx";

export type Presence = "hidden" | "shown" | "exclusive";

export type ModuleSettings = Readonly<Record<string, unknown>>;

export type UiActions = {
	openModal(request: ModalRequest): () => void;
	showToast(message: string, kind?: ToastKind): void;
	quit(): void;
	restart(): void;
	updateBackend(): void;
};

export type CommandContext = {
	readonly pi: PiState;
	readonly actions: PiActions & UiActions;
	readonly theme: Theme;
};

export type Command = {
	readonly name: string;
	readonly description?: string;
	run(context: CommandContext, args: string): void;
};

export type BoundCommand = Omit<Command, "run"> & { run(args?: string): void };

export type ModuleContext = {
	readonly cwd: string;
	readonly commands: readonly BoundCommand[];
	readonly pi: PiState;
	readonly actions: PiActions & UiActions;
	readonly theme: Theme;
	readonly settings: ModuleSettings;
	readonly channel: Channel;
	readonly keybindings: Keybindings;
	readonly animate: Animate;
	onCleanup(cleanup: () => void): void;
	onKey(handler: (event: KeyEvent) => void): void;
	holdFocusKeys(active: Accessor<boolean>): void;
	reportPresence(presence: Accessor<Presence>): void;
};

export type Module = {
	readonly id: string;
	readonly title?: string;
	readonly followsOutput?: boolean;
	render(context: ModuleContext): JSX.Element;
};

export type Extension = {
	readonly modules: readonly Module[];
	readonly commands?: readonly Command[];
	readonly channels?: readonly string[];
};

export type PlacedModule = {
	readonly id: string;
	readonly module: Module;
	readonly settings: ModuleSettings;
};
