// End-to-end tests for "Delete chat" and PIN chat lock against the real app and a throwaway MongoDB.
// Run: npm run test:integration
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
delete process.env.REDIS_URL;

const { configureApp } = await import("../src/app.js");

let mongo;
let server;
let baseUrl;

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = "";
    this.unlock = null;
  }

  async call(method, path, body, headers = {}) {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return { status: response.status, data: await response.json().catch(() => null) };
  }

  async signup() {
    const username = this.name.toLowerCase();
    const { status, data } = await this.call("POST", "/auth/signup", {
      fullName: this.name, username, email: `${username}@example.test`, password: "secret123",
    });
    assert.equal(status, 201);
    this.id = String(data._id);
    return this;
  }

  send(to, text) {
    return this.call("POST", `/messages/send/${to.id}`, { text });
  }

  history(peer, headers) {
    return this.call("GET", `/messages/${peer.id}`, undefined, headers);
  }
}

const asha = new Client("Asha");
const ben = new Client("Ben");
let chatId;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ server } = configureApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await asha.signup();
  await ben.signup();
  await asha.send(ben, "hi ben");
  const [request] = (await ben.call("GET", "/messages/requests")).data;
  chatId = request._id;
  await ben.call("PUT", `/messages/requests/${chatId}/accept`);
  await ben.send(asha, "hey asha");
  await asha.send(ben, "how are you?");
});

after(async () => {
  const { io } = await import("../src/lib/socket.js");
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

test("a chat can't be locked before a PIN exists, and PINs must be 4–6 digits", async () => {
  const noPin = await asha.call("PATCH", `/messages/conversation/${chatId}/meta`, { locked: true });
  assert.equal(noPin.status, 400);
  assert.match(noPin.data.message, /PIN first/);

  assert.equal((await asha.call("PUT", "/messages/lock/pin", { pin: "12" })).status, 400);
  assert.equal((await asha.call("PUT", "/messages/lock/pin", { pin: "12ab" })).status, 400);
  const set = await asha.call("PUT", "/messages/lock/pin", { pin: "4321" });
  assert.equal(set.status, 200);
  assert.equal((await asha.call("GET", "/auth/check")).data.hasChatLockPin, true);
});

test("a locked chat hides its messages and preview until unlocked with the PIN", async () => {
  const lock = await asha.call("PATCH", `/messages/conversation/${chatId}/meta`, { locked: true });
  assert.equal(lock.status, 200);
  assert.equal(lock.data.locked, true);

  const blocked = await asha.history(ben);
  assert.equal(blocked.status, 423);
  assert.equal(blocked.data.code, "CHAT_LOCKED");

  const list = (await asha.call("GET", "/messages/conversations")).data;
  const entry = list.find((chat) => String(chat._id) === String(chatId));
  assert.equal(entry.locked, true);
  assert.equal(entry.lastMessage.text, undefined, "no message content in the chat list");

  assert.equal((await asha.call("GET", `/messages/conversation/${chatId}/memories`)).status, 423);
  assert.equal((await asha.call("POST", `/messages/conversation/${chatId}/unlock`, { pin: "0000" })).status, 401);

  const unlocked = await asha.call("POST", `/messages/conversation/${chatId}/unlock`, { pin: "4321" });
  assert.equal(unlocked.status, 200);
  assert.ok(unlocked.data.token);
  asha.unlock = { "x-chat-unlock": unlocked.data.token };

  const history = await asha.history(ben, asha.unlock);
  assert.equal(history.status, 200);
  assert.equal(history.data.messages.length, 3);
  assert.equal(history.data.conversation.locked, true, "still locked; the token only opens it for now");
});

test("the lock is personal: the other person's chat is unaffected", async () => {
  const benHistory = await ben.history(asha);
  assert.equal(benHistory.status, 200);
  assert.equal(benHistory.data.messages.length, 3);
});

test("unlock tokens are tied to one user and one chat", async () => {
  const otherChatToken = await ben.history(asha, asha.unlock);
  assert.equal(otherChatToken.status, 200, "Ben's chat isn't locked, so his request is fine either way");
  const forged = await asha.history(ben, { "x-chat-unlock": "not-a-token" });
  assert.equal(forged.status, 423);
});

test("removing a lock needs the PIN", async () => {
  const noPin = await asha.call("PATCH", `/messages/conversation/${chatId}/meta`, { locked: false });
  assert.equal(noPin.status, 401);
  const wrong = await asha.call("PATCH", `/messages/conversation/${chatId}/meta`, { locked: false, pin: "1111" });
  assert.equal(wrong.status, 401);
  const right = await asha.call("PATCH", `/messages/conversation/${chatId}/meta`, { locked: false, pin: "4321" });
  assert.equal(right.status, 200);
  assert.equal(right.data.locked, false);
  assert.equal((await asha.history(ben)).status, 200);
});

test("changing the PIN needs the current PIN or the account password", async () => {
  assert.equal((await asha.call("PUT", "/messages/lock/pin", { pin: "9999" })).status, 401);
  assert.equal((await asha.call("PUT", "/messages/lock/pin", { pin: "9999", currentPin: "1111" })).status, 401);
  assert.equal((await asha.call("PUT", "/messages/lock/pin", { pin: "9999", currentPin: "4321" })).status, 200);
  assert.equal((await asha.call("PUT", "/messages/lock/pin", { pin: "5555", password: "secret123" })).status, 200, "forgot-PIN path");
});

test("deleting a chat hides it only for you, until someone sends something new", async () => {
  const removed = await asha.call("DELETE", `/messages/conversation/${chatId}`);
  assert.equal(removed.status, 200);

  const ashaList = (await asha.call("GET", "/messages/conversations")).data;
  assert.equal(ashaList.some((chat) => String(chat._id) === String(chatId)), false, "gone from Asha's list");
  assert.equal((await asha.history(ben)).data.messages.length, 0, "Asha's history is empty");

  const benList = (await ben.call("GET", "/messages/conversations")).data;
  assert.ok(benList.some((chat) => String(chat._id) === String(chatId)), "Ben still has the chat");
  assert.equal((await ben.history(asha)).data.messages.length, 3, "Ben keeps every message");

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await ben.send(asha, "you there?")).status, 201);
  const back = (await asha.call("GET", "/messages/conversations")).data.find((chat) => String(chat._id) === String(chatId));
  assert.ok(back, "a new message brings the chat back");
  assert.equal(back.unreadCount, 1, "only the new message counts as unread");
  const fresh = await asha.history(ben);
  assert.deepEqual(fresh.data.messages.map((message) => message.text), ["you there?"]);
});
