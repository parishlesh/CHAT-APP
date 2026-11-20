// End-to-end tests for contact profiles and shared media, against the real app and a throwaway MongoDB.
// Run: npm run test:integration
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.CLOUDINARY_CLOUD_NAME = "vibe-test";
delete process.env.REDIS_URL;

const { configureApp } = await import("../src/app.js");
const { default: Message } = await import("../src/models/message-model.js");
const { mediaFolder } = await import("../src/lib/media.js");

let mongo;
let server;
let baseUrl;

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = "";
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

  async signup(extra = {}) {
    const username = this.name.toLowerCase();
    const { status, data } = await this.call("POST", "/auth/signup", {
      fullName: this.name, username, email: `${username}@example.test`, password: "secret123", phone: "+91 90000 00000", ...extra,
    });
    assert.equal(status, 201);
    this.id = String(data._id);
    return this;
  }

  profileOf(other, headers) {
    return this.call("GET", `/messages/users/${other.id}/profile`, undefined, headers);
  }
}

const asha = new Client("Asha");
const ben = new Client("Ben");
const cara = new Client("Cara");
let chatId;

const attachment = (owner, kind, name) => ({
  kind,
  url: `https://res.cloudinary.com/vibe-test/${kind === "file" ? "raw" : kind === "image" ? "image" : "video"}/upload/v1/${mediaFolder(owner.id)}/${name}`,
  publicId: `${mediaFolder(owner.id)}/${name}`,
  name,
  bytes: 1000,
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ server } = configureApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await asha.signup();
  await ben.signup();
  await cara.signup();
  await ben.call("PUT", "/auth/update-profile", { about: "Coffee, code and cricket." });
  await ben.call("PUT", `/messages/conversation/${asha.id}/mood`, { mood: "happy" });

  await asha.call("POST", `/messages/send/${ben.id}`, { text: "hi ben" });
  const [request] = (await ben.call("GET", "/messages/requests")).data;
  chatId = request._id;
  await ben.call("PUT", `/messages/requests/${chatId}/accept`);
  for (const [who, kind, name] of [[ben, "image", "a.jpg"], [asha, "video", "b.mp4"], [ben, "file", "notes.pdf"], [asha, "audio", "voice.webm"], [ben, "image", "c.jpg"]]) {
    const to = who === ben ? asha : ben;
    const sent = await who.call("POST", `/messages/send/${to.id}`, { text: "", attachment: attachment(who, kind, name) });
    assert.equal(sent.status, 201, `send ${kind}`);
  }
});

