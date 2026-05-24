// used as entity ids in db — globally unique so independent devices can mint
// IDs without collisions (op-log / sync prerequisite). Mixed-format with
// legacy `${ts}-${rand}` rows is fine; nothing parses the ID format.
export function generateId(): string {
	return crypto.randomUUID();
}
