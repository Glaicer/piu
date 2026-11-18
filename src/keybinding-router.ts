import type { Clock, KeyEvent } from "@opentui/core";
import { matches, type Shortcut } from "./keybindings.ts";

export const sequenceTimeoutMs = 1_000;

type Candidate = {
	readonly action: string;
	readonly shortcut: Shortcut;
};

type Pending = {
	readonly first: KeyEvent;
	readonly candidates: readonly Candidate[];
	readonly deadline: number;
	readonly timer: ReturnType<Clock["setTimeout"]>;
};

export function createKeybindingRouter(options: {
	clock: Clock;
	bindings: () => Readonly<Record<string, readonly Shortcut[]>>;
	enabled: () => boolean;
	canUseSequence: (action: string) => boolean;
	run: (action: string, shortcut: Shortcut, event: KeyEvent) => boolean;
	fallback: (event: KeyEvent) => void;
	replay: (event: KeyEvent) => void;
}) {
	let pending: Pending | undefined;
	let replaying = false;

	const consume = (event: KeyEvent) => {
		event.preventDefault();
		event.stopPropagation();
	};
	const replay = (event: KeyEvent) => {
		replaying = true;
		try {
			options.replay(event);
		} finally {
			replaying = false;
		}
	};
	const clear = () => {
		const current = pending;
		pending = undefined;
		if (current) options.clock.clearTimeout(current.timer);
		return current;
	};
	const singleFor = (event: KeyEvent) => {
		for (const [action, shortcuts] of Object.entries(options.bindings())) {
			for (const shortcut of shortcuts) {
				if (shortcut.length === 1 && matches(shortcut[0], event)) {
					return { action, shortcut };
				}
			}
		}
		return undefined;
	};
	const runAction = (action: string, shortcut: Shortcut, event: KeyEvent) => {
		try {
			return options.run(action, shortcut, event);
		} catch (error) {
			// why: a handler that throws must not let a captured stroke reach the focused text field, where Enter would submit the draft.
			consume(event);
			throw error;
		}
	};
	const candidatesFor = (event: KeyEvent) =>
		Object.entries(options.bindings()).flatMap(([action, shortcuts]) =>
			shortcuts.flatMap((shortcut) =>
				shortcut.length === 2 &&
				matches(shortcut[0], event) &&
				options.canUseSequence(action)
					? [{ action, shortcut }]
					: [],
			),
		);
	const replayKey = (event: KeyEvent) => {
		if (!options.enabled()) return;
		const single = singleFor(event);
		if (single && runAction(single.action, single.shortcut, event)) {
			consume(event);
			return;
		}
		options.fallback(event);
	};

	function onKey(event: KeyEvent) {
		if (replaying) {
			replayKey(event);
			return;
		}
		if (pending) {
			const current = pending;
			if (options.clock.now() >= current.deadline) {
				clear();
				replay(current.first);
				onKey(event);
				return;
			}
			if (
				event.name === "escape" &&
				!event.ctrl &&
				!event.shift &&
				!event.meta &&
				!event.option
			) {
				clear();
				consume(event);
				return;
			}
			const second = current.candidates.find(
				(candidate) =>
					candidate.shortcut.length === 2 &&
					matches(candidate.shortcut[1], event) &&
					options.canUseSequence(candidate.action),
			);
			clear();
			if (second && runAction(second.action, second.shortcut, event)) {
				consume(event);
				return;
			}
			consume(event);
			replay(current.first);
			replay(event);
			return;
		}
		if (!options.enabled()) return;
		const single = singleFor(event);
		if (single) {
			if (runAction(single.action, single.shortcut, event)) {
				consume(event);
			} else {
				options.fallback(event);
			}
			return;
		}
		const candidates = candidatesFor(event);
		if (candidates.length > 0) {
			const timer = options.clock.setTimeout(() => {
				if (pending?.timer !== timer) return;
				if (!options.enabled()) {
					clear();
					return;
				}
				const first = pending.first;
				clear();
				replay(first);
			}, sequenceTimeoutMs);
			pending = {
				first: event,
				candidates,
				deadline: options.clock.now() + sequenceTimeoutMs,
				timer,
			};
			consume(event);
			return;
		}
		options.fallback(event);
	}

	return {
		onKey,
		cancel() {
			clear();
		},
		flush() {
			const current = clear();
			if (current && options.enabled()) replay(current.first);
		},
	};
}
