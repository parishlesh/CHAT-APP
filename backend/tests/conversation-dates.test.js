import test from "node:test";
import assert from "node:assert/strict";
import { formatConversationDayKey, formatConversationDayLabel } from "../../frontend/src/lib/time.js";

test("conversation day labels use local calendar dates", () => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const older = new Date(now);
  older.setDate(now.getDate() - 10);
  const lastYear = new Date(now);
  lastYear.setFullYear(now.getFullYear() - 1);

  assert.equal(formatConversationDayLabel(now.toISOString()), "TODAY");
  assert.equal(formatConversationDayLabel(yesterday.toISOString()), "YESTERDAY");
  assert.equal(formatConversationDayKey(now.toISOString()), formatConversationDayKey(now));
  assert.notEqual(formatConversationDayKey(now.toISOString()), formatConversationDayKey(yesterday.toISOString()));
  assert.match(formatConversationDayLabel(older.toISOString()), /[A-Za-z]/);
  assert.match(formatConversationDayLabel(lastYear.toISOString()), new RegExp(String(lastYear.getFullYear())));
});
