import type { JSX } from "@opentui/solid";
import type { Accessor } from "solid-js";
import type { ModalRequest } from "./modal.tsx";
import type { PiActions, PiState } from "./pi-state.ts";
import type { Theme } from "./theme.ts";

export type Presence = "hidden" | "shown" | "exclusive";

export type ModuleSettings = Readonly<Record<string, unknown>>;

export type UiActions = {
	openModal(request: ModalRequest): () => void;
};

export type ModuleContext = {
	readonly pi: PiState;
	readonly actions: PiActions & UiActions;
	readonly theme: Theme;
	readonly settings: ModuleSettings;
	onCleanup(cleanup: () => void): void;
	reportPresence(presence: Accessor<Presence>): void;
};

export type Module = {
	readonly id: string;
	readonly title?: string;
	readonly followsOutput?: boolean;
	render(context: ModuleContext): JSX.Element;
};

export type Extension = { readonly modules: readonly Module[] };

export type PlacedModule = {
	readonly id: string;
	readonly module: Module;
	readonly settings: ModuleSettings;
};
