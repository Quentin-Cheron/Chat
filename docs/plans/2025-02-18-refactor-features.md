# Refactor + Feature Plan — Phase 7

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the PrivateChat codebase for correctness and security, remove dead code, and add file uploads via MinIO, message edit/delete, and message reactions.

**Architecture:** Convex (self-hosted) for real-time data + mediasoup SFU for voice + MinIO for object storage. All file uploads use a pre-signed URL flow: frontend requests a URL from a Convex HTTP action, uploads directly to MinIO, then records metadata in Convex.

**Tech Stack:** React 18, Convex, TanStack Router, Tailwind CSS v4, socket.io, mediasoup, MinIO SDK (server-side in Convex HTTP action), lucide-react.

---

## Task 1 — Fix Convex Schema (define all missing tables)

**Files:**

- Modify: `web/convex/schema.ts`

**Context:** Currently `schema.ts` only re-exports Better Auth tables. The tables `workspaces`, `channels`, `messages`, `members`, `invites` are used in mutations/queries but never declared — Convex runs in schemaless mode, meaning zero type safety and no index enforcement.

**Step 1: Replace schema.ts with full definition**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tables as authTables } from "./betterAuth/schema";

export default defineSchema({
  ...authTables,

  workspaces: defineTable({
    name: v.string(),
    ownerId: v.string(),
    allowMemberChannelCreation: v.boolean(),
    allowMemberInviteCreation: v.boolean(),
  }),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(v.literal("OWNER"), v.literal("ADMIN"), v.literal("MEMBER")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  channels: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    slug: v.string(),
    type: v.union(v.literal("TEXT"), v.literal("VOICE")),
    position: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_slug", ["workspaceId", "slug"]),

  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.string(),
    authorName: v.string(),
    content: v.string(),
    editedAt: v.optional(v.number()),
    attachments: v.optional(
      v.array(
        v.object({
          storageKey: v.string(),
          url: v.string(),
          name: v.string(),
          size: v.number(),
          mimeType: v.string(),
        }),
      ),
    ),
  })
    .index("by_channel", ["channelId"])
    .index("by_channel_time", ["channelId", "_creationTime"]),

  reactions: defineTable({
    messageId: v.id("messages"),
    userId: v.string(),
    emoji: v.string(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"]),

  invites: defineTable({
    workspaceId: v.id("workspaces"),
    code: v.string(),
    createdById: v.string(),
    expiresAt: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    useCount: v.number(),
    revoked: v.boolean(),
  }).index("by_code", ["code"]),
});
```

**Step 2: Verify no TypeScript errors surface from the schema itself**

Run: `cd web && npx convex codegen 2>&1 | tail -5` (or just check the file parses)
Expected: no syntax errors.

**Step 3: Commit**

```bash
git add web/convex/schema.ts
git commit -m "fix(schema): define all Convex tables with proper types and indexes"
```

---

## Task 2 — Fix Security Helpers (throw instead of returning null)

**Files:**

- Modify: `web/convex/_helpers.ts`
- Modify: `web/convex/channels.ts`
- Modify: `web/convex/workspaces.ts`
- Modify: `web/convex/members.ts`
- Modify: `web/convex/messages.ts`
- Modify: `web/convex/invites.ts`

**Context:** `requireAuth`, `requireMember`, `requireModerator` all return `null` on failure. Every single mutation that calls them must manually null-check the result — but none of them do. This means unauthenticated users can call any mutation and get a silent no-op or a JS crash. Fix by making the helpers throw.

**Step 1: Rewrite `_helpers.ts`**

```ts
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export async function requireMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<{
  member: {
    _id: Id<"members">;
    workspaceId: Id<"workspaces">;
    userId: string;
    role: string;
  };
  authId: string;
}> {
  const authId = await requireAuth(ctx);
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", authId),
    )
    .unique();
  if (!member) throw new Error("Not a member of this workspace");
  return { member, authId };
}

export async function requireModerator(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<{
  member: {
    _id: Id<"members">;
    workspaceId: Id<"workspaces">;
    userId: string;
    role: string;
  };
  authId: string;
}> {
  const data = await requireMember(ctx, workspaceId);
  if (data.member.role === "MEMBER")
    throw new Error("Insufficient permissions");
  return data;
}

export function canModerate(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}
```

**Step 2: Update callers — remove all `if (!data) return` guards**

In each convex file, remove patterns like:

```ts
const authId = await requireAuth(ctx);
if (!authId) return []; // DELETE THIS
```

and:

```ts
const data = await requireMember(ctx, workspaceId);
if (!data) return null; // DELETE THIS
const { member, authId } = data;
```

Replace with direct destructuring since helpers now throw.

In `messages.ts` list query, the current code does:

```ts
const authId = await requireAuth(ctx);
```

but `requireAuth` returned `string | null` before. Update to just:

```ts
await requireMember(ctx, channel.workspaceId);
```

(no need to capture authId in the query).

**Step 3: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -40`
Expected: no type errors in convex files.

**Step 4: Commit**

```bash
git add web/convex/_helpers.ts web/convex/channels.ts web/convex/workspaces.ts web/convex/members.ts web/convex/messages.ts web/convex/invites.ts
git commit -m "fix(security): make requireAuth/requireMember/requireModerator throw on failure"
```

---

## Task 3 — Remove Dead Code

**Files:**

- Modify: `web/convex/users.ts`
- Delete: `web/src/routes/profile.tsx`
- Modify: `web/src/routes/security.change-password.tsx`
- Modify: `web/src/routes/app.tsx`
- Modify: `web/src/store/app-store.ts`

**Context:**

- `getPasswordStatus` always returns `{ mustChangePassword: false }` — never useful, queried in `app.tsx`
- `clearMustChangePassword` is a no-op mutation, called in `security.change-password.tsx`
- `profile.tsx` is a standalone page that duplicates the "account" tab already in `settings.tsx`
- `selectedDmUserId` state in `app.tsx` is set but never actually drives a real DM channel
- `useUiStore` in `ui-store.ts` has `output` and `copied` state that nothing uses

**Step 1: Remove dead mutations from `users.ts`**

Delete `getPasswordStatus` and `clearMustChangePassword` exports entirely.

**Step 2: Update `security.change-password.tsx`**

Remove the `useQuery(api.users.getPasswordStatus, ...)` call and the `clearMustChange` mutation call. The page should just handle the password change form without those.

**Step 3: Update `app.tsx`**

Remove:

```ts
const passwordStatus = useQuery(
  api.users.getPasswordStatus,
  session?.user ? {} : "skip",
);
```

And remove the `useEffect` that navigates to change-password:

```ts
useEffect(() => {
  if (session?.user && passwordStatus?.mustChangePassword) {
    void navigate({ to: "/security/change-password" });
  }
}, [navigate, session?.user, passwordStatus?.mustChangePassword]);
```

And remove `selectedDmUserId` state and `dmMembers`/`selectedDmMember` derived values since DM is not implemented.

**Step 4: Delete `profile.tsx`**

```bash
rm web/src/routes/profile.tsx
```

The `routeTree.gen.ts` is auto-generated — it will regenerate on next `pnpm dev`. Do not manually edit it.

**Step 5: Delete `ui-store.ts`**

```bash
rm web/src/store/ui-store.ts
```

Verify nothing imports it:

```bash
grep -r "ui-store" web/src/
```

Expected: no results.

**Step 6: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -40`

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove dead code (getPasswordStatus, clearMustChangePassword, profile route, ui-store)"
```

---

## Task 4 — Extract Socket Logic from app.tsx into useSocketEvents Hook

**Files:**

- Create: `web/src/hooks/useSocketEvents.ts`
- Modify: `web/src/routes/app.tsx`

**Context:** `app.tsx` is 407 lines. The socket.io connection and all `socket.on(...)` handlers live directly in the component. The voice state setters (`setVoiceParticipants`, `setVoiceRoster`) are returned from `useVoiceChannel` but never called — the socket event handlers in `app.tsx` are empty stubs. This hook will wire them up properly.

**Step 1: Create `useSocketEvents.ts`**

```ts
import { useEffect, type MutableRefObject } from "react";
import { io, type Socket } from "socket.io-client";

type VoiceParticipant = { peerId: string; name: string; email: string };
type VoiceRosterEntry = { name: string; email: string; speaking: boolean };

type Params = {
  sessionUser: { id: string; name: string; email: string } | undefined;
  selectedChannelId: string;
  voiceChannelId: string;
  socketRef: MutableRefObject<Socket | null>;
  setVoiceParticipants: (p: VoiceParticipant[]) => void;
  setVoiceRoster: (
    updater: (
      prev: Record<string, VoiceRosterEntry>,
    ) => Record<string, VoiceRosterEntry>,
  ) => void;
  onVoiceNewProducer: (payload: {
    channelId: string;
    producerId: string;
    peerId: string;
  }) => void;
};

export function useSocketEvents({
  sessionUser,
  selectedChannelId,
  voiceChannelId,
  socketRef,
  setVoiceParticipants,
  setVoiceRoster,
  onVoiceNewProducer,
}: Params) {
  // Connect socket once on session
  useEffect(() => {
    if (!sessionUser || socketRef.current) return;
    const socket: Socket = io("/ws", {
      withCredentials: true,
      transports: ["websocket"],
      path: "/socket.io",
    });
    socketRef.current = socket;

    socket.on(
      "voice-presence",
      (payload: {
        channelId: string;
        participants: Array<{
          peerId: string;
          name?: string;
          email?: string;
          speaking?: boolean;
        }>;
      }) => {
        if (!payload?.channelId || !Array.isArray(payload.participants)) return;
        const participants: VoiceParticipant[] = payload.participants.map(
          (p) => ({
            peerId: p.peerId,
            name: p.name ?? "User",
            email: p.email ?? "",
          }),
        );
        setVoiceParticipants(participants);
        setVoiceRoster(() => {
          const next: Record<string, VoiceRosterEntry> = {};
          for (const p of payload.participants) {
            next[p.peerId] = {
              name: p.name ?? "User",
              email: p.email ?? "",
              speaking: p.speaking ?? false,
            };
          }
          return next;
        });
      },
    );

    socket.on(
      "voice-new-producer",
      (payload: { channelId: string; producerId: string; peerId: string }) => {
        onVoiceNewProducer(payload);
      },
    );

    socket.on(
      "voice-speaking",
      (payload: { peerId: string; speaking: boolean }) => {
        if (!payload?.peerId) return;
        setVoiceRoster((prev) => ({
          ...prev,
          [payload.peerId]: {
            ...(prev[payload.peerId] ?? { name: "User", email: "" }),
            speaking: payload.speaking,
          },
        }));
      },
    );

    socket.on("voice-peer-left", (payload: { peerId: string }) => {
      if (!payload?.peerId) return;
      setVoiceParticipants([]);
      setVoiceRoster((prev) => {
        const next = { ...prev };
        delete next[payload.peerId];
        return next;
      });
    });

    return () => {
      socket.off("voice-new-producer");
      socket.off("voice-presence");
      socket.off("voice-speaking");
      socket.off("voice-peer-left");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionUser]);

  // Join/leave channel room on selection change
  useEffect(() => {
    if (!socketRef.current || !selectedChannelId) return;
    socketRef.current.emit("join-channel", { channelId: selectedChannelId });
    return () => {
      socketRef.current?.emit("leave-channel", {
        channelId: selectedChannelId,
      });
    };
  }, [selectedChannelId]);
}
```

**Step 2: Update `app.tsx` to use the new hook**

Remove the two `useEffect` blocks related to socket.io and replace with:

```ts
useSocketEvents({
  sessionUser: session?.user,
  selectedChannelId,
  voiceChannelId: voiceChannel.voiceChannelId,
  socketRef,
  setVoiceParticipants: voiceChannel.setVoiceParticipants,
  setVoiceRoster: (updater) =>
    voiceChannel.setVoiceRoster(
      typeof updater === "function"
        ? updater(voiceChannel.voiceRoster)
        : updater,
    ),
  onVoiceNewProducer: (_payload) => {
    // future: trigger SFU consume flow
  },
});
```

Remove the `io` import and `Socket` type import from `app.tsx` (they move to the hook).

**Step 3: Update `useVoiceChannel.ts` to accept a function updater for setVoiceRoster**

Change:

```ts
const [voiceRoster, setVoiceRoster] = useState<
  Record<string, VoiceRosterEntry>
>({});
```

This already accepts a function updater via React's `useState` setter — no change needed. Just expose `setVoiceRoster` in the return value (it already is).

**Step 4: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -40`

**Step 5: Commit**

```bash
git add web/src/hooks/useSocketEvents.ts web/src/routes/app.tsx
git commit -m "refactor(app): extract socket.io logic into useSocketEvents hook, wire voice presence"
```

---

## Task 5 — Message Pagination (cursor-based, load more)

**Files:**

- Modify: `web/convex/messages.ts`
- Modify: `web/src/components/MessagePanel.tsx`
- Modify: `web/src/routes/app.tsx`

**Context:** Messages are hardcoded to `take(50)`. With cursor-based pagination: initial load shows last 50 messages, clicking "Load more" fetches the previous 50.

**Step 1: Update `messages.ts` to support cursor**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireMember } from "./_helpers";

export const list = query({
  args: {
    channelId: v.id("channels"),
    cursor: v.optional(v.string()), // paginationOptsValidator cursor
  },
  handler: async (ctx, { channelId, cursor }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return { messages: [], hasMore: false };

    await requireMember(ctx, channel.workspaceId);

    const PAGE_SIZE = 50;

    let q = ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .order("desc");

    const result = await q.paginate({
      numItems: PAGE_SIZE,
      cursor: cursor ?? null,
    });

    return {
      messages: result.page.reverse(), // show oldest first
      hasMore: !result.isDone,
      nextCursor: result.continueCursor,
    };
  },
});

export const send = mutation({
  args: {
    channelId: v.id("channels"),
    content: v.string(),
  },
  handler: async (ctx, { channelId, content }) => {
    if (!content.trim()) throw new Error("Message vide");

    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Canal introuvable");
    if (channel.type === "VOICE")
      throw new Error("Impossible d'envoyer dans un canal vocal");

    const authId = await requireAuth(ctx);
    await requireMember(ctx, channel.workspaceId);

    const user = await ctx.db.get(authId as any);

    return ctx.db.insert("messages", {
      channelId,
      authorId: authId,
      authorName: user?.name ?? "Utilisateur",
      content: content.trim(),
    });
  },
});
```

**Step 2: Update `MessagePanel.tsx` Props**

```ts
type Props = {
  // ...existing...
  hasMoreMessages: boolean;
  onLoadMoreMessages: () => void;
  loadingMoreMessages: boolean;
};
```

Add a "Load more" button at the top of the messages list:

```tsx
{
  hasMoreMessages && (
    <div className="flex justify-center pb-3">
      <button
        type="button"
        onClick={onLoadMoreMessages}
        disabled={loadingMoreMessages}
        className="rounded-lg border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {loadingMoreMessages ? "Loading..." : "Load more messages"}
      </button>
    </div>
  );
}
```

**Step 3: Update `app.tsx`**

Replace the simple `useQuery(api.messages.list, ...)` with paginated state:

```ts
const [messageCursor, setMessageCursor] = useState<string | null>(null);
const [allMessages, setAllMessages] = useState<Message[]>([]);
const [loadingMore, setLoadingMore] = useState(false);

const messagesResult = useQuery(
  api.messages.list,
  session?.user && selectedChannelId
    ? { channelId: selectedChannelId as Id<"channels"> }
    : "skip",
);

// Reset messages when channel changes
useEffect(() => {
  setAllMessages([]);
  setMessageCursor(null);
}, [selectedChannelId]);

// Merge incoming messages
useEffect(() => {
  if (!messagesResult) return;
  setAllMessages(messagesResult.messages);
}, [messagesResult]);

async function handleLoadMore() {
  if (!messagesResult?.nextCursor) return;
  setLoadingMore(true);
  setMessageCursor(messagesResult.nextCursor);
  setLoadingMore(false);
}
```

Pass to `MessagePanel`:

```tsx
hasMoreMessages={messagesResult?.hasMore ?? false}
onLoadMoreMessages={handleLoadMore}
loadingMoreMessages={loadingMore}
```

**Step 4: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -40`

**Step 5: Commit**

```bash
git add web/convex/messages.ts web/src/components/MessagePanel.tsx web/src/routes/app.tsx
git commit -m "feat(messages): cursor-based pagination with load more button"
```

---

## Task 6 — Message Edit + Delete

**Files:**

- Modify: `web/convex/messages.ts`
- Modify: `web/src/components/MessagePanel.tsx`
- Modify: `web/src/hooks/useFormHandlers.ts`

**Context:** Users should be able to edit their own messages (inline) and delete their own messages (with confirmation). Admins/owners can delete any message.

**Step 1: Add `update` and `remove` mutations to `messages.ts`**

```ts
export const update = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, { messageId, content }) => {
    if (!content.trim()) throw new Error("Message vide");
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message introuvable");

    const authId = await requireAuth(ctx);
    const channel = await ctx.db.get(msg.channelId);
    if (!channel) throw new Error("Canal introuvable");
    await requireMember(ctx, channel.workspaceId);

    if (msg.authorId !== authId)
      throw new Error("Vous ne pouvez modifier que vos propres messages");

    await ctx.db.patch(messageId, {
      content: content.trim(),
      editedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message introuvable");

    const authId = await requireAuth(ctx);
    const channel = await ctx.db.get(msg.channelId);
    if (!channel) throw new Error("Canal introuvable");

    const { member } = await requireMember(ctx, channel.workspaceId);
    const canDelete =
      msg.authorId === authId ||
      member.role === "OWNER" ||
      member.role === "ADMIN";

    if (!canDelete) throw new Error("Permission refusée");

    await ctx.db.delete(messageId);
  },
});
```

**Step 2: Add mutations to `useFormHandlers.ts`**

Add:

```ts
const updateMessageMutation = useMutation(api.messages.update);
const removeMessageMutation = useMutation(api.messages.remove);

const onEditMessage = useCallback(
  async (messageId: string, content: string) => {
    await withPending("editMessage", () =>
      updateMessageMutation({
        messageId: messageId as Id<"messages">,
        content,
      }),
    );
  },
  [updateMessageMutation],
);

const onDeleteMessage = useCallback(
  async (messageId: string) => {
    await withPending("deleteMessage", () =>
      removeMessageMutation({ messageId: messageId as Id<"messages"> }),
    );
  },
  [removeMessageMutation],
);
```

Return them from the hook.

**Step 3: Update `MessagePanel.tsx`**

Add `onEditMessage` and `onDeleteMessage` to Props type.

Add `currentUserId` prop (`string`) so the component knows which messages belong to the current user.

In each message `<li>`, add a hover action bar that appears on `group-hover`:

```tsx
<div className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-card shadow-sm group-hover:flex">
  {msg.authorId === currentUserId && (
    <button
      type="button"
      title="Edit"
      onClick={() => setEditingMessageId(msg._id)}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )}
  {(msg.authorId === currentUserId || canModerate) && (
    <button
      type="button"
      title="Delete"
      onClick={() => onDeleteMessage(msg._id)}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )}
</div>
```

Add `editingMessageId` state (`string | null`). When set, replace the message content with an inline `<input>` prefilled with the current content, with Save/Cancel buttons.

Add `(edited)` label after messages with `editedAt`:

```tsx
{
  msg.editedAt && (
    <span className="ml-1 text-[10px] text-muted-foreground">(edited)</span>
  );
}
```

Add `relative` to the `<li>` className so the action bar positions correctly.

Import `Pencil` and `Trash2` from `lucide-react`.

**Step 4: Wire in `app.tsx`**

Pass `onEditMessage`, `onDeleteMessage`, `currentUserId={session.user.id}`, and `canModerate={canModerateRoles}` to `<MessagePanel>`.

**Step 5: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -40`

**Step 6: Commit**

```bash
git add web/convex/messages.ts web/src/components/MessagePanel.tsx web/src/hooks/useFormHandlers.ts web/src/routes/app.tsx
git commit -m "feat(messages): add edit and delete with inline edit UI and hover action bar"
```

---

## Task 7 — Message Reactions

**Files:**

- Create: `web/convex/reactions.ts`
- Modify: `web/src/components/MessagePanel.tsx`
- Modify: `web/src/hooks/useFormHandlers.ts`
- Modify: `web/src/routes/app.tsx`

**Context:** Quick emoji reactions on messages (Discord-style). A limited set of 6 emoji. Users can toggle a reaction. The reactions table is already in the schema from Task

1.

**Step 1: Create `web/convex/reactions.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireMember } from "./_helpers";

// Returns reactions grouped by emoji for a list of message IDs
export const listForChannel = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return {};

    await requireMember(ctx, channel.workspaceId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();

    const result: Record<string, Array<{ emoji: string; userId: string }>> = {};

    for (const msg of messages) {
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", msg._id))
        .collect();
      if (reactions.length > 0) {
        result[msg._id] = reactions.map((r) => ({
          emoji: r.emoji,
          userId: r.userId,
        }));
      }
    }

    return result;
  },
});

// Toggle a reaction (add if not present, remove if already reacted)
export const toggle = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, { messageId, emoji }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message introuvable");

    const channel = await ctx.db.get(msg.channelId);
    if (!channel) throw new Error("Canal introuvable");

    const authId = await requireAuth(ctx);
    await requireMember(ctx, channel.workspaceId);

    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_user_emoji", (q) =>
        q.eq("messageId", messageId).eq("userId", authId).eq("emoji", emoji),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.insert("reactions", { messageId, userId: authId, emoji });
    }
  },
});
```

**Step 2: Add toggle to `useFormHandlers.ts`**

```ts
const toggleReactionMutation = useMutation(api.reactions.toggle);

const onToggleReaction = useCallback(
  async (messageId: string, emoji: string) => {
    await withPending(`reaction-${messageId}-${emoji}`, () =>
      toggleReactionMutation({ messageId: messageId as Id<"messages">, emoji }),
    );
  },
  [toggleReactionMutation],
);
```

**Step 3: Add reactions to `app.tsx`**

```ts
const reactions =
  useQuery(
    api.reactions.listForChannel,
    session?.user && selectedChannelId
      ? { channelId: selectedChannelId as Id<"channels"> }
      : "skip",
  ) ?? {};
```

Pass `reactions` and `onToggleReaction` to `<MessagePanel>`.

**Step 4: Update `MessagePanel.tsx`**

Add `reactions` and `onToggleReaction` to Props.

Define quick-reaction emojis:

```ts
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
```

In the message hover action bar (from Task 6), add a reaction button that shows a small popover with the 6 emojis:

```tsx
<button
  type="button"
  title="React"
  onClick={() =>
    setReactionPickerFor(reactionPickerFor === msg._id ? null : msg._id)
  }
  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
>
  <Smile className="h-3.5 w-3.5" />
</button>;

{
  reactionPickerFor === msg._id && (
    <div className="absolute right-0 top-8 z-50 flex gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onToggleReaction(msg._id, emoji);
            setReactionPickerFor(null);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-muted"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
```

Below each message content, render grouped reactions:

```tsx
{
  (() => {
    const msgReactions = reactions[msg._id] ?? [];
    const grouped = QUICK_REACTIONS.map((emoji) => ({
      emoji,
      count: msgReactions.filter((r) => r.emoji === emoji).length,
      reacted: msgReactions.some(
        (r) => r.emoji === emoji && r.userId === currentUserId,
      ),
    })).filter((r) => r.count > 0);

    if (!grouped.length) return null;
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {grouped.map(({ emoji, count, reacted }) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggleReaction(msg._id, emoji)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              reacted
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-foreground hover:border-primary/30",
            )}
          >
            {emoji} <span>{count}</span>
          </button>
        ))}
      </div>
    );
  })();
}
```

Add `reactionPickerFor` state (`string | null`) to track which message's picker is open.

**Step 5: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -40`

**Step 6: Commit**

```bash
git add web/convex/reactions.ts web/src/components/MessagePanel.tsx web/src/hooks/useFormHandlers.ts web/src/routes/app.tsx
git commit -m "feat(reactions): add emoji reactions to messages with toggle and grouped display"
```

---

## Task 8 — MinIO Setup (docker-compose + environment)

**Files:**

- Modify: `docker-compose.yml`
- Modify: `install.sh`
- Create: `infra/minio/init.sh`

**Context:** MinIO provides S3-compatible object storage. Files uploaded in chat (images, documents) are stored in MinIO. The flow: frontend requests a pre-signed PUT URL from the Convex HTTP action → uploads directly to MinIO → stores the public URL in the message.

**Step 1: Add MinIO service to `docker-compose.yml`**

```yaml
minio:
  image: minio/minio:latest
  container_name: privatechat-minio
  restart: unless-stopped
  command: server /data --console-address ":9001"
  environment:
    - MINIO_ROOT_USER=${MINIO_ROOT_USER:-minioadmin}
    - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-minioadmin123}
  volumes:
    - minio_data:/data
  expose:
    - "9000"
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 5s
    retries: 3
