import { test, expect } from "@playwright/test";

const workspace = {
  id: "mobile-room",
  name: "Mobile Room",
  displayName: "Alex & Jordan",
  createdAt: "2026-05-23T00:00:00.000Z",
  updatedAt: "2026-05-23T00:00:00.000Z",
  status: "active",
  productMode: "couples",
  settings: {},
  deletion: null,
  members: [
    { email: "alex@example.test", displayName: "Alex", role: "owner", status: "active", joinedAt: "2026-05-23T00:00:00.000Z" },
    { email: "jordan@example.test", displayName: "Jordan", role: "partner", status: "active", joinedAt: "2026-05-23T00:00:00.000Z" },
  ],
};

const auth = {
  email: "alex@example.test",
  person: "Alex",
  isKnownCoupleMember: true,
  provider: "test",
};

const request = {
  id: "req-1",
  workspaceId: workspace.id,
  status: "sent",
  requester: "Jordan",
  reviewer: "Alex",
  requesterEmail: "jordan@example.test",
  reviewerEmail: "alex@example.test",
  requesterName: "Jordan",
  reviewerName: "Alex",
  categories: ["Kiss"],
  timing: "Tonight",
  filming: "No",
  decisions: [],
  counters: [],
  boundaryConflicts: [],
  note: "Slow and close.",
  feedback: "",
  createdAt: "2026-05-23T00:00:00.000Z",
  updatedAt: "2026-05-23T00:05:00.000Z",
  sentAt: "2026-05-23T00:05:00.000Z",
};

const counterDecisions = [
  {
    label: "Counter option 1",
    decision: "Counter",
    counter: "💆 Sensual massage",
    counterActId: "built-in-0-sensual-massage",
    note: "",
    targetType: "act",
    actId: "",
  },
  {
    label: "Timing: Tonight",
    decision: "Counter",
    counter: "Tomorrow",
    counterActId: "",
    note: "",
    targetType: "timing",
    actId: "",
  },
];

const counteredRequest = {
  ...request,
  status: "reviewed",
  requester: "Alex",
  reviewer: "Jordan",
  requesterEmail: "alex@example.test",
  reviewerEmail: "jordan@example.test",
  requesterName: "Alex",
  reviewerName: "Jordan",
  decisions: counterDecisions,
  counters: counterDecisions,
  updatedAt: "2026-05-23T00:20:00.000Z",
  reviewedAt: "2026-05-23T00:20:00.000Z",
};

function isoForLocalDaysAgo(days, hour = 20, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const kink = {
  id: "kink-1",
  workspaceId: workspace.id,
  text: "Try the hotel window fantasy.",
  addedByEmail: "jordan@example.test",
  addedByName: "Jordan",
  note: "",
  notes: {},
  comments: [],
  reactions: [],
  statusHistory: [],
  createdAt: "2026-05-23T00:00:00.000Z",
  updatedAt: "2026-05-23T00:00:00.000Z",
};

const shelfItem = {
  id: "shelf-1",
  type: "story",
  source: "url",
  sourceLabel: "Source",
  sourceUrl: "https://example.test/hot",
  embedUrl: "",
  posterUrl: "",
  videoHdUrl: "",
  videoSdUrl: "",
  passageText: "",
  title: "Saved source",
  addedByEmail: "jordan@example.test",
  addedByName: "Jordan",
  addedAt: "2026-05-23T00:00:00.000Z",
  reactions: {},
};

const shelfReactionCatalog = [
  { id: "think", emoji: "👀", label: "Curious", tone: "maybe", caption: "{name} is curious." },
  { id: "fire", emoji: "🔥", label: "Hot", tone: "yes", caption: "{name} says hot." },
  { id: "pass", emoji: "✕", label: "Pass", tone: "pass", caption: "Not {name}'s vibe." },
];

const savedLibraryAct = {
  id: "act-slow-undressing",
  workspaceId: workspace.id,
  label: "Slow undressing",
  icon: "",
  tags: ["soft"],
  comfort: {},
  source: "custom",
  addedByEmail: "alex@example.test",
  addedByName: "Alex",
  approvedByEmail: "",
  approvedByName: "",
  createdAt: "2026-05-23T00:00:00.000Z",
  updatedAt: "2026-05-23T00:00:00.000Z",
};

const activityResponse = {
  workspaceId: workspace.id,
  unreadTotal: 1,
  unreadByResource: { "request-board": 1 },
  readState: { all: "", resources: {} },
  items: [
    {
      id: "ask-activity",
      workspaceId: workspace.id,
      resource: "request-board",
      resourceLabel: "Sexboard",
      action: "sent",
      label: "New Ask landed",
      entityId: "req-1",
      actorEmail: "jordan@example.test",
      actorName: "Jordan",
      at: "2026-05-23T00:10:00.000Z",
      passive: false,
      unread: true,
    },
    {
      id: "shelf:revealed:shelf-1:partner:2026-05-23",
      workspaceId: workspace.id,
      resource: "shelf",
      resourceLabel: "Shelf",
      action: "revealed",
      label: "Opened a Shelf save",
      entityId: "shelf-1",
      actorEmail: "jordan@example.test",
      actorName: "Jordan",
      at: "2026-05-23T00:09:00.000Z",
      passive: true,
      unread: false,
    },
    {
      id: "pile-drop-2",
      workspaceId: workspace.id,
      resource: "pile",
      resourceLabel: "Pile",
      action: "dropped",
      label: "Pile changed",
      entityId: "",
      actorEmail: "jordan@example.test",
      actorName: "Jordan",
      at: "2026-05-23T00:08:00.000Z",
      passive: false,
      unread: false,
    },
    {
      id: "pile-drop-1",
      workspaceId: workspace.id,
      resource: "pile",
      resourceLabel: "Pile",
      action: "undropped",
      label: "Pile changed",
      entityId: "",
      actorEmail: "jordan@example.test",
      actorName: "Jordan",
      at: "2026-05-23T00:07:00.000Z",
      passive: false,
      unread: false,
    },
  ],
};

const chatSeedMessages = [
  {
    id: "chat-1",
    seq: 1,
    email: "jordan@example.test",
    name: "Jordan",
    text: "Hold this message",
    at: "2026-05-23T00:12:00.000Z",
    reactions: [],
  },
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function recomputeActivityUnread(activity) {
  activity.unreadTotal = 0;
  activity.unreadByResource = {};
  for (const item of activity.items || []) {
    if (!item.unread) continue;
    activity.unreadTotal += 1;
    activity.unreadByResource[item.resource] = (activity.unreadByResource[item.resource] || 0) + 1;
  }
  return activity;
}

const activePile = {
  revealAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  startedAt: "2026-05-23T00:00:00.000Z",
  startedByEmail: "alex@example.test",
  isRevealed: false,
  mine: ["Kiss"],
  maxDropCount: 3,
  targetDropCount: 3,
  targetMaxDropCount: 6,
  actPoolCount: 19,
  counts: { Kiss: 1 },
  partnerHasDropped: true,
  partnerLabels: null,
  overlap: null,
  onlyMine: null,
  onlyTheirs: null,
  revealNarration: "",
};

const revealedPile = {
  ...activePile,
  isRevealed: true,
  mine: ["🍆 Penetration", "💋 Mutual oral", "⛓️ Light restraint", "Dirty talk", "Slow positions", "Couch", "Toys", "Standing"],
  partnerLabels: {
    "jordan@example.test": ["🍆 Penetration", "Sensual massage", "From behind", "On Top", "Roleplay", "Face sitting", "Cuddling", "Cowgirl"],
  },
  overlap: ["🍆 Penetration"],
  onlyMine: ["💋 Mutual oral", "⛓️ Light restraint", "Dirty talk", "Slow positions", "Couch", "Toys", "Standing"],
  onlyTheirs: ["Sensual massage", "From behind", "On Top", "Roleplay", "Face sitting", "Cuddling", "Cowgirl"],
  revealNarration: "Tonight Alex penetrates Jordan.",
};

const archivedBlindReveal = {
  id: "blind-closed-1",
  workspaceId: workspace.id,
  prompt: "What should we admit after midnight?",
  status: "archived",
  createdAt: "2026-05-23T00:00:00.000Z",
  updatedAt: "2026-05-23T00:12:00.000Z",
  revealedAt: "2026-05-23T00:08:00.000Z",
  archivedAt: "2026-05-23T00:12:00.000Z",
  requiredCount: 2,
  submittedCount: 2,
  mySubmitted: true,
  partnerSubmitted: true,
  myEntry: {
    email: "alex@example.test",
    name: "Alex",
    text: "I want the hotel fantasy again.",
    promotedIdeaId: "",
    createdAt: "2026-05-23T00:01:00.000Z",
    updatedAt: "2026-05-23T00:01:00.000Z",
  },
  entries: [
    {
      email: "alex@example.test",
      name: "Alex",
      text: "I want the hotel fantasy again.",
      promotedIdeaId: "",
      createdAt: "2026-05-23T00:01:00.000Z",
      updatedAt: "2026-05-23T00:01:00.000Z",
    },
    {
      email: "jordan@example.test",
      name: "Jordan",
      text: "I want the same thing, slower.",
      promotedIdeaId: "",
      createdAt: "2026-05-23T00:02:00.000Z",
      updatedAt: "2026-05-23T00:02:00.000Z",
    },
  ],
};

const healthResponse = {
  workspaceId: workspace.id,
  range: { id: "30d", label: "Last 30 days", from: "2026-04-24T00:00:00.000Z", to: "2026-05-23T23:59:59.000Z" },
  totals: { sexEvents: 9, sexActs: 26, uniqueActs: 12, askEvents: 5, pileEvents: 4 },
  rhythm: [
    { date: "2026-05-02", sexEvents: 1, sexActs: 2, askEvents: 1, pileEvents: 0 },
    { date: "2026-05-07", sexEvents: 2, sexActs: 6, askEvents: 1, pileEvents: 1 },
    { date: "2026-05-13", sexEvents: 1, sexActs: 3, askEvents: 0, pileEvents: 1 },
    { date: "2026-05-18", sexEvents: 3, sexActs: 9, askEvents: 2, pileEvents: 1 },
    { date: "2026-05-22", sexEvents: 2, sexActs: 6, askEvents: 1, pileEvents: 1 },
  ],
  topActs: [
    { label: "Slow kissing", count: 6, askCount: 3, pileCount: 3, firstSeenAt: "2026-05-02T22:10:00.000Z", lastSeenAt: "2026-05-22T22:10:00.000Z" },
    { label: "Shower sex", count: 5, askCount: 2, pileCount: 3, firstSeenAt: "2026-05-07T22:10:00.000Z", lastSeenAt: "2026-05-22T22:10:00.000Z" },
    { label: "Oral with eye contact", count: 4, askCount: 3, pileCount: 1, firstSeenAt: "2026-05-13T22:10:00.000Z", lastSeenAt: "2026-05-18T22:10:00.000Z" },
    { label: "Hands pinned over head", count: 3, askCount: 1, pileCount: 2, firstSeenAt: "2026-05-18T22:10:00.000Z", lastSeenAt: "2026-05-22T22:10:00.000Z" },
    { label: "Very long teasing name that should still truncate cleanly", count: 2, askCount: 2, pileCount: 0, firstSeenAt: "2026-05-18T22:10:00.000Z", lastSeenAt: "2026-05-18T22:10:00.000Z" },
  ],
  events: [
    { id: "ask:req-1", type: "ask", sourceId: "req-1", sourceHref: "/ask-detail?id=req-1", title: "Tonight after dinner", at: "2026-05-22T22:10:00.000Z", requester: "Jordan", acts: ["Slow kissing", "Shower sex", "Oral with eye contact", "Filming = yes"], actSummaries: [{ label: "Slow kissing", emoji: "💋" }, { label: "Shower sex", emoji: "🚿" }, { label: "Oral with eye contact", emoji: "👅" }, { label: "Filming = yes", emoji: "📹" }] },
    { id: "pile:pile-4", type: "pile", sourceId: "pile-4", sourceHref: "/games/pile", title: "Pile overlap", at: "2026-05-22T22:05:00.000Z", requester: "Both", acts: ["Slow kissing", "Shower sex", "Hands pinned over head"], actSummaries: [{ label: "Slow kissing", emoji: "💋" }, { label: "Shower sex", emoji: "🚿" }, { label: "Hands pinned over head", emoji: "⛓️" }] },
    { id: "ask:req-2", type: "ask", sourceId: "req-2", sourceHref: "/ask-detail?id=req-2", title: "Long source history title that needs graceful truncation on the narrow phone surface", at: "2026-05-18T23:30:00.000Z", requester: "Alex", acts: ["Slow kissing", "Hands pinned over head"], actSummaries: [{ label: "Slow kissing", emoji: "💋" }, { label: "Hands pinned over head", emoji: "⛓️" }] },
  ],
  insights: {
    daysSinceLast: 1,
    requesterSplit: [{ label: "Jordan", count: 3 }, { label: "Alex", count: 2 }],
    sourceSplit: [{ label: "Ask", count: 5 }, { label: "Pile", count: 4 }],
    newActs: [
      { label: "Shower sex", count: 1, askCount: 0, pileCount: 1, firstSeenAt: "2026-05-22T22:05:00.000Z", lastSeenAt: "2026-05-22T22:05:00.000Z" },
      { label: "Hands pinned over head", count: 1, askCount: 1, pileCount: 0, firstSeenAt: "2026-05-18T23:30:00.000Z", lastSeenAt: "2026-05-18T23:30:00.000Z" },
    ],
  },
};

async function mockApi(page, state = {}) {
  const activity = state.activity || cloneJson(activityResponse);
  state.activity = activity;

  // RoomEncryptionGate (web/src/components/RoomEncryptionGate.tsx) reauths on
  // launch: any protected route (/space, /sexboard, /games, …) redirects to
  // /api/auth/logout unless the browser session is already launch-authenticated.
  // Real sign-in sets the (non-HttpOnly) sxs-launch cookie in
  // functions/api/_app_session.js, which the gate consumes into this
  // sessionStorage flag (ss:auth:launch-ok — see web/src/lib/launch-auth.ts).
  // These specs navigate straight to protected routes without signing in, so
  // seed the flag to mirror a post-auth session; otherwise the gate bounces
  // every page to /signed-out and the content assertions never resolve.
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem("ss:auth:launch-ok", "1");
    } catch {
      // sessionStorage can be blocked in some webviews; nothing else to do here.
    }
  });

  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathname = requestUrl.pathname;
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (requestUrl.hostname.endsWith("bellesa.co") && pathname.startsWith("/api/rest/v1/videos/")) {
      const id = pathname.split("/").filter(Boolean).pop();
      const video = state.bellesaVideos?.[id] || state.bellesaVideo;
      return video ? json(video) : json({ error: "Not found." }, 404);
    }

    if (pathname === "/api/auth/logout") {
      return route.fulfill({
        status: 303,
        headers: {
          location: "/signed-out",
          "set-cookie": "sxs-session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax; HttpOnly",
        },
      });
    }
    if (pathname === "/api/auth/google") {
      state.googleAuthAttempts = (state.googleAuthAttempts || 0) + 1;
      return route.fulfill({
        status: 302,
        headers: { location: "/sexboard" },
      });
    }
    if (pathname === "/api/auth/pwa-handoff" && method === "POST") {
      const body = route.request().postDataJSON();
      state.pwaHandoffActions = [...(state.pwaHandoffActions || []), body];
      if (body.action === "start") {
        if (state.pwaHandoffStartStatus) {
          const status = state.pwaHandoffStartStatus;
          return route.fulfill({
            status,
            contentType: "application/json",
            headers: state.pwaHandoffStartRetryAfter ? { "retry-after": String(state.pwaHandoffStartRetryAfter) } : {},
            body: JSON.stringify({ error: status === 429 ? "Too many attempts. Try again soon." : "Something went wrong." }),
          });
        }
        return json({
          ok: true,
          id: "handoff-test",
          secret: "handoff-secret",
          expiresAt: Date.now() + (10 * 60 * 1000),
          returnTo: body.returnTo || "/sexboard",
        }, 201);
      }
      if (body.action === "redeem") {
        if (state.pwaHandoffRedeemAbortOnce) {
          // The server consumed the handoff and set the session, but iOS
          // suspended the app and the response never arrived.
          state.pwaHandoffRedeemAbortOnce = false;
          state.pwaHandoffRedeemStatus = 400;
          state.bootstrapUnauthorized = false;
          return route.abort("failed");
        }
        const redeemStatus = state.pwaHandoffRedeemStatus || 202;
        if (redeemStatus === 400) {
          return json({ error: "This reconnect request is invalid or expired." }, 400);
        }
        if (redeemStatus === 200) {
          return json({ ok: true, returnTo: body.returnTo || "/sexboard", provider: "google" });
        }
        if (redeemStatus === 202) return json({ ok: true, pending: true }, 202);
        return route.fulfill({
          status: redeemStatus,
          contentType: "application/json",
          headers: { "retry-after": "1" },
          body: JSON.stringify({ error: "Too many attempts. Try again soon." }),
        });
      }
      return json({ ok: true, approved: true });
    }
    if (pathname === "/api/config") {
      return json({
        appVersion: "test",
        googleAuthEnabled: true,
        sentryDsn: "",
        vapidPublicKey: "BEl6Ww",
      });
    }
    if (pathname === "/api/green-lights" && state.greenLightsFull) {
      return json(state.greenLightsFull);
    }
    if (pathname === "/api/sex-quiz" && state.sexQuizFull) {
      if (method === "POST") {
        const body = route.request().postDataJSON();
        state.sexQuizSubmits = [...(state.sexQuizSubmits || []), body];
        state.sexQuizFull = { ...state.sexQuizFull, myRatings: body.ratings, myTopPicks: body.topPicks || [], mySubmitted: true };
      }
      return json(state.sexQuizFull);
    }
    if (pathname === "/api/profile") {
      if (method === "POST") {
        const body = route.request().postDataJSON();
        state.profilePatchBody = body;
        if (body.action === "update_workspace" && body.displayName) {
          state.workspace = {
            ...(state.workspace || workspace),
            displayName: body.displayName,
            updatedAt: "2026-05-23T00:30:00.000Z",
          };
        }
      }
      const currentWorkspace = state.workspace || workspace;
      return json({
        profile: { id: "profile-ans", email: auth.email, displayName: "Alex", avatarUrl: "", createdAt: "", updatedAt: "", settings: { defaultWorkspaceId: workspace.id } },
        workspaces: [currentWorkspace],
        activeWorkspaceId: currentWorkspace.id,
        activeWorkspace: currentWorkspace,
        pendingInvites: [],
        auth,
        app: { name: "Sexualsync", knownLegacyPeople: {} },
      });
    }
    if (pathname === "/api/bootstrap") {
      state.bootstrapCalls = (state.bootstrapCalls || 0) + 1;
      if (state.bootstrapUnauthorized) {
        return json({ error: "Sign in to continue." }, 401);
      }
      const boardRequest = state.request || request;
      const currentWorkspace = state.workspace || workspace;
      return json({
        profile: { id: "profile-ans", email: auth.email, displayName: "Avery", avatarUrl: "", createdAt: "", updatedAt: "", settings: { defaultWorkspaceId: workspace.id } },
        workspaces: [currentWorkspace],
        activeWorkspaceId: currentWorkspace.id,
        activeWorkspace: currentWorkspace,
        pendingInvites: [],
        auth,
        app: { name: "Sexualsync", knownLegacyPeople: {} },
        bootstrap: {
          workspaceId: workspace.id,
          requests: { workspaceId: workspace.id, requests: [boardRequest], activeRequests: [boardRequest], history: [] },
          fantasy: state.fantasy || { workspaceId: workspace.id, reactionCatalog: [], ideas: [kink], graveyard: [] },
          boundaries: { workspaceId: workspace.id, boundaries: [] },
          acts: { workspaceId: workspace.id, acts: cloneJson(state.acts || []) },
        },
      });
    }
    if (pathname === "/api/request-board") {
      const boardRequest = state.request || request;
      const activeRequests = ["completed", "archived", "expired"].includes(boardRequest.status) ? [] : [boardRequest];
      const history = ["completed", "archived", "expired"].includes(boardRequest.status) ? [boardRequest] : [];
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        state.requestCreateBody = body;
        if (state.delayRequestBoardPostMs) await new Promise((resolve) => setTimeout(resolve, state.delayRequestBoardPostMs));
        state.request = {
          ...boardRequest,
          status: "pending",
          requesterEmail: body.requesterEmail || auth.email,
          reviewerEmail: body.reviewerEmail || "jordan@example.test",
          categories: body.categories || boardRequest.categories,
          timing: body.timing || boardRequest.timing,
          filming: body.filming || boardRequest.filming,
          note: body.note || "",
          updatedAt: "2026-05-23T00:30:00.000Z",
          sentAt: "2026-05-23T00:30:00.000Z",
        };
        const updatedRequest = state.request;
        return json({ workspaceId: workspace.id, request: updatedRequest, requests: [updatedRequest], activeRequests: [updatedRequest], history: [] });
      }
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        state.requestActionBody = body;
        if (body.action === "reply") {
          state.requestReplyBody = body;
          state.request = { ...boardRequest, status: "reviewed", decisions: body.decisions || [], counters: (body.decisions || []).filter((item) => item.counter) };
        } else if (body.action === "maybe") {
          state.request = {
            ...boardRequest,
            status: "maybe",
            maybeAt: "2026-05-23T00:20:00.000Z",
            maybeByEmail: auth.email,
            maybeByName: auth.person,
          };
        } else if (body.action === "accept_counter") {
          state.request = {
            ...boardRequest,
            status: "on_deck",
            categories: ["💆 Sensual massage"],
            timing: "Tomorrow",
            counterAcceptedAt: "2026-05-23T00:25:00.000Z",
            acceptedCounters: boardRequest.counters || [],
          };
        } else if (body.action === "plan") {
          state.requestPlanBody = body;
          const { plannedFor: _plannedFor, plannedAt: _plannedAt, plannedByEmail: _plannedByEmail, plannedByName: _plannedByName, ...unplanned } = boardRequest;
          state.request = body.plannedFor
            ? {
                ...unplanned,
                plannedFor: body.plannedFor,
                plannedAt: "2026-05-23T00:40:00.000Z",
                plannedByEmail: auth.email,
                plannedByName: auth.person,
              }
            : unplanned;
        } else if (body.action === "pass") {
          state.request = {
            ...boardRequest,
            status: "archived",
            passedAt: "2026-05-23T00:35:00.000Z",
            passedByEmail: auth.email,
            passedByName: auth.person,
            archivedAt: "2026-05-23T00:35:00.000Z",
            archivedByEmail: auth.email,
            archivedByName: auth.person,
          };
        }
        const updatedRequest = state.request || boardRequest;
        const nextActiveRequests = ["completed", "archived", "expired"].includes(updatedRequest.status) ? [] : [updatedRequest];
        const nextHistory = ["completed", "archived", "expired"].includes(updatedRequest.status) ? [updatedRequest] : [];
        return json({ workspaceId: workspace.id, request: updatedRequest, requests: [updatedRequest], activeRequests: nextActiveRequests, history: nextHistory });
      }
      return json({ workspaceId: workspace.id, requests: [boardRequest], activeRequests, history });
    }
    if (pathname === "/api/review-token") {
      const body = route.request().postDataJSON();
      const boardRequest = state.request || request;
      if (body.action === "resolve") {
        return json({
          token: { expiresAt: "2026-05-30T00:00:00.000Z", workspaceId: workspace.id, requestId: request.id },
          request: boardRequest,
          workspace: {
            id: workspace.id,
            displayName: workspace.displayName,
            members: workspace.members.map((member) => ({ email: member.email, displayName: member.displayName })),
          },
        });
      }
      state.reviewSubmitBody = body;
      return json({
        request: { ...boardRequest, status: "reviewed", decisions: body.decisions || [] },
        token: { expiresAt: "2026-05-30T00:00:00.000Z", consumedAt: "2026-05-23T00:20:00.000Z" },
      });
    }
    if (pathname === "/api/sexboard") {
      const boardRequest = state.request || request;
      const activeRequests = ["completed", "archived", "expired"].includes(boardRequest.status) ? [] : [boardRequest];
      const history = ["completed", "archived", "expired"].includes(boardRequest.status) ? [boardRequest] : [];
      return json({
        profile: { id: "profile-ans", email: auth.email, displayName: "Alex", avatarUrl: "", createdAt: "", updatedAt: "", settings: { defaultWorkspaceId: workspace.id } },
        workspaces: [workspace],
        activeWorkspaceId: workspace.id,
        activeWorkspace: workspace,
        pendingInvites: [],
        auth,
        app: { name: "Sexualsync", knownLegacyPeople: {} },
        sexboard: {
          workspaceId: workspace.id,
          board: { workspaceId: workspace.id, requests: [boardRequest], activeRequests, history },
          pile: state.pile || null,
          pileSessions: state.pileSessions || [],
          blindReveal: state.blindReveal || null,
          blindReveals: state.blindReveals || [],
          fantasy: state.fantasy || { workspaceId: workspace.id, reactionCatalog: [], ideas: [], graveyard: [] },
          presence: {
            me: { email: auth.email, lastSeen: "2026-05-23T00:11:00.000Z", displayName: "Alex" },
            partner: { email: "jordan@example.test", lastSeen: new Date().toISOString(), displayName: "Jordan" },
            daysInSync: 2,
          },
          activity,
          sexQuiz: state.sexQuiz || null,
          greenLights: state.greenLights || null,
        },
      });
    }
    if (pathname === "/api/pile") {
      return json({ pile: state.pile || null, sessions: state.pileSessions || [] });
    }
    if (pathname === "/api/approved-acts") {
      if (state.delayApprovedActsMs) await new Promise((resolve) => setTimeout(resolve, state.delayApprovedActsMs));
      return json({ workspaceId: workspace.id, acts: cloneJson(state.acts || []) });
    }
    if (pathname === "/api/blind-reveals") {
      return json({ workspaceId: workspace.id, activeReveal: state.blindReveal || null, reveals: state.blindReveals || [] });
    }
    if (pathname === "/api/dashboard/health") {
      return json(state.health || healthResponse);
    }
    if (pathname === "/api/space/presence") {
      return json({
        me: { email: auth.email, lastSeen: "2026-05-23T00:11:00.000Z", displayName: "Alex" },
        partner: { email: "jordan@example.test", lastSeen: new Date().toISOString(), displayName: "Jordan" },
        daysInSync: 2,
      });
    }
    if (pathname === "/api/push-subscribe") {
      state.pushSubscribeBody = route.request().postDataJSON();
      return json({ ok: true });
    }
    if (pathname === "/api/push-test") {
      state.pushTestBody = route.request().postDataJSON();
      return json({ ok: true });
    }
    if (pathname === "/api/activity") {
      if (method !== "GET") {
        const body = route.request().postDataJSON();
        if (body.action === "mark_read") {
          activity.readState.all = new Date().toISOString();
          for (const item of activity.items) {
            if (!body.resource || item.resource === body.resource) item.unread = false;
          }
          recomputeActivityUnread(activity);
        }
        if (body.action === "dismiss") {
          const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
          activity.items = activity.items.filter((item) => !ids.has(item.id));
          activity.readState.dismissed = Array.from(new Set([
            ...(activity.readState.dismissed || []),
            ...ids,
          ]));
          recomputeActivityUnread(activity);
        }
        if (body.action === "clear") {
          activity.readState.all = new Date().toISOString();
          activity.readState.dismissed = Array.from(new Set([
            ...(activity.readState.dismissed || []),
            ...activity.items.map((item) => item.id),
          ]));
          activity.items = [];
          recomputeActivityUnread(activity);
        }
      }
      return json(activity);
    }
    if (pathname === "/api/chat") {
      state.chatMessages = state.chatMessages || cloneJson(chatSeedMessages);
      state.chatReadCursors = state.chatReadCursors || {};
      state.chatReadAt = state.chatReadAt || {};

      if (method === "GET") {
        const after = Number(requestUrl.searchParams.get("after") || 0);
        const messages = after > 0
          ? state.chatMessages.filter((message) => Number(message.seq) > after)
          : state.chatMessages;
        return json({
          workspaceId: workspace.id,
          messages,
          readCursors: state.chatReadCursors,
          readAt: state.chatReadAt,
        });
      }

      const body = route.request().postDataJSON();
      if (method === "PATCH") {
        if (body.action === "read") {
          state.chatReadCursors[auth.email] = Math.max(Number(state.chatReadCursors[auth.email]) || 0, Number(body.seq) || 0);
          state.chatReadAt[auth.email] = "2026-05-23T00:20:00.000Z";
          return json({ readCursors: state.chatReadCursors, readAt: state.chatReadAt });
        }
        return json({ ok: true });
      }

      if (method === "POST") {
        state.chatPostBody = body;
        const nextSeq = state.chatMessages.reduce((max, message) => Math.max(max, Number(message.seq) || 0), 0) + 1;
        const message = {
          id: `chat-${nextSeq}`,
          seq: nextSeq,
          email: auth.email,
          name: auth.person,
          text: body.text || "",
          at: "2026-05-23T00:21:00.000Z",
          reactions: [],
          ...(body.replyToId ? { replyToId: body.replyToId } : {}),
        };
        state.chatMessages.push(message);
        return json({ workspaceId: workspace.id, message }, 201);
      }
    }
    if (pathname === "/api/fantasy-backlog") {
      const fantasy = state.fantasy || { workspaceId: workspace.id, reactionCatalog: [], ideas: [kink], graveyard: [] };
      state.fantasy = fantasy;
      if (method === "PATCH") {
        const body = route.request().postDataJSON();
        state.fantasyPatchBody = body;
        if (state.delayFantasyPatchMs) await new Promise((resolve) => setTimeout(resolve, state.delayFantasyPatchMs));
        if (body.action === "update_comment") {
          fantasy.ideas = (fantasy.ideas || []).map((idea) => {
            if (idea.id !== body.id) return idea;
            return {
              ...idea,
              comments: (idea.comments || []).map((comment) => (
                comment.id === body.commentId
                  ? {
                      ...comment,
                      text: body.comment,
                      editedAt: "2026-05-23T00:30:00.000Z",
                      editedByEmail: auth.email,
                      editedByName: auth.person,
                    }
                  : comment
              )),
            };
          });
        } else if (body.comment) {
          fantasy.ideas = (fantasy.ideas || []).map((idea) => {
            if (idea.id !== body.id) return idea;
            return {
              ...idea,
              comments: [
                ...(idea.comments || []),
                {
                  id: `comment-${(idea.comments || []).length + 1}`,
                  email: auth.email,
                  name: auth.person,
                  text: body.comment,
                  at: "2026-05-23T00:30:00.000Z",
                },
              ],
            };
          });
        }
      }
      return json(fantasy);
    }
    if (pathname === "/api/prompts") {
      return json({ text: "Name the fantasy that would feel easier if they admitted one too." });
    }
    if (pathname === "/api/shelf") {
      if (method === "PATCH") {
        state.shelfPatchBody = route.request().postDataJSON();
        if (state.shelfPatchBody.action === "revealed" && state.shelfRevealResponse) {
          state.shelf = state.shelfRevealResponse;
        }
      }
      return json(state.shelf || { workspaceId: workspace.id, reactionCatalog: shelfReactionCatalog, item: shelfItem, items: [shelfItem] });
    }
    if (pathname === "/api/vault") {
      if (method === "POST") {
        state.vaultUploadSeen = true;
      }
      return json({ workspaceId: workspace.id, reactionCatalog: [], items: [] });
    }
    if (pathname === "/api/mood") {
      // Double-blind mood light, same contract as functions/api/mood.js: the
      // response carries only my state plus a match when both are on.
      // state.moodPartner = { until } plays the partner's (hidden) light.
      const now = state.moodNow ? Date.parse(state.moodNow) : Date.now();
      const iso = (ms) => new Date(ms).toISOString();
      const mood = state.mood = state.mood || { on: false, since: null, until: null, cooldownUntil: null, match: null };
      const partnerUntil = state.moodPartner ? Date.parse(state.moodPartner.until) : 0;
      // The partner switching on while I'm on forms the match server-side.
      if (mood.on && !mood.match && partnerUntil > now) {
        mood.match = { since: iso(now), until: iso(Math.min(Date.parse(mood.until), partnerUntil)) };
      }
      const view = () => ({
        workspaceId: workspace.id,
        mine: { on: mood.on, since: mood.since, until: mood.until, cooldownUntil: mood.cooldownUntil },
        match: mood.match,
        serverNow: iso(now),
      });
      if (state.moodFail) return json({ error: "Internal error" }, 500);
      if (method === "POST") {
        const body = route.request().postDataJSON();
        state.moodPosts = [...(state.moodPosts || []), body];
        if (body.action === "off") {
          const wasOn = mood.on;
          Object.assign(mood, { on: false, since: null, until: null, match: null });
          if (wasOn) mood.cooldownUntil = iso(now + 5 * 60_000);
        }
        if (body.action === "on") {
          if (mood.cooldownUntil && Date.parse(mood.cooldownUntil) > now) {
            return json({
              error: "You just switched it off. Give it a few minutes.",
              code: "mood_cooldown",
              retryAt: mood.cooldownUntil,
              ...view(),
            }, 429);
          }
          const until = Math.min(Math.max(Date.parse(body.until), now + 15 * 60_000), now + 24 * 60 * 60_000);
          if (!mood.on) mood.since = iso(now);
          Object.assign(mood, { on: true, until: iso(until), cooldownUntil: null });
          if (partnerUntil > now) {
            mood.match = { since: mood.match?.since || iso(now), until: iso(Math.min(until, partnerUntil)) };
          }
        }
      }
      return json(view());
    }
    return json({ ok: true });
  });
}

