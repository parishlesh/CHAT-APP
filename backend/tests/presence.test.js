import test from "node:test";
import assert from "node:assert/strict";
import { addUserSocket, getOnlineUserIds, getReceiverSocketId, getSocketIds, removeUserSocket, resetPresenceForTests } from "../src/lib/presence.js";

test("keeps a user online until every tab disconnects", async () => {
  await resetPresenceForTests();
  await addUserSocket("user1", "s1");
  await addUserSocket("user1", "s2");
  assert.deepEqual((await getSocketIds("user1")).sort(), ["s1", "s2"]);
  assert.equal((await removeUserSocket("user1", "s1")).wentOffline, false);
  assert.deepEqual(await getOnlineUserIds(), ["user1"]);
  assert.equal((await removeUserSocket("user1", "s2")).wentOffline, true);
  assert.equal(await getReceiverSocketId("user1"), undefined);
});
