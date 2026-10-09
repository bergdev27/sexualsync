"use client";

/**
 * Sexboard presence band + pulse wave + live indicator. Split out of
 * page.tsx as part of H-2 because these three pieces are visually
 * paired (top of the dashboard card) and have no dependency back on
 * the sexboard's `LoadState` discriminated union — they accept the
 * narrow set of props they actually render.
 */

import { type ReactNode, useEffect, useState } from "react";
import type { ActivityResponse, AuthInfo, PresenceResponse, Workspace } from "@/lib/types";
import { partnerOf } from "@/lib/workspace";
import { friendlyDateLabel } from "./_sexboard-helpers";

const PARTNER_LIVE_WINDOW_MS = 2 * 60 * 1000;
const PARTNER_RECENT_WINDOW_MS = 5 * 60 * 1000;

export function PresenceBand({
  workspace,
  auth,
  presence,
}: {
  workspace: Workspace;
  auth: AuthInfo;
  presence: PresenceResponse | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const partner = partnerOf(workspace, auth.email);
  const me = workspace.members.find((member) => member.email.toLowerCase() === auth.email.toLowerCase());
  const partnerName = partner?.displayName?.split(" ")[0] || "partner";
  const myName = me?.displayName?.split(" ")[0] || auth.person?.split(" ")[0] || "You";
  const spaceName = workspace.displayName || workspace.name || `${myName} & ${partnerName}`;
  const partnerLastSeen = presence?.partner?.lastSeen || null;
  const partnerLastSeenTime = partnerLastSeen ? new Date(partnerLastSeen).getTime() : 0;
  const isPartnerLive = Number.isFinite(partnerLastSeenTime) && partnerLastSeenTime > 0 && now - partnerLastSeenTime <= PARTNER_LIVE_WINDOW_MS;
  const isPartnerRecent = !isPartnerLive && Number.isFinite(partnerLastSeenTime) && partnerLastSeenTime > 0 && now - partnerLastSeenTime <= PARTNER_RECENT_WINDOW_MS;
  const seenWhen = partnerLastSeen ? friendlyDateLabel(partnerLastSeen).replace(/\s+ago$/, "") : null;
  const status = isPartnerLive
    ? "Live"
    : isPartnerRecent
    ? "Just here"
    : partnerLastSeen
    ? `Seen ${seenWhen}`
    : presence?.partner
      ? "Not seen yet"
      : "Checking last seen";

  // Re-render the "Seen …" age every 30s while the screen is in front; a
  // hidden screen catches up the moment it is visible again.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <div className="presence-band sexboard-presence" role="group" aria-label="Partner presence">
      <span className="presence-band-names">
        {spaceName}
      </span>
      <span className="presence-band-meta">
        <span className="presence-band-private">Private</span>
        {/* A plain span can't carry an aria-label (ARIA names no generic), so
            the spoken status is its own sr-only text and the short visible
            one is hidden from assistive tech. */}
        <span
          className={`presence-band-status ${isPartnerLive ? "is-live" : ""} ${isPartnerRecent ? "is-recent" : ""}`}
        >
          <span className="sr-only">{isPartnerLive ? `${partnerName} is live` : status}</span>
          <LiveLogoMark />
          <span aria-hidden="true">{status}</span>
        </span>
      </span>
    </div>
  );
}

