# Phase 7 — UX Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add skeleton loading states, empty states, and fix diagnostics panel wiring across the web app to satisfy the Phase 7 test checklist.

**Architecture:** We add a reusable `Skeleton` UI primitive, then thread `undefined`-awareness (Convex loading state) down through `WorkspaceSidebar`, `ChannelList`, and `MessagePanel`. We also fix the hardcoded `diagnostics={[]}` / `showDiagPanel={false}` props in `app.tsx` by lifting diagnostics state up from the `useVoiceChannel` hook.

**Tech Stack:** React 18, Convex (real-time queries), TanStack Router, Tailwind CSS v4, shadcn component conventions.

---

## Task 1: Skeleton UI Primitive

**Files:**
- Create: `web/src/components/ui/skeleton.tsx`

**Step 1: Write the component**

```tsx
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
```

**Step 2: Verify the file exists and exports correctly**

Run: `grep -n "export function Skeleton" web/src/components/ui/skeleton.tsx`
Expected: line 3 — `export function Skeleton`

**Step 3: Commit**

```bash
git add web/src/components/ui/skeleton.tsx
git commit -m "feat(ui): add Skeleton primitive component"
```

---

## Task 2: Skeleton Loading in WorkspaceSidebar

**Files:**
- Modify: `web/src/components/WorkspaceSidebar.tsx`

**Context:** `WorkspaceSidebar` receives `workspaces` as an array. When Convex is loading, `workspacesQuery === undefined`. We currently default it to `[]` in `app.tsx`. Instead, we pass `undefined` as a signal for "still loading" so the sidebar can render skeletons.

**Step 1: Update Props type to accept `undefined` workspaces**

In `web/src/components/WorkspaceSidebar.tsx`, change the `Props` type:

```tsx
type Props = {
  workspaces: WorkspaceItem[] | undefined;   // undefined = loading
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (e: FormEvent) => void;
  workspaceName: string;
  setWorkspaceName: (v: string) => void;
  pendingMutations: Set<string>;
  mutationError: string;
};
```

**Step 2: Import Skeleton**

Add at top of file:
```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

**Step 3: Render skeletons when `workspaces` is undefined**

Inside the `<aside>` JSX, before the `workspaces.map(...)` call, add a guard:

```tsx
{workspaces === undefined ? (
  // Loading skeletons — 3 workspace icon placeholders
  <>
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-10 w-10 rounded-2xl" />
    ))}
  </>
) : (
  workspaces.map((ws) => { /* existing map code unchanged */ })
)}
```

**Step 4: Update call site in `app.tsx`**

In `web/src/routes/app.tsx`, change both `WorkspaceSidebar` usages (mobile drawer + desktop):
```tsx
// Before
const workspaces = workspacesQuery ?? [];
// After
// Remove the ?? [] fallback — let WorkspaceSidebar receive undefined
```

Pass `workspaces={workspacesQuery}` (can be `undefined`).

Also remove the early-return spinner block for `workspacesQuery === undefined`:
```tsx
// DELETE this block entirely:
if (workspacesQuery === undefined) {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      ...
    </div>
  );
}
```

**Step 5: Verify TypeScript compiles**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -30`
Expected: no errors related to `WorkspaceSidebar` props.

**Step 6: Commit**

```bash
git add web/src/components/WorkspaceSidebar.tsx web/src/routes/app.tsx
git commit -m "feat(ux): skeleton loading state in WorkspaceSidebar"
```

---

## Task 3: Skeleton Loading + Empty State in ChannelList

**Files:**
- Modify: `web/src/components/ChannelList.tsx`
- Modify: `web/src/routes/app.tsx`

**Context:** `channels` comes from `useQuery(api.channels.list, ...)` — returns `undefined` while loading, then `Channel[]`. Currently defaulted to `[]`. We pass `undefined` to render skeletons.

**Step 1: Update Props type**

```tsx
type Props = {
  channels: Channel[] | undefined;   // undefined = loading
  // ... rest unchanged
};
```