async function emulateStandalonePwa(page) {
  await page.addInitScript(() => {
    const standaloneQuery = "(display-mode: standalone)";
    Object.defineProperty(window.navigator, "standalone", {
      value: true,
      configurable: true,
    });
    window.matchMedia = (query) => ({
      matches: query === standaloneQuery,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    });
  });
}

test("sign-in requires legal acceptance before auth starts", async ({ page }) => {
  const state = { bootstrapUnauthorized: true };
  await mockApi(page, state);
  await page.goto("/signin");

  await expect(page.getByRole("heading", { name: /Some things are easier to type than say/i })).toBeVisible();

  await page.getByRole("link", { name: /Continue with Google/i }).click({ force: true });
  expect(state.googleAuthAttempts || 0).toBe(0);
  await expect(page.getByText("Confirm you are 18+ and agree to the Terms and Privacy Policy first.")).toBeVisible();

  await page.getByLabel(/I am 18\+ and agree/i).check();
  await expect(page.getByRole("link", { name: /Continue with Google/i })).toHaveAttribute("aria-disabled", "false");

  await page.getByRole("button", { name: "Use email instead" }).click();
  await page.getByLabel("Email address").fill("alex@example.test");
  await expect(page.getByRole("button", { name: "Send code" })).toBeEnabled();
});

test("A launch reauth lands on a calm sign-in screen, not a signed-out error", async ({ page }) => {
  await mockApi(page, {});
  await page.goto("/signed-out?reason=launch");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to open your room." })).toBeVisible();
  await expect(page.getByText("This device is clear.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  await page.goto("/signed-out");
  await expect(page.getByRole("heading", { level: 1, name: "This device is clear." })).toBeVisible();
});

test("Sign-out warns before it deletes device-only private notes", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!window.sessionStorage.getItem("seeded-notes")) {
        window.sessionStorage.setItem("seeded-notes", "1");
        window.localStorage.setItem("ss:private-notes", JSON.stringify([{ id: "n1", text: "Just for me.", createdAt: "2026-05-23T00:00:00.000Z" }]));
      }
    } catch {}
  });
  await mockApi(page, {});
  await page.goto("/space");
  await page.getByRole("button", { name: "Settings" }).click();
  const signOut = page.getByRole("dialog", { name: "Settings" }).getByRole("link", { name: /Sign out of this device/i });

  await signOut.click();
  const confirm = page.getByRole("alertdialog", { name: "Sign out of this device?" });
  await expect(confirm).toContainText("only on this device");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/space/);
  expect(await page.evaluate(() => window.localStorage.getItem("ss:private-notes"))).toBeTruthy();

  await signOut.click();
  await page.getByRole("alertdialog", { name: "Sign out of this device?" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "This device is clear." })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("ss:private-notes"))).toBeNull();
});

test("intentional sign-out suppresses standalone PWA auto-reconnect from welcome", async ({ page }) => {
  await emulateStandalonePwa(page);

  const state = {};
  await mockApi(page, state);
  // Sign out lives in the Settings sheet on Us.
  await page.goto("/space");
  await page.getByRole("button", { name: "Settings" }).click();

  await page.getByRole("dialog", { name: "Settings" }).getByRole("link", { name: /Sign out of this device/i }).click();
  await expect(page.getByRole("heading", { name: "This device is clear." })).toBeVisible();

  state.bootstrapUnauthorized = true;
  state.bootstrapCalls = 0;
  await page.getByRole("link", { name: "Back to welcome" }).click();

  await expect(page.getByRole("heading", { name: /Get in Sync/i })).toBeVisible();
  expect(state.googleAuthAttempts || 0).toBe(0);
  expect(state.bootstrapCalls || 0).toBe(0);
});

