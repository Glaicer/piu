export type ModelKey = {
	readonly provider: string;
	readonly id: string;
};

export function sameModel(
	left: ModelKey | null | undefined,
	right: ModelKey | null | undefined,
) {
	return (
		!!left &&
		!!right &&
		left.provider === right.provider &&
		left.id === right.id
	);
}