```

Add `minio_data:` to the `volumes:` section.

**Step 2: Create `infra/minio/init.sh`** (bucket creation on first start)

```bash
#!/bin/sh
# Wait for MinIO to be ready, then create the chat-uploads bucket
set -e

MINIO_URL="${MINIO_INTERNAL_URL:-http://minio:9000}"
ALIAS="local"

until mc alias set "$ALIAS" "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null; do
  echo "Waiting for MinIO..."
  sleep 2
done

mc mb --ignore-existing "$ALIAS/chat-uploads"
mc anonymous set download "$ALIAS/chat-uploads"
echo "MinIO bucket ready."
```

**Step 3: Add environment variables**

Document in `install.sh` and `.env.example` (if present):

```bash
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<generate-strong-password>
MINIO_INTERNAL_URL=http://minio:9000
MINIO_PUBLIC_URL=https://${DOMAIN}/minio  # proxied through Caddy
MINIO_BUCKET=chat-uploads
```

**Step 4: Add MinIO proxy route to `infra/caddy/Caddyfile`**

In the existing Caddyfile, add a route to proxy `/minio/*` to the MinIO service so files are served from the same domain:

```caddyfile
handle /minio/* {
    uri strip_prefix /minio
    reverse_proxy minio:9000
}
```

**Step 5: Commit**

```bash
git add docker-compose.yml infra/minio/init.sh
git commit -m "feat(infra): add MinIO service for file storage"
```

---

## Task 9 — File Upload: Convex HTTP Action (Pre-signed URL)

**Files:**

- Create: `web/convex/files.ts`
- Modify: `web/convex/http.ts`
- Modify: `web/convex/messages.ts`

**Context:** The frontend cannot have AWS/MinIO credentials. Instead, it calls a Convex HTTP action that generates a pre-signed PUT URL using the MinIO SDK. The frontend then PUTs the file directly to MinIO, then sends a message with the file metadata.

**Step 1: Create `web/convex/files.ts`**

```ts
import { httpAction } from "./_generated/server";
import { requireAuth } from "./_helpers";

// POST /api/files/presign
// Body: { fileName: string, mimeType: string, size: number }
// Returns: { uploadUrl: string, storageKey: string, publicUrl: string }
export const presignUpload = httpAction(async (ctx, request) => {
  try {
    await requireAuth(ctx);
  } catch {
    return new Response(JSON.stringify({ error: "Unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await request.json()) as {
    fileName: string;
    mimeType: string;
    size: number;
  };
  const { fileName, mimeType, size } = body;

  if (!fileName || !mimeType || !size) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (size > 50 * 1024 * 1024) {
    // 50 MB limit
    return new Response(
      JSON.stringify({ error: "File too large (max 50 MB)" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const minioUrl = process.env.MINIO_INTERNAL_URL ?? "http://minio:9000";
  const minioPublicUrl = process.env.MINIO_PUBLIC_URL ?? minioUrl;
  const bucket = process.env.MINIO_BUCKET ?? "chat-uploads";
  const accessKey = process.env.MINIO_ROOT_USER ?? "minioadmin";
  const secretKey = process.env.MINIO_ROOT_PASSWORD ?? "minioadmin123";

  // Generate a unique storage key
  const ext = fileName.split(".").pop() ?? "bin";
  const storageKey = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Build pre-signed PUT URL using AWS Signature V4 (MinIO is S3-compatible)
  // We implement a minimal presign without an SDK to avoid bundle size issues
  const uploadUrl = await buildPresignedPutUrl({
    endpoint: minioUrl,
    bucket,
    key: storageKey,
    accessKey,
    secretKey,
    mimeType,
    expiresIn: 300, // 5 minutes
  });

  const publicUrl = `${minioPublicUrl}/${bucket}/${storageKey}`;

  return new Response(JSON.stringify({ uploadUrl, storageKey, publicUrl }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// Minimal AWS Signature V4 pre-signed URL builder for MinIO PUT
async function buildPresignedPutUrl(opts: {
  endpoint: string;
  bucket: string;
  key: string;
  accessKey: string;
  secretKey: string;
  mimeType: string;
  expiresIn: number;
}): Promise<string> {
  const { endpoint, bucket, key, accessKey, secretKey, mimeType, expiresIn } =
    opts;

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, "")
      .slice(0, 15) + "Z";
  const region = "us-east-1"; // MinIO default
  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKey}/${credentialScope}`;

  const url = new URL(`${endpoint}/${bucket}/${encodeURIComponent(key)}`);
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", credential);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  url.searchParams.set("X-Amz-SignedHeaders", "content-type;host");
  url.searchParams.set("X-Amz-Security-Token", "");

  const canonicalHeaders = `content-type:${mimeType}\nhost:${url.host}\n`;
  const canonicalRequest = [
    "PUT",
    `/${bucket}/${encodeURIComponent(key)}`,
    url.searchParams.toString(),
    canonicalHeaders,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const encoder = new TextEncoder();
  const hash = async (data: string | Uint8Array) => {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      typeof data === "string" ? encoder.encode(data) : data,
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };
  const hmac = async (key: Uint8Array, data: string) => {
    const k = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(data));
    return new Uint8Array(sig);
  };

  const hashedCanonical = await hash(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashedCanonical,
  ].join("\n");

  const signingKey = await (async () => {
    const kDate = await hmac(encoder.encode(`AWS4${secretKey}`), dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    return hmac(kService, "aws4_request");
  })();

  const sigBytes = await hmac(signingKey, stringToSign);
  const signature = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  url.searchParams.set("X-Amz-Signature", signature);
  // Remove empty security token
  url.searchParams.delete("X-Amz-Security-Token");

  return url.toString();
}
```

**Step 2: Register the HTTP route in `web/convex/http.ts`**

Add:

```ts
import { presignUpload } from "./files";

http.route({
  path: "/api/files/presign",
  method: "POST",
  handler: presignUpload,
});

// CORS preflight
http.route({
  path: "/api/files/presign",
  method: "OPTIONS",
  handler: httpAction(
    async () =>
      new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }),
  ),
});
```

**Step 3: Add `sendWithAttachments` mutation to `messages.ts`**

```ts
export const sendWithAttachments = mutation({
  args: {
    channelId: v.id("channels"),
    content: v.string(),
    attachments: v.array(
      v.object({
        storageKey: v.string(),
        url: v.string(),
        name: v.string(),
        size: v.number(),
        mimeType: v.string(),
      }),
    ),
  },
  handler: async (ctx, { channelId, content, attachments }) => {
    if (!content.trim() && attachments.length === 0)
      throw new Error("Message vide");

    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Canal introuvable");
    if (channel.type === "VOICE")
      throw new Error("Impossible d'envoyer dans un canal vocal");

    const authId = await requireAuth(ctx);
    await requireMember(ctx, channel.workspaceId);

    const user = await ctx.db.get(authId as any);

    return ctx.db.insert("messages", {
      channelId,
      authorId: authId,
      authorName: user?.name ?? "Utilisateur",
      content: content.trim(),
      attachments,
    });
  },
});
```

**Step 4: Commit**

```bash
git add web/convex/files.ts web/convex/http.ts web/convex/messages.ts
git commit -m "feat(files): add pre-signed MinIO upload HTTP action and sendWithAttachments mutation"
```

---

## Task 10 — File Upload UI (MessagePanel)

**Files:**

- Create: `web/src/lib/upload.ts`
- Modify: `web/src/components/MessagePanel.tsx`
- Modify: `web/src/hooks/useFormHandlers.ts`
- Modify: `web/src/routes/app.tsx`

**Context:** The `+` button in the message input is currently a no-op. Wire it to trigger a file picker, upload to MinIO via pre-signed URL, and send the message with the attachment.

**Step 1: Create `web/src/lib/upload.ts`**

```ts
const CONVEX_SITE_URL =
  (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ??
  "http://localhost:3211";

export type UploadedFile = {
  storageKey: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
};

export async function uploadFile(file: File): Promise<UploadedFile> {
  // 1. Get pre-signed URL from Convex HTTP action
  const presignRes = await fetch(`${CONVEX_SITE_URL}/api/files/presign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Presign failed");
  }

  const { uploadUrl, storageKey, publicUrl } = (await presignRes.json()) as {
    uploadUrl: string;
    storageKey: string;
    publicUrl: string;
  };

  // 2. PUT file directly to MinIO
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

  if (!uploadRes.ok) throw new Error("Upload to storage failed");

  return {
    storageKey,
    url: publicUrl,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

**Step 2: Add file attachment state and handlers to `MessagePanel.tsx`**

Add `pendingFiles` state (`UploadedFile[]`) and `uploading` state (`boolean`).

Wire the `+` button to a hidden `<input type="file" accept="image/*,application/pdf,.zip,.txt" multiple>`.

On file select:

```ts
async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const files = Array.from(e.target.files ?? []);
  if (!files.length) return;
  setUploading(true);
  try {
    const uploaded = await Promise.all(files.map(uploadFile));
    setPendingFiles((prev) => [...prev, ...uploaded]);
  } catch (err) {
    // show error inline
  } finally {
    setUploading(false);
    e.target.value = "";
  }
}
```

Show pending file previews above the input:

```tsx
{
  pendingFiles.length > 0 && (
    <div className="mb-2 flex flex-wrap gap-2">
      {pendingFiles.map((f, i) => (
        <div
          key={i}
          className="relative flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs"
        >
          {isImage(f.mimeType) ? (
            <img
              src={f.url}
              alt={f.name}
              className="h-12 w-12 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-card">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="max-w-[120px] truncate font-medium text-foreground">
              {f.name}
            </span>
            <span className="text-muted-foreground">
              {formatFileSize(f.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setPendingFiles((prev) => prev.filter((_, j) => j !== i))
            }
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

On form submit, if there are pending files use `onSendMessageWithAttachments(content, pendingFiles)` instead of `onSendMessage`. Clear `pendingFiles` on success.

**Step 3: Add `onSendMessageWithAttachments` to `useFormHandlers.ts`**

```ts
const onSendMessageWithAttachments = useCallback(
  async (content: string, attachments: UploadedFile[]) => {
    if (!selectedChannelId) return;
    const draft = content.trim();
    setMessageDraft("");
    await withPending("sendMessage", () =>
      sendMessageWithAttachmentsMutation({
        channelId: selectedChannelId as Id<"channels">,
        content: draft,
        attachments,
      }),
    );
  },
  [selectedChannelId, sendMessageWithAttachmentsMutation, setMessageDraft],
);
```

**Step 4: Render attachments in message display**

In the message `<li>`, after the text content, render any attachments:

```tsx
{
  msg.attachments?.map((att, i) => (
    <div key={i} className="mt-2">
      {isImage(att.mimeType) ? (
        <a href={att.url} target="_blank" rel="noopener noreferrer">
          <img
            src={att.url}
            alt={att.name}
            className="max-h-64 max-w-sm rounded-lg border border-border object-cover"
          />
        </a>
      ) : (
        <a
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          download={att.name}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground hover:bg-muted/80"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[200px] truncate">{att.name}</span>
          <span className="text-muted-foreground">
            {formatFileSize(att.size)}
          </span>
        </a>
      )}
    </div>
  ));
}
```

Import `Paperclip` from `lucide-react`.

**Step 5: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -40`
Expected: no type errors.

**Step 6: Commit**

```bash
git add web/src/lib/upload.ts web/src/components/MessagePanel.tsx web/src/hooks/useFormHandlers.ts web/src/routes/app.tsx
git commit -m "feat(upload): file attachment UI with MinIO pre-signed upload and inline preview"
```

---

## Summary of Changes

| Category     | What                              | Impact                                |
| ------------ | --------------------------------- | ------------------------------------- |
| **Fix**      | Convex schema fully defined       | Type safety, index enforcement        |
| **Fix**      | Security helpers throw on failure | No more silent auth bypasses          |
| **Remove**   | Dead no-op mutations              | Cleaner API surface                   |
| **Remove**   | `/profile` route                  | Duplicate of settings, less confusion |
| **Remove**   | Fake DM state                     | Less dead code in app.tsx             |
| **Refactor** | Socket logic extracted to hook    | Socket events actually wired to state |
| **Add**      | Message pagination                | Scalable beyond 50 messages           |
| **Add**      | Message edit + delete             | Core messaging feature                |
| **Add**      | Emoji reactions                   | Engagement feature                    |
| **Add**      | MinIO service                     | Object storage infrastructure         |
| **Add**      | File upload (pre-signed URL flow) | Attach images and files to messages   |
