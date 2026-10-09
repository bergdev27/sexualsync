"use client";

/**
 * "Your voice" in Settings: how spicy the prompts you see get, and how
 * explicit the app talks to you. Both are yours alone: saved on your own
 * profile, never shown to your partner, and they change only copy addressed
 * to you (see lib/desire-voice.ts for the curated list).
 */

import { useEffect, useState } from "react";
import { updateProfileSettings } from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import { readSpice, readVoice, type ExplicitVoice, type SpiceCeiling } from "@/lib/desire-voice";
import "./desire-settings.css";

const SPICE_OPTIONS: Array<{ id: SpiceCeiling; label: string }> = [
  { id: "mild", label: "Mild" },
  { id: "spicy", label: "Spicy" },
  { id: "filthy", label: "Filthy" },
];

const VOICE_OPTIONS: Array<{ id: ExplicitVoice; label: string }> = [
  { id: "gentle", label: "Softer" },
  { id: "standard", label: "As is" },
  { id: "filthy", label: "Filthier" },
];

export default function DesireVoiceSettings() {
  const [spice, setSpice] = useState<SpiceCeiling | null>(null);
  const [voice, setVoice] = useState<ExplicitVoice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getProfileCached()
      .then((profile) => {
        if (cancelled) return;
        setSpice(readSpice(profile.profile?.settings?.promptSpice));
        setVoice(readVoice(profile.profile?.settings?.explicitVoice));
      })
      .catch(() => {
        if (!cancelled) { setSpice(readSpice(undefined)); setVoice(readVoice(undefined)); }
      });
    return () => { cancelled = true; };
  }, []);

  async function save(next: { promptSpice?: SpiceCeiling; explicitVoice?: ExplicitVoice }, revert: () => void) {
    setError("");
    try {
      await updateProfileSettings(next);
    } catch {
      revert();
      setError("Couldn't save that. Try again.");
    }
  }

  function pickSpice(value: SpiceCeiling) {
    if (value === spice) return;
    const prior = spice;
    setSpice(value);
    void save({ promptSpice: value }, () => setSpice(prior));
  }

  function pickVoice(value: ExplicitVoice) {
    if (value === voice) return;
    const prior = voice;
    setVoice(value);
    void save({ explicitVoice: value }, () => setVoice(prior));
  }

  return (
    <section className="settings-section" aria-labelledby="settings-voice">
      <h3 id="settings-voice" className="eyebrow">Your voice</h3>
      <div className="settings-card desire-settings-card">
        <Segmented
          title="How spicy prompts get"
          sub="Prompts start gentle and climb to this. Only you see this setting."
          name="Prompt spice"
          options={SPICE_OPTIONS}
          value={spice}
          onChange={pickSpice}
          testId="desire-spice"
        />
        <Segmented
          title="Explicit language"
          sub="How the app talks to you. Your partner's setting is their own."
          name="Explicit language"
          options={VOICE_OPTIONS}
          value={voice}
          onChange={pickVoice}
          testId="desire-voice"
        />
        {error && <p className="desire-settings-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

function Segmented<T extends string>({
  title,
  sub,
  name,
  options,
  value,
  onChange,
  testId,
}: {
  title: string;
  sub: string;
  name: string;
  options: Array<{ id: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <div className="desire-seg-row">
      <span className="settings-row-title">{title}</span>
      <span className="settings-row-sub">{sub}</span>
      <div className="desire-seg" role="radiogroup" aria-label={name} data-testid={testId}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            disabled={value === null}
            className={`desire-seg-option pressable ${value === option.id ? "is-active" : ""}`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