export function LiveLogoMark() {
  return (
    <svg className="presence-live-mark" width="14" height="8" viewBox="0 0 100 50" fill="none" aria-hidden="true">
      <path
        d="M12 25 C 12 10, 38 10, 50 25 C 62 40, 88 40, 88 25 C 88 10, 62 10, 50 25 C 38 40, 12 40, 12 25 Z"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PulseWaves({
  state,
  synced,
}: {
  state: "quiet" | "pending" | "lit" | "hot";
  synced: boolean;
}) {
  // Tempo, accent and glow are driven by CSS custom props set on the
  // .pulse-card[data-pulse-state] ancestor (--acc / --beat / --glow-o), so the
  // markup is the same across states; data-synced flips on the sync payoff.
  const youPath = "M 8,40 C 65,15 110,15 160,40 S 255,65 312,40";
  const partnerPath = "M 8,40 C 65,58 110,58 160,40 S 255,22 312,40";

  // Each moving part is its own <svg> layer. Chromium doesn't composite a
  // transform on SVG content (a <g> or <path>), so a breath on a group means a
  // layout + repaint every frame; on an outer <svg> element it's a compositor
  // transform like any HTML box. The layers share one box and one viewBox, so
  // they line up exactly.
  const layer = (className: string, children: ReactNode) => (
    <svg className={`pw-layer ${className}`} viewBox="0 0 320 80" focusable="false" aria-hidden="true">
      {children}
    </svg>
  );

  return (
    <div className="pulse-wave-wrap" aria-hidden="true">
      {/* Keyed on state so the bounded comet laps replay when the state changes. */}
      <div key={`${state}-${synced}`} className="pulse-wave" data-state={state} data-synced={String(synced)}>
        <svg className="pw-defs" width="0" height="0" focusable="false" aria-hidden="true">
          <defs>
            <linearGradient id="pulseGradient" x1="0" x2="1">
              <stop offset="0" stopColor="var(--acc)" stopOpacity="0.5" />
              <stop offset="0.5" stopColor="var(--acc)" stopOpacity="1" />
              <stop offset="1" stopColor="var(--acc)" stopOpacity="0.5" />
            </linearGradient>
            {/* soft blur for the glow underlay strings */}
            <filter id="pwGlow" x="-20%" y="-80%" width="140%" height="260%">
              <feGaussianBlur stdDeviation="3.6" />
            </filter>
            {/* tighter blur for the comet halo */}
            <filter id="pwComet" x="-50%" y="-300%" width="200%" height="700%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
            <radialGradient id="pwBloom">
              <stop offset="0" stopColor="var(--acc)" stopOpacity="0.9" />
              <stop offset="55%" stopColor="var(--acc)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--acc)" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>

        {/* glow underlay — both curves, blurred, breathing in opacity */}
        {layer("pw-glow", (
          <g filter="url(#pwGlow)">
            <path d={youPath} fill="none" stroke="var(--acc)" strokeWidth="3" strokeLinecap="round" />
            <path d={partnerPath} fill="none" stroke="var(--acc)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        ))}

        {/* YOU wave — base + traveling trail/comet/dot, breathing as a layer */}
        {layer("pw-you", (
          <>
            <path d={youPath} fill="none" stroke="url(#pulseGradient)" strokeWidth="3" strokeLinecap="round" />
            <path className="pw-trail" d={youPath} pathLength={1} fill="none" stroke="var(--acc)" strokeWidth="3" strokeLinecap="round" strokeDasharray=".16 .84" opacity="0.5" />
            <path className="pw-comet" d={youPath} pathLength={1} fill="none" stroke="var(--acc)" strokeWidth="3.4" strokeLinecap="round" strokeDasharray=".035 .965" filter="url(#pwComet)" />
            <path className="pw-dot" d={youPath} pathLength={1} fill="none" stroke="var(--cream)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray=".012 .988" />
          </>
        ))}

        {/* PARTNER wave — offset comet (is-p), softer base */}
        {layer("pw-partner", (
          <>
            <path d={partnerPath} fill="none" stroke="var(--accent-fog)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
            <path className="pw-trail is-p" d={partnerPath} pathLength={1} fill="none" stroke="var(--acc)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray=".16 .84" opacity="0.4" />
            <path className="pw-comet is-p" d={partnerPath} pathLength={1} fill="none" stroke="var(--acc)" strokeWidth="3" strokeLinecap="round" strokeDasharray=".035 .965" filter="url(#pwComet)" />
            <path className="pw-dot is-p" d={partnerPath} pathLength={1} fill="none" stroke="var(--cream)" strokeWidth="2.2" strokeLinecap="round" strokeDasharray=".012 .988" />
          </>
        ))}

        {/* sync payoff — center seam, blooms, ripple rings, rising sparks.
            All start at opacity 0; CSS animates them only when data-synced. */}
        {layer("pw-blooms", (
          <>
            <circle className="pw-ripple" cx="160" cy="40" r="11" fill="none" stroke="var(--acc)" strokeWidth="1.5" />
            <circle className="pw-ripple r2" cx="160" cy="40" r="11" fill="none" stroke="var(--acc)" strokeWidth="1.2" />
            <circle className="pw-bloom" cx="160" cy="40" r="22" fill="url(#pwBloom)" />
            <circle className="pw-bloom s" cx="160" cy="40" r="15" fill="url(#pwBloom)" />
            <rect className="pw-seam" x="158.4" y="18" width="3.2" height="44" rx="1.6" fill="var(--acc)" />
            <circle className="pw-spark" cx="160" cy="40" r="1.7" fill="var(--cream)" />
            <circle className="pw-spark b" cx="153" cy="40" r="1.4" fill="var(--acc)" />
            <circle className="pw-spark c" cx="167" cy="40" r="1.4" fill="var(--acc)" />
          </>
        ))}
      </div>
    </div>
  );
}

// Re-export the activity response type purely so callers importing this
// module can hint at the underlying shape without re-importing from types.
export type { ActivityResponse };
