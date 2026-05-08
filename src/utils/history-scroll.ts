export interface InitialScrollSection {
	isUpcoming?: boolean;
	isUnconfirmed?: boolean;
}

// Returns the section index the History list should land on when first
// rendered (or after a user-initiated filter/period/search change).
//
// Rule: if the first section is "Upcoming" and there is anything below it,
// scroll past it so the user lands on the actionable / current content.
// Otherwise, default to the top.
export function pickInitialScrollSectionIndex(sections: InitialScrollSection[]): number {
	if (sections.length <= 1) return 0;
	return sections[0].isUpcoming ? 1 : 0;
}
