export type Trigger = {
	readonly kind: "slash" | "file";
	readonly query: string;
};

export type Entry = {
	readonly label: string;
	readonly detail?: string;
	readonly insert: string;
};

export function findTrigger(before: string): Trigger | undefined {
	if (before.startsWith("/") && !/\s/.test(before)) {
		return { kind: "slash", query: before.slice(1) };
	}
	const file = /(?:^|\s)@(\S*)$/.exec(before);
	if (file?.[1] !== undefined) return { kind: "file", query: file[1] };
}

export function narrow<T>(
	items: readonly T[],
	query: string,
	name: (item: T) => string,
): T[] {
	const needle = query.toLowerCase();
	const rank = (item: T) => {
		const lower = name(item).toLowerCase();
		if (lower === needle) return 0;
		if (lower.startsWith(needle)) return 1;
		return lower.includes(needle) ? 2 : -1;
	};
	return items
		.filter((item) => rank(item) >= 0)
		.sort((a, b) => rank(a) - rank(b));
}
