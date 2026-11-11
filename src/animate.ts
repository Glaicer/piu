import {
	type CliRenderer,
	createTimeline,
	type EasingFunctions,
	getTimelineEngine,
} from "@opentui/core";

export type AnimateOptions = {
	from: number;
	to: number;
	duration: number;
	ease?: EasingFunctions;
	loop?: boolean;
	frameRate?: number;
	onUpdate(value: number): void;
	onComplete?(): void;
};

export type Animate = (options: AnimateOptions) => () => void;

const idle = () => {};

export function createAnimate(
	renderer: CliRenderer,
	enabled: boolean,
): Animate {
	return (options) => {
		if (!enabled) {
			if (options.loop) return idle;
			options.onUpdate(options.to);
			options.onComplete?.();
			return idle;
		}
		const target = { value: options.from };
		const engine = getTimelineEngine(renderer);
		const timeline = createTimeline(
			{
				duration: options.duration,
				loop: options.loop,
				frameRate: options.frameRate,
				autoplay: false,
				onComplete: () => {
					engine.unregister(timeline);
					options.onComplete?.();
				},
			},
			renderer,
		);
		timeline.add(target, {
			value: options.to,
			duration: options.duration,
			ease: options.ease ?? "linear",
			onUpdate: () => options.onUpdate(target.value),
		});
		timeline.play();
		return () => {
			timeline.pause();
			engine.unregister(timeline);
		};
	};
}
