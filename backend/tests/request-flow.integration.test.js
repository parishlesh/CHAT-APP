// End-to-end test of the conversation request flow: real Express app, real Socket.IO,
// a throwaway MongoDB (mongodb-memory-server), and real HTTP calls with auth cookies.
//
// Run: npm run test:integration
// If the MongoDB download is blocked on your network, point MONGOMS_SYSTEM_BINARY at a local mongod.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as connectSocket } from "socket.io-client";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
delete process.env.REDIS_URL;

const { configureApp } = await import("../src/app.js");
const { default: Conversation } = await import("../src/models/conversation-model.js");
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
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  }

  async signup() {
    const username = this.name.toLowerCase();
    const { status, data } = await this.call("POST", "/auth/signup", {
      fullName: this.name, username, email: `${username}@example.test`, password: "secret123",
    });
    assert.equal(status, 201, `signup ${this.name}`);
    this.id = String(data._id);
    return this;
  }

  async connect() {
    const socket = connectSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: this.cookie }, reconnection: false });
    sockets.push(socket);
    socket.onAny((event, payload) => this.events.push({ event, payload, at: Date.now() }));
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    this.socket = socket;
    return this;
  }

  send(to, text, extra = {}) {
    return this.call("POST", `/messages/send/${to.id}`, { text, ...extra });
  }

  mark() {
    return this.events.length;
  }

  // Wait for an event that arrived after `since` (an index from mark()).
  async waitFor(event, predicate = () => true, { since = 0, timeout = 2000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const hit = this.events.slice(since).find((item) => item.event === event && predicate(item.payload));
      if (hit) return hit.payload;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${this.name} never received "${event}"`);
  }

  async expectNo(event, predicate = () => true, { since = 0, wait = 400 } = {}) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    const hit = this.events.slice(since).find((item) => item.event === event && predicate(item.payload));
    assert.equal(hit, undefined, `${this.name} should not receive "${event}"`);
  }
}

const asha = new Client("Asha");
const ben = new Client("Ben");
const cara = new Client("Cara");
let ashaBen;
let ashaFirstMessage;
let benReplyAfterReopen;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Conversation.init(), Message.init()]);
  ({ server } = configureApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const client of [asha, ben, cara]) {
    await client.signup();
    await client.connect();
  }
});

after(async () => {
  sockets.forEach((socket) => socket.disconnect());
  const { io } = await import("../src/lib/socket.js");
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

test("first message creates a pending request the recipient sees", async () => {
  const since = ben.mark();
  const first = await asha.send(ben, "hi ben");
  assert.equal(first.status, 201);
  ashaFirstMessage = first.data;

  await ben.waitFor("conversationRequest", (request) => request.participants.some((p) => String(p._id) === asha.id), { since });
  await ben.waitFor("newMessage", (message) => String(message._id) === String(first.data._id), { since });

  const requests = await ben.call("GET", "/messages/requests");
  assert.equal(requests.data.length, 1);
  assert.equal(String(requests.data[0].user._id), asha.id);
  ashaBen = requests.data[0]._id;

  const ashaChats = await asha.call("GET", "/messages/conversations");
  assert.equal(ashaChats.data.find((chat) => String(chat._id) === String(ashaBen)).status, "pending");
});

test("while pending, only the sender can keep messaging", async () => {
  const benTries = await ben.send(asha, "can I reply before accepting?");
  assert.equal(benTries.status, 403);
  assert.match(benTries.data.message, /Accept this conversation request/);

  const ashaAgain = await asha.send(ben, "are you there?");
  assert.equal(ashaAgain.status, 201);
});

test("rejecting notifies the sender and locks them out of every action", async () => {
  await ben.call("PUT", `/messages/conversation/${asha.id}/mood`, { mood: "happy" });

  const since = asha.mark();
  const rejected = await ben.call("PUT", `/messages/requests/${ashaBen}/reject`);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.status, "declined");
  await asha.waitFor("conversationUpdated", (c) => c.status === "declined", { since });
  await asha.waitFor("newMessage", (m) => m.systemEvent === "request_declined", { since });

  const blockedSend = await asha.send(ben, "please?");
  assert.equal(blockedSend.status, 403);
  assert.match(blockedSend.data.message, /rejected/);

  // No back doors: editing, reacting, pinning, shared settings, memories, rituals.
  const attempts = await Promise.all([
    asha.call("PATCH", `/messages/${ashaFirstMessage._id}`, { text: "edited to sneak a message in" }),
    asha.call("PUT", `/messages/${ashaFirstMessage._id}/reaction`, { key: "feel" }),
    asha.call("PUT", `/messages/conversation/${ashaBen}/pins/${ashaFirstMessage._id}`),
    asha.call("PATCH", `/messages/conversation/${ashaBen}/vibe`, { key: "romantic" }),
    asha.call("PATCH", `/messages/conversation/${ashaBen}/meta`, { relationshipType: "partner" }),
    asha.call("PATCH", `/messages/conversation/${ashaBen}/mode`, { key: "comfort" }),
    asha.call("POST", `/messages/conversation/${ashaBen}/memories`, { messageId: ashaFirstMessage._id, title: "us" }),
    asha.call("PUT", `/messages/conversation/${ashaBen}/rituals`, { key: "morning" }),
  ]);
  attempts.forEach((attempt, index) => assert.equal(attempt.status, 403, `back door #${index} should be refused`));

  // Purely personal settings still work.
  const lock = await asha.call("PATCH", `/messages/conversation/${ashaBen}/meta`, { locked: true });
  assert.equal(lock.status, 200);

  const conversation = await Conversation.findById(ashaBen);
  assert.equal(conversation.status, "declined");
  assert.equal(await Conversation.countDocuments({ participants: { $all: [asha.id, ben.id] } }), 1);
});

