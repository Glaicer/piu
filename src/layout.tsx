import { For, onCleanup } from "solid-js";
import type { ModuleContext, PlacedModule } from "./module.ts";

export type Size = number | `${number}%` | "rest";
type Direction = "row" | "column";
type SlotBase = { id: string; direction: Direction; size: Size };
export type Slot =
	| (SlotBase & { kind: "container"; children: readonly Slot[] })
	| (SlotBase & { kind: "panel" });

type SharedContext = Omit<ModuleContext, "onCleanup" | "settings">;

type SlotProps = {
	slot: Slot;
	parentDirection: Direction;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	context: SharedContext;
};

export function SlotView(props: SlotProps) {
	const slot = props.slot;
	const sizing = sizeStyle(slot.size, props.parentDirection);
	if (slot.kind === "container") {
		return (
			<box {...sizing} flexDirection={slot.direction}>
				<For each={slot.children}>
					{(child) => (
						<SlotView
							slot={child}
							parentDirection={slot.direction}
							panels={props.panels}
							context={props.context}
						/>
					)}
				</For>
			</box>
		);
	}
	return (
		<scrollbox
			{...sizing}
			border
			borderColor={props.context.theme.border}
			contentOptions={{ flexDirection: slot.direction }}
		>
			<For each={props.panels.get(slot.id) ?? []}>
				{(placed) => <ModuleView placed={placed} context={props.context} />}
			</For>
		</scrollbox>
	);
}

function ModuleView(props: { placed: PlacedModule; context: SharedContext }) {
	const cleanups: (() => void)[] = [];
	onCleanup(() => {
		for (const cleanup of cleanups) cleanup();
	});
	return props.placed.module.render({
		...props.context,
		settings: props.placed.settings,
		onCleanup: (cleanup) => cleanups.push(cleanup),
	});
}

function sizeStyle(size: Size, parentDirection: Direction) {
	if (size === "rest") return { flexGrow: 1, flexBasis: 0 };
	return parentDirection === "row"
		? { width: size, flexShrink: 0 }
		: { height: size, flexShrink: 0 };
}