after(async () => {
  const { io } = await import("../src/lib/socket.js");
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

test("a profile shows bio, mood, join date and your shared chat details", async () => {
  const { status, data } = await asha.profileOf(ben);
  assert.equal(status, 200);
  assert.equal(data.profile.fullName, "Ben");
  assert.equal(data.profile.username, "ben");
  assert.equal(data.profile.about, "Coffee, code and cricket.");
  assert.equal(data.profile.mood, "happy");
  assert.ok(data.profile.joinedAt);
  assert.equal(data.relationship.status, "accepted");
  assert.equal(data.isSelf, false);
  assert.deepEqual(data.mediaCounts, { media: 3, files: 1, voice: 1 });
});

test("email and phone stay private everywhere other users can look", async () => {
  const profile = (await asha.profileOf(ben)).data.profile;
  assert.equal(profile.email, undefined);
  assert.equal(profile.phone, undefined);
  const search = (await asha.call("GET", "/messages/search?q=ben")).data;
  assert.equal(search[0].email, undefined, "search results don't leak email");
  const chats = (await asha.call("GET", "/messages/conversations")).data;
  assert.equal(chats[0].user.email, undefined, "chat list doesn't leak email");
});

test("shared media is split into photos & videos, documents and voice notes", async () => {
  const media = (await asha.call("GET", `/messages/users/${ben.id}/media?kind=media`)).data;
  assert.deepEqual(media.items.map((item) => item.attachment.name), ["c.jpg", "b.mp4", "a.jpg"], "newest first");
  const files = (await asha.call("GET", `/messages/users/${ben.id}/media?kind=files`)).data;
  assert.deepEqual(files.items.map((item) => item.attachment.name), ["notes.pdf"]);
  const voice = (await asha.call("GET", `/messages/users/${ben.id}/media?kind=voice`)).data;
  assert.deepEqual(voice.items.map((item) => item.attachment.name), ["voice.webm"]);

  const firstPage = (await asha.call("GET", `/messages/users/${ben.id}/media?kind=media&limit=2`)).data;
  assert.equal(firstPage.hasMore, true);
  const next = (await asha.call("GET", `/messages/users/${ben.id}/media?kind=media&limit=2&before=${firstPage.items[1]._id}`)).data;
  assert.deepEqual(next.items.map((item) => item.attachment.name), ["a.jpg"]);
});

test("deleted and deleted-for-me messages drop out of shared media", async () => {
  const pdf = await Message.findOne({ "attachment.name": "notes.pdf" });
  assert.equal((await asha.call("DELETE", `/messages/${pdf._id}?scope=me`)).status, 200);
  assert.equal((await asha.call("GET", `/messages/users/${ben.id}/media?kind=files`)).data.items.length, 0);
  assert.equal((await ben.call("GET", `/messages/users/${asha.id}/media?kind=files`)).data.items.length, 1, "still there for Ben");
});

test("a locked chat hides its shared media until unlocked", async () => {
  await asha.call("PUT", "/messages/lock/pin", { pin: "2468" });
  await asha.call("PATCH", `/messages/conversation/${chatId}/meta`, { locked: true });
  const profile = (await asha.profileOf(ben)).data;
  assert.equal(profile.mediaHidden, true);
  assert.equal(profile.mediaCounts, null);
  assert.equal(profile.profile.about, "Coffee, code and cricket.", "the person's own profile is still visible");
  assert.equal((await asha.call("GET", `/messages/users/${ben.id}/media`)).status, 423);

  const { token } = (await asha.call("POST", `/messages/conversation/${chatId}/unlock`, { pin: "2468" })).data;
  const unlocked = (await asha.profileOf(ben, { "x-chat-unlock": token })).data;
  assert.equal(unlocked.mediaHidden, false);
  assert.equal(unlocked.mediaCounts.media, 3);
  await asha.call("PATCH", `/messages/conversation/${chatId}/meta`, { locked: false, pin: "2468" });
});

test("if someone blocked you, you only see their name", async () => {
  await ben.call("PUT", `/messages/block/${asha.id}`, { blocked: true });
  const { data } = await asha.profileOf(ben);
  assert.equal(data.profile.limited, true);
  assert.equal(data.profile.about, "");
  assert.equal(data.profile.mood, null);
  assert.equal(data.profile.lastSeen, null);
  assert.equal(data.profile.fullName, "Ben");
  const bensView = (await ben.profileOf(asha)).data;
  assert.equal(bensView.blockedByMe, true);
  assert.equal(bensView.profile.limited, false, "blocking someone doesn't hide their profile from you");
  await ben.call("PUT", `/messages/block/${asha.id}`, { blocked: false });
});

test("rejected requests hide mood and last seen both ways; strangers see the basics", async () => {
  await cara.call("PUT", "/auth/update-profile", { about: "Hi, I'm Cara" });
  const stranger = (await asha.profileOf(cara)).data;
  assert.equal(stranger.relationship, null);
  assert.equal(stranger.profile.about, "Hi, I'm Cara");
  assert.equal(stranger.mediaCounts, null);

  await cara.call("POST", `/messages/send/${asha.id}`, { text: "hello" });
  const request = (await asha.call("GET", "/messages/requests")).data.find((item) => String(item.user._id) === cara.id);
  await asha.call("PUT", `/messages/requests/${request._id}/reject`);
  const caraView = (await cara.profileOf(asha)).data;
  assert.equal(caraView.profile.statusHidden, true);
  assert.equal(caraView.profile.mood, null);
  assert.equal(caraView.profile.lastSeen, null);
  assert.equal((await asha.profileOf(cara)).data.profile.statusHidden, true);
});

test("unknown users 404 and bad ids 400", async () => {
  assert.equal((await asha.call("GET", "/messages/users/507f1f77bcf86cd799439099/profile")).status, 404);
  assert.equal((await asha.call("GET", "/messages/users/not-an-id/profile")).status, 400);
});
