import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ModuleContext } from "./module.ts";

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const SPINNER_MS = 800;
const SPINNER_FPS = 10;

export function workingSpinner(context: Pick<ModuleContext, "pi" | "animate">) {
	const [spinner, setSpinner] = createSignal("");
	createEffect(() => {
		if (!context.pi.working) return;
		const stop = context.animate({
			from: 0,
			to: SPINNER.length,
			duration: SPINNER_MS,
			loop: true,
			frameRate: SPINNER_FPS,
			onUpdate: (value) =>
				setSpinner(`${SPINNER[Math.floor(value) % SPINNER.length]} `),
		});
		onCleanup(() => {
			stop();
			setSpinner("");
		});
	});
	return spinner;
}
