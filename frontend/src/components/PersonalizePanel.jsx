/* eslint-disable react/prop-types */
import { RotateCcw, Shuffle, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { usePersonalizationStore } from "../store/usePersonalizationStore";
import { useThemeStore } from "../store/useThemeStore";
import {
  ACCENT_SWATCHES, DENSITIES, FONT_OPTIONS, MY_WALLPAPER_OPTIONS, TEXT_SIZES, VIBE_PRESETS,
  accentCssVars, fontStack, textSizePx,
} from "../config/personalization";
import { wallpaperClass } from "../config/conversationExtras";
import VibeEffects from "./VibeEffects";

const Segmented = ({ options, value, onChange, label }) => (
  <div className="flex flex-wrap gap-1 rounded-lg bg-base-200 p-1" role="radiogroup" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.key}
        type="button"
        role="radio"
        aria-checked={value === option.key}
        className={`ui-press flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${value === option.key ? "bg-base-100 shadow-sm" : "text-base-content/70 hover:bg-base-100/60"}`}
        style={option.stack ? { fontFamily: option.stack } : undefined}
        onClick={() => onChange(option.key)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Toggle = ({ label, hint, checked, onChange }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg px-1 py-2">
    <span>
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-base-content/60">{hint}</span>
    </span>
    <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

const Field = ({ title, children }) => (
  <div className="space-y-2">
    <p className="text-xs font-semibold uppercase tracking-wide text-base-content/50">{title}</p>
    {children}
  </div>
);

const PresetCard = ({ preset, active, onPick }) => (
  <button
    type="button"
    onClick={onPick}
    aria-pressed={active}
    className={`ui-press overflow-hidden rounded-xl border text-left ${active ? "border-primary ring-2 ring-primary/40" : "border-base-300 hover:border-base-content/30"}`}
  >
    <div data-theme={preset.appTheme} style={accentCssVars(preset.prefs.accent)} className={`relative h-16 bg-base-100 ${wallpaperClass(preset.prefs.myWallpaper)}`}>
      <div className="absolute inset-x-2 top-2 flex flex-col gap-1">
        <span className="w-2/3 rounded-md bg-base-200 px-1.5 py-0.5 text-[9px] text-base-content">hey you ✨</span>
        <span className="ml-auto w-1/2 rounded-md bg-primary px-1.5 py-0.5 text-right text-[9px] text-primary-content">same vibe!</span>
      </div>
    </div>
    <div className="bg-base-100 px-2.5 py-2">
      <p className="truncate text-sm font-medium">{preset.emoji} {preset.label}</p>
      <p className="truncate text-[11px] text-base-content/60">{preset.blurb}</p>
    </div>
  </button>
);

const PersonalizePanel = () => {
  const { prefs, update, applyPreset, surpriseMe, reset } = usePersonalizationStore();
  const appliedAppTheme = useThemeStore((state) => state.appliedAppTheme);
  const customAccent = prefs.accent && !ACCENT_SWATCHES.some((swatch) => swatch.hex === prefs.accent);
  const previewWallpaper = prefs.myWallpaper === "conversation" ? "default" : prefs.myWallpaper;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} className="text-primary" /> My vibe</h2>
          <p className="text-sm text-base-content/70">Make VibeLink feel like yours. These settings are only on this device and only change what you see.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary ui-press gap-1"
            onClick={() => {
              const pick = surpriseMe();
              if (pick) toast.success(`${pick.emoji} ${pick.label}`);
            }}
          >
            <Shuffle size={14} /> Surprise me
          </button>
          <button type="button" className="btn btn-sm btn-ghost ui-press gap-1" onClick={reset}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <Field title="Vibe presets">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {VIBE_PRESETS.map((preset) => (
            <PresetCard key={preset.key} preset={preset} active={prefs.presetKey === preset.key} onPick={() => applyPreset(preset.key)} />
          ))}
        </div>
        <p className="text-[11px] text-base-content/50">A preset sets your app theme, accent, font and background in one tap. Tweak anything below afterwards.</p>
      </Field>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Field title="Accent color (your bubbles & buttons)">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_SWATCHES.map((swatch) => {
                const selected = (prefs.accent || null) === swatch.hex;
                return (
                  <button
                    key={swatch.key}
                    type="button"
                    title={swatch.label}
                    aria-label={`Accent ${swatch.label}`}
                    aria-pressed={selected}
                    onClick={() => update({ accent: swatch.hex })}
                    className={`ui-press h-8 w-8 rounded-full border-2 ${selected ? "border-base-content" : "border-transparent"}`}
                    style={swatch.hex ? { backgroundColor: swatch.hex } : undefined}
                  >
                    {!swatch.hex && <span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-content">A</span>}
                  </button>
                );
              })}
              <label className={`ui-press relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border-2 ${customAccent ? "border-base-content" : "border-dashed border-base-content/40"}`} title="Custom color">
                <span className="absolute inset-0" style={{ background: customAccent ? prefs.accent : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
                <input
                  type="color"
                  aria-label="Custom accent color"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={prefs.accent || "#8b5cf6"}
                  onChange={(event) => update({ accent: event.target.value.toUpperCase() })}
                />
              </label>
            </div>
          </Field>

          <Field title="Font">
            <Segmented label="Font" options={FONT_OPTIONS} value={prefs.font} onChange={(font) => update({ font })} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field title="Message size">
              <Segmented label="Message size" options={TEXT_SIZES} value={prefs.textSize} onChange={(textSize) => update({ textSize })} />
            </Field>
            <Field title="Spacing">
              <Segmented label="Spacing" options={DENSITIES} value={prefs.density} onChange={(density) => update({ density })} />
            </Field>
          </div>

          <Field title="My chat background">
            <div className="grid grid-cols-5 gap-2">
              {MY_WALLPAPER_OPTIONS.map((option) => {
                const selected = prefs.myWallpaper === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ myWallpaper: option.key })}
                    className={`ui-press overflow-hidden rounded-lg border text-[10px] ${selected ? "border-primary ring-2 ring-primary/40" : "border-base-300"}`}
                  >
                    <span className={`block h-8 bg-base-100 ${option.key === "conversation" ? "" : wallpaperClass(option.key)}`}>
                      {option.key === "conversation" && <span className="flex h-full items-center justify-center text-base">💬</span>}
                    </span>
                    <span className="block truncate px-1 py-0.5">{option.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-base-content/50">&quot;Chat&apos;s own&quot; uses the wallpaper set for that conversation (shared with them). Anything else overrides it just for you.</p>
          </Field>

          <div className="divide-y divide-base-300 rounded-xl border border-base-300 px-3">
            <Toggle
              label="Let my mood color my chats"
              hint="Your mood picks the chat theme (e.g. Romantic → Valentine). Off = chats follow your app theme."
              checked={prefs.moodTheme}
              onChange={(moodTheme) => update({ moodTheme })}
            />
            <Toggle
              label="Vibe effects"
              hint="Gentle floating emojis that match each chat's vibe. Hidden automatically if you prefer reduced motion."
              checked={prefs.vibeEffects}
              onChange={(vibeEffects) => update({ vibeEffects })}
            />
          </div>
        </div>

        <Field title="Preview">
          <div
            data-theme={appliedAppTheme}
            data-density={prefs.density}
            style={{ ...accentCssVars(prefs.accent), "--vl-msg-size": `${textSizePx(prefs.textSize)}px`, fontFamily: fontStack(prefs.font) || undefined }}
            className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm"
          >
            <div className="flex items-center gap-2 border-b border-base-300 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-secondary" />
              <div>
                <p className="text-sm font-medium leading-tight">Alex</p>
                <p className="text-[11px] text-base-content/60">Online · Vibe 😜 Playful</p>
              </div>
            </div>
            <div className={`relative h-64 ${wallpaperClass(previewWallpaper)}`}>
              <VibeEffects vibe="playful" particles={prefs.vibeEffects} />
              <div className={`relative z-[1] flex h-full flex-col justify-end px-3 ${prefs.density === "compact" ? "space-y-0.5 py-2" : "space-y-1.5 py-3"}`}>
                <div className="flex justify-start">
                  <p className="vl-bubble vl-msg-text max-w-[75%] rounded-lg rounded-bl-none bg-base-200 px-2.5 py-1.5 leading-snug">are we still on for tonight? 🍕</p>
                </div>
                <div className="flex justify-end">
                  <p className="vl-bubble vl-msg-text max-w-[75%] rounded-lg rounded-br-none bg-primary px-2.5 py-1.5 leading-snug text-primary-content">obviously. I&apos;m bringing the playlist</p>
                </div>
                <div className="flex justify-start">
                  <p className="vl-bubble vl-msg-text max-w-[75%] rounded-lg rounded-bl-none bg-base-200 px-2.5 py-1.5 leading-snug">perfect, see you at 8</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-base-300 px-3 py-2">
              <div className="h-9 flex-1 rounded-2xl border border-base-300 bg-base-200" />
              <div className="h-9 w-9 rounded-full bg-primary" />
            </div>
          </div>
        </Field>
      </div>
    </section>
  );
};

export default PersonalizePanel;
