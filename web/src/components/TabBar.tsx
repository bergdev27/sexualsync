"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ACTIVITY_SUMMARY_EVENT,
  ACTIVITY_SUMMARY_KEY,
  activityTabForResource,
} from "@/lib/activity";
import { LIVE_ROOM_EVENT, type LiveRoomEventDetail } from "@/lib/use-live-room";
import type { ActivityResource } from "@/lib/types";
import RollingNumber from "@/components/RollingNumber";
import { getProfileCached } from "@/lib/profile-cache";

interface Tab {
  href: string;
  label: string;
  activeId: string;
  icon: (active: boolean) => ReactNode;
  match: (path: string) => boolean;
}

const CHAT_UNREAD_KEY = "ss:chat:unread";
const CHAT_UNREAD_EVENT = "sexualsync:chat-unread";

function readChatUnread(): number {
  try {
    return Math.max(0, Number(window.localStorage.getItem(CHAT_UNREAD_KEY)) || 0);
  } catch {
    return 0;
  }
}

function writeChatUnread(count: number) {
  const next = Math.max(0, count);
  try {
    window.localStorage.setItem(CHAT_UNREAD_KEY, String(next));
  } catch {}
  window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: next }));
}

function underRoute(path: string, route: string) {
  return path === route || path.startsWith(`${route}/`);
}

// The five slots (DESIGN.md "Tab bar (v2 target)"): Home · Play · + Ask ·
// Sext · Us. Ask is the centre slot and renders as the raised primary
// action; the other four are plain icon-over-label tabs. Routes keep their
// internal names (/sexboard, /games, /space); only the UI names changed.
const tabs: Tab[] = [
  {
    href: "/sexboard",
    label: "Home",
    activeId: "home",
    icon: (active) => <IconRibbon active={active} />,
    match: (p) => underRoute(p, "/sexboard") || underRoute(p, "/tonight"),
  },
  {
    href: "/games",
    label: "Play",
    activeId: "play",
    icon: (active) => <IconGames active={active} />,
    // Inspiration (and its old /ideas and /shelf aliases) lives inside Play.
    match: (p) => underRoute(p, "/games") || underRoute(p, "/inspiration") || underRoute(p, "/ideas") || underRoute(p, "/shelf"),
  },
  {
    href: "/ask",
    label: "Ask",
    activeId: "ask",
    icon: () => <IconPlus />,
    match: (p) => underRoute(p, "/ask"),
  },
  {
    href: "/chat",
    label: "Sext",
    activeId: "chat",
    icon: (active) => <IconChat active={active} />,
    match: (p) => underRoute(p, "/chat"),
  },
  {
    href: "/space",
    label: "Us",
    activeId: "us",
    icon: (active) => <IconSpace active={active} />,
    match: (p) => underRoute(p, "/space") || underRoute(p, "/limits"),
  },
];

