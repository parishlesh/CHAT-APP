import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_MOODS, ALLOWED_VIBES, RELATIONSHIP_TYPES, CONVERSATION_MODES,
  AVAILABILITY_KEYS, REACTION_KEYS, MEMORY_TYPES, RITUAL_KEYS, includesKey,
} from "../src/lib/catalog.js";

test("catalogs keep mood, vibe, and relationship independent", () => {
  assert.ok(ALLOWED_MOODS.includes("angry"));
  assert.ok(ALLOWED_VIBES.includes("flirty"));
  assert.ok(RELATIONSHIP_TYPES.includes("close-friend"));
  assert.equal(includesKey(CONVERSATION_MODES, "Comfort"), true);
  assert.ok(AVAILABILITY_KEYS.includes("quiet"));
  assert.ok(REACTION_KEYS.includes("feel"));
  assert.ok(MEMORY_TYPES.includes("trip"));
  assert.ok(RITUAL_KEYS.includes("morning"));
  assert.equal(includesKey(ALLOWED_MOODS, "not-a-mood"), false);
});
