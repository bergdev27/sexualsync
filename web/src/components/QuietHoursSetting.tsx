"use client";

import { useId, useState } from "react";
import { ensurePushSubscription, readStoredPushPrefs } from "@/lib/push-subscription";
import {
  QUIET_HOURS_DEFAULT,
  clockLabel,
  readStoredQuietHours,
  storeQuietHours,
  type QuietHours,
} from "@/lib/quiet-hours";
import "./quiet-hours.css";

/**
 * Quiet hours for this device (research rec #4: recipient-controlled, and the
 * partner can never see it's on). The window is saved with this device's push
 * subscription and the server holds pushes back inside it. Nothing is shown to
 * the partner and nothing they send changes: their Ask still lands, it just
 * doesn't buzz this phone until the morning.
 */
export default function QuietHoursSetting({ workspaceId }: { workspaceId: string }) {
  const fromId = useId();
  const untilId = useId();
  // Only mounted once the Settings sheet is open (client-side, after a tap),
  // so reading storage in the initializer can't cause a hydration mismatch.
  const [value, setValue] = useState<QuietHours>(() => (
    typeof window === "undefined" ? QUIET_HOURS_DEFAULT : readStoredQuietHours()
  ));
  const [status, setStatus] = useState("");

  function save(next: QuietHours) {
    setValue(next);
    storeQuietHours(next);
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !workspaceId) {
      setStatus(next.enabled ? "Saved. It applies once notifications are on for this device." : "");
      return;
    }
    setStatus("Saving…");
    ensurePushSubscription(workspaceId, readStoredPushPrefs(), { force: true })
      .then(() => setStatus(next.enabled ? `Quiet from ${clockLabel(next.start)} to ${clockLabel(next.end)}.` : "Quiet hours are off."))
      .catch(() => setStatus("Couldn't save quiet hours. Try again."));
  }

  const sub = value.enabled
    ? `No buzzes from ${clockLabel(value.start)} to ${clockLabel(value.end)} on this device. Only you can see this.`
    : "Hold notifications overnight on this device. Only you can see this.";

  return (
    <div className="settings-card quiet-hours" data-testid="quiet-hours">
      <button
        type="button"
        role="switch"
        aria-checked={value.enabled}
        className="settings-row pressable"
        onClick={() => save({ ...value, enabled: !value.enabled })}
        data-testid="quiet-hours-toggle"
      >
        <span>
          <span className="settings-row-title">Quiet hours</span>
          <span className="settings-row-sub">{sub}</span>
        </span>
        <span className={`switch ${value.enabled ? "is-on" : ""}`} aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </button>
      {value.enabled && (
        <div className="quiet-hours-times">
          <label className="quiet-hours-field" htmlFor={fromId}>
            <span className="quiet-hours-label">From</span>
            <input
              id={fromId}
              type="time"
              className="input quiet-hours-input"
              value={value.start}
              onChange={(event) => {
                if (event.target.value) save({ ...value, start: event.target.value });
              }}
            />
          </label>
          <label className="quiet-hours-field" htmlFor={untilId}>
            <span className="quiet-hours-label">Until</span>
            <input
              id={untilId}
              type="time"
              className="input quiet-hours-input"
              value={value.end}
              onChange={(event) => {
                if (event.target.value) save({ ...value, end: event.target.value });
              }}
            />
          </label>
        </div>
      )}
      <p className="quiet-hours-status" role="status">{status}</p>
    </div>
  );
}
