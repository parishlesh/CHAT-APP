// End-to-end test of message ticks: ✓ sent → ✓✓ delivered → blue ✓✓ seen, over real Socket.IO.
// Run: npm run test:integration
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as connectSocket } from "socket.io-client";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
delete process.env.REDIS_URL;

const { configureApp } = await import("../src/app.js");
const { default: Message } = await import("../src/models/message-model.js");

let mongo;
let server;
let baseUrl;
const sockets = [];

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = "";
    this.events = [];
  }

  async call(method, path, body) {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return { status: response.status, data: await response.json().catch(() => null) };
  }

  async signup() {
    const username = this.name.toLowerCase();
    const { data } = await this.call("POST", "/auth/signup", { fullName: this.name, username, email: `${username}@example.test`, password: "secret123" });
    this.id = String(data._id);
    return this;
  }

  async connect({ autoAck = false } = {}) {
    const socket = connectSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: this.cookie }, reconnection: false });
    sockets.push(socket);
    socket.onAny((event, payload) => {
      this.events.push({ event, payload });
      // Behave like the real app: acknowledge every incoming message.
      if (autoAck && event === "newMessage" && String(payload.senderId) !== this.id) {
        socket.emit("messagesDelivered", { messageIds: [String(payload._id)] });
      }
    });
    await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    this.socket = socket;
    return this;
  }

  send(to, text) {
    return this.call("POST", `/messages/send/${to.id}`, { text });
  }

  async waitFor(event, predicate = () => true, timeout = 2000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const hit = this.events.find((item) => item.event === event && predicate(item.payload));
      if (hit) return hit.payload;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${this.name} never received "${event}"`);
  }
}

const asha = new Client("Asha");
const ben = new Client("Ben");
const cara = new Client("Cara");
const state = async (id) => Message.findById(id).select("delivered seen").lean();

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ server } = configureApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await asha.signup();
  await ben.signup();
  await cara.signup();
  await asha.send(ben, "hi");
  const [request] = (await ben.call("GET", "/messages/requests")).data;
  await ben.call("PUT", `/messages/requests/${request._id}/accept`);
  await asha.connect();
});

after(async () => {
  sockets.forEach((socket) => socket.disconnect());
  const { io } = await import("../src/lib/socket.js");
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

let offlineMessage;

test("a message to someone who's offline stays at one tick (sent)", async () => {
  const { status, data } = await asha.send(ben, "are you there?");
  assert.equal(status, 201);
  offlineMessage = data;
  assert.equal(data.delivered, false);
  assert.deepEqual(await state(data._id), { _id: (await state(data._id))._id, delivered: false, seen: false });
});

test("when they come online it turns into two grey ticks (delivered)", async () => {
  await ben.connect({ autoAck: true });
  const receipt = await asha.waitFor("messagesDelivered", (payload) => payload.messageIds.includes(String(offlineMessage._id)));
  assert.ok(receipt.deliveredAt);
  const stored = await state(offlineMessage._id);
  assert.equal(stored.delivered, true);
  assert.equal(stored.seen, false, "delivered isn't seen");
});

test("live messages are delivered as soon as their app receives them", async () => {
  const { data } = await asha.send(ben, "live one");
  await asha.waitFor("messagesDelivered", (payload) => payload.messageIds.includes(String(data._id)));
  assert.equal((await state(data._id)).delivered, true);
});

test("opening the chat turns everything blue (seen)", async () => {
  await ben.call("GET", `/messages/${asha.id}`);
  const seen = await asha.waitFor("messagesSeen", (payload) => payload.messageIds.includes(String(offlineMessage._id)));
  assert.ok(seen.messageIds.length >= 2);
  const stored = await state(offlineMessage._id);
  assert.equal(stored.seen, true);
  assert.equal(stored.delivered, true, "seen implies delivered");
});

test("you can't mark your own or other people's messages as delivered", async () => {
  const { data: toCara } = await asha.send(cara, "hello cara");
  ben.socket.emit("messagesDelivered", { messageIds: [String(toCara._id)] });
  asha.socket.emit("messagesDelivered", { messageIds: [String(toCara._id)] });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await state(toCara._id)).delivered, false);
});