test("the rejected sender can't show typing, and no status flows either way", async () => {
  const benSince = ben.mark();
  asha.socket.emit("typing", { to: ben.id });
  await asha.call("PUT", `/messages/conversation/${ben.id}/mood`, { mood: "sad" });
  await asha.call("PUT", "/messages/me/availability", { key: "busy" });
  await ben.expectNo("typing", (p) => p.from === asha.id, { since: benSince });
  await ben.expectNo("conversationMoodUpdated", (p) => String(p.userId) === asha.id, { since: benSince, wait: 0 });
  await ben.expectNo("conversationStatusUpdated", (p) => String(p.userId) === asha.id, { since: benSince, wait: 0 });

  const ashaSince = asha.mark();
  await ben.call("PUT", `/messages/conversation/${asha.id}/mood`, { mood: "calm" });
  await asha.expectNo("conversationMoodUpdated", (p) => String(p.userId) === ben.id, { since: ashaSince });

  const ashaView = await asha.call("GET", `/messages/conversation/${ben.id}/mood`);
  assert.equal(ashaView.data.theirs, null);
  assert.equal(ashaView.data.theirAvailability, null);
});

test("the rejecter sees them under Rejected, and the sender sees the chat as declined", async () => {
  const rejected = await ben.call("GET", "/messages/rejected");
  assert.deepEqual(rejected.data.map((item) => String(item.user._id)), [asha.id]);
  assert.equal((await ben.call("GET", "/messages/requests")).data.length, 0);

  const ashaChats = await asha.call("GET", "/messages/conversations");
  assert.equal(ashaChats.data.find((chat) => String(chat._id) === String(ashaBen)).status, "declined");

  const history = await asha.call("GET", `/messages/${ben.id}`);
  assert.equal(history.data.conversation.status, "declined");
  assert.equal(history.data.conversation.initiatedBy, asha.id);
});

test("only the rejecter can reopen, and messaging reopens it fully for both", async () => {
  const ashaSince = asha.mark();
  const benSince = ben.mark();
  const reopen = await ben.send(asha, "hey, changed my mind");
  assert.equal(reopen.status, 201);
  benReplyAfterReopen = reopen.data;

  await asha.waitFor("conversationUpdated", (c) => c.status === "accepted", { since: ashaSince });
  await ben.waitFor("conversationUpdated", (c) => c.status === "accepted", { since: benSince });
  await asha.waitFor("newMessage", (m) => String(m._id) === String(reopen.data._id), { since: ashaSince });

  assert.equal((await Conversation.findById(ashaBen)).status, "accepted");
  assert.equal((await ben.call("GET", "/messages/rejected")).data.length, 0);
  assert.equal((await asha.call("GET", "/messages/requests")).data.length, 0, "no new request for Asha to accept");

  const benSees = ben.mark();
  const reply = await asha.send(ben, "yay, hi again");
  assert.equal(reply.status, 201);
  await ben.waitFor("newMessage", (m) => String(m._id) === String(reply.data._id), { since: benSees });

  asha.socket.emit("typing", { to: ben.id });
  await ben.waitFor("typing", (p) => p.from === asha.id, { since: benSees });

  const react = await asha.call("PUT", `/messages/${benReplyAfterReopen._id}/reaction`, { key: "feel" });
  assert.equal(react.status, 200);
});

test("accepting a request lets both people talk", async () => {
  const sent = await cara.send(ben, "hello from cara");
  assert.equal(sent.status, 201);
  const request = (await ben.call("GET", "/messages/requests")).data.find((item) => String(item.user._id) === cara.id);
  assert.ok(request);

  const caraSince = cara.mark();
  const accepted = await ben.call("PUT", `/messages/requests/${request._id}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.status, "accepted");
  await cara.waitFor("conversationUpdated", (c) => c.status === "accepted", { since: caraSince });

  assert.equal((await ben.send(cara, "welcome!")).status, 201);
  assert.equal((await cara.send(ben, "thanks!")).status, 201);
  assert.equal((await ben.call("GET", "/messages/requests")).data.length, 0);
});

test("a request can't be rejected twice or after it was accepted", async () => {
  const again = await ben.call("PUT", `/messages/requests/${ashaBen}/reject`);
  assert.equal(again.status, 404);
});

test("the person who rejected can't use the requests API to accept on the sender's behalf", async () => {
  const sent = await cara.send(asha, "hi asha");
  assert.equal(sent.status, 201);
  const conversation = await Conversation.findOne({ participants: { $all: [asha.id, cara.id] } });
  const selfAccept = await cara.call("PUT", `/messages/requests/${conversation._id}/accept`);
  assert.equal(selfAccept.status, 404, "the sender can't accept their own request");
});
