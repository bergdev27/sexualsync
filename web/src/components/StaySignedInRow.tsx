"use client";

import { useState } from "react";
import { updateWorkspaceSettings } from "@/lib/api";
import type { Workspace } from "@/lib/types";

const STAY_SIGNED_IN_OPTIONS = [
  { value: 0, label: "Re-ask every launch" },
  { value: 1, label: "1 day" },
  { value: 2, label: "2 days" },
  { value: 7, label: "1 week" },
  { value: 30, label: "1 month" },
];

/**
 * Where the user picks how long reopening the installed PWA skips the
 * sign-in check. Lives on the main settings page (Us) rather than inside
 * the Account and data subpage — this is the setting users go looking for
 * when the app keeps logging them out, and it must not be a menu level
 * deep. Server-side validation mirrors the 0–30 day range (the HttpOnly
 * 30-day session cookie is the hard ceiling).
 */
export default function StaySignedInRow({ workspace }: { workspace: Workspace }) {
  const [days, setDays] = useState(() => {
    const stored = Number(workspace.settings?.staySignedInDays);
    return Number.isInteger(stored) && stored >= 0 && stored <= 30 ? stored : 0;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function choose(raw: string) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 30 || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      await updateWorkspaceSettings({ workspaceId: workspace.id, staySignedInDays: value });
      setDays(value);
      setStatus(value === 0 ? "Saved — the app will re-check sign-in on every launch." : "Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="settings-row">
      <span>
        <span className="settings-row-title">Stay signed in</span>
        <span className="settings-row-sub">
          Skip the sign-in check when reopening the app within this window. The
          room lock and the 30-day session limit still apply.
        </span>
        {status && <span className="settings-row-sub">{status}</span>}
      </span>
      <select
        className="settings-select"
        value={days}
        disabled={saving}
        onChange={(event) => { void choose(event.target.value); }}
      >
        {STAY_SIGNED_IN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