test("standalone PWA launch prefers browser-session reconnect over saved email mode", async ({ page }) => {
  await emulateStandalonePwa(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("ss:last-auth-provider", "email");
  });

  const state = { bootstrapUnauthorized: true };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");

  await expect(page).toHaveURL(/\/pwa-reconnect\?/);
  const reconnectUrl = new URL(page.url());
  expect(reconnectUrl.searchParams.get("returnTo")).toBe("/sexboard");
  expect(reconnectUrl.searchParams.get("provider")).toBe("email");
  expect(reconnectUrl.searchParams.get("source")).toBe("pwa-launch");
  // iOS Home Screen apps can't hand a same-origin link to real Safari; the
  // x-safari-https: scheme is the only route that reaches Safari's session.
  const openSafari = page.getByRole("link", { name: "Open Safari to reconnect" });
  await expect(openSafari).toBeVisible();
  const safariHref = await openSafari.getAttribute("href");
  expect(safariHref).toMatch(/^x-safari-https?:\/\/[^/]+\/pwa-reconnect\?approve=handoff-test#secret=handoff-secret$/);
  expect(await openSafari.getAttribute("target")).toBeNull();
  expect(state.googleAuthAttempts || 0).toBe(0);
  expect(state.pwaHandoffActions?.[0]?.action).toBe("start");
});

test("standalone PWA reconnect offers a copyable link when Safari can't be opened", async ({ page, context }) => {
  await emulateStandalonePwa(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const state = { bootstrapUnauthorized: true };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");
  await expect(page).toHaveURL(/\/pwa-reconnect\?/);

  await page.getByRole("button", { name: "Copy link instead" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/^https?:\/\/[^/]+\/pwa-reconnect\?approve=handoff-test#secret=handoff-secret$/);
  // Copying counts as "opened": the app starts polling for the approval.
  await expect(page.locator(".pwa-reconnect-status")).toContainText("Waiting for Safari to approve");
  await expect.poll(() => (state.pwaHandoffActions || []).some((action) => action.action === "redeem")).toBe(true);
});

test("standalone PWA reconnect restarts in place after a failed start", async ({ page }) => {
  await emulateStandalonePwa(page);

  const state = { bootstrapUnauthorized: true, pwaHandoffStartStatus: 429 };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");

  await expect(page).toHaveURL(/\/pwa-reconnect\?/);
  // Scope to the card: Next's route announcer is an empty role="alert" too.
  await expect(page.locator(".pwa-reconnect-card [role='alert']")).toContainText("Too many attempts");
  const errorUrl = page.url();
  // Dev-mode StrictMode double-fires the mount effect, so count relative to
  // the failed attempt rather than asserting an absolute number.
  const starts = () => (state.pwaHandoffActions || []).filter((action) => action.action === "start").length;
  const startsBefore = starts();
  const bootstrapBefore = state.bootstrapCalls || 0;

  // The old restart link bounced through /signin?source=pwa, where the launch
  // path's cooldown and attempt cap swallowed the retry. Restart now mints a
  // fresh handoff right here without leaving the page.
  state.pwaHandoffStartStatus = 0;
  await page.getByRole("button", { name: "Restart reconnect" }).click();

  await expect(page.getByRole("link", { name: "Open Safari to reconnect" })).toBeVisible();
  expect(page.url()).toBe(errorUrl);
  expect(starts()).toBe(startsBefore + 1);
  // No trip through /signin: the sign-in page's bootstrap never ran again.
  expect(state.bootstrapCalls || 0).toBe(bootstrapBefore);
  expect(state.googleAuthAttempts || 0).toBe(0);
  await expect(page.getByRole("link", { name: "Sign in here instead" })).toBeVisible();
});

test("standalone PWA reconnect shows a countdown and retries on its own when the network is rate-limited", async ({ page }) => {
  await emulateStandalonePwa(page);

  const state = { bootstrapUnauthorized: true, pwaHandoffStartStatus: 429, pwaHandoffStartRetryAfter: 3 };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");
  await expect(page).toHaveURL(/\/pwa-reconnect\?/);

  // Retrying can't work until the limit lifts, so the button is disabled, the
  // wait is visible, and in-app sign-in is the primary way forward.
  const card = page.locator(".pwa-reconnect-card");
  await expect(card.getByRole("button", { name: "Restart reconnect" })).toBeDisabled();
  await expect(card.locator(".pwa-reconnect-status")).toContainText(/Reconnect unlocks in 0:0[1-3]/);
  await expect(card.getByRole("link", { name: "Sign in here instead" })).toHaveClass(/btn-primary/);
  await expect(card.getByRole("heading", { name: "Sign in on this phone." })).toBeVisible();

  const starts = () => (state.pwaHandoffActions || []).filter((action) => action.action === "start").length;
  const startsBefore = starts();
  state.pwaHandoffStartStatus = 0;
  await expect(page.getByRole("link", { name: "Open Safari to reconnect" })).toBeVisible({ timeout: 10_000 });
  expect(starts()).toBeGreaterThan(startsBefore);
});

test("standalone PWA reconnect makes a repeated failure visible and promotes in-app sign-in", async ({ page }) => {
  await emulateStandalonePwa(page);

  const state = { bootstrapUnauthorized: true, pwaHandoffStartStatus: 500 };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");
  await expect(page).toHaveURL(/\/pwa-reconnect\?/);

  const card = page.locator(".pwa-reconnect-card");
  await expect(card.getByRole("button", { name: "Restart reconnect" })).toHaveClass(/btn-primary/);
  await expect(card.locator(".pwa-reconnect-status")).toContainText("HTTP 500");

  // Tapping restart into the same failure used to redraw an identical screen,
  // which looked like the button did nothing.
  await card.getByRole("button", { name: "Restart reconnect" }).click();
  await expect(card).toContainText("Starting a fresh reconnect.");
  await expect(card.locator(".pwa-reconnect-status")).toContainText(/Attempt [2-9]/);
  await expect(card.getByRole("link", { name: "Sign in here instead" })).toHaveClass(/btn-primary/);
  await expect(card.getByRole("button", { name: "Restart reconnect" })).toBeEnabled();
});

test("standalone PWA reconnect finishes when the redeem response was lost but the session landed", async ({ page }) => {
  await emulateStandalonePwa(page);

  // No clipboard grant: whether the copy succeeds or falls back to the manual
  // link, tapping it starts the approval polling, which is all this needs.
  const state = { bootstrapUnauthorized: true, pwaHandoffRedeemAbortOnce: true };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");
  await expect(page).toHaveURL(/\/pwa-reconnect\?/);

  await page.getByRole("button", { name: "Copy link instead" }).click();
  // First redeem dies in flight, the next one sees the handoff already used.
  // The app confirms the session is live and goes in instead of erroring.
  await expect(page).toHaveURL(/\/sexboard/, { timeout: 20_000 });
});

test("standalone PWA relaunch reuses a fresh handoff and checks for approval right away", async ({ page }) => {
  await emulateStandalonePwa(page);
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("handoff-seeded")) return;
    window.sessionStorage.setItem("handoff-seeded", "1");
    window.localStorage.setItem("ss:pwa-browser-handoff", JSON.stringify({
      id: "handoff-stored",
      secret: "stored-secret",
      expiresAt: Date.now() + 8 * 60 * 1000,
      returnTo: "/chat",
    }));
  });

  const state = { bootstrapUnauthorized: true };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");
  await expect(page).toHaveURL(/\/pwa-reconnect\?/);

  // iOS kills the app while Safari is in front; coming back is a cold launch
  // that may land on a different page. The stored handoff is reused and polled
  // immediately instead of minting a new one and waiting for another tap.
  await expect(page.locator(".pwa-reconnect-status")).toContainText("Waiting for Safari to approve");
  await expect.poll(() => (state.pwaHandoffActions || []).some((action) => action.action === "redeem" && action.id === "handoff-stored")).toBe(true);
  expect((state.pwaHandoffActions || []).filter((action) => action.action === "start")).toHaveLength(0);
});

test("standalone PWA reconnect keeps waiting through a rate-limited redeem", async ({ page, context }) => {
  await emulateStandalonePwa(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const state = { bootstrapUnauthorized: true, pwaHandoffRedeemStatus: 429 };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");
  await expect(page).toHaveURL(/\/pwa-reconnect\?/);

  await page.getByRole("button", { name: "Copy link instead" }).click();
  const redeems = () => (state.pwaHandoffActions || []).filter((action) => action.action === "redeem").length;
  await expect.poll(redeems, { timeout: 15_000 }).toBeGreaterThan(0);

  // A 429 used to end the handoff with an error screen. Both partners share
  // one home IP, so the other phone's polling can trip the limit; the
  // approval may still land, so the app backs off and keeps waiting.
  await expect(page.locator(".pwa-reconnect-status")).toContainText("Waiting for Safari to approve");
  await expect(page.locator(".pwa-reconnect-card [role='alert']")).toHaveCount(0);

  state.pwaHandoffRedeemStatus = 200;
  state.bootstrapUnauthorized = false;
  await expect(page).toHaveURL(/\/sexboard/, { timeout: 20_000 });
  expect(redeems()).toBeGreaterThan(1);
});

test("browser approval without a secret points back to the installed app", async ({ page }) => {
  const state = { bootstrapUnauthorized: true };
  await mockApi(page, state);
  await page.goto("/pwa-reconnect?approve=handoff-test");

  await expect(page.locator(".pwa-reconnect-card [role='alert']")).toContainText("missing its secret");
  await expect(page.getByRole("button", { name: "Restart reconnect" })).toHaveCount(0);
  await expect(page.getByText(/Open the installed app from your Home Screen/)).toBeVisible();
});

test("standalone PWA launch reconnects after an old sign-out marker expires", async ({ page }) => {
  await emulateStandalonePwa(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("ss:intentional-sign-out", String(Date.now() - (3 * 60 * 1000)));
  });

  const state = { bootstrapUnauthorized: true };
  await mockApi(page, state);
  await page.goto("/signin?source=pwa");

  await expect(page).toHaveURL(/\/pwa-reconnect\?/);
  const reconnectUrl = new URL(page.url());
  expect(reconnectUrl.searchParams.get("provider")).toBe("google");
  expect(reconnectUrl.searchParams.get("source")).toBe("pwa-launch");
  await expect(page.getByRole("link", { name: "Open Safari to reconnect" })).toBeVisible();
  expect(state.googleAuthAttempts || 0).toBe(0);
  expect(state.pwaHandoffActions?.[0]?.action).toBe("start");
});

test("Us omits the redundant paired-space summary card", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/space");

  await expect(page.getByRole("heading", { level: 1, name: "Us" })).toBeVisible();
  await expect(page.locator(".settings-id")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rename space" })).toHaveCount(0);
});

test("Us reconnects granted notification permission to push subscription storage", async ({ page }) => {
  const state = {};
  await page.addInitScript(() => {
    // A user who already enabled notifications has their per-event prefs saved in
    // localStorage (here: request-sent ON, game-ready opted OFF). The app-wide
    // PushReconnect re-sends exactly these on launch (readStoredPushPrefs), and
    // /space's auto-register merges them over the all-on defaults — so the silent
    // reconnect after a deploy must PRESERVE them, never reset to defaults. Seed
    // them so the assertion is deterministic no matter which path posts first.
    // (Without a seed, PushReconnect posts `{}` and the server applies its own
    // request-sent:true default, which this API-mock can't observe.)
    try {
      window.localStorage.setItem("sexualsync-push-preferences", JSON.stringify({
        "chat-message": true, "request-sent": true, "request-reviewed": true,
        "request-reminder": true, "kink-nudge": true, "blind-reveal": true,
        "pile-started": true, "pile-reminder": true, "game-ready": false, "push-test": true,
      }));
    } catch { /* sessionStorage/localStorage can be blocked; nothing else to do */ }
    const subscription = {
      endpoint: "https://push.example.test/alex-phone",
      expirationTime: null,
      keys: { p256dh: "p256", auth: "auth" },
      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: this.expirationTime,
          keys: this.keys,
        };
      },
    };
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "granted",
        requestPermission: async () => "granted",
      },
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        // PwaBridge (mounted app-wide) registers the SW + listens for
        // controllerchange on mount; a mock missing these throws and the whole
        // app tree never settles, so /space stays on its loading spinner.
        controller: null,
        addEventListener: () => {},
        register: async () => ({
          waiting: null,
          installing: null,
          update: async () => {},
          addEventListener: () => {},
        }),
        ready: Promise.resolve({
          pushManager: {
            // Reconnect scenario: this device already holds a live subscription,
            // so getSubscription returns it — the page shows "Notifications are
            // on" and the silent reconnect re-saves the existing endpoint.
            getSubscription: async () => subscription,
            subscribe: async () => subscription,
          },
        }),
      },
    });
  });
  await mockApi(page, state);
  await page.goto("/space");

  await expect(page.getByRole("heading", { level: 1, name: "Us" })).toBeVisible();
  await expect.poll(() => state.pushSubscribeBody?.subscription?.endpoint).toBe("https://push.example.test/alex-phone");
  expect(state.pushSubscribeBody?.workspaceId).toBe(workspace.id);
  expect(state.pushSubscribeBody?.preferences?.["request-sent"]).toBe(true);
  // The reconnect carries the saved opt-out through instead of resetting to
  // all-on — i.e. a deploy never silently changes the user's notification prefs.
  expect(state.pushSubscribeBody?.preferences?.["game-ready"]).toBe(false);
  // Device notification status lives in the Settings sheet on Us.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByText("Notifications are on for this device.")).toBeVisible();
});

test("Sext long-press reply survives small finger movement", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/chat");

  const bubble = page.getByRole("button", { name: "Hold this message" });
  await expect(bubble).toBeVisible();
  const box = await bubble.boundingBox();
  expect(box).toBeTruthy();
  const x = box.x + Math.min(32, box.width / 2);
  const y = box.y + Math.min(20, box.height / 2);

  await bubble.dispatchEvent("pointerdown", {
    pointerId: 23,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  await page.waitForTimeout(160);
  await bubble.dispatchEvent("pointermove", {
    pointerId: 23,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: x + 6,
    clientY: y + 4,
    bubbles: true,
    cancelable: true,
  });

  await expect(page.getByRole("group", { name: "Message actions" })).toBeVisible();
  await bubble.dispatchEvent("pointerup", {
    pointerId: 23,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: x + 6,
    clientY: y + 4,
    bubbles: true,
    cancelable: true,
  });
  await page.getByRole("button", { name: "Reply" }).click();

  await expect(page.getByText("Replying to Jordan")).toBeVisible();
  await page.getByPlaceholder(/Message Jordan/).fill("replying now");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => state.chatPostBody?.replyToId).toBe("chat-1");
});

test("Ask surfaces saved library Acts before collapsed defaults", async ({ page }) => {
  const state = { acts: [savedLibraryAct] };
  await mockApi(page, state);
  await page.goto("/ask");

  await expect(page.getByRole("heading", { name: "Be specific." })).toBeVisible();
  await expect(page.locator(".ask-act-grid .act-chip").first()).toContainText("Slow undressing");
  await expect(page.getByRole("button", { name: "Slow undressing" })).toBeVisible();
});

test("Ask submit routes while the send pulse is still animating", async ({ page }) => {
  const state = { acts: [savedLibraryAct], delayRequestBoardPostMs: 500 };
  await mockApi(page, state);
  await page.goto("/ask");

  await page.getByRole("button", { name: "Slow undressing" }).click();
  await page.getByRole("button", { name: "Send to Jordan" }).click();

  await expect.poll(() => state.requestCreateBody?.categories?.[0]).toBe("Slow undressing");
  // The pulse layer is body-mounted (outside the React tree) the instant the
  // Ask write resolves and lives ~3.4s, so it survives the soft route to
  // /sexboard. Assert it here — freshly mounted — rather than after landing on
  // /sexboard, where its ~1.6s self-teardown is a fixed wall-clock timer that
  // raced the (CPU-bound, CI-variable) navigation and flaked. The URL assertion
  // below still resolves while the layer is alive, so this keeps the "routes
  // while the send pulse is still animating" coverage without the teardown race.
  await expect(page.locator(".ss-send-pulse-layer")).toBeVisible();
  await expect(page).toHaveURL(/\/sexboard$/);
});

test("Health dashboard stays compact and tappable on iPhone", async ({ page }) => {
  await mockApi(page);
  await page.goto("/space/health");
  await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
  await expect(page.getByText("Same-night approved Asks and Pile overlaps stay separate")).toBeVisible();
  await expect(page.getByText("Very long teasing name that should still truncate cleanly")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rangeButton = document.querySelector(".health-range-button");
    const summary = document.querySelector(".health-summary");
    const rhythm = document.querySelector(".health-section[aria-label='Rhythm']");
    const chip = document.querySelector(".health-section-head span");
    const letterSpacing = chip ? getComputedStyle(chip).letterSpacing : "0px";
    const letterSpacingPx = letterSpacing === "normal" ? 0 : Number.parseFloat(letterSpacing);
    const statRects = Array.from(document.querySelectorAll(".health-substat-grid .health-substat")).map((item) => {
      const rect = item.getBoundingClientRect();
      const value = item.querySelector("span");
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        valueFontSize: Number.parseFloat(value ? getComputedStyle(value).fontSize : "0")
      };
    });
    const sourceHistory = document.querySelector(".health-section[aria-label='Source history']");
    const eventLinks = sourceHistory ? sourceHistory.querySelectorAll("a.health-event-row").length : -1;
    const emojis = sourceHistory
      ? Array.from(sourceHistory.querySelectorAll(".health-act-emoji")).map((node) => node.textContent?.trim() || "")
      : [];
    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rangeButtonHeight: rangeButton?.getBoundingClientRect().height || 0,
      summaryHeight: summary?.getBoundingClientRect().height || 0,
      rhythmTop: rhythm?.getBoundingClientRect().top || 0,
      letterSpacingPx,
      statRects,
      eventLinks,
      emojis,
    };
  });

  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(metrics.rangeButtonHeight).toBeGreaterThanOrEqual(40);
  expect(metrics.summaryHeight).toBeLessThanOrEqual(260);
  expect(metrics.rhythmTop).toBeLessThan(560);
  expect(metrics.letterSpacingPx).toBe(0);
  expect(metrics.statRects.length).toBe(2);
  expect(new Set(metrics.statRects.map((rect) => rect.width)).size).toBe(1);
  expect(new Set(metrics.statRects.map((rect) => rect.height)).size).toBe(1);
  expect(new Set(metrics.statRects.map((rect) => rect.valueFontSize)).size).toBe(1);
  expect(metrics.eventLinks).toBe(0);
  expect(metrics.emojis.length).toBeGreaterThanOrEqual(6);
  expect(metrics.emojis).not.toContain("✦");
  expect(metrics.emojis).toContain("💋");
  expect(metrics.emojis).toContain("🚿");
  expect(metrics.emojis).toContain("📹");
});

