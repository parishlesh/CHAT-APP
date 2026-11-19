/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";

const RECENT_KEY = "vibelink-recent-emoji";

const CATEGORIES = [
  { key: "smileys", label: "😀", title: "Smileys", emojis: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖" },
  { key: "gestures", label: "👍", title: "Gestures & people", emojis: "👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🧠 👀 👁️ 👅 👄 🫶 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧑‍💻 👨‍👩‍👧 💃 🕺" },
  { key: "hearts", label: "❤️", title: "Hearts & symbols", emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✨ ⭐ 🌟 💫 🔥 💥 💯 ✅ ❌ ❓ ❗ 💤 💬 🗯️ 💭 🎉 🎊 🎈 🎁 🏆 🥇" },
  { key: "nature", label: "🌸", title: "Animals & nature", emojis: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦄 🐝 🦋 🐢 🐙 🐬 🐳 🌸 🌹 🌻 🌼 🌷 🌱 🌲 🌴 🍀 🍁 🌈 ☀️ 🌙 ⛅ 🌧️ ❄️ 🌊" },
  { key: "food", label: "🍕", title: "Food & drink", emojis: "🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🌶️ 🌽 🥕 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🌯 🍜 🍝 🍣 🍱 🍛 🍩 🍪 🎂 🍰 🍫 🍿 ☕ 🍵 🧋 🍺 🍷 🥂" },
  { key: "activity", label: "⚽", title: "Activities & travel", emojis: "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏏 🏓 🏸 🥊 🎮 🎲 🎯 🎳 🎸 🎹 🎧 🎤 🎬 📷 🚗 🚕 🚌 🚲 🛵 ✈️ 🚀 🛳️ 🏖️ 🏔️ 🏕️ 🏠 🏢 🗽 🗼 💻 📱 ⌚ 💡 📚 ✏️ 📌 💼 💰" },
];

const readRecent = () => {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 24) : [];
  } catch {
    return [];
  }
};

// Lightweight emoji grid (no extra dependency). Remembers recently used emojis on this device.
const EmojiPicker = ({ onPick, onClose }) => {
  const [recent, setRecent] = useState(readRecent);
  const [active, setActive] = useState(() => (readRecent().length ? "recent" : "smileys"));
  const categories = useMemo(() => [
    ...(recent.length ? [{ key: "recent", label: "🕘", title: "Recent", list: recent }] : []),
    ...CATEGORIES.map((category) => ({ ...category, list: category.emojis.split(" ") })),
  ], [recent]);
  const current = categories.find((category) => category.key === active) || categories[0];

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (emoji) => {
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 24);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage full */ }
    onPick(emoji);
  };

  return (
    <>
      <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close emoji picker" onClick={onClose} />
      <div className="ui-pop absolute bottom-full left-0 z-40 mb-2 w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg" role="dialog" aria-label="Emoji picker">
        <div className="flex border-b border-base-300 px-1">
          {categories.map((category) => (
            <button
              key={category.key}
              type="button"
              title={category.title}
              aria-label={category.title}
              onClick={() => setActive(category.key)}
              className={`flex-1 border-b-2 py-1.5 text-lg ${current.key === category.key ? "border-primary" : "border-transparent opacity-60"}`}
            >
              {category.label}
            </button>
          ))}
        </div>
        <p className="px-2 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">{current.title}</p>
        <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-1.5">
          {current.list.map((emoji) => (
            <button key={emoji} type="button" className="rounded p-1 text-xl hover:bg-base-200" onClick={() => pick(emoji)} aria-label={emoji}>
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default EmojiPicker;
