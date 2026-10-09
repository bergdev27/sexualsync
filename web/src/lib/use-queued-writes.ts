"use client";

import { useEffect, useState } from "react";
import {
  listQueuedWritePreviews,
  OFFLINE_QUEUE_CHANGE_EVENT,
  subscribeOfflineFlush,
  type QueuedWritePreview,
} from "./offline-queue";

/**
 * Live list of writes still waiting in the offline queue for one intent
 * ("ask:create", "chat:send"). Re-reads when the queue changes or a flush
 * finishes, so a "Waiting to send" row disappears once the write lands.
 * `null` until the first read resolves, so callers can tell "not read yet"
 * from "empty".
 */
export function useQueuedWrites(intent: string): QueuedWritePreview[] | null {
  const [items, setItems] = useState<QueuedWritePreview[] | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () => {
      listQueuedWritePreviews(intent)
        .then((next) => {
          if (!alive) return;
          setItems((current) => (current && sameIds(current, next) ? current : next));
        })
        .catch(() => {});
    };
    read();
    window.addEventListener(OFFLINE_QUEUE_CHANGE_EVENT, read);
    const unsubscribe = subscribeOfflineFlush(read);
    return () => {
      alive = false;
      window.removeEventListener(OFFLINE_QUEUE_CHANGE_EVENT, read);
      unsubscribe();
    };
  }, [intent]);

  return items;
}

function sameIds(a: QueuedWritePreview[], b: QueuedWritePreview[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item.id === b[index].id);
}