test("Play art uses app theme colors on iPhone", async ({ page }) => {
  // The Pile and Blind Reveal are both waiting on Alex, so they float up as
  // full art tiles; the untouched Sex Quiz and Green Lights sit as rows.
  await mockApi(page, {
    pile: { ...activePile, mine: [], partnerHasDropped: true },
    blindReveal: {
      ...archivedBlindReveal,
      id: "blind-open-1",
      status: "open",
      revealedAt: "",
      archivedAt: "",
      submittedCount: 1,
      mySubmitted: false,
      partnerSubmitted: true,
      myEntry: null,
      entries: [],
    },
  });
  await page.goto("/games");
  await expect(page.getByRole("heading", { level: 1, name: "Play" })).toBeVisible();
  const tiles = page.locator(".game-tile");
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0)).toHaveAttribute("href", "/games/pile");
  await expect(tiles.nth(1)).toHaveAttribute("href", "/games/blind-reveal");
  const rows = page.locator(".play-row-game");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("href", "/games/sex-quiz");
  await expect(rows.nth(1)).toHaveAttribute("href", "/games/green-lights");
  await expect(page.getByText("2 waiting on you")).toBeVisible();
  await expect(page.locator(".game-art-pile")).toBeVisible();
  await expect(page.locator(".game-art-reveal")).toBeVisible();
  await expect(page.locator(".pile-card")).toHaveCount(3);
  await expect(page.locator(".pile-glow")).toHaveCount(1);
  await expect(page.locator(".pile-card-pip")).toHaveCount(1);
  await expect(page.locator(".reveal-line")).toHaveCount(6);
  await expect(page.locator(".reveal-pip")).toHaveCount(1);
  await expect(page.locator(".reveal-pip-halo")).toHaveCount(1);

  const metrics = await page.evaluate(() => {
    const pileArt = document.querySelector(".game-art-pile");
    const revealArt = document.querySelector(".game-art-reveal");
    const pileCard = document.querySelector(".pile-card");
    const frontPileCard = document.querySelector(".pile-card-2");
    const revealLine = document.querySelector(".reveal-line");
    const revealHalf = document.querySelector(".reveal-half-a");
    const revealSeam = document.querySelector(".reveal-seam");
    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pileArtBackground: pileArt ? getComputedStyle(pileArt).backgroundImage : "",
      revealArtBackground: revealArt ? getComputedStyle(revealArt).backgroundImage : "",
      pileCardBackground: pileCard ? getComputedStyle(pileCard).backgroundImage : "",
      pileCardBorder: pileCard ? getComputedStyle(pileCard).borderTopColor : "",
      frontPileAnimation: frontPileCard ? getComputedStyle(frontPileCard).animationName : "",
      revealHalfBackground: revealHalf ? getComputedStyle(revealHalf).backgroundImage : "",
      revealLineAnimation: revealLine ? getComputedStyle(revealLine).animationName : "",
      revealSeamColor: revealSeam ? getComputedStyle(revealSeam).backgroundColor : "",
      revealSeamAnimation: revealSeam ? getComputedStyle(revealSeam).animationName : "",
    };
  });

  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(metrics.pileArtBackground).toContain("rgb(52, 26, 40)");
  expect(metrics.revealArtBackground).toContain("rgb(52, 26, 40)");
  expect(metrics.pileCardBackground).toContain("rgb(35, 17, 26)");
  expect(metrics.pileCardBorder).toContain("color(srgb 0.952941");
  expect(metrics.frontPileAnimation).toBe("pile-bob");
  expect(metrics.revealHalfBackground).toContain("color(srgb");
  expect(metrics.revealLineAnimation).toBe("reveal-type");
  expect(metrics.revealSeamColor).toBe("rgb(233, 168, 179)");
  expect(metrics.revealSeamAnimation).toBe("reveal-seam-breath");
});

test("Blind Reveal Recent Reveals opens a closed reveal on iPhone", async ({ page }) => {
  await mockApi(page, { blindReveal: null, blindReveals: [archivedBlindReveal] });
  await page.goto("/games/blind-reveal");

  await expect(page.getByText("Recent reveals")).toBeVisible();
  await page.getByRole("button", { name: /Open closed Blind Reveal: What should we admit after midnight\?/ }).click();

  await expect(page.getByText("closed reveal")).toBeVisible();
  await expect(page.getByText("I want the hotel fantasy again.")).toBeVisible();
  await expect(page.getByText("I want the same thing, slower.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close this reveal" })).toHaveCount(0);
});

test("Sexboard locked Blind Reveal opens closed answers on iPhone", async ({ page }) => {
  await mockApi(page, { blindReveal: null, blindReveals: [archivedBlindReveal] });
  await page.goto("/sexboard");

  const lockedReveal = page.locator(".sexboard-handoff-row").filter({ hasText: "What should we admit after midnight?" });
  await expect(lockedReveal).toBeVisible();
  await expect(lockedReveal).toHaveAttribute("href", "/games/blind-reveal?id=blind-closed-1&activity=1");

  await lockedReveal.click();
  await expect(page).toHaveURL(/\/games\/blind-reveal\?id=blind-closed-1&activity=1$/);
  await expect(page.getByText("closed reveal")).toBeVisible();
  await expect(page.getByText("I want the hotel fantasy again.")).toBeVisible();
  await expect(page.getByText("I want the same thing, slower.")).toBeVisible();
});

test("Pile page shows Recent piles history on iPhone", async ({ page }) => {
  await mockApi(page, {
    pile: null,
    pileSessions: [{
      id: "pile-history-1",
      workspaceId: workspace.id,
      acts: ["Slow kissing"],
      overlap: ["Slow kissing"],
      quietDropCount: 0,
      revealAt: "2026-05-23T00:08:00.000Z",
      startedAt: "2026-05-23T00:00:00.000Z",
      lockedAt: "2026-05-23T00:12:00.000Z",
      lockedByEmail: auth.email,
      lockedByName: auth.person,
      revealNarration: "",
    }],
  });
  await page.goto("/games/pile");

  await expect(page.getByText("Recent piles")).toBeVisible();
  await expect(page.getByText("Slow kissing")).toBeVisible();
});

test("Play badge clears after viewed Pile and Blind Reveal reveals", async ({ page }) => {
  const gameActivity = {
    workspaceId: workspace.id,
    unreadTotal: 2,
    unreadByResource: { pile: 1, "blind-reveals": 1 },
    readState: { all: "", resources: {} },
    items: [
      {
        id: "pile-locked-activity",
        workspaceId: workspace.id,
        resource: "pile",
        resourceLabel: "Pile",
        action: "locked",
        label: "Pile locked in",
        entityId: "pile-history-1",
        actorEmail: "jordan@example.test",
        actorName: "Jordan",
        at: "2026-05-23T00:13:00.000Z",
        passive: false,
        unread: true,
      },
      {
        id: "blind-revealed-activity",
        workspaceId: workspace.id,
        resource: "blind-reveals",
        resourceLabel: "Blind Reveal",
        action: "revealed",
        label: "Blind Reveal opened",
        entityId: "blind-closed-1",
        actorEmail: "jordan@example.test",
        actorName: "Jordan",
        at: "2026-05-23T00:12:00.000Z",
        passive: false,
        unread: true,
      },
    ],
  };
  await mockApi(page, {
    activity: gameActivity,
    pile: revealedPile,
    blindReveal: null,
    blindReveals: [archivedBlindReveal],
  });
  await page.goto("/sexboard");
  await expect(page.getByRole("link", { name: /Play 2 unread/ })).toBeVisible();

  await page.goto("/games/pile");
  await expect(page.getByRole("heading", { name: "In sync." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Play 1 unread/ })).toBeVisible();

  await page.goto("/games/blind-reveal?id=blind-closed-1&activity=1");
  await expect(page.getByText("closed reveal")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Play$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Play [1-9] unread/ })).toHaveCount(0);
});

test("Pile waiting-on-partner pill is centered on iPhone", async ({ page }) => {
  await mockApi(page, {
    pile: {
      ...activePile,
      partnerHasDropped: false,
      mine: ["Kiss"],
    },
  });
  await page.goto("/games/pile");

  const pill = page.locator(".pile-waiting-pill");
  await expect(pill).toHaveText("Waiting on Jordan");
  const metrics = await pill.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      pillCenter: rect.left + rect.width / 2,
      viewportCenter: window.innerWidth / 2,
    };
  });
  expect(Math.abs(metrics.pillCenter - metrics.viewportCenter)).toBeLessThanOrEqual(1);
});

test("Sexboard Jordan activity actions are stable on iPhone", async ({ page }) => {
  await mockApi(page);
  await page.goto("/sexboard");
  await expect(page.getByRole("heading", { name: "Jordan's activity" })).toBeVisible();
  await expect(page.getByText("New Ask landed")).toBeVisible();
  await expect(page.getByText("Pile changed 2 times")).toBeVisible();

  const markRead = page.getByRole("button", { name: "Mark read" });
  await expect(page.getByText("1 unread update from Jordan.")).toBeVisible();

  const scrollMetrics = await page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector(".app-shell.surface");
    const stage = document.querySelector(".sexboard-stage");
    window.scrollTo(80, window.scrollY);
    root.scrollLeft = 80;
    document.body.scrollLeft = 80;
    return {
      horizontalOverflow: Math.max(root.scrollWidth - root.clientWidth, document.body.scrollWidth - window.innerWidth),
      scrollLeft: Math.max(window.scrollX, root.scrollLeft, document.body.scrollLeft),
      shellOverflowX: shell ? getComputedStyle(shell).overflowX : "",
      stageTouchAction: stage ? getComputedStyle(stage).touchAction : "",
    };
  });

  expect(scrollMetrics.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(scrollMetrics.scrollLeft).toBe(0);
  expect(["hidden", "clip"]).toContain(scrollMetrics.shellOverflowX);
  expect(scrollMetrics.stageTouchAction).toBe("pan-y");

  const swipeWrap = page.locator(".live-activity-swipe-wrap").filter({ hasText: "Pile changed 2 times" });
  const groupedRow = swipeWrap.locator(".live-activity-item");
  const box = await groupedRow.boundingBox();
  expect(box).not.toBeNull();
  await groupedRow.evaluate((node, swipe) => {
    const touch = (clientX) => ({ clientX, clientY: swipe.clientY });
    const fire = (type, touches, changedTouches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: touches });
      Object.defineProperty(event, "changedTouches", { value: changedTouches });
      node.dispatchEvent(event);
    };
    fire("touchstart", [touch(swipe.startX)], [touch(swipe.startX)]);
    fire("touchmove", [touch(swipe.endX)], [touch(swipe.endX)]);
  }, {
    startX: box.x + box.width - 10,
    endX: box.x + 14,
    clientY: box.y + box.height / 2,
  });
  await expect.poll(async () => swipeWrap.evaluate((node) => {
    const indicator = node.querySelector(".live-activity-swipe-indicator");
    return {
      ready: node.classList.contains("is-ready"),
      indicatorText: indicator?.textContent?.replace(/\s+/g, " ").trim() || "",
      indicatorOpacity: indicator ? getComputedStyle(indicator).opacity : "",
    };
  })).toEqual({
    ready: true,
    indicatorText: "✓Mark read",
    indicatorOpacity: "1",
  });
  await groupedRow.evaluate((node, swipe) => {
    const touch = (clientX) => ({ clientX, clientY: swipe.clientY });
    const event = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: [] });
    Object.defineProperty(event, "changedTouches", { value: [touch(swipe.endX)] });
    node.dispatchEvent(event);
  }, {
    endX: box.x + 14,
    clientY: box.y + box.height / 2,
  });
  await expect(groupedRow).toBeHidden();

  // "Mark read" clears the whole box (inbox-zero), not just the unread badge.
  await markRead.click();
  await expect(page.getByText("1 unread update from Jordan.")).toBeHidden();
  await expect(page.getByText("New Ask landed")).toBeHidden();
  await expect(markRead).toBeDisabled();
});

test("Sexboard online presence mark breathes green", async ({ page }) => {
  await mockApi(page);
  await page.goto("/sexboard");
  const liveStatus = page.locator(".presence-band-status.is-live");
  await expect(liveStatus).toContainText("Live");

  const markStyle = await liveStatus.locator(".presence-live-mark").evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      animationName: style.animationName,
      color: style.color,
      filter: style.filter,
    };
  });
  expect(markStyle.animationName).toBe("live-logo-breathe-green");
  expect(markStyle.color).toBe("rgb(168, 201, 160)");
  expect(markStyle.filter).toContain("drop-shadow");
});

test("Sexboard treats the Pile count as an optional cap", async ({ page }) => {
  await mockApi(page, { pile: activePile });
  await page.goto("/sexboard");
  const pileRow = page.locator(".sexboard-handoff-row").filter({ hasText: "Up to 3 each" });
  await expect(pileRow.getByText("Both Pile lists are in")).toBeVisible();
  await expect(pileRow.getByText("Reveal in")).toBeVisible();
  await expect(pileRow.getByText("Drop 2 more Acts")).toHaveCount(0);
  await expect(pileRow.getByText("Your side needs 3 before reveal can open.")).toHaveCount(0);
  await expect(page.locator(".game-progress-alert")).toHaveCount(0);
});

test("Sexboard hides expired unrevealed Piles", async ({ page }) => {
  await mockApi(page, {
    pile: {
      ...activePile,
      revealAt: new Date(Date.now() - 60_000).toISOString(),
      isRevealed: false,
      mine: [],
      partnerHasDropped: true,
      partnerLabels: null,
      overlap: null,
    },
  });
  await page.goto("/sexboard");
  await expect(page.locator('a.sexboard-handoff-row[href="/games/pile"]')).toHaveCount(0);
});

test("Green Lights reveal breaks alignment down by topic and names shared worries", async ({ page }) => {
  const mine = { "am-happy": { value: "agree" }, "am-more": { value: "yes" }, "tk-laugh": { value: "agree" }, "pl-pressure": { value: "agree" } };
  const partner = { "am-happy": { value: "agree" }, "am-more": { value: "open" }, "tk-laugh": { value: "agree" }, "pl-pressure": { value: "agree" } };
  await mockApi(page, {
    greenLightsFull: {
      workspaceId: "ws-demo", status: "revealed", requiredCount: 2, mySubmitted: true, partnerSubmitted: true,
      updatedAt: "", revealedAt: "", myAnswers: mine, partnerAnswers: partner, partnerName: "Jordan",
    },
  });
  await page.goto("/games/green-lights");

  const concerns = page.locator(".gl-shared-concerns");
  await expect(concerns.getByText("Shared, worth naming")).toBeVisible();
  await expect(concerns.getByText("I feel pressure to orgasm, or to make you orgasm")).toBeVisible();

  const breakdown = page.locator("details.sync-breakdown");
  await breakdown.getByText("See it by topic").click();
  await expect(breakdown.locator("li").filter({ hasText: "Amount & cadence" })).toContainText("1/2");
  await expect(breakdown.locator("li").filter({ hasText: "Talking about sex" })).toContainText("1/1");
});

test("Sex Quiz reveal shows where the overlap clusters", async ({ page }) => {
  await mockApi(page, {
    sexQuizFull: {
      workspaceId: "ws-demo", status: "revealed", requiredCount: 2, mySubmitted: true, partnerSubmitted: true,
      updatedAt: "", revealedAt: "", myRatings: { oral: { interest: "into" } }, myTopPicks: [],
      matches: [{ cardId: "oral", myRole: "", partnerRole: "", complementary: false }, { cardId: "sixtynine", myRole: "", partnerRole: "", complementary: false }, { cardId: "frombehind", myRole: "", partnerRole: "", complementary: false }],
      curiousTogether: [{ cardId: "facesitting" }], syncScore: 72, partnerTopPicks: [], partnerName: "Jordan",
      fullRevealMine: false, fullRevealPartner: false, partnerRatings: null,
    },
  });
  await page.goto("/games/sex-quiz");
  const breakdown = page.locator("details.sync-breakdown");
  await breakdown.getByText("Where you overlap most").click();
  const rows = breakdown.locator("li");
  await expect(rows.first()).toContainText("Mouths, hands & tits");
  await expect(rows.first()).toContainText("2 into · 1 curious");
  await expect(rows.nth(1)).toContainText("Positions & places");
});

test("Sex Quiz locked-in screen moves to the reveal when the partner finishes", async ({ page }) => {
  const state = {
    sexQuizFull: {
      workspaceId: "ws-demo", status: "open", requiredCount: 2, mySubmitted: true, partnerSubmitted: false,
      updatedAt: "", revealedAt: "", myRatings: { oral: { interest: "into" } }, myTopPicks: ["oral"],
      matches: [], curiousTogether: [], syncScore: 0, partnerTopPicks: [], partnerName: "Jordan",
      fullRevealMine: false, fullRevealPartner: false, partnerRatings: null,
    },
  };
  await mockApi(page, state);
  let socket = null;
  await page.routeWebSocket(/\/api\/room\/socket/, (ws) => {
    socket = ws;
    ws.send(JSON.stringify({ type: "room.hello", workspaceId: workspace.id, latestSeq: 1, online: [], at: new Date().toISOString() }));
  });
  await page.goto("/games/sex-quiz");
  await expect(page.getByText("Your answers are locked in")).toBeVisible();
  await expect.poll(() => Boolean(socket)).toBe(true);

  state.sexQuizFull = {
    ...state.sexQuizFull,
    status: "revealed", partnerSubmitted: true, revealedAt: new Date().toISOString(), syncScore: 72,
    matches: [{ cardId: "oral", myRole: "", partnerRole: "", complementary: false }],
  };
  socket.send(JSON.stringify({
    type: "room.event",
    seq: 2,
    event: { seq: 2, resource: "sex-quiz", action: "submitted", actorEmail: "jordan@example.test", actorName: "Jordan", passive: true, at: new Date().toISOString() },
  }));
  await expect(page.getByText("Your answers are locked in")).toHaveCount(0);
  await expect(page.locator(".sync-score-reveal")).toBeVisible();
});

