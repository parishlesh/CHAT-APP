import test from "node:test";
import assert from "node:assert/strict";
import { WALLPAPERS, BUBBLE_STYLES } from "../src/lib/catalog.js";
import Conversation from "../src/models/conversation-model.js";

test("wallpaper and bubble catalogs match the conversation schema", () => {
  assert.deepEqual([...Conversation.schema.path("appearance.wallpaper").enumValues].sort(), [...WALLPAPERS].sort());
  assert.deepEqual([...Conversation.schema.path("appearance.bubbleStyle").enumValues].sort(), [...BUBBLE_STYLES].sort());
});
