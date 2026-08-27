import test from "node:test";
import assert from "node:assert/strict";
import { addUserSocket, getOnlineUserIds, getReceiverSocketId, getSocketIds, removeUserSocket, resetPresenceForTests } from "../src/lib/presence.js";

test("keeps a user online until every tab disconnects", () => {
  resetPresenceForTests();
  addUserSocket("user1", "s1");
  addUserSocket("user1", "s2");
  assert.deepEqual(getSocketIds("user1").sort(), ["s1", "s2"]);
  assert.equal(removeUserSocket("user1", "s1").wentOffline, false);
  assert.deepEqual(getOnlineUserIds(), ["user1"]);
  assert.equal(removeUserSocket("user1", "s2").wentOffline, true);
  assert.equal(getReceiverSocketId("user1"), undefined);
});
