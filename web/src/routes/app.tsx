import { authClient } from "@/lib/auth-client";
import { useAppStore } from "@/store/app-store";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Menu, MessageSquareMore, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

import { ChannelList } from "@/components/ChannelList";
import { MessagePanel } from "@/components/MessagePanel";
import { RightSidebar } from "@/components/RightSidebar";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";

import { useFormHandlers } from "@/hooks/useFormHandlers";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>) => ({
    workspace:
      typeof search.workspace === "string" && search.workspace.trim()
        ? search.workspace
        : undefined,
    channel:
      typeof search.channel === "string" && search.channel.trim()
        ? search.channel
        : undefined,
    voice:
      typeof search.voice === "string" && search.voice.trim()
        ? search.voice
        : undefined,
  }),
  component: AppPage,
});

function AppPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const search = Route.useSearch();

  // messageDraft reste dans le store (état purement local, pas dans l'URL)
  const messageDraft = useAppStore((s) => s.messageDraft);
  const setMessageDraft = useAppStore((s) => s.setMessageDraft);

  const [showMobileNav, setShowMobileNav] = useState(false);
  const [selectedDmUserId, setSelectedDmUserId] = useState("");

  // ── IDs depuis l'URL (source de vérité) ─────────────────────────────────
  const selectedWorkspaceId = search.workspace ?? "";
  const selectedChannelId = search.channel ?? "";

  const socketRef = useRef<Socket | null>(null);
  const formHandlers = useFormHandlers({ selectedWorkspaceId, selectedChannelId });

  // ── Helpers de navigation ────────────────────────────────────────────────
  function selectWorkspace(id: string) {
    void navigate({ to: "/app", replace: true, search: { workspace: id } });
  }

  function selectChannel(id: string) {
    void navigate({ to: "/app", replace: true, search: (prev) => ({ ...prev, channel: id, voice: undefined }) });
  }

  const voiceChannel = useVoiceChannel(socketRef, session);

  // ── Convex queries ──────────────────────────────────────────────────────
  const passwordStatus = useQuery(api.users.getPasswordStatus, session?.user ? {} : "skip");
  const workspacesQuery = useQuery(api.workspaces.list, session?.user ? {} : "skip");
  const workspaces = workspacesQuery ?? [];
  const channels = useQuery(
    api.channels.list,
    session?.user && selectedWorkspaceId ? { workspaceId: selectedWorkspaceId as Id<"workspaces"> } : "skip",
  ) ?? [];
  const messages = useQuery(
    api.messages.list,
    session?.user && selectedChannelId ? { channelId: selectedChannelId as Id<"channels"> } : "skip",
  ) ?? [];
  const members = useQuery(
    api.members.list,
    session?.user && selectedWorkspaceId ? { workspaceId: selectedWorkspaceId as Id<"workspaces"> } : "skip",
  ) ?? [];
  const workspaceSettings = useQuery(
    api.workspaces.getSettings,
    session?.user && selectedWorkspaceId ? { workspaceId: selectedWorkspaceId as Id<"workspaces"> } : "skip",
  );

  // ── Derived state ───────────────────────────────────────────────────────
  const selectedWorkspaceMembership = useMemo(
    () => workspaces.find((w) => w.workspaceId === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId],
  );
  const selectedChannel = useMemo(
    () => channels.find((c) => c._id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );
  const dmMembers = useMemo(
    () => members.filter((m) => m.userId !== session?.user?.id),
    [members, session?.user?.id],
  );
  const selectedDmMember = useMemo(
    () => dmMembers.find((m) => m.userId === selectedDmUserId) ?? null,
    [dmMembers, selectedDmUserId],
  );
  const canModerateRoles =
    selectedWorkspaceMembership?.role === "OWNER" ||
    selectedWorkspaceMembership?.role === "ADMIN";

  // ── Auto-select workspace si absent de l'URL ─────────────────────────────
  useEffect(() => {
    if (!workspaces.length) return;
    if (selectedWorkspaceId && workspaces.some((w) => w.workspaceId === selectedWorkspaceId)) return;
    // Pas de workspace valide dans l'URL → prendre le premier
    void navigate({ to: "/app", replace: true, search: { workspace: workspaces[0].workspaceId } });
  }, [workspaces, selectedWorkspaceId, navigate]);

  // ── Auto-select channel si absent de l'URL ───────────────────────────────
  useEffect(() => {
    if (!channels.length) return;
    if (selectedChannelId && channels.some((c) => c._id === selectedChannelId)) return;
    // Pas de channel valide dans l'URL → prendre le premier
    void navigate({ to: "/app", replace: true, search: (prev) => ({ ...prev, channel: channels[0]._id, voice: undefined }) });
  }, [channels, selectedChannelId, navigate]);

  // ── mustChangePassword redirect ──────────────────────────────────────────
  useEffect(() => {
    if (session?.user && passwordStatus?.mustChangePassword) {
      void navigate({ to: "/security/change-password" });
    }
  }, [navigate, session?.user, passwordStatus?.mustChangePassword]);

  // ── Leave voice if channel deleted ───────────────────────────────────────
  useEffect(() => {
    if (!voiceChannel.voiceChannelId || !channels.length) return;
    if (!channels.some((c) => c._id === voiceChannel.voiceChannelId)) void voiceChannel.leaveVoiceChannel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  // ── Socket.io ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || socketRef.current) return;
    const socket: Socket = io("/ws", { withCredentials: true, transports: ["websocket"], path: "/socket.io" });
    socketRef.current = socket;
    socket.on("voice-presence", (payload: { channelId: string; participants: Array<{ peerId: string; name?: string; email?: string; speaking?: boolean }> }) => {
      if (!payload?.channelId || !Array.isArray(payload.participants)) return;
    });
    socket.on("voice-new-producer", async (payload: { channelId: string; producerId: string; peerId: string }) => {
      if (!payload?.channelId || payload.channelId !== voiceChannel.voiceChannelId) return;
    });
    socket.on("voice-peer-left", (_payload: { peerId: string }) => {});
    socket.on("voice-speaking", (_payload: { peerId: string; speaking: boolean }) => {});
    return () => { socket.off("voice-new-producer"); socket.off("voice-presence"); socket.disconnect(); socketRef.current = null; };
  }, [session?.user, voiceChannel.voiceChannelId]);

  useEffect(() => {
    if (!socketRef.current || !selectedChannelId) return;
    socketRef.current.emit("join-channel", { channelId: selectedChannelId });
    return () => { socketRef.current?.emit("leave-channel", { channelId: selectedChannelId }); };
  }, [selectedChannelId]);

  // ── Auto-join voice from URL ─────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || !search.voice || !socketRef.current) return;
    if (voiceChannel.voiceChannelId === search.voice || !channels.length) return;
    const target = channels.find((c) => c._id === search.voice && c.type === "VOICE");
    if (!target) return;
    void voiceChannel.joinVoiceChannel(target._id);
  }, [channels, search.voice, session?.user, voiceChannel]);

  // ── Audio devices ────────────────────────────────────────────────────────
  useEffect(() => {
    void voiceChannel.refreshDevices();
    if (!navigator.mediaDevices) return;
    const onDeviceChange = () => { void voiceChannel.refreshDevices(); };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [voiceChannel]);

  useEffect(() => {
    return () => { void voiceChannel.leaveVoiceChannel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Early returns ───────────────────────────────────────────────────────
  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading...
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
          <MessageSquareMore className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Sign in required</h2>
        <p className="text-sm text-muted-foreground">You need to be signed in to access this page.</p>
        <Link to="/login" className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary/90">
          Go to login
        </Link>
      </div>
    );
  }

  if (workspacesQuery === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading...
        </div>
      </div>
    );
  }

  if (workspacesQuery.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <MessageSquareMore className="h-6 w-6 text-white" />
          </div>
          <h3 className="text-xl font-bold text-foreground">Create your first workspace</h3>
          <p className="mt-1 text-sm text-muted-foreground">Start by creating a workspace, then invite your team.</p>
          <form className="mt-6 flex gap-2" onSubmit={formHandlers.onCreateWorkspace}>
            <input
              value={formHandlers.workspaceName}
              onChange={(e) => formHandlers.setWorkspaceName(e.target.value)}
              placeholder="Workspace name"
              className="h-10 flex-1 rounded-lg border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90">
              Create
            </button>
          </form>
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">Or join with an invite code:</p>
            <form className="flex gap-2" onSubmit={formHandlers.onJoinInvite}>
              <input
                value={formHandlers.inviteCode}
                onChange={(e) => formHandlers.setInviteCode(e.target.value)}
                placeholder="Invite code"
                className="h-10 flex-1 rounded-lg border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
              <button type="submit" className="h-10 rounded-lg border border-border px-4 text-sm text-muted-foreground hover:text-foreground">
                Join
              </button>
            </form>
          </div>
          {formHandlers.mutationError && (
            <p className="mt-3 text-xs text-red-400">{formHandlers.mutationError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {showMobileNav && (
        <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setShowMobileNav(false)} />
      )}

      {/* Mobile nav drawer */}
      <div className={`fixed inset-y-0 left-0 z-30 flex transition-transform duration-200 md:hidden ${showMobileNav ? "translate-x-0" : "-translate-x-full"}`}>
        <WorkspaceSidebar
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={(id) => { selectWorkspace(id); setShowMobileNav(false); }}
          onCreateWorkspace={formHandlers.onCreateWorkspace}
          workspaceName={formHandlers.workspaceName}
          setWorkspaceName={formHandlers.setWorkspaceName}
          pendingMutations={formHandlers.pendingMutations}
          mutationError={formHandlers.mutationError}
        />
        <ChannelList
          channels={channels}
          members={members}
          selectedChannelId={selectedChannelId}
          selectedWorkspaceMembership={selectedWorkspaceMembership}
          workspaceSettings={workspaceSettings}
          channelName={formHandlers.channelName}
          setChannelName={formHandlers.setChannelName}
          channelType={formHandlers.channelType}
          setChannelType={formHandlers.setChannelType}
          onCreateChannel={formHandlers.onCreateChannel}
          onRemoveChannel={formHandlers.onRemoveChannel}
          showMobileNav={true}
          onSelectChannel={(id) => { selectChannel(id); setShowMobileNav(false); }}
        />
      </div>

      {/* Desktop */}
      <WorkspaceSidebar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={formHandlers.onCreateWorkspace}
        workspaceName={formHandlers.workspaceName}
        setWorkspaceName={formHandlers.setWorkspaceName}
        pendingMutations={formHandlers.pendingMutations}
        mutationError={formHandlers.mutationError}
      />

      <ChannelList
        channels={channels}
        members={members}
        selectedChannelId={selectedChannelId}
        selectedWorkspaceMembership={selectedWorkspaceMembership}
        workspaceSettings={workspaceSettings}
        channelName={formHandlers.channelName}
        setChannelName={formHandlers.setChannelName}
        channelType={formHandlers.channelType}
        setChannelType={formHandlers.setChannelType}
        onCreateChannel={formHandlers.onCreateChannel}
        onRemoveChannel={formHandlers.onRemoveChannel}
        showMobileNav={false}
        onSelectChannel={selectChannel}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:hidden">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setShowMobileNav((p) => !p)}
          >
            {showMobileNav ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <span className="text-sm font-semibold text-foreground">
            {selectedChannel?.name ?? "Select a channel"}
          </span>
        </div>

        <MessagePanel
          selectedDmMember={selectedDmMember}
          selectedChannel={selectedChannel}
          messages={messages}
          messageDraft={messageDraft}
          onMessageDraftChange={setMessageDraft}
          onSendMessage={formHandlers.onSendMessage}
          pendingMutations={formHandlers.pendingMutations}
          voiceChannelId={voiceChannel.voiceChannelId}
          voiceParticipants={voiceChannel.voiceParticipants}
          selectedChannelId={selectedChannelId}
        />
      </div>

      <div className="hidden lg:flex">
        <RightSidebar
          selectedWorkspaceId={selectedWorkspaceId}
          selectedWorkspaceMembership={selectedWorkspaceMembership}
          selectedChannel={selectedChannel}
          workspaceSettings={workspaceSettings}
          canModerateRoles={canModerateRoles}
          sessionUser={session.user}
          members={members}
          onUpdateMemberRole={formHandlers.onUpdateMemberRole}
          onKickMember={formHandlers.onKickMember}
          inviteCode={formHandlers.inviteCode}
          setInviteCode={formHandlers.setInviteCode}
          inviteLink={formHandlers.inviteLink}
          setInviteLink={formHandlers.setInviteLink}
          pendingMutations={formHandlers.pendingMutations}
          mutationError={formHandlers.mutationError}
          onGenerateInvite={formHandlers.onGenerateInvite}
          onJoinInvite={formHandlers.onJoinInvite}
          onUpdateSettings={formHandlers.onUpdateSettings}
          voiceChannelId={voiceChannel.voiceChannelId}
          selectedChannelId={selectedChannelId}
          micLevel={voiceChannel.micLevel}
          audioSettings={voiceChannel.audioSettings}
          inputDevices={voiceChannel.inputDevices}
          outputDevices={voiceChannel.outputDevices}
          voiceParticipants={voiceChannel.voiceParticipants}
          voiceRoster={voiceChannel.voiceRoster}
          localSpeaking={voiceChannel.localSpeaking}
          micEnabled={voiceChannel.micEnabled}
          deafened={voiceChannel.deafened}
          loopbackTesting={voiceChannel.loopbackTesting}
          diagnostics={[]}
          showDiagPanel={false}
          voiceError={voiceChannel.voiceError}
          voiceJoining={voiceChannel.voiceJoining}
          onJoinVoice={voiceChannel.joinVoiceChannel}
          onLeaveVoice={voiceChannel.leaveVoiceChannel}
          onToggleMic={voiceChannel.toggleMicrophone}
          onToggleDeafen={voiceChannel.toggleDeafen}
          onRefreshDevices={voiceChannel.refreshDevices}
          onToggleLoopback={voiceChannel.toggleLoopbackTest}
          onSelectInputDevice={voiceChannel.onSelectInputDevice}
          onSelectOutputDevice={voiceChannel.onSelectOutputDevice}
          onToggleAudioProcessing={voiceChannel.onToggleAudioProcessing}
          onSetShowDiagPanel={() => {}}
        />
      </div>
    </div>
  );
}
