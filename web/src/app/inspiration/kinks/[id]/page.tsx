"use client";

export const runtime = "edge";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import { SkeletonList } from "@/components/States";

export default function LegacyKinkDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params.id || "");

  useEffect(() => {
    if (!id) return;
    router.replace(`/inspiration/kink?id=${encodeURIComponent(id)}`);
  }, [id, router]);

  return (
    <AppShell>
      <ScreenHeader variant="bar" back={{ href: "/inspiration", label: "Inspiration" }} title="Kink" />
      <SkeletonList count={3} />
    </AppShell>
  );
}