test("Sex Quiz offers only the new cards to someone who answered an older deck", async ({ page }) => {
  // An answer for every current card except two, plus one retired card.
  const deckSource = await import("node:fs").then((fs) => fs.readFileSync(new URL("../web/src/lib/quiz-deck.ts", import.meta.url), "utf8"));
  const ids = [...deckSource.matchAll(/\{ id: "([^"]+)", category:/g)].map((match) => match[1]);
  const missing = ["wakemeup", "titfuck"];
  const myRatings = Object.fromEntries(ids.filter((id) => !missing.includes(id)).map((id) => [id, { interest: "curious" }]));
  myRatings.oral = { interest: "into", role: "give" };
  myRatings.handedge = { interest: "into" };
  const state = {
    sexQuizFull: {
      workspaceId: "ws-demo", status: "open", requiredCount: 2, mySubmitted: true, partnerSubmitted: false,
      updatedAt: "", revealedAt: "", myRatings, myTopPicks: ["oral", "handedge"], matches: [], curiousTogether: [],
      syncScore: null, partnerTopPicks: [], partnerName: "Jordan", fullRevealMine: false, fullRevealPartner: false, partnerRatings: null,
    },
  };
  await mockApi(page, state);
  await page.goto("/games/sex-quiz");

  await expect(page.getByText("2 new cards to rate")).toBeVisible();
  await page.getByRole("button", { name: "Rate them" }).click();
  await page.getByRole("button", { name: "Rate the new cards" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.getByRole("button", { name: "Into it" }).click();
  await page.getByRole("button", { name: "Pass" }).click();
  await page.getByRole("button", { name: "Reveal to your partner" }).click();

  await expect.poll(() => (state.sexQuizSubmits || []).length).toBe(1);
  const submitted = state.sexQuizSubmits[0];
  // Old answers carried forward, both new cards rated, the retired card dropped.
  expect(Object.keys(submitted.ratings)).toHaveLength(ids.length);
  expect(submitted.ratings.oral).toEqual({ interest: "into", role: "give" });
  expect(submitted.ratings.handedge).toBeUndefined();
  expect(submitted.ratings.wakemeup?.interest).toBe("into");
  expect(submitted.ratings.titfuck?.interest).toBe("pass");
  expect(submitted.topPicks).toEqual(["oral"]);
  await expect(page.getByText("new cards to rate")).toHaveCount(0);
});

test("Sexboard shows a waiting Sex Quiz handoff once I've submitted", async ({ page }) => {
  await mockApi(page, { sexQuiz: { status: "open", mySubmitted: true, partnerSubmitted: false, revealed: false } });
  await page.goto("/sexboard");
  const row = page.locator('a.sexboard-handoff-row[href="/games/sex-quiz"]');
  await expect(row.getByText("Your Sex Quiz is in")).toBeVisible();
  await expect(row.getByText("Waiting on Jordan")).toBeVisible();
});

test("Sexboard shows a needs-you Green Lights handoff when the partner finished first", async ({ page }) => {
  await mockApi(page, { greenLights: { status: "open", mySubmitted: false, partnerSubmitted: true, revealed: false } });
  await page.goto("/sexboard");
  const row = page.locator('a.sexboard-handoff-row[href="/games/green-lights"]');
  await expect(row.getByText("Take Green Lights")).toBeVisible();
  await expect(row.getByText("Jordan took Green Lights")).toBeVisible();
});

test("Sexboard drops the game handoffs once both partners have submitted", async ({ page }) => {
  await mockApi(page, {
    sexQuiz: { status: "revealed", mySubmitted: true, partnerSubmitted: true, revealed: true },
    greenLights: { status: "revealed", mySubmitted: true, partnerSubmitted: true, revealed: true },
  });
  await page.goto("/sexboard");
  await expect(page.locator('a.sexboard-handoff-row[href="/games/sex-quiz"]')).toHaveCount(0);
  await expect(page.locator('a.sexboard-handoff-row[href="/games/green-lights"]')).toHaveCount(0);
});

test("Sexboard waiting kink opens the shared library", async ({ page }) => {
  const myKink = {
    ...kink,
    id: "kink-mine",
    text: "Try a silk blindfold scene.",
    addedByEmail: auth.email,
    addedByName: auth.person,
  };
  const fantasy = { workspaceId: workspace.id, reactionCatalog: [], ideas: [myKink], graveyard: [] };

  await mockApi(page, { fantasy });
  await page.goto("/sexboard");

  const waitingSection = page.locator(".sexboard-handoff-section").filter({ hasText: "Waiting on Jordan" });
  const kinkRow = waitingSection.locator(".sexboard-handoff-row").filter({ hasText: "Waiting on a kink response" });
  await expect(kinkRow).toBeVisible();
  await expect(kinkRow).toHaveAttribute("href", "/inspiration?section=shared-kinks#shared-kinks");

  await kinkRow.click();
  await expect(page).toHaveURL(/\/inspiration\?section=shared-kinks#shared-kinks$/);
  await expect(page.locator("#shared-kinks")).toHaveJSProperty("open", true);
  await expect(page.locator("#shared-kinks .kink-card")).toContainText("Try a silk blindfold scene.");
});

test("Kink detail lets comment authors edit their own comments", async ({ page }) => {
  const commentKink = {
    ...kink,
    id: "kink-comment-edit",
    text: "Try a silk blindfold scene.",
    addedByEmail: auth.email,
    addedByName: auth.person,
    comments: [{
      id: "comment-1",
      email: auth.email,
      name: auth.person,
      text: "Original comment",
      at: "2026-05-23T00:00:00.000Z",
    }],
  };
  const state = {
    fantasy: { workspaceId: workspace.id, reactionCatalog: [], ideas: [commentKink], graveyard: [] },
  };

  await mockApi(page, state);
  await page.goto("/inspiration/kink?id=kink-comment-edit");

  const originalMessage = page.locator(".kd-msg").filter({ hasText: "Original comment" });
  await expect(originalMessage.getByRole("button", { name: /^Edit$/ })).toHaveCount(0);
  await originalMessage.click();
  const editBox = page.locator(".kd-comment-edit-form textarea");
  await expect(editBox).toBeFocused();
  await editBox.fill("Edited comment");
  await page.locator(".kd-comment-edit-form").getByRole("button", { name: "Save" }).click();

  await expect.poll(() => state.fantasyPatchBody?.action).toBe("update_comment");
  expect(state.fantasyPatchBody.commentId).toBe("comment-1");
  await expect(page.locator(".kd-msg").filter({ hasText: "Edited comment" })).toBeVisible();
  await expect(page.locator(".kd-msg").filter({ hasText: "Original comment" })).toHaveCount(0);
});

test("Kink detail shows new comments optimistically while the save is in flight", async ({ page }) => {
  const commentKink = {
    ...kink,
    id: "kink-comment-optimistic",
    text: "Try a silk blindfold scene.",
    comments: [],
  };
  const state = {
    delayFantasyPatchMs: 2_000,
    fantasy: { workspaceId: workspace.id, reactionCatalog: [], ideas: [commentKink], graveyard: [] },
  };

  await mockApi(page, state);
  await page.goto("/inspiration/kink?id=kink-comment-optimistic");

  await page.locator("textarea[placeholder='Leave a note…']").fill("Instant comment");
  await page.getByRole("button", { name: "Add comment" }).click();

  await expect(page.locator(".kd-msg").filter({ hasText: "Instant comment" })).toBeVisible({ timeout: 1_000 });
  expect(state.fantasyPatchBody?.comment).toBe("Instant comment");
});

test("Sexboard approved Ask opens the shared approval splash", async ({ page }) => {
  const yesterdayNight = isoForLocalDaysAgo(1);
  const state = {
    request: {
      ...counteredRequest,
      status: "on_deck",
      categories: ["💆 Sensual massage"],
      timing: "Tomorrow",
      createdAt: yesterdayNight,
      updatedAt: yesterdayNight,
      sentAt: yesterdayNight,
      reviewedAt: yesterdayNight,
      counterAcceptedAt: yesterdayNight,
      acceptedCounters: counterDecisions,
    },
  };
  await mockApi(page, state);
  await page.goto("/sexboard");

  const approvedRow = page.locator(".sexboard-handoff-row").filter({ hasText: "Approved for tonight." });
  await expect(approvedRow).toHaveAttribute("href", /\/mutual\?source=ask&requestId=req-1/);
  await expect(approvedRow.locator(".sexboard-handoff-action")).toHaveText("It's on!");
  await page.evaluate(() => {
    window.__mutualMarkCenters = [];
    let recording = false;
    const startRecording = () => {
      const mark = document.querySelector(".mutual-mark");
      if (!mark || recording) return false;
      recording = true;
      const startedAt = performance.now();
      const tick = () => {
        const node = document.querySelector(".mutual-mark");
        if (node) {
          const rect = node.getBoundingClientRect();
          window.__mutualMarkCenters.push(rect.top + rect.height / 2);
        }
        if (performance.now() - startedAt < 900) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return true;
    };
    const observer = new MutationObserver(() => {
      if (startRecording()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    startRecording();
  });
  await approvedRow.click();

  await expect(page).toHaveURL(/\/mutual\?/);
  await expect(page.getByRole("heading", { name: "Both of you said yes." })).toBeVisible();
  await expect(page.getByText(/Sensual massage/)).toBeVisible();
  await expect(page.locator(".mutual-mark")).toHaveCount(1);
  await expect(page.locator(".brand-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pass tonight" })).toBeVisible();
  await page.waitForTimeout(700);
  const markCenters = await page.evaluate(() => window.__mutualMarkCenters || []);
  expect(markCenters.length).toBeGreaterThan(3);
  expect(Math.max(...markCenters) - Math.min(...markCenters)).toBeLessThanOrEqual(2);

  // The pass confirm is the in-page accessible confirmAction <dialog>
  // (was window.confirm) — click its primary button instead of arming a
  // native dialog handler.
  await page.getByRole("button", { name: "Pass tonight" }).click();
  await page.locator(".ss-confirm-dialog .ss-confirm-primary").click();
  await expect.poll(() => state.requestActionBody?.action).toBe("pass");
  await expect(page).toHaveURL(/\/sexboard$/);
});

const approvedMatchRequest = {
  ...counteredRequest,
  status: "on_deck",
  categories: ["💆 Sensual massage", "🛁 Shower sex"],
  timing: "Tonight",
  feedback: "Bring the oil.",
  counterAcceptedAt: "2026-05-23T00:25:00.000Z",
  acceptedCounters: counterDecisions,
  decisions: [
    { label: "💆 Sensual massage", decision: "Yes", targetType: "act", note: "" },
    { label: "🛁 Shower sex", decision: "Yes", targetType: "act", note: "" },
  ],
  counters: [],
};

test("Match moment renders the result before and without its reveal", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  await mockApi(page, { request: approvedMatchRequest });
  await page.goto("/mutual?source=ask&requestId=req-1");

  // The result is in the DOM from the first render; the reveal only animates it.
  const heading = page.getByRole("heading", { name: "Both of you said yes." });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.locator(".match-moment")).toHaveAttribute("data-reveal", "full");
  await expect(page.locator(".match-act-name").filter({ hasText: "Sensual massage" })).toHaveCount(1);
  await expect(page.locator(".match-act-name").filter({ hasText: "Shower sex" })).toHaveCount(1);

  // One tap anywhere skips the reveal: every element is at its final state.
  await page.locator(".match-scroll").dispatchEvent("pointerdown");
  await expect(page.locator(".match-moment")).toHaveAttribute("data-reveal", "done");
  const finalState = await page.evaluate(() => ({
    // Reveal animations only (the shared atmosphere drift is ambient and separate).
    running: (document.querySelector(".match-moment")?.getAnimations({ subtree: true }) || [])
      .filter((animation) => String(animation.animationName || "").startsWith("match-")).length,
    opacities: [...document.querySelectorAll(".match-act-name, .mutual-title, .match-when, .match-dock > *")]
      .map((node) => getComputedStyle(node).opacity),
  }));
  expect(finalState.running).toBe(0);
  expect(finalState.opacities.every((value) => value === "1")).toBe(true);
  await expect(page.getByText("Tonight", { exact: true })).toBeVisible();
  await expect(page.getByText("Bring the oil.")).toBeVisible();

  // Every control in the dock is at least 44px tall.
  const heights = await page.locator(".match-dock a, .match-dock button").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
});

test("Approved Sexboard row morphs into the match hero, and a repeat visit gets the short reveal", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  await page.addInitScript(() => {
    window.__matchMorphs = 0;
    const original = document.startViewTransition?.bind(document);
    if (original) {
      document.startViewTransition = (callback) => {
        window.__matchMorphs += 1;
        return original(callback);
      };
    }
  });
  await mockApi(page, { request: approvedMatchRequest });
  await page.goto("/sexboard");

  const row = page.locator(".sexboard-handoff-row").filter({ hasText: "Approved for tonight." });
  await row.click();
  await expect(page).toHaveURL(/\/mutual\?/);
  await expect(page.locator("[data-match-hero][data-ready='1']")).toBeVisible();
  const morphs = await page.evaluate(() => window.__matchMorphs);
  const supported = await page.evaluate(() => typeof document.startViewTransition === "function");
  expect(morphs).toBe(supported ? 1 : 0);
  if (supported) await expect(page.locator(".match-moment")).toHaveAttribute("data-morph", "1");

  await page.goto("/mutual?source=ask&requestId=req-1");
  await expect(page.locator(".match-moment")).toHaveAttribute("data-reveal", /brief|done/);
  await expect(page.getByRole("heading", { name: "Both of you said yes." })).toBeVisible();
});

test("Match moment with reduced motion lands on the final state instantly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  await mockApi(page, { request: approvedMatchRequest });
  await page.goto("/mutual?source=ask&requestId=req-1");

  await expect(page.getByRole("heading", { name: "Both of you said yes." })).toBeVisible();
  await expect(page.locator(".match-moment")).toHaveAttribute("data-reveal", "done");
  await expect(page.locator(".match-act-name").first()).toHaveCSS("opacity", "1");
  const running = await page.evaluate(() => (document.querySelector(".match-moment")?.getAnimations({ subtree: true }) || [])
    .filter((animation) => String(animation.animationName || "").startsWith("match-")).length);
  expect(running).toBe(0);
  await expect(page.getByRole("button", { name: "Plan it" })).toBeVisible();
});

test("Plan it puts the match on the calendar and the Sexboard shows it as Planned", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  const state = { request: approvedMatchRequest };
  await mockApi(page, state);
  await page.goto("/mutual?source=ask&requestId=req-1");

  const planButton = page.getByRole("button", { name: "Plan it" });
  await expect(planButton).toBeEnabled();
  await planButton.click();
  await expect(page.getByRole("group", { name: "When?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Tonight/ })).toBeChecked();
  await page.getByRole("radio", { name: /This weekend/ }).check();
  await expect(page.getByRole("radio", { name: /This weekend/ })).toBeChecked();
  await page.getByRole("radio", { name: /Pick a time/ }).check();
  await expect(page.getByLabel("Day and time", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /^Tomorrow/ }).check();
  await page.getByRole("button", { name: "Save plan" }).click();

  await expect.poll(() => state.requestPlanBody?.action).toBe("plan");
  const plannedFor = new Date(state.requestPlanBody.plannedFor);
  expect(Number.isFinite(plannedFor.getTime())).toBe(true);
  expect(plannedFor.getHours()).toBe(21);
  await expect(page.getByRole("button", { name: /Planned.*Change/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Planned for/ })).toHaveCount(1);

  await page.getByRole("link", { name: "Back to Sexboard" }).click();
  await expect(page).toHaveURL(/\/sexboard$/);
  const plannedSection = page.locator(".sexboard-handoff-section", { has: page.locator(".sexboard-section-head", { hasText: "Planned" }) });
  await expect(plannedSection).toBeVisible();
  const plannedRow = plannedSection.locator(".sexboard-handoff-row");
  await expect(plannedRow).toContainText("Planned for");
  await expect(plannedRow).toContainText("Sensual massage");
  await expect(plannedRow).toContainText("You put it on the calendar.");
  await expect(plannedRow).toHaveAttribute("href", /\/mutual\?source=ask&requestId=req-1/);
});

test("Pile reveal final state fits the iPhone viewport", async ({ page }) => {
  await mockApi(page, { pile: revealedPile });
  await page.goto("/games/pile");
  await expect(page.getByRole("heading", { name: "In sync." })).toBeVisible();
  // The reveal animation slowed in 2026-05 (intro → final now takes ~5.2s, plus
  // a 900ms opacity/transform transition). Measure after the final state has
  // settled so we read the committed layout, not the pre-final scaled state.
  await page.waitForTimeout(6300);

  const metrics = await page.evaluate(() => {
    const final = document.querySelector(".pile-final");
    const heading = document.querySelector(".pile-final .pile-headline");
    const actions = document.querySelector(".pile-final-actions");
    const board = document.querySelector(".pile-reveal-board");
    const tabbar = document.querySelector(".tabbar");
    const visibleDoingThisCount = Array.from(document.querySelectorAll(".pile-reveal-eyebrow, .pile-final .pile-headline"))
      .filter((node) => {
        const style = getComputedStyle(node);
        return node.textContent?.includes("In sync") &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number.parseFloat(style.opacity || "1") > 0.05;
      }).length;

    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      finalTop: final?.getBoundingClientRect().top || 0,
      finalBottom: final?.getBoundingClientRect().bottom || 0,
      headingTop: heading?.getBoundingClientRect().top || 0,
      actionsBottom: actions?.getBoundingClientRect().bottom || 0,
      boardBottom: board?.getBoundingClientRect().bottom || 0,
      tabTop: tabbar?.getBoundingClientRect().top || window.innerHeight,
      visibleDoingThisCount,
    };
  });

  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(metrics.finalTop).toBeLessThan(330);
  expect(metrics.headingTop).toBeLessThan(260);
  expect(metrics.finalBottom).toBeLessThan(metrics.tabTop - 12);
  expect(metrics.actionsBottom).toBeLessThan(metrics.tabTop - 12);
  expect(metrics.boardBottom).toBeLessThan(metrics.tabTop - 12);
  expect(metrics.visibleDoingThisCount).toBe(1);
});

test("Inspiration source dock is stacked and tappable on iPhone", async ({ page }) => {
  await mockApi(page);
  await page.goto("/inspiration");
  await expect(page.locator(".inspiration-source-dock")).toBeVisible();
  await expect(page.locator(".inspiration-source-card")).toHaveCount(5);
  await expect(page.getByRole("link", { name: /Bellesa/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /RedGIFs/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Literotica/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /AO3/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Private Vault/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the Shelf/ })).toBeVisible();
  await expect(page.locator(".button-secondary")).toHaveCount(0);
});

test("Private Vault uploads phone videos with generic MIME from extension", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/space/vault");
  await expect(page.getByText("Add private video")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "phone-clip.MOV",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]),
  });
  await page.getByPlaceholder("Shared Vault passphrase").fill("shared secret");
  await page.getByRole("button", { name: "Encrypt and save" }).click();

  await expect.poll(() => state.vaultUploadSeen).toBe(true);
  await expect(page.locator(".vault-status").last()).toHaveText("Encrypted clip saved.");
});

