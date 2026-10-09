"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LiveRoomContext, LiveRoomHub } from "@/lib/use-live-room";

/**
 * Owns the one live-room socket for the whole app. It sits in the root layout,
 * above every route, so navigating between screens keeps the same connection;
 * screens subscribe with useLiveRoomReload().
 */
export default function LiveRoomProvider({ children }: { children: ReactNode }) {
  const [hub] = useState(() => new LiveRoomHub());
  useEffect(() => () => hub.dispose(), [hub]);
  return <LiveRoomContext.Provider value={hub}>{children}</LiveRoomContext.Provider>;
}
