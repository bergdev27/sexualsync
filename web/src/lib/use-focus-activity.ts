"use client";

import { type RefObject, useEffect, useRef } from "react";
import { recordKinkFocus, recordShelfFocus } from "@/lib/api";

type FocusResource = "fantasy-backlog" | "shelf";

const SAMPLE_PREFIX = "ss:focus-samples:";
const ROOM_COOLDOWN_PREFIX = "ss:focus-room:";
const ITEM_COOLDOWN_PREFIX = "ss:focus-item:";
const SAMPLE_LIMIT = 24;
const LOCAL_ROOM_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const LOCAL_ITEM_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function useFocusActivity({
  workspaceId,
  entityId,
  resource,
  enabled = true,
  elementRef,
  sampleBucket = "",
  minMs,
  maxMs,
}: {
  workspaceId: string;
  entityId: string;
  resource: FocusResource;
  enabled?: boolean;
  elementRef?: RefObject<Element | null>;
  sampleBucket?: string;
  minMs: number;
  maxMs: number;
}) {
  const sentRef = useRef(false);

  useEffect(() => {
    sentRef.current = false;
    if (!enabled || !workspaceId || !entityId || typeof window === "undefined") return;

    const sampleKey = `${SAMPLE_PREFIX}${resource}:${sampleBucket || "default"}`;
    const roomCooldownKey = `${ROOM_COOLDOWN_PREFIX}${workspaceId}`;
    const itemCooldownKey = `${ITEM_COOLDOWN_PREFIX}${workspaceId}:${resource}:${entityId}`;
    const thresholdMs = focusThreshold(sampleKey, minMs, maxMs);
    const needsElementVisibility = Boolean(elementRef);
    let elementVisible = !needsElementVisibility;
    let accumulatedMs = 0;
    let lastTick = performance.now();
    let sampleWritten = false;
    // Whether the span since lastTick counted as focused. Tracked explicitly
    // because by the time visibilitychange fires the state has already flipped.
    let wasActive = false;
    // One timeout for the remaining focus time instead of a 1 Hz poll; nothing
    // runs while the page is hidden or the element is off screen.
    let timer: number | null = null;

    const target = elementRef?.current || null;
    let observer: IntersectionObserver | null = null;
    if (target && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        settle();
        elementVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.55);
        wasActive = activeNow();
        reschedule();
      }, { threshold: [0, 0.55, 0.8] });
      observer.observe(target);
    } else if (needsElementVisibility) {
      elementVisible = Boolean(target);
    }

    function activeNow() {
      return document.visibilityState === "visible" && elementVisible;
    }

    function settle() {
      const now = performance.now();
      if (wasActive) accumulatedMs += now - lastTick;
      lastTick = now;
      wasActive = activeNow();
    }

    function reschedule() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (sentRef.current || !wasActive) return;
      const remaining = thresholdMs - accumulatedMs;
      if (remaining <= 0) {
        sendFocus();
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        settle();
        if (accumulatedMs >= thresholdMs) sendFocus();
        else reschedule();
      }, remaining + 50);
    }

    function sendFocus() {
      if (sentRef.current) return;
      sentRef.current = true;
      const now = Date.now();
      if (recentAt(roomCooldownKey, now, LOCAL_ROOM_COOLDOWN_MS) || recentAt(itemCooldownKey, now, LOCAL_ITEM_COOLDOWN_MS)) {
        return;
      }
      writeAt(roomCooldownKey, now);
      writeAt(itemCooldownKey, now);

      const payload = { workspaceId, id: entityId };
      const task = resource === "shelf"
        ? recordShelfFocus(payload)
        : recordKinkFocus(payload);
      task.catch(() => {});
    }

    function writeSampleOnce() {
      settle();
      if (sampleWritten) return;
      sampleWritten = true;
      if (accumulatedMs >= 3000) appendSample(sampleKey, accumulatedMs);
    }

    function onVisibilityChange() {
      settle();
      reschedule();
    }

    wasActive = activeNow();
    reschedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", writeSampleOnce);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", writeSampleOnce);
      writeSampleOnce();
    };
  }, [workspaceId, entityId, resource, enabled, elementRef, sampleBucket, minMs, maxMs]);
}

function focusThreshold(sampleKey: string, minMs: number, maxMs: number) {
  const samples = readSamples(sampleKey);
  if (samples.length < 4) return minMs;
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return Math.min(maxMs, Math.max(minMs, average * 1.35));
}

function readSamples(key: string) {
  try {
    const value = window.localStorage.getItem(key);
    const samples = JSON.parse(value || "[]");
    return Array.isArray(samples)
      ? samples.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
      : [];
  } catch {
    return [];
  }
}

function appendSample(key: string, ms: number) {
  try {
    const samples = [...readSamples(key), Math.round(ms)].slice(-SAMPLE_LIMIT);
    window.localStorage.setItem(key, JSON.stringify(samples));
  } catch {}
}

function recentAt(key: string, now: number, cooldownMs: number) {
  const at = readAt(key);
  return at > 0 && now - at < cooldownMs;
}

function readAt(key: string) {
  try {
    return Number(window.localStorage.getItem(key) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeAt(key: string, at: number) {
  try {
    window.localStorage.setItem(key, String(at));
  } catch {}
}