test("Private Vault sniffs iOS hidden videos without useful metadata", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/space/vault");
  await expect(page.getByText("Add private video")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "IMG_0001",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 113, 116, 32, 32, 0, 0, 0, 0]),
  });
  await page.getByPlaceholder("Shared Vault passphrase").fill("shared secret");
  await page.getByRole("button", { name: "Encrypt and save" }).click();

  await expect.poll(() => state.vaultUploadSeen).toBe(true);
  await expect(page.locator(".vault-status").last()).toHaveText("Encrypted clip saved.");
});

test("Shelf activity arrival records reveal and keeps media hideable", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/inspiration/shelf?item=shelf-1&activity=1&action=revealed");
  await expect(page.getByText("Recently opened")).toBeVisible();
  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByRole("button", { name: "Hide" })).toBeVisible();
  await expect.poll(() => state.shelfPatchBody?.action).toBe("revealed");
});

test("Shelf RedGifs reveal uses muted native video without RedGifs chrome", async ({ page }) => {
  const redgifsItem = {
    ...shelfItem,
    id: "shelf-redgifs",
    type: "gif",
    source: "redgifs",
    sourceLabel: "REDGIFS",
    sourceUrl: "https://www.redgifs.com/watch/sample",
    embedUrl: "https://www.redgifs.com/ifr/sample?hd=1&muted=1&autoplay=0",
    posterUrl: "https://media.redgifs.com/sample-poster.jpg",
    videoHdUrl: "https://media.redgifs.com/sample-hd.mp4",
    videoSdUrl: "https://media.redgifs.com/sample-sd.mp4",
    title: "Saved RedGifs",
  };
  await mockApi(page, {
    shelf: {
      workspaceId: workspace.id,
      reactionCatalog: shelfReactionCatalog,
      item: redgifsItem,
      items: [redgifsItem],
    },
  });
  await page.goto("/inspiration/shelf");

  await page.getByRole("button", { name: "Reveal" }).click();
  const video = page.locator(".media-art video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", "https://media.redgifs.com/sample-hd.mp4");
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).toHaveJSProperty("autoplay", true);
  await expect(video).not.toHaveAttribute("controls", /.*/);
  await expect(page.locator(".media-art iframe")).toHaveCount(0);
  await expect(page.getByText("Open source")).toHaveCount(0);
});

test("Shelf RedGifs reveal resolves missing native video before opening", async ({ page }) => {
  const missingVideo = {
    ...shelfItem,
    id: "shelf-redgifs-missing",
    type: "gif",
    source: "redgifs",
    sourceLabel: "REDGIFS",
    sourceUrl: "https://www.redgifs.com/watch/sample",
    embedUrl: "https://www.redgifs.com/ifr/sample?hd=1&muted=1&autoplay=0",
    videoHdUrl: "",
    videoSdUrl: "",
    title: "Fresh RedGifs",
  };
  const resolvedVideo = {
    ...missingVideo,
    videoHdUrl: "https://media.redgifs.com/sample-hd.mp4",
    videoSdUrl: "https://media.redgifs.com/sample-sd.mp4",
  };
  await mockApi(page, {
    shelf: {
      workspaceId: workspace.id,
      reactionCatalog: shelfReactionCatalog,
      item: missingVideo,
      items: [missingVideo],
    },
    shelfRevealResponse: {
      workspaceId: workspace.id,
      reactionCatalog: shelfReactionCatalog,
      item: resolvedVideo,
      items: [resolvedVideo],
    },
  });
  await page.goto("/inspiration/shelf");

  await page.getByRole("button", { name: "Reveal" }).click();
  const video = page.locator(".media-art video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", "https://media.redgifs.com/sample-hd.mp4");
  await expect(page.locator(".media-art iframe")).toHaveCount(0);
  await expect(page.getByText("Open source")).toHaveCount(0);
});

test("Shelf Bellesa reveal can try in-app video and keeps the external provider link", async ({ page }) => {
  const bellesaItem = {
    ...shelfItem,
    id: "shelf-bellesa",
    type: "story",
    source: "bellesa",
    sourceLabel: "BELLESA",
    sourceUrl: "https://www.bellesa.com/videos/4135/hot-property",
    title: "Hot Property",
  };
  await mockApi(page, {
    bellesaVideo: {
      id: 4135,
      title: "Hot Property",
      source: "5f5a5c40034d4a621406a5bf",
      resolutions: "360,480,720",
      image: "https://c.bellesa.co/dkvdbifey/image/upload/v1615830229/video_upload/dhl9os_threeofus.jpg",
      access: { public: 1 },
    },
    shelf: {
      workspaceId: workspace.id,
      reactionCatalog: shelfReactionCatalog,
      item: bellesaItem,
      items: [bellesaItem],
    },
  });
  await page.goto("/inspiration/shelf");

  await page.getByRole("button", { name: "Reveal" }).click();
  const video = page.locator(".media-art video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", "https://s.bellesa.co/v/5f5a5c40034d4a621406a5bf/720.mp4");
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).toHaveJSProperty("autoplay", true);
  await expect(video).not.toHaveAttribute("loop", /.*/);
  const link = page.getByRole("link", { name: "Open Bellesa" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://www.bellesa.co/videos/4135/hot-property");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.getByText("Open source")).toHaveCount(0);
});

test("Shelf partner reactions use the partner name", async ({ page }) => {
  const reactedItem = {
    ...shelfItem,
    reactions: { "jordan@example.test": "fire" },
  };
  await mockApi(page, {
    shelf: {
      workspaceId: workspace.id,
      reactionCatalog: shelfReactionCatalog,
      item: reactedItem,
      items: [reactedItem],
    },
  });
  await page.goto("/inspiration/shelf");

  await expect(page.getByText("Jordan taps")).toBeVisible();
  await expect(page.locator(".partner-strip")).toContainText("Jordan");
  await expect(page.locator(".partner-strip")).not.toContainText("Partner");
  await expect(page.getByText("Jordan sees it the moment you do.")).toBeVisible();
});

test("Activity deep links glow Ask and Kink targets", async ({ page }) => {
  await mockApi(page);
  await page.goto("/ask-detail?id=req-1&activity=1");
  await expect(page.locator(".activity-detail-stage[data-activity-highlight='true']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await expect(page.getByText("Reply link required")).toHaveCount(0);
  await page.goto("/inspiration/kink?id=kink-1&activity=1");
  await expect(page.locator(".kd-stage[data-activity-highlight='true']")).toBeVisible();
});

const replyActs = ["💋 Slow kissing", "🚿 Shower sex"];

test("Ask reply card puts the whole decision on one screen", async ({ page }) => {
  await mockApi(page, { request: { ...request, categories: replyActs } });
  await page.goto("/ask-detail?id=req-1&activity=1");

  // Focus starts on the card heading; the Acts are the hero.
  const heading = page.getByRole("heading", { level: 1, name: "Jordan wants" });
  await expect(heading).toBeFocused();
  // The card's heading is the page's one h1 (the shared header drops its title).
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Requested Acts" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Slow and close.")).toBeVisible();
  await expect(page.getByText("Reply link required")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await expect(page.locator(".tabbar")).toHaveCount(0);

  const backToSexboard = page.getByRole("link", { name: "Back to Sexboard" });
  await expect(backToSexboard).toBeVisible();
  await expect(backToSexboard).toHaveAttribute("href", "/sexboard");
  const backMetrics = await backToSexboard.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { height: rect.height, width: rect.width, fontSize: Number.parseFloat(getComputedStyle(node).fontSize) };
  });
  // Shared drill-down back control: 44px chevron plus the parent's name.
  expect(backMetrics.height).toBeGreaterThanOrEqual(44);
  expect(backMetrics.width).toBeGreaterThanOrEqual(44);
  expect(backMetrics.fontSize).toBeGreaterThanOrEqual(13);

  // Every decision is reachable without scrolling, at thumb-friendly size.
  const viewport = page.viewportSize();
  for (const name of ["Pass", "Maybe", "Yes to all", "Counter with something else"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box.y + box.height, name).toBeLessThanOrEqual(viewport.height);
    expect(box.height, name).toBeGreaterThanOrEqual(44);
  }
  const scrollRoom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(scrollRoom).toBeLessThanOrEqual(1);
});

