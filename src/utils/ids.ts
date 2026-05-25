import * as Crypto from 'expo-crypto';

// used as entity ids in db — globally unique so independent devices can mint
// IDs without collisions (op-log / sync prerequisite). Mixed-format with
// legacy `${ts}-${rand}` rows is fine; nothing parses the ID format.
//
// Why expo-crypto and not `crypto.randomUUID()`: RN 0.83 / Hermes 0.14 do
// not expose a `crypto` global — `setUpDefaultReactNativeEnvironment` never
// polyfills Web Crypto. The call works in Jest (Node) but throws on device.
export function generateId(): string {
	return Crypto.randomUUID();
}
