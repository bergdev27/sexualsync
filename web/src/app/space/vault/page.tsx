"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, ErrorState, LoadErrorState, SkeletonList } from "@/components/States";
import { ApiUnauthorizedError, getProfile, getVault } from "@/lib/api";
import type {
  AuthInfo,
  ProfileResponse,
  VaultResponse,
  Workspace,
} from "@/lib/types";
import { useLiveRoomReload } from "@/lib/use-live-room";
import { useQueryParam } from "@/lib/use-query-param";
import { getCachedResource, setCachedResource, useColdStart } from "@/lib/resource-cache";
import { VaultComposer } from "./_VaultComposer";
import "./vault.css";

// Code-split the Vault clip card: it transitively pulls in the E2EE
// vault-crypto pipeline and both full-screen lightboxes, none of which are
// needed until the list actually has clips to render. ssr:false because the
// card decrypts blobs against browser-only Web Crypto + object URLs.
const VaultCard = dynamic(() => import("./_VaultCard").then((m) => m.VaultCard), {
  ssr: false,
  loading: () => <div className="vault-card vault-card-placeholder enter-rise" aria-hidden="true" />,
});

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; error?: unknown }
  | { kind: "unauthorized" }
  | { kind: "no-workspace"; auth: AuthInfo }
  | {
      kind: "ready";
      auth: AuthInfo;
      workspace: Workspace;
      vault: VaultResponse;
    };




export default function VaultPage() {
  const [state, setState] = useState<LoadState>(() => getCachedResource<LoadState>("vault") ?? { kind: "loading" });
  useColdStart("vault", setState);
  useEffect(() => { if (state.kind === "ready") setCachedResource("vault", state); }, [state]);
  const highlightedItemId = useQueryParam("item");
  const highlightedFromActivity = useQueryParam("activity") === "1";

  async function reload() {
    const profile: ProfileResponse = await getProfile();
    if (!profile.activeWorkspace) {
      setState({ kind: "no-workspace", auth: profile.auth });
      return;
    }
    const vault = await getVault(profile.activeWorkspace.id);
    setState({ kind: "ready", auth: profile.auth, workspace: profile.activeWorkspace, vault });
  }

  async function retry() {
    try {
      await reload();
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        setState({ kind: "unauthorized" });
        return;
      }
      setState((current) => (current.kind === "ready"
        ? current
        : { kind: "error", message: error instanceof Error ? error.message : "", error }));
    }
  }

  function applyVaultResponse(vault: VaultResponse) {
    setState((current) => current.kind === "ready" ? { ...current, vault } : current);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile: ProfileResponse = await getProfile();
        if (cancelled) return;
        if (!profile.activeWorkspace) {
          setState({ kind: "no-workspace", auth: profile.auth });
          return;
        }
        const vault = await getVault(profile.activeWorkspace.id);
        if (cancelled) return;
        setState({ kind: "ready", auth: profile.auth, workspace: profile.activeWorkspace, vault });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized" });
          return;
        }
        setState((current) => (current.kind === "ready"
          ? current
          : { kind: "error", message: error instanceof Error ? error.message : "", error }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell>
      <ScreenHeader
        back={{ href: "/space", label: "Us" }}
        showBrand={false}
        title="Private Vault"
        subtitle="Encrypted clips, saved moments, reactions and comments, just for the two of you."
      />
      <Body
        state={state}
        onReload={reload}
        onRetry={retry}
        onVaultChange={applyVaultResponse}
        highlightedItemId={highlightedItemId}
        highlightedFromActivity={highlightedFromActivity}
      />
    </AppShell>
  );
}

function Body({
  state,
  onReload,
  onRetry,
  onVaultChange,
  highlightedItemId,
  highlightedFromActivity,
}: {
  state: LoadState;
  onReload: () => Promise<void>;
  onRetry: () => Promise<void>;
  onVaultChange: (vault: VaultResponse) => void;
  highlightedItemId: string;
  highlightedFromActivity: boolean;
}) {
  if (state.kind === "loading") return <SkeletonList count={3} />;
  if (state.kind === "unauthorized") {
    return (
      <ErrorState
        title="Couldn't confirm your session"
        body="Reconnect Google and come back to Vault."
        action={<a className="btn-primary pressable" href="/api/auth/google?returnTo=%2Fspace%2Fvault">Reconnect</a>}
      />
    );
  }
  if (state.kind === "error") return <LoadErrorState what="your Vault" error={state.error ?? state.message} onRetry={onRetry} />;
  if (state.kind === "no-workspace") {
    return (
      <ErrorState
        title="No partner space yet"
        body="Vault needs an active partner space."
        action={<Link href="/space" className="btn-primary pressable">Open Us</Link>}
      />
    );
  }

  return (
    <VaultReady
      state={state}
      onReload={onReload}
      onVaultChange={onVaultChange}
      highlightedItemId={highlightedItemId}
      highlightedFromActivity={highlightedFromActivity}
    />
  );
}

function VaultReady({
  state,
  onReload,
  onVaultChange,
  highlightedItemId,
  highlightedFromActivity,
}: {
  state: Extract<LoadState, { kind: "ready" }>;
  onReload: () => Promise<void>;
  onVaultChange: (vault: VaultResponse) => void;
  highlightedItemId: string;
  highlightedFromActivity: boolean;
}) {
  useLiveRoomReload({
    workspaceId: state.workspace.id,
    actorEmail: state.auth.email,
    resources: ["vault"],
    onReload,
  });

  return (
    <div className="vault-stage">
      <VaultComposer workspaceId={state.workspace.id} onVaultChange={onVaultChange} />

      <section className="vault-section">
        <p className="eyebrow">Vault clips · <em>{state.vault.items.length}</em></p>
        {state.vault.items.length ? (
          <div className="vault-list">
            {state.vault.items.map((item) => (
              <VaultCard
                key={item.id}
                item={item}
                workspaceId={state.workspace.id}
                catalog={state.vault.reactionCatalog}
                me={state.auth.email}
                onVaultChange={onVaultChange}
                highlighted={highlightedItemId === item.id}
                highlightedFromActivity={highlightedFromActivity && highlightedItemId === item.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing in Vault yet"
            body="Add a short encrypted clip when there is something private worth keeping between you two."
          />
        )}
      </section>
    </div>
  );
}