test("Ask reply Yes commits in one tap and hands off to the match", async ({ page }) => {
  const state = { request: { ...request, categories: replyActs } };
  await mockApi(page, state);
  await page.goto("/ask-detail?id=req-1");

  await page.getByRole("button", { name: "Yes to all" }).click();
  // The short undo window shows first; nothing is sent yet.
  await expect(page.getByText("Sending your yes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  expect(state.requestReplyBody).toBeUndefined();

  // Left alone, it sends by itself.
  await expect.poll(() => state.requestReplyBody?.decisions?.map((item) => item.decision), { timeout: 8000 }).toEqual(["Yes", "Yes"]);
  expect(state.requestReplyBody.decisions.map((item) => item.label)).toEqual(replyActs);
  await expect(page).toHaveURL(/\/mutual\?/);
  await expect(page.getByRole("heading", { name: "Both of you said yes." })).toBeVisible();
});

test("Ask reply Pass can be undone, then sends with a calm result", async ({ page }) => {
  const state = {
    request: {
      ...request,
      requesterEmail: "ans@example.test",
      requesterName: "Avery",
      requester: "Avery",
      reviewerEmail: auth.email,
      reviewerName: "Rowan",
      reviewer: "Rowan",
      categories: ["Slow kissing", "Shower sex"],
      note: "Want this tonight?",
      status: "sent",
    },
  };
  await mockApi(page, state);
  await page.goto("/ask-detail?id=req-1");

  await expect(page.getByRole("heading", { name: "Avery wants" })).toBeVisible();
  await page.getByRole("button", { name: "Pass" }).click();
  // Focus follows the swap to the undo bar and back.
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Pass" })).toBeFocused();
  await page.waitForTimeout(4500);
  expect(state.requestReplyBody).toBeUndefined();

  await page.getByRole("button", { name: "Pass" }).click();
  await page.getByRole("button", { name: "Send now" }).click();

  await expect.poll(() => state.requestReplyBody?.action).toBe("reply");
  await expect.poll(() => state.requestReplyBody?.decisions?.map((item) => item.decision)).toEqual(["No", "No"]);
  const result = page.getByTestId("ask-reply-result");
  await expect(result.getByRole("heading", { name: "Passed." })).toBeFocused();
  // The explanation is spoken through the app's one polite announcer.
  await expect(page.getByTestId("app-announcer")).toHaveText("Avery gets a quiet heads-up. No reason needed.");
  await expect(result.getByRole("link", { name: "Back to Sexboard" })).toHaveAttribute("href", "/sexboard");
  await expect(page.getByRole("heading", { name: "Your reply" })).toBeVisible();
  await expect(page.getByTestId("ask-reply-verdict")).toHaveText("Passed on all of it.");
  await expect(page.getByTestId("ask-status")).toHaveText("Passed");
  await expect(page.getByText("Countered with")).toHaveCount(0);
  await expect(page.getByText("Partner response")).toHaveCount(0);
});

test("Ask reply Maybe defers in one tap and can be decided later", async ({ page }) => {
  const state = { request: { ...request, categories: replyActs } };
  await mockApi(page, state);
  await page.goto("/ask-detail?id=req-1");

  await page.getByRole("button", { name: "Maybe" }).click();
  await expect(page.getByText("Saving your maybe", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send now" }).click();

  await expect.poll(() => state.requestActionBody?.action).toBe("maybe");
  expect(state.requestReplyBody).toBeUndefined();
  const result = page.getByTestId("ask-reply-result");
  await expect(result.getByRole("heading", { name: "Saved as a maybe." })).toBeVisible();
  await expect(page.getByTestId("ask-status")).toHaveText("You said maybe");

  // A maybe stays answerable: Decide now brings the card back without Maybe.
  await result.getByRole("button", { name: "Decide now instead" }).click();
  await expect(page.getByText("You said maybe earlier.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Maybe" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yes to all" })).toBeVisible();
});

test("Ask reply Counter opens a focused sheet with any other act and time", async ({ page }) => {
  const state = { request: { ...request, categories: replyActs } };
  await mockApi(page, state);
  await page.goto("/ask-detail?id=req-1&activity=1");

  const opener = page.getByRole("button", { name: "Counter with something else" });
  await opener.click();
  const sheet = page.getByRole("dialog", { name: "Counter" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Back" })).toBeFocused();
  // Escape closes the sheet and focus returns to the opener.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(sheet).toBeVisible();
  // The offer grid never repeats an Act that was already asked for.
  const offerGrid = sheet.locator(".ask-act-grid");
  await expect(offerGrid.getByRole("button", { name: /Slow kissing/ })).toHaveCount(0);
  await expect(offerGrid.getByRole("button", { name: /Shower sex/ })).toHaveCount(0);
  const keep = sheet.getByRole("button", { name: /Slow kissing/ });
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await expect(sheet.getByRole("button", { name: /^Send counter/ })).toBeDisabled();

  const massage = offerGrid.getByRole("button", { name: /Sensual massage/ });
  await massage.click();
  await expect(massage).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Tomorrow" }).click();
  await sheet.getByLabel("Note").fill("Different vibe.");
  await sheet.getByRole("button", { name: /^Send counter/ }).click();

  await expect.poll(() => state.requestReplyBody?.action).toBe("reply");
  await expect.poll(() => state.requestReplyBody?.decisions?.find((item) => item.targetType === "act")?.decision).toBe("Counter");
  await expect.poll(() => state.requestReplyBody?.decisions?.find((item) => item.targetType === "act")?.counter).toContain("Sensual massage");
  await expect.poll(() => state.requestReplyBody?.decisions?.find((item) => item.targetType === "timing")?.counter).toBe("Tomorrow");
  await expect.poll(() => state.requestReplyBody?.note).toBe("Different vibe.");

  await expect(page.getByTestId("ask-reply-result").getByRole("heading", { name: "Counter sent." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your reply" })).toBeVisible();
  const counter = page.getByTestId("ask-counter");
  await expect(counter).toContainText("Countered with");
  await expect(counter).toContainText("Sensual massage");
  await expect(counter).toContainText("Tomorrow instead of tonight");
  await expect(page.getByText(/Counter option/)).toHaveCount(0);
  await expect(page.getByTestId("ask-status")).toHaveText("Countered");
});

test("Ask reply Counter can keep some requested acts", async ({ page }) => {
  const state = { request: { ...request, categories: replyActs } };
  await mockApi(page, state);
  await page.goto("/ask-detail?id=req-1");

  await page.getByRole("button", { name: "Counter with something else" }).click();
  const sheet = page.getByRole("dialog", { name: "Counter" });
  await sheet.getByRole("button", { name: /Slow kissing/ }).click();
  await sheet.locator(".ask-act-grid").getByRole("button", { name: /Sensual massage/ }).click();
  await sheet.getByRole("button", { name: /^Send counter/ }).click();

  await expect.poll(() => state.requestReplyBody?.decisions?.map((item) => [item.label, item.decision])).toEqual([
    ["💋 Slow kissing", "Yes"],
    ["Counter option 1", "Counter"],
  ]);
});

test("Answered Ask views label the reply from each side", async ({ page }) => {
  const state = { request: { ...counteredRequest, feedback: "Different vibe." } };
  await mockApi(page, state);
  await page.goto("/ask-detail?id=req-1");

  // Sent by me, countered by Jordan.
  await expect(page.getByRole("heading", { name: "You asked for" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jordan's reply" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your reply" })).toHaveCount(0);
  await expect(page.getByTestId("ask-status")).toHaveText("Countered");
  await expect(page.getByTestId("ask-counter")).toHaveCount(1);
  await expect(page.getByText(/Counter option/)).toHaveCount(0);
  await expect(page.getByText(/Timing: Tonight/)).toHaveCount(0);
  await expect(page.getByText("Jordan's note")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept counter" })).toBeVisible();

  // Jordan's Ask that I already said yes to.
  state.request = {
    ...request,
    status: "reviewed",
    decisions: [{ label: "Kiss", decision: "Yes", counter: "", counterActId: "", note: "", targetType: "act", actId: "" }],
    reviewedAt: "2026-05-23T00:20:00.000Z",
  };
  await page.reload();
  await expect(page.getByRole("heading", { name: "Jordan wanted" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your reply" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jordan's reply" })).toHaveCount(0);
  await expect(page.getByTestId("ask-status")).toHaveText("Yes");
  await expect(page.getByTestId("ask-reply-verdict")).toHaveText("Yes.");
  await expect(page.getByText("It’s on")).toBeVisible();
  await expect(page.getByRole("link", { name: "See the match" })).toBeVisible();

  // My own Ask, still waiting.
  state.request = { ...request, requesterEmail: auth.email, requesterName: "Alex", requester: "Alex", reviewerEmail: "jordan@example.test", reviewerName: "Jordan", reviewer: "Jordan" };
  await page.reload();
  await expect(page.getByTestId("ask-status")).toHaveText("Waiting on Jordan");
  await expect(page.getByRole("button", { name: "Remind Jordan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take back this Ask" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes" })).toHaveCount(0);
});

test("Accepting an Ask counter shows the partner note before approval", async ({ page }) => {
  const state = { request: { ...counteredRequest, feedback: "Different vibe." } };
  await mockApi(page, state);
  await page.goto("/ask-detail?id=req-1");

  await expect(page.getByRole("button", { name: "Accept counter" })).toBeVisible();
  await expect(page.getByText("Different vibe.")).toBeVisible();
  await page.getByRole("button", { name: "Accept counter" }).click();

  await expect.poll(() => state.requestActionBody?.action).toBe("accept_counter");
  await expect(page).toHaveURL(/\/mutual\?/);
  await expect(page).toHaveURL(/requestId=req-1/);
  await expect(page.getByText("The Ask landed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Both of you said yes." })).toBeVisible();
  await expect(page.getByText(/Sensual massage/)).toBeVisible();
});

test("Counter accepted activity opens the shared approval splash for the partner", async ({ page }) => {
  const state = {
    request: {
      ...counteredRequest,
      status: "on_deck",
      categories: ["💆 Sensual massage"],
      timing: "Tomorrow",
      counterAcceptedAt: "2026-05-23T00:25:00.000Z",
      acceptedCounters: counterDecisions,
    },
    activity: {
      ...cloneJson(activityResponse),
      unreadTotal: 1,
      unreadByResource: { "request-board": 1 },
      items: [
        {
          id: "counter-accepted-activity",
          workspaceId: workspace.id,
          resource: "request-board",
          resourceLabel: "Sexboard",
          action: "counter_accepted",
          label: "Counter accepted",
          entityId: "req-1",
          actorEmail: "jordan@example.test",
          actorName: "Jordan",
          at: "2026-05-23T00:25:00.000Z",
          passive: false,
          unread: true,
        },
      ],
    },
  };
  await mockApi(page, state);
  await page.goto("/sexboard");

  const activityRow = page.locator(".live-activity-item").filter({ hasText: "Counter accepted" });
  await expect(activityRow).toHaveAttribute("href", /\/mutual\?source=ask&requestId=req-1/);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("sexualsync:room-event", {
      detail: {
        resource: "request-board",
        action: "counter_accepted",
        entityId: "req-1",
        actorEmail: "jordan@example.test",
        actorName: "Jordan",
      },
    }));
  });

  await expect(page).toHaveURL(/\/mutual\?/);
  await expect(page.getByRole("heading", { name: "Both of you said yes." })).toBeVisible();
  await expect(page.getByText(/Sensual massage/)).toBeVisible();
});

test("A fresh device ignores replayed room events: no splash, no toast, only live ones act", async ({ page }) => {
  const state = {
    request: {
      ...counteredRequest,
      status: "on_deck",
      categories: ["💆 Sensual massage"],
      timing: "Tomorrow",
      counterAcceptedAt: "2026-05-23T00:25:00.000Z",
      acceptedCounters: counterDecisions,
    },
  };
  await mockApi(page, state);
  let socket = null;
  let connected = 0;
  await page.routeWebSocket(/\/api\/room\/socket/, (ws) => {
    socket = ws;
    connected += 1;
    ws.send(JSON.stringify({ type: "room.hello", workspaceId: workspace.id, latestSeq: 3, online: [], at: new Date().toISOString() }));
    // No stored seq on this device: the room replays its buffer, minutes old.
    for (const seq of [1, 2, 3]) {
      ws.send(JSON.stringify({
        type: "room.event",
        seq,
        event: {
          seq,
          resource: "request-board",
          action: "counter_accepted",
          entityId: "req-1",
          actorEmail: "jordan@example.test",
          actorName: "Jordan",
          at: "2026-05-23T00:25:00.000Z",
        },
      }));
    }
  });
  await page.goto("/chat");
  await expect.poll(() => connected).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.locator(".live-activity-toast")).toHaveCount(0);

  // Something that happens after the hello still opens the splash.
  socket.send(JSON.stringify({
    type: "room.event",
    seq: 4,
    event: {
      seq: 4,
      resource: "request-board",
      action: "counter_accepted",
      entityId: "req-1",
      actorEmail: "jordan@example.test",
      actorName: "Jordan",
      at: new Date().toISOString(),
    },
  }));
  await expect(page).toHaveURL(/\/mutual\?/);
});

test("Request reply link shares the one-card reply", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/review?token=reply-token");

  await expect(page.getByRole("heading", { level: 1, name: `${request.requesterName} wants` })).toBeFocused();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Back to Sexboard" })).toHaveAttribute("href", "/sexboard");
  await expect(page.getByText(`From ${request.requesterName} · private reply link`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  // The single-use link answers once, so it offers no Maybe.
  await expect(page.getByRole("button", { name: "Maybe" })).toHaveCount(0);

  await page.getByRole("button", { name: "Counter with something else" }).click();
  const sheet = page.getByRole("dialog", { name: "Counter" });
  await expect(sheet.getByText("Timing", { exact: true })).toBeVisible();
  const cadenceMetrics = await sheet.locator(".cadence-grid").evaluate((grid) => {
    const gridRect = grid.getBoundingClientRect();
    const buttons = Array.from(grid.querySelectorAll("button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        height: rect.height,
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth,
      };
    });
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
      gridLeft: gridRect.left,
      gridRight: gridRect.right,
      buttons,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(cadenceMetrics.columns).toBe(3);
  expect(cadenceMetrics.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(cadenceMetrics.buttons).toHaveLength(3);
  for (const button of cadenceMetrics.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(cadenceMetrics.gridLeft - 1);
    expect(button.right).toBeLessThanOrEqual(cadenceMetrics.gridRight + 1);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeLessThanOrEqual(62);
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
  }
  await sheet.getByRole("button", { name: "Back" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Send now" }).click();

  await expect.poll(() => state.reviewSubmitBody?.decisions?.[0]?.decision).toBe("Yes");
  await expect(page.getByRole("heading", { name: "Reply sent" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See the match" })).toBeVisible();
});

test("Rowan can pass Avery's Ask from a private reply link", async ({ page }) => {
  const state = {
    request: {
      ...request,
      requesterEmail: "ans@example.test",
      requesterName: "Avery",
      requester: "Avery",
      reviewerEmail: auth.email,
      reviewerName: "Rowan",
      reviewer: "Rowan",
      categories: ["Slow kissing"],
      status: "sent",
    },
  };
  await mockApi(page, state);
  await page.goto("/review?token=reply-token");

  await expect(page.getByRole("heading", { name: "Avery wants" })).toBeVisible();
  await page.getByRole("button", { name: "Pass" }).click();
  await page.getByRole("button", { name: "Send now" }).click();

  await expect.poll(() => state.reviewSubmitBody?.decisions?.[0]?.decision).toBe("No");
  await expect(page.getByRole("heading", { name: "Reply sent" })).toBeVisible();
});

test("Root review links preserve the reply token", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?review=reply-token");

  await expect(page).toHaveURL(/\/review\?token=reply-token$/);
  await expect(page.getByRole("heading", { name: `${request.requesterName} wants` })).toBeVisible();
});

// Offline simulation: context.setOffline() doesn't combine with route mocks,
// so tests abort the mocked API themselves and flip navigator.onLine + fire
// the matching window event, which is what the app listens to.
async function setNavigatorOnline(page, online) {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  }, online);
}

test("Sexboard load error is plain-language and recovers with Try again", async ({ page }) => {
  await mockApi(page, {});
  let failSexboard = true;
  await page.route("**/api/sexboard", (route) => (failSexboard
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal error" }) })
    : route.fallback()));
  await page.goto("/sexboard");

  await expect(page.getByRole("heading", { name: "Couldn't load your Sexboard" })).toBeVisible();
  await expect(page.getByText("Internal error")).toHaveCount(0);
  failSexboard = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".sexboard-handoff-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Couldn't load your Sexboard" })).toHaveCount(0);
});

test("Sext keeps the thread and composer offline, queues a text, and recovers online", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/chat");
  const thread = page.getByRole("log", { name: "Messages" });
  await expect(thread.locator(".chat-row").first()).toBeVisible();
  const seededRows = await thread.locator(".chat-row").count();

  let offline = true;
  await page.route("**/api/**", (route) => (offline ? route.abort("internetdisconnected") : route.fallback()));
  await setNavigatorOnline(page, false);

  await expect(page.getByText("You're offline", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-offline-banner")).toBeVisible();
  await expect(thread.locator(".chat-row")).toHaveCount(seededRows);
  await expect(page.getByRole("button", { name: /Send a photo/ })).toBeDisabled();

  await page.getByPlaceholder(/Message Jordan/).fill("Thinking about you.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(thread.getByText("Waiting to send")).toBeVisible();
  await expect(thread.getByText("Thinking about you.")).toBeVisible();
  await expect(page.locator(".chat-error")).toHaveCount(0);

  offline = false;
  await setNavigatorOnline(page, true);
  await expect.poll(() => state.chatPostBody?.text).toBe("Thinking about you.");
  await expect(thread.getByText("Waiting to send")).toHaveCount(0);
  await expect(thread.getByText("Thinking about you.")).toHaveCount(1);
  await expect(page.locator(".chat-offline-banner")).toHaveCount(0);
  await expect(page.getByText("You're offline", { exact: true })).toHaveCount(0);
});

test("Sext settles a queued text the server refuses: bubble goes, draft comes back, reason shown", async ({ page }) => {
  await mockApi(page, {});
  await page.goto("/chat");
  const thread = page.getByRole("log", { name: "Messages" });
  await expect(thread.locator(".chat-row").first()).toBeVisible();

  let offline = true;
  await page.route("**/api/**", (route) => (offline ? route.abort("internetdisconnected") : route.fallback()));
  await setNavigatorOnline(page, false);

  const composer = page.getByPlaceholder(/Message Jordan/);
  await composer.fill("Thinking about you.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(thread.getByText("Waiting to send")).toBeVisible();

  // The partner switched on Room Encryption while this text sat in the queue.
  let refusedPosts = 0;
  await page.route("**/api/chat", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    refusedPosts += 1;
    return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Room Encryption requires encrypted messages." }) });
  });
  offline = false;
  await setNavigatorOnline(page, true);

  await expect(thread.getByText("Waiting to send")).toHaveCount(0);
  await expect(page.locator(".chat-error")).toContainText("Room Encryption requires encrypted messages.");
  await expect(composer).toHaveValue("Thinking about you.");
  await expect(thread.getByText("Thinking about you.")).toHaveCount(0);
  // Dropped, not retried on the next focus.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(300);
  expect(refusedPosts).toBe(1);
});

test("Offline Ask shows the queued confirmation, then waits on the Sexboard", async ({ page }) => {
  const state = { acts: [savedLibraryAct] };
  await mockApi(page, state);
  await page.goto("/ask");

  await page.getByRole("button", { name: "Slow undressing" }).click();
  await page.route("**/api/request-board", (route) => (route.request().method() === "POST"
    ? route.abort("internetdisconnected")
    : route.fallback()));
  await setNavigatorOnline(page, false);
  await page.getByRole("button", { name: "Send to Jordan" }).click();

  await expect(page.locator(".ss-send-pulse-confirm-headline")).toHaveText("Queued — sends when you're back online.");
  await expect(page).toHaveURL(/\/sexboard$/);
  const queued = page.locator(".sexboard-handoff-row--queued");
  await expect(queued).toContainText("Slow undressing");
  await expect(queued).toContainText("when you're back online");
});

// ---------- v2 layout: thumb-zone send, one header system, human statuses ----------

test("Ask pins Send in the thumb zone and highlights picked Acts in place", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/ask");
  await expect(page.getByRole("heading", { name: "Be specific." })).toBeVisible();

  // Send sits in the sticky bar, on screen above the tab bar, before any scroll.
  const send = page.locator(".sticky-action").getByRole("button", { name: "Send to Jordan" });
  await expect(send).toBeVisible();
  const sendBox = await send.boundingBox();
  const tabBox = await page.locator(".tabbar-inner").boundingBox();
  expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(tabBox.y);

  // Unavailable Send stays focusable and explains itself.
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await expect(send).toHaveAttribute("aria-describedby", "ask-send-status");
  await expect(page.getByTestId("ask-send-status")).toHaveText("Choose at least one Act");
  // Playwright won't click an aria-disabled control, which is the point: use
  // the keyboard, as a user who tabs to Send would.
  await send.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("app-announcer")).toHaveText("Choose at least one Act");
  await expect(page).toHaveURL(/\/ask$/);

  // Picking an Act never reorders the grid.
  const grid = page.getByRole("group", { name: "Acts" });
  const namesBefore = await grid.locator(".act-chip-name").allTextContents();
  const third = grid.locator(".act-chip").nth(2);
  await third.click();
  await expect(third).toHaveAttribute("aria-pressed", "true");
  expect(await grid.locator(".act-chip-name").allTextContents()).toEqual(namesBefore);
  await expect(page.locator(".selected-act-strip")).toHaveCount(0);

  await expect(send).toHaveAttribute("aria-disabled", "false");
  await expect(page.getByTestId("ask-send-status")).toHaveText("1 Act selected · Tonight");

  // Timing is one choice: a radiogroup.
  const timing = page.getByRole("radiogroup", { name: "Timing" });
  await expect(timing.getByRole("radio", { name: "Tonight" })).toHaveAttribute("aria-checked", "true");
  await timing.getByRole("radio", { name: "Tomorrow" }).click();
  await expect(timing.getByRole("radio", { name: "Tomorrow" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("ask-send-status")).toHaveText("1 Act selected · Tomorrow");
});

test("Drill-down screens get a 44px back control and tab screens get none", async ({ page }) => {
  await mockApi(page);

  await page.goto("/space/limits");
  const back = page.getByRole("link", { name: "Back to Us" });
  await expect(back).toBeVisible();
  const box = await back.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("heading", { level: 1, name: "Limits" })).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/space$/);

  await page.goto("/games/sex-quiz");
  await expect(page.getByRole("link", { name: "Back to Play" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Sex Quiz" })).toBeVisible();

  // Sext is a top-level tab: no back control, and a serif h1 like the others.
  await page.goto("/chat");
  await expect(page.getByRole("heading", { level: 1, name: "Sext with Jordan" })).toHaveCount(1);
  await expect(page.getByTestId("screen-back")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message Jordan" })).toBeVisible();

  // Modal-style flows close with a 44px Done pill and drop the tab bar.
  await page.goto("/inspiration/shelf");
  const done = page.getByTestId("screen-done");
  await expect(done).toBeVisible();
  expect((await done.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".tabbar")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "The Shelf" })).toBeVisible();
});

test("Reveals tiles say whose turn it is in plain words", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("ss:runnerdraft:green-lights:mobile-room", JSON.stringify({
        answers: { a: { value: "good" }, b: { value: "no" }, c: { value: "depends" } },
        index: 3,
        phase: "cards",
      }));
    } catch {}
  });
  await mockApi(page, {
    sexQuizFull: { status: "open", mySubmitted: false, partnerSubmitted: true, partnerName: "Jordan", myRatings: {}, myTopPicks: [], matches: [] },
    greenLightsFull: { status: "open", mySubmitted: false, partnerSubmitted: false, partnerName: "Jordan", myAnswers: {}, partnerAnswers: {} },
    pile: { ...activePile, mine: ["Kiss"], partnerHasDropped: false },
  });
  await page.goto("/games");
  // Only the Sex Quiz is waiting on Alex: it gets the full tile on top.
  const tiles = page.locator(".game-tile");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.nth(0).locator(".game-status")).toHaveText("Your turn — Jordan finished");
  // Games under way follow as rows, then the untouched one, which says what
  // it is instead of "New".
  const rows = page.locator(".play-row-game");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute("href", "/games/green-lights");
  await expect(rows.nth(0).locator(".play-row-sub")).toHaveText(/^In progress · 3 of \d+$/);
  await expect(rows.nth(0).locator(".play-row-cta")).toContainText("Resume");
  await expect(rows.nth(1).locator(".play-row-sub")).toHaveText("Waiting on Jordan");
  await expect(rows.nth(2)).toHaveAttribute("href", "/games/blind-reveal");
  await expect(rows.nth(2).locator(".play-row-sub")).toHaveText("One question, two answers, opened together.");
  await expect(page.locator(".game-status", { hasText: "Idle" })).toHaveCount(0);
});

test("Tab bar has five slots with Ask as the raised centre action", async ({ page }) => {
  await mockApi(page);
  await page.goto("/games");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(5);
  expect(await links.locator(".tab-label").allTextContents()).toEqual(["Home", "Play", "Ask", "Sext", "Us"]);
  await expect(nav.getByRole("link", { name: /^Play/ })).toHaveAttribute("aria-current", "page");

  // Ask is the third (centre) slot, a 48px+ disc set into the bar.
  const ask = nav.getByRole("link", { name: "Ask" });
  await expect(ask).toHaveClass(/tab-primary/);
  const disc = await ask.locator(".tab-icon").boundingBox();
  const bar = await page.locator(".tabbar-inner").boundingBox();
  expect(disc.width).toBeGreaterThanOrEqual(48);
  expect(disc.y).toBeLessThan(bar.y);
  expect(disc.x + disc.width / 2).toBeCloseTo(bar.x + bar.width / 2, -1);
  await ask.click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Ask" })).toHaveAttribute("aria-current", "page");

  // Inspiration lives in Play: its routes light the Play tab and go back to Play.
  await page.goto("/inspiration");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /^Play/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Back to Play" })).toHaveAttribute("href", "/games");
  await page.goto("/space/limits");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /^Us/ })).toHaveAttribute("aria-current", "page");
});

test("Play links into Inspiration without repeating it", async ({ page }) => {
  await mockApi(page);
  await page.goto("/games");
  const inspo = page.getByRole("region", { name: "Inspiration" });
  await expect(inspo.getByRole("link", { name: /Today's prompt/ })).toHaveAttribute("href", "/inspiration#kink-compose");
  await expect(inspo.getByRole("link", { name: /Kinks, fantasies & confessions/ })).toHaveAttribute("href", "/inspiration?section=shared-kinks");
  await expect(inspo.getByRole("link", { name: /The Shelf/ })).toHaveAttribute("href", "/inspiration/shelf");
  await expect(inspo.getByRole("link", { name: /Watch and read/ })).toHaveAttribute("href", "/inspiration#sources");
  // The source dock and composer live only on /inspiration.
  await expect(page.locator(".inspiration-source-dock")).toHaveCount(0);
  await expect(page.locator(".kink-compose-form")).toHaveCount(0);
  await inspo.getByRole("link", { name: /The Shelf/ }).click();
  await expect(page).toHaveURL(/\/inspiration\/shelf$/);
});

test("Us opens Settings as a focus-trapped sheet that Escape closes", async ({ page }) => {
  await mockApi(page);
  await page.goto("/space");
  await expect(page.getByRole("heading", { level: 1, name: "Us" })).toBeVisible();
  // The version badge stays on Us itself.
  await expect(page.locator(".settings-footer .chip.settings-version")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);

  const gear = page.getByRole("button", { name: "Settings" });
  const gearBox = await gear.boundingBox();
  expect(gearBox.width).toBeGreaterThanOrEqual(44);
  expect(gearBox.height).toBeGreaterThanOrEqual(44);
  await gear.click();
  const sheet = page.getByRole("dialog", { name: "Settings" });
  await expect(sheet).toBeVisible();
  await expect(gear).toHaveAttribute("aria-expanded", "true");
  const done = sheet.getByRole("button", { name: "Done" });
  await expect(done).toBeFocused();
  await expect(sheet.getByRole("switch", { name: /Blur the dirty stuff/ })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Sign out of this device/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  await expect(gear).toBeFocused();

  // Deep link straight into the sheet.
  await page.goto("/space?settings=1");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/space$/);
});

test("Notification presets write the per-device preference map", async ({ page }) => {
  const state = {};
  await page.addInitScript(() => {
    const subscription = {
      endpoint: "https://push.example.test/alex-phone",
      expirationTime: null,
      keys: { p256dh: "p256", auth: "auth" },
      toJSON() {
        return { endpoint: this.endpoint, expirationTime: this.expirationTime, keys: this.keys };
      },
    };
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "granted", requestPermission: async () => "granted" },
    });
    Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: null,
        addEventListener: () => {},
        register: async () => ({ waiting: null, installing: null, update: async () => {}, addEventListener: () => {} }),
        ready: Promise.resolve({
          pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription },
        }),
      },
    });
  });
  await mockApi(page, state);
  await page.goto("/space?settings=1");
  const sheet = page.getByRole("dialog", { name: "Settings" });
  const presets = sheet.getByRole("radiogroup", { name: "What to be notified about" });
  await expect(presets.getByRole("radio")).toHaveCount(3);
  await expect(presets.getByRole("radio", { name: /Everything/ })).toHaveAttribute("aria-checked", "true");

  await presets.getByRole("radio", { name: /Only what needs me/ }).click();
  await expect(presets.getByRole("radio", { name: /Only what needs me/ })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => state.pushSubscribeBody?.preferences?.["kink-nudge"]).toBe(false);
  const needsMe = state.pushSubscribeBody.preferences;
  expect(needsMe).toMatchObject({
    "chat-message": true,
    "request-sent": true,
    "request-reviewed": true,
    "request-reminder": true,
    "pile-started": true,
    "game-ready": true,
    "mood-match": true,
    "kink-nudge": false,
    "pile-reminder": false,
    "blind-reveal": false,
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sexualsync-push-preferences") || "{}"));
  expect(stored).toMatchObject(needsMe);

  await presets.getByRole("radio", { name: /Quiet/ }).click();
  await expect.poll(() => state.pushSubscribeBody?.preferences?.["chat-message"]).toBe(false);
  expect(state.pushSubscribeBody.preferences["request-sent"]).toBe(true);
  expect(state.pushSubscribeBody.preferences["mood-match"]).toBe(true);

  // Customize reveals every tag, including the mood match, as its own switch.
  const customize = sheet.getByRole("button", { name: /Customize/ });
  await expect(customize).toHaveAttribute("aria-expanded", "false");
  await customize.click();
  await expect(customize).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.locator("[data-push-pref]")).toHaveCount(10);
  const mood = sheet.getByRole("switch", { name: /You're both horny/ });
  await expect(mood).toHaveAttribute("aria-checked", "true");
  // Flipping one switch leaves no preset matching: a custom mix.
  await sheet.getByRole("switch", { name: /Sext messages/ }).click();
  await expect.poll(() => state.pushSubscribeBody?.preferences?.["chat-message"]).toBe(true);
  await expect(presets.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(customize).toContainText("your own mix");
});

test("Pile setup leads with reveal-time presets and keeps the picker behind Custom", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  const state = {};
  await mockApi(page, state);
  const starts = [];
  await page.route("**/api/pile", async (route) => {
    if (route.request().method() === "POST") starts.push(route.request().postDataJSON());
    return route.fallback();
  });
  await page.goto("/games/pile");

  const presets = page.getByRole("radiogroup", { name: "Reveal" });
  await expect(presets.getByRole("radio")).toHaveCount(4);
  await expect(page.getByLabel("Reveal at")).toHaveCount(0);

  await presets.getByRole("radio", { name: "Custom…" }).click();
  await expect(page.getByLabel("Reveal at")).toBeVisible();

  await presets.getByRole("radio", { name: "In an hour" }).click();
  await expect(presets.getByRole("radio", { name: "In an hour" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Reveal at")).toHaveCount(0);
  await page.getByRole("button", { name: "Start" }).click();
  await expect.poll(() => starts.length).toBeGreaterThan(0);
  const startBody = starts.find((body) => body && body.revealAt);
  const minutesOut = (Date.parse(startBody.revealAt) - Date.parse("2026-05-23T01:00:00Z")) / 60000;
  expect(minutesOut).toBeGreaterThanOrEqual(59);
  expect(minutesOut).toBeLessThanOrEqual(61);
});

test("Partner's legacy sent Ask lands in Needs you with a human status", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  await mockApi(page);
  await page.goto("/sexboard");
  const row = page.locator("a.sexboard-handoff-row", { hasText: "Jordan sent an Ask" }).first();
  await expect(row).toContainText("Reply");
  await expect(page.getByText(/\bsent · Tonight\b/)).toHaveCount(0);
});

test("Home clears its own tab badge: the feed is already on screen", async ({ page }) => {
  const state = {
    activity: {
      ...cloneJson(activityResponse),
      unreadTotal: 1,
      unreadByResource: { "request-board": 1 },
      items: [{
        id: "reviewed-activity", workspaceId: workspace.id, resource: "request-board", resourceLabel: "Sexboard",
        action: "reviewed", label: "Ask reviewed", entityId: "req-1", actorEmail: "jordan@example.test",
        actorName: "Jordan", at: "2026-05-23T00:25:00.000Z", passive: false, unread: true,
      }],
    },
  };
  await mockApi(page, state);
  await page.goto("/sexboard");
  await expect(page.locator(".live-activity-item").first()).toBeVisible();
  await expect(page.locator('.tab[data-tab="home"]')).not.toHaveClass(/has-unread/);
  await expect.poll(() => state.activity.unreadByResource?.["request-board"] || 0).toBe(0);
  await page.locator('.tab[data-tab="games"], .tab[data-tab="play"]').first().click();
  await expect(page).toHaveURL(/\/games/);
  await expect(page.locator('.tab[data-tab="home"]')).not.toHaveClass(/has-unread/);
});

test("A counter on my Ask is in Needs you, not Waiting", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  await mockApi(page, { request: counteredRequest });
  await page.goto("/sexboard");
  const needsYou = page.locator(".sexboard-handoff-section", { hasText: "Needs you" }).first();
  const row = needsYou.locator("a.sexboard-handoff-row", { hasText: "Jordan countered your Ask" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Review");
  const waiting = page.locator(".sexboard-handoff-section").filter({ hasText: "Waiting on Jordan" });
  await expect(waiting.locator("a.sexboard-handoff-row")).toHaveCount(0);
});

test("A pass on my Ask is a reply outcome, not something waiting", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-05-23T01:00:00Z") });
  const passed = {
    ...counteredRequest,
    decisions: [{ label: "Kiss", decision: "No", targetType: "act" }],
    counters: [],
  };
  await mockApi(page, { request: passed });
  await page.goto("/sexboard");
  const replies = page.locator(".sexboard-handoff-section", { hasText: "Replies" });
  await expect(replies.locator("a.sexboard-handoff-row")).toContainText("Jordan passed.");
  const waiting = page.locator(".sexboard-handoff-section").filter({ hasText: "Waiting on Jordan" });
  await expect(waiting.locator("a.sexboard-handoff-row")).toHaveCount(0);
  await expect(page.getByText("Jordan reviewed it.")).toHaveCount(0);
});

// ---------- Mood light (Home) ----------

function moodOnState(extra = {}) {
  const now = Date.now();
  return {
    mood: {
      on: true,
      since: new Date(now - 10 * 60_000).toISOString(),
      until: new Date(now + 90 * 60_000).toISOString(),
      cooldownUntil: null,
      match: null,
    },
    ...extra,
  };
}

function emitMoodEvent(page, action) {
  return page.evaluate((value) => {
    window.dispatchEvent(new CustomEvent("sexualsync:room-event", {
      detail: { resource: "mood", action: value, entityId: new Date().toISOString() },
    }));
  }, action);
}

test("Mood light switches on from an inline chooser and shows only my own state", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/sexboard");

  const mood = page.getByTestId("mood-light");
  const trigger = mood.getByRole("button", { name: "I’m horny" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(mood).toContainText("Only shows if Jordan's horny too.");

  // Compact when off: "Needs you" stays above the fold on a 390x844 screen.
  const off = await mood.boundingBox();
  expect(off.height).toBeLessThanOrEqual(72);
  const needsYou = page.locator(".sexboard-handoff-section", { hasText: "Needs you" }).first();
  const needsBox = await needsYou.boundingBox();
  expect(needsBox.y + 120).toBeLessThan(844);

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const chooser = page.getByRole("group", { name: "Horny for" });
  await expect(chooser.getByRole("button")).toHaveCount(3);
  await expect(chooser.getByRole("button", { name: /For the next hour/ })).toBeVisible();
  await expect(chooser.getByRole("button", { name: /Until I turn it off/ })).toContainText("24 hours at most");
  for (const box of await chooser.getByRole("button").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }

  await chooser.getByRole("button", { name: /Tonight/ }).click();
  await expect(mood).toHaveAttribute("data-phase", "on");
  await expect(mood).toContainText(/You.re horny until \d{1,2}:\d{2}/);
  await expect(mood).not.toContainText(/both|Jordan.s light|Jordan is/i);
  expect(state.moodPosts).toHaveLength(1);
  expect(state.moodPosts[0].action).toBe("on");
  // "Tonight" ends at 04:00 local, at most a day away.
  const until = new Date(state.moodPosts[0].until);
  expect(until.getHours()).toBe(4);
  expect(until.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60_000);
  await expect(page.getByTestId("app-announcer")).toContainText(/You.re horny until/);

  const turnOff = mood.getByRole("button", { name: "Turn off" });
  const turnOffBox = await turnOff.boundingBox();
  expect(turnOffBox.height).toBeGreaterThanOrEqual(44);
});

test("Mood light cooldown says when it can go back on, without error styling", async ({ page }) => {
  const state = moodOnState();
  await mockApi(page, state);
  await page.goto("/sexboard");

  const mood = page.getByTestId("mood-light");
  await expect(mood).toHaveAttribute("data-phase", "on");
  await mood.getByRole("button", { name: "Turn off" }).click();
  await expect(mood).toHaveAttribute("data-phase", "cooldown");
  await expect(mood).toContainText(/You can switch it back on at \d{1,2}:\d{2}/);
  await expect(mood.getByRole("button", { name: "I’m horny" })).toBeDisabled();
  await expect(mood.locator("[role=alert]")).toHaveCount(0);

  // A 429 from the server (cooldown the GET didn't know about) lands the same way.
  const fresh = {};
  await mockApi(page, fresh);
  await page.goto("/sexboard");
  await expect(mood).toHaveAttribute("data-phase", "off");
  await mood.getByRole("button", { name: "I’m horny" }).click();
  fresh.mood.cooldownUntil = new Date(Date.now() + 4 * 60_000).toISOString();
  await page.getByRole("button", { name: /For the next hour/ }).click();
  await expect(mood).toHaveAttribute("data-phase", "cooldown");
  await expect(mood).toContainText(/You can switch it back on at \d{1,2}:\d{2}/);
  await expect(page.getByTestId("app-announcer")).toContainText("You can switch it back on at");
  const hintColor = await mood.locator(".mood-light-hint").evaluate((node) => getComputedStyle(node).color);
  expect(hintColor).not.toMatch(/rgb\(201, 138, 130/);
});

test("Mood match forms live with a bloom, an announcement and quick actions", async ({ page }) => {
  const state = moodOnState();
  await mockApi(page, state);
  await page.goto("/sexboard");

  const mood = page.getByTestId("mood-light");
  await expect(mood).toHaveAttribute("data-phase", "on");
  state.moodPartner = { until: new Date(Date.now() + 60 * 60_000).toISOString() };
  await emitMoodEvent(page, "match");

  await expect(mood).toHaveAttribute("data-phase", "match");
  await expect(mood).toHaveAttribute("data-blooming", "true");
  await expect(mood.getByRole("heading", { name: /both horny/ })).toBeVisible();
  await expect(mood).toContainText(/Until \d{1,2}:\d{2}/);
  await expect(page.getByTestId("app-announcer")).toHaveText("You're both horny.");
  await expect(mood.getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
  await expect(mood.getByRole("link", { name: "Sext" })).toHaveAttribute("href", "/chat");
  const bloomName = await mood.locator(".mood-light-bloom").evaluate((node) => getComputedStyle(node).animationName);
  expect(bloomName).toBe("mood-bloom");

  // Switching off mid-match goes back to my own blind state.
  await mood.getByRole("button", { name: "Turn off" }).click();
  await expect(mood).toHaveAttribute("data-phase", "cooldown");
  expect(state.moodPosts.at(-1).action).toBe("off");
});

test("Mood match deep link focuses the mood light, and its activity row has no actor", async ({ page }) => {
  const now = Date.now();
  const state = moodOnState();
  state.mood.match = { since: new Date(now - 5 * 60_000).toISOString(), until: state.mood.until };
  state.activity = cloneJson(activityResponse);
  state.activity.items.unshift({
    id: "mood:match:1",
    workspaceId: workspace.id,
    resource: "mood",
    resourceLabel: "Horny",
    action: "match",
    label: "You're both horny",
    entityId: state.mood.match.since,
    at: new Date(now - 5 * 60_000).toISOString(),
    passive: false,
    unread: true,
  });
  await mockApi(page, state);
  await page.goto("/sexboard?mood=match");

  const mood = page.getByTestId("mood-light");
  await expect(mood).toHaveAttribute("data-phase", "match");
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("[data-testid=mood-light]")))).toBe(true);
  // A deep link into an existing match doesn't replay the bloom.
  await expect(mood).not.toHaveAttribute("data-blooming", "true");

  const row = page.locator(".live-activity-item", { hasText: "You're both horny" });
  await expect(row).toHaveAttribute("href", "/sexboard?mood=match");
  await expect(row).toContainText("Both of you - Horny");
  await expect(row).not.toContainText("Jordan");
  await expect(row.locator(".live-activity-glyph.is-mood svg")).toHaveCount(1);
});

test("Mood match bloom is static with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = moodOnState();
  await mockApi(page, state);
  await page.goto("/sexboard");

  const mood = page.getByTestId("mood-light");
  await expect(mood).toHaveAttribute("data-phase", "on");
  state.moodPartner = { until: new Date(Date.now() + 60 * 60_000).toISOString() };
  await emitMoodEvent(page, "match");
  await expect(mood).toHaveAttribute("data-blooming", "true");

  const motion = await mood.evaluate((node) => ({
    bloom: getComputedStyle(node.querySelector(".mood-light-bloom")).animationName,
    title: getComputedStyle(node.querySelector(".mood-light-match-title")).animationName,
    titleOpacity: getComputedStyle(node.querySelector(".mood-light-match-title")).opacity,
  }));
  expect(motion.bloom).toBe("none");
  expect(motion.title).toBe("none");
  expect(motion.titleOpacity).toBe("1");
  await expect(page.getByTestId("app-announcer")).toHaveText("You're both horny.");
});

test("Mood light waits for a connection instead of queueing", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/sexboard");
  const mood = page.getByTestId("mood-light");
  await expect(mood).toHaveAttribute("data-phase", "off");

  await setNavigatorOnline(page, false);
  await expect(mood.getByRole("button", { name: "I’m horny" })).toBeDisabled();
  await expect(mood).toContainText("You're offline. This needs a connection.");

  await setNavigatorOnline(page, true);
  await expect(mood.getByRole("button", { name: "I’m horny" })).toBeEnabled();
  expect(state.moodPosts || []).toHaveLength(0);
});

test("Mood match toast away from Home links back to the mood light, once per match", async ({ page }) => {
  const state = moodOnState();
  state.mood.match = { since: new Date(Date.now() - 60_000).toISOString(), until: state.mood.until };
  await mockApi(page, state);
  await page.goto("/games");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  await emitMoodEvent(page, "match");
  const toast = page.locator("a.live-activity-toast--mood");
  await expect(toast).toHaveText("You're both horny.");
  await expect(toast).toHaveAttribute("href", "/sexboard?mood=match");
  await expect(toast).not.toContainText("Jordan");

  // A replay of the same match after a reconnect doesn't toast again, and
  // "ended" never toasts.
  await expect(toast).toHaveCount(0, { timeout: 8000 });
  await emitMoodEvent(page, "match");
  await emitMoodEvent(page, "ended");
  await page.waitForTimeout(600);
  await expect(page.locator(".live-activity-toast")).toHaveCount(0);
});

test("Ambient loops pause while the app is hidden and the atmosphere has no blur or blend", async ({ page }) => {
  await mockApi(page);
  await page.goto("/sexboard");
  await expect(page.locator(".presence-band-status.is-live")).toBeVisible();

  const atmosphere = await page.evaluate(() => {
    const read = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      return { filter: style.filter, blend: style.mixBlendMode };
    };
    return { top: read(".atm-top"), bottom: read(".atm-bottom"), grain: read(".grain") };
  });
  expect(atmosphere.top?.filter).toBe("none");
  expect(atmosphere.bottom?.filter).toBe("none");
  expect(atmosphere.grain?.blend).toBe("normal");

  const runningInfinite = () => page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.effect?.getTiming?.().iterations === Infinity && animation.playState === "running").length);
  expect(await runningInfinite()).toBeGreaterThan(0);

  const setHidden = (hidden) => page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (value ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await setHidden(true);
  await expect(page.locator("html")).toHaveAttribute("data-page-hidden", "");
  await expect.poll(runningInfinite).toBe(0);
  await setHidden(false);
  await expect(page.locator("html")).not.toHaveAttribute("data-page-hidden", "");
  await expect.poll(runningInfinite).toBeGreaterThan(0);
});

test("Landing screenshots load small WebP renditions with reserved size", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const shot = page.locator(".pp-shot img").first();
  await expect(shot).toHaveAttribute("width", "1170");
  await expect(shot).toHaveAttribute("height", "2532");
  await expect(shot).toHaveAttribute("loading", "lazy");
  await shot.scrollIntoViewIfNeeded();
  await expect.poll(() => shot.evaluate((img) => img.currentSrc)).toMatch(/\/screens\/03-sexboard-home-320\.webp$/);
});

test("Sext keeps a half-typed draft across a reload and drops it once sent", async ({ page }) => {
  const state = {};
  await mockApi(page, state);
  await page.goto("/chat");
  const field = page.getByPlaceholder(/Message Jordan/);
  await field.fill("Half a thought");
  // pagehide flushes the debounced save, so an immediate reload keeps it.
  await page.reload();
  await expect(page.getByPlaceholder(/Message Jordan/)).toHaveValue("Half a thought");

  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => state.chatPostBody?.text).toBe("Half a thought");
  await expect(page.getByPlaceholder(/Message Jordan/)).toHaveValue("");
  await page.reload();
  await expect(page.getByPlaceholder(/Message Jordan/)).toHaveValue("");
});