**Step 2: Import Skeleton**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

**Step 3: Add skeleton rendering at the top of the channel list section**

Find where `channels` is mapped (after the "CHANNELS" section header). Replace:

```tsx
{channels.map((channel) => (
```

With:

```tsx
{channels === undefined ? (
  // Loading skeletons
  <div className="mt-1 flex flex-col gap-1 px-2">
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-7 w-full rounded" />
    ))}
  </div>
) : channels.length === 0 ? (
  // Empty state
  <div className="mt-2 px-3 py-4 text-center">
    <p className="text-xs text-muted-foreground">No channels yet.</p>
    {canCreateChannel && (
      <p className="mt-1 text-xs text-muted-foreground">Use the <strong>+</strong> button to create one.</p>
    )}
  </div>
) : (
  channels.map((channel) => (
    /* existing JSX unchanged */
  ))
)}
```

Where `canCreateChannel` is the existing boolean already computed in the component (role/settings check).

**Step 4: Update call site in `app.tsx`**

Change:
```tsx
const channels = useQuery(...) ?? [];
```
To:
```tsx
const channels = useQuery(...);  // undefined while loading
```

Pass `channels={channels}` (can be `undefined`) to both `ChannelList` usages.

Also update the auto-select `useEffect` guards:
```tsx
// Before
if (!channels.length) return;
// After
if (!channels || !channels.length) return;
```
(2 effects use this pattern — update both.)

**Step 5: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -30`
Expected: no type errors.

**Step 6: Commit**

```bash
git add web/src/components/ChannelList.tsx web/src/routes/app.tsx
git commit -m "feat(ux): skeleton loading + empty state in ChannelList"
```

---

## Task 4: Skeleton Loading + Empty State in MessagePanel

**Files:**
- Modify: `web/src/components/MessagePanel.tsx`
- Modify: `web/src/routes/app.tsx`

**Context:** `messages` comes from `useQuery(api.messages.list, ...)` — `undefined` while loading. Currently `?? []`. The panel should show skeletons during load and a friendly empty state when there are no messages.

**Step 1: Update Props type**

```tsx
type Props = {
  // ...
  messages: Message[] | undefined;   // undefined = loading
  // ...
};
```

**Step 2: Import Skeleton**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

**Step 3: Build a `MessageSkeleton` internal component**

Add above the main `MessagePanel` export:

```tsx
function MessageSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
        <Skeleton className="h-4 w-3/4 rounded" />
      </div>
    </div>
  );
}
```

**Step 4: Replace messages rendering with loading/empty/content states**

In the messages scroll area, replace the raw `messages.map(...)` with:

```tsx
{messages === undefined ? (
  // Loading skeletons — 6 message placeholders
  <div className="flex flex-col py-2">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <MessageSkeleton key={i} />
    ))}
  </div>
) : messages.length === 0 ? (
  // Empty state
  <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Hash className="h-5 w-5 text-muted-foreground" />
    </div>
    <p className="text-sm font-semibold text-foreground">
      No messages yet
    </p>
    <p className="text-xs text-muted-foreground">
      Be the first to say something in{" "}
      <span className="font-medium text-foreground">
        #{selectedChannel?.name ?? "this channel"}
      </span>
      !
    </p>
  </div>
) : (
  messages.map((msg) => (
    /* existing message JSX unchanged */
  ))
)}
```

**Step 5: Update call site in `app.tsx`**

Change:
```tsx
const messages = useQuery(...) ?? [];
```
To:
```tsx
const messages = useQuery(...);  // undefined while loading
```

Pass `messages={messages}` (can be `undefined`).

**Step 6: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -30`
Expected: no type errors.

**Step 7: Commit**

```bash
git add web/src/components/MessagePanel.tsx web/src/routes/app.tsx
git commit -m "feat(ux): skeleton loading + empty state in MessagePanel"
```

---

## Task 5: Fix Diagnostics Panel Wiring

