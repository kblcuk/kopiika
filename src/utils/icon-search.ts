function normalizeSearchValue(value: string): string {
	return value.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getSubsequencePenalty(haystack: string, needle: string): number {
	let previousIndex = -1;
	let penalty = 0;

	for (const char of needle) {
		const currentIndex = haystack.indexOf(char, previousIndex + 1);
		if (currentIndex === -1) {
			return -1;
		}

		penalty += currentIndex - previousIndex - 1;
		previousIndex = currentIndex;
	}

	return penalty;
}

function getIconMatchScore(icon: string, query: string): number {
	const normalizedIcon = normalizeSearchValue(icon);
	const normalizedQuery = normalizeSearchValue(query);

	if (!normalizedQuery) return 0;
	if (normalizedIcon === normalizedQuery) return 1000;

	const iconWords = normalizedIcon.split(' ');
	if (iconWords.includes(normalizedQuery)) return 900;
	if (iconWords.some((word) => word.startsWith(normalizedQuery))) return 800;
	if (normalizedIcon.startsWith(normalizedQuery)) return 700;

	const containsIndex = normalizedIcon.indexOf(normalizedQuery);
	if (containsIndex !== -1) return 600 - containsIndex;

	const compactIcon = normalizedIcon.replace(/ /g, '');
	const compactQuery = normalizedQuery.replace(/ /g, '');
	const compactContainsIndex = compactIcon.indexOf(compactQuery);

	if (compactContainsIndex !== -1) {
		return 500 - compactContainsIndex;
	}

	const subsequencePenalty = getSubsequencePenalty(compactIcon, compactQuery);
	return subsequencePenalty === -1 ? -1 : 250 - subsequencePenalty;
}

export function searchIcons(icons: readonly string[], query: string): string[] {
	const normalizedQuery = normalizeSearchValue(query);

	if (!normalizedQuery) {
		return [...icons];
	}

	return icons
		.map((icon, index) => ({
			icon,
			index,
			score: getIconMatchScore(icon, normalizedQuery),
		}))
		.filter((entry) => entry.score >= 0)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map((entry) => entry.icon);
}