export default function TabBar() {
  const pathname = usePathname() || "";
  const [activitySummary, setActivitySummary] = useState<Partial<Record<ActivityResource, number>>>({});
  const [chatUnread, setChatUnread] = useState(0);
  const onChat = pathname.startsWith("/chat");
  const onChatRef = useRef(onChat);
  useEffect(() => { onChatRef.current = onChat; }, [onChat]);

  // Chat isn't in the activity summary (it's broadcast-only), so track unread
  // from live room events. The count lives in localStorage so it survives the
  // TabBar remount on every navigation (the bar is inside each page's AppShell)
  // and stays in sync across instances via a custom event. Only opening the
  // chat tab clears it; navigating elsewhere preserves it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChatUnread(readChatUnread());
    function onUnread(event: Event) {
      setChatUnread(Number((event as CustomEvent<number>).detail) || 0);
    }
    window.addEventListener(CHAT_UNREAD_EVENT, onUnread);
    return () => window.removeEventListener(CHAT_UNREAD_EVENT, onUnread);
  }, []);

  // Opening the chat tab clears its unread count.
  useEffect(() => {
    if (onChat) writeChatUnread(0);
  }, [onChat]);

  // Count partner messages that arrive while the user is anywhere but the chat
  // tab. Only fires while a room socket is open (the page the user is on
  // subscribes); push notifications cover the rest.
  useEffect(() => {
    function onRoomEvent(event: Event) {
      const detail = (event as CustomEvent<LiveRoomEventDetail>).detail;
      if (detail?.resource === "chat" && detail.action === "message" && !onChatRef.current) {
        writeChatUnread(readChatUnread() + 1);
      }
    }
    window.addEventListener(LIVE_ROOM_EVENT, onRoomEvent);
    return () => window.removeEventListener(LIVE_ROOM_EVENT, onRoomEvent);
  }, []);

  useEffect(() => {
    function applySummary(value: unknown) {
      if (!value || typeof value !== "object") {
        setActivitySummary({});
        return;
      }
      setActivitySummary(value as Partial<Record<ActivityResource, number>>);
    }

    try {
      applySummary(JSON.parse(window.localStorage.getItem(ACTIVITY_SUMMARY_KEY) || "{}"));
    } catch {
      // Hydration-safe reset: server can't reach localStorage; the effect runs
      // only on the client to seed the state from there.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActivitySummary({});
    }

    function onActivitySummary(event: Event) {
      applySummary((event as CustomEvent<Partial<Record<ActivityResource, number>>>).detail);
    }

    window.addEventListener(ACTIVITY_SUMMARY_EVENT, onActivitySummary);
    return () => window.removeEventListener(ACTIVITY_SUMMARY_EVENT, onActivitySummary);
  }, []);

  return (
    <nav className="tabbar safe-bottom" aria-label="Primary">
      <div className="tabbar-inner">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          // Home carries the activity feed, so while you're on it its badge
          // would count rows already in front of you.
          const unread = tab.activeId === "chat"
            ? chatUnread
            : active && tab.activeId === "home" ? 0 : unreadForTab(activitySummary, tab.activeId);
          const primary = tab.activeId === "ask";
          return (
            <Link
              key={tab.activeId}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              data-tab={tab.activeId}
              className={`tab pressable ${primary ? "tab-primary" : ""} ${active ? "is-active" : ""} ${unread ? "has-unread" : ""}`}
              onPointerEnter={() => { void getProfileCached(); }}
              onFocus={() => { void getProfileCached(); }}
            >
              <span className="tab-icon" aria-hidden="true">{tab.icon(active)}</span>
              <span className="tab-label">{tab.label}</span>
              {unread ? (
                <>
                  <span className="tab-unread-dot" aria-hidden="true"><RollingNumber value={unread} max={9} /></span>
                  <span className="sr-only">{unread} unread</span>
                </>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function unreadForTab(summary: Partial<Record<ActivityResource, number>>, tabId: string) {
  return (Object.entries(summary) as Array<[ActivityResource, number]>).reduce((total, [resource, count]) => {
    return activityTabForResource(resource) === tabId ? total + Number(count || 0) : total;
  }, 0);
}

function IconRibbon({ active }: { active: boolean }) {
  // The infinity ribbon is the brand motif (it echoes the hero wave). Its path
  // only uses the middle band of a 100x60 box, so the old 22x14 render came out
  // as a thin shape that floated above the other 20px glyphs. Crop the viewBox to
  // the ribbon's content (6 14 88 32) and render it ~18px tall so it sits at the
  // same height and baseline as every other tab icon.
  return (
    <svg width="31" height="18" viewBox="6 14 88 32" fill="none">
      <path
        d="M14 30 C 14 14, 40 14, 50 30 C 60 46, 86 46, 86 30 C 86 14, 60 14, 50 30 C 40 46, 14 46, 14 30 Z"
        stroke="currentColor"
        strokeWidth={active ? 3.6 : 2.9}
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPlus() {
  // The centre Ask slot: a plus drawn in ink on the rose disc (the disc is the
  // .tab-icon box itself, styled in globals.css under .tab-primary).
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function IconChat({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M4.5 6.5c0-1.1.9-2 2-2h11c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2H9l-3.5 3v-3h-1c-1.1 0-2-.9-2-2Z"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.16 : 0}
      />
    </svg>
  );
}

function IconGames({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect
        x="3.5"
        y="5.5"
        width="14"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.14 : 0}
        transform="rotate(-8 10.5 12)"
      />
      <rect
        x="7.5"
        y="4.5"
        width="14"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.18 : 0}
        transform="rotate(6 14.5 11)"
      />
    </svg>
  );
}

function IconSpace({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle
        cx="9"
        cy="12"
        r="4.5"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.18 : 0}
      />
      <circle cx="15" cy="12" r="4.5" stroke="currentColor" strokeWidth={active ? 1.7 : 1.4} />
    </svg>
  );
}