**Files:**
- Modify: `web/src/hooks/useVoiceChannel.ts`
- Modify: `web/src/routes/app.tsx`

**Context:** In `app.tsx`, `RightSidebar` receives `diagnostics={[]}` and `showDiagPanel={false}` hardcoded, and `onSetShowDiagPanel={() => {}}` is a no-op. The `useVoiceChannel` hook likely accumulates diagnostics internally but never exposes them. We need to expose `diagnostics`, `showDiagPanel`, and `setShowDiagPanel` from the hook return value.

**Step 1: Inspect current useVoiceChannel return value**

Read `web/src/hooks/useVoiceChannel.ts` fully. Look for any `diagnostics` or `diag` state variables.

**Step 2: Add diagnostics state to hook if missing**

If `useVoiceChannel` does not have diagnostics state, add:

```ts
const [diagnostics, setDiagnostics] = useState<string[]>([]);
const [showDiagPanel, setShowDiagPanel] = useState(false);
```

And expose them in the return object:
```ts
return {
  // ... existing fields ...
  diagnostics,
  showDiagPanel,
  setShowDiagPanel,
};
```

If diagnostics logging already exists in the hook (e.g., pushed into a local array or logged to console), replace `console.log` / `console.error` calls with `setDiagnostics(prev => [...prev, message])` where `message` is a descriptive string with timestamp.

**Step 3: Wire into app.tsx**

In `web/src/routes/app.tsx`, destructure the new fields:

```tsx
const {
  // ... existing destructured fields ...
  diagnostics,
  showDiagPanel,
  setShowDiagPanel,
} = voiceChannel;
```

Then pass them to `RightSidebar`:

```tsx
// Before (hardcoded)
diagnostics={[]}
showDiagPanel={false}
onSetShowDiagPanel={() => {}}

// After (live)
diagnostics={diagnostics}
showDiagPanel={showDiagPanel}
onSetShowDiagPanel={setShowDiagPanel}
```

**Step 4: Verify TypeScript**

Run: `cd web && pnpm tsc --noEmit 2>&1 | head -30`
Expected: no type errors.

**Step 5: Commit**

```bash
git add web/src/hooks/useVoiceChannel.ts web/src/routes/app.tsx
git commit -m "fix(voice): wire diagnostics state from useVoiceChannel to RightSidebar"
```

---

## Task 6: Final Integration Check

**Step 1: Start the dev server**

```bash
cd web && pnpm dev
```

Expected: server starts on `http://localhost:5173` with no build errors.

**Step 2: Manual smoke test — Loading states**

1. Open `http://localhost:5173/app` in browser with DevTools → Network → slow 3G throttling.
2. Verify workspace sidebar shows 3 pulsing grey squares before data loads.
3. Verify channel list shows 3 pulsing grey bars before channels load.
4. Verify message area shows 6 pulsing skeleton messages before messages load.

**Step 3: Manual smoke test — Empty states**

1. Create a brand-new workspace (no channels).
2. Verify ChannelList shows "No channels yet." with hint text.
3. Select an empty text channel.
4. Verify MessagePanel shows the empty state with hash icon and "Be the first to say something".

**Step 4: Manual smoke test — Diagnostics**

1. Join a voice channel.
2. Open the voice settings panel (Settings tab in RightSidebar).
3. Click "Show diagnostics" if available.
4. Verify that real-time diagnostic messages appear (connection events, device info, etc.).

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: phase 7 UX polish complete — skeletons, empty states, diagnostics wiring"
```

---

## Checklist Coverage

| Checklist Item | Addressed By |
|---|---|
| Skeleton loading visible pendant chargement channels/messages | Tasks 1, 2, 3, 4 |
| Empty states explicites pour messages, channels, onboarding | Tasks 3, 4 |
| Diagnostics panel renseigne les erreurs permission/not found/in use | Task 5 |
| Workspace onboarding visible sur compte neuf | Already implemented in `app.tsx` (workspaces.length === 0 guard) |
