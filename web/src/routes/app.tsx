import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useAppStore } from "@/store/app-store";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Menu, PanelLeftClose } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// Import new components
import { ChannelList } from "@/components/ChannelList";
import { MemberPanel } from "@/components/MemberPanel";
import { MessagePanel } from "@/components/MessagePanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { VoicePanel } from "@/components/VoicePanel";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";

// Import new hooks
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

  // App store selectors
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const selectedChannelId = useAppStore((s) => s.selectedChannelId);
  const messageDraft = useAppStore((s) => s.messageDraft);
  const setSelectedWorkspaceId = useAppStore((s) => s.setSelectedWorkspaceId);
  const setSelectedChannelId = useAppStore((s) => s.setSelectedChannelId);
  const setMessageDraft = useAppStore((s) => s.setMessageDraft);
  const resetChannelSelection = useAppStore((s) => s.resetChannelSelection);

  // Local UI state
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [selectedDmUserId, setSelectedDmUserId] = useState("");
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return (
        window.localStorage.getItem("privatechat_onboarding_dismissed") === "1"
      );
    } catch {
      return false;
    }
  });

  const socketRef = useRef<Socket | null>(null);

  // Use custom hooks
  const formHandlers = useFormHandlers();
  const voiceChannel = useVoiceChannel(socketRef, session);

  // ── Convex live queries ──────────────────────────────────────────────────
  const passwordStatus = useQuery(
    api.users.getPasswordStatus,
    session?.user ? {} : "skip",
  );
  const workspaces =
    useQuery(api.workspaces.list, session?.user ? {} : "skip") ?? [];

  const channels =
    useQuery(
      api.channels.list,
      selectedWorkspaceId
        ? { workspaceId: selectedWorkspaceId as Id<"workspaces"> }
        : "skip",
    ) ?? [];

  const messages =
    useQuery(
      api.messages.list,
      selectedChannelId
        ? { channelId: selectedChannelId as Id<"channels"> }
        : "skip",
    ) ?? [];

  const members =
    useQuery(
      api.members.list,
      selectedWorkspaceId
        ? { workspaceId: selectedWorkspaceId as Id<"workspaces"> }
        : "skip",
    ) ?? [];

  const workspaceSettings = useQuery(
    api.workspaces.getSettings,
    selectedWorkspaceId
      ? { workspaceId: selectedWorkspaceId as Id<"workspaces"> }
      : "skip",
  );

  // ── Derived state ────────────────────────────────────────────────────────
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

  // ── mustChangePassword redirect ─────────────────────────────────────────
  useEffect(() => {
    if (session?.user && passwordStatus?.mustChangePassword) {
      void navigate({ to: "/security/change-password" });
    }
  }, [navigate, session?.user, passwordStatus?.mustChangePassword]);

  // ── Workspace selection sync ─────────────────────────────────────────────
  useEffect(() => {
    if (!workspaces.length) {
      setSelectedWorkspaceId("");
      resetChannelSelection();
      return;
    }
    const fromSearch =
      search.workspace &&
      workspaces.some((w) => w.workspaceId === search.workspace)
        ? search.workspace
        : "";
    if (fromSearch && fromSearch !== selectedWorkspaceId) {
      setSelectedWorkspaceId(fromSearch);
      return;
    }
    if (
      !selectedWorkspaceId ||
      !workspaces.some((w) => w.workspaceId === selectedWorkspaceId)
    ) {
      setSelectedWorkspaceId(workspaces[0].workspaceId);
    }
  }, [
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    resetChannelSelection,
    search.workspace,
  ]);

  // ── Channel selection sync ───────────────────────────────────────────────
  useEffect(() => {
    if (!channels.length) {
      setSelectedChannelId("");
      return;
    }
    const fromSearch =
      search.channel && channels.some((c) => c._id === search.channel)
        ? search.channel
        : "";
    if (fromSearch && fromSearch !== selectedChannelId) {
      setSelectedDmUserId("");
      setSelectedChannelId(fromSearch);
      return;
    }
    if (
      !selectedDmUserId &&
      (!selectedChannelId || !channels.some((c) => c._id === selectedChannelId))
    ) {
      setSelectedChannelId(channels[0]._id);
    }
  }, [channels, selectedDmUserId, setSelectedChannelId, search.channel]);

  // ── Leave voice if channel deleted ──────────────────────────────────────
  useEffect(() => {
    if (!voiceChannel.voiceChannelId || !channels.length) return;
    if (!channels.some((c) => c._id === voiceChannel.voiceChannelId)) {
      void voiceChannel.leaveVoiceChannel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  // ── URL sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    const nextWorkspace = selectedWorkspaceId || undefined;
    const nextChannel = selectedChannelId || undefined;
    const nextVoice = voiceChannel.voiceChannelId || undefined;
    if (
      search.workspace === nextWorkspace &&
      search.channel === nextChannel &&
      search.voice === nextVoice
    )
      return;
    void navigate({
      to: "/app",
      replace: true,
      search: (prev) => ({
        ...prev,
        workspace: nextWorkspace,
        channel: nextChannel,
        voice: nextVoice,
      }),
    });
  }, [
    navigate,
    search.channel,
    search.voice,
    search.workspace,
    selectedChannelId,
    selectedWorkspaceId,
    session?.user,
    voiceChannel.voiceChannelId,
  ]);

  // ── Onboarding persistence ───────────────────────────────────────────────
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "privatechat_onboarding_dismissed",
        onboardingDismissed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [onboardingDismissed]);

  // ── Socket.io — voice only ───────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || socketRef.current) return;

    const socket: Socket = io("/ws", {
      withCredentials: true,
      transports: ["websocket"],
      path: "/socket.io",
    });
    socketRef.current = socket;

    // Voice presence listener
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
        if (payload.channelId !== voiceChannel.voiceChannelId) return;
        const me = socket.id;
        const peers = payload.participants
          .map((p) => p.peerId)
          .filter((id) => id && id !== me);
        const roster: Record<
          string,
          { name: string; email: string; speaking: boolean }
        > = {};
        payload.participants.forEach((p) => {
          if (!p.peerId || p.peerId === me) return;
          roster[p.peerId] = {
            name: p.name || "User",
            email: p.email || "",
            speaking: Boolean(p.speaking),
          };
        });
        // Update voice roster (this would be handled by the voice hook in a full refactor)
        console.log("Voice presence update received", roster);
      },
    );

    socket.on(
      "voice-new-producer",
      async (payload: {
        channelId: string;
        producerId: string;
        peerId: string;
      }) => {
        if (
          !payload?.channelId ||
          payload.channelId !== voiceChannel.voiceChannelId
        )
          return;
        // Handle new producer (managed by voice hook)
        console.log("New producer", payload);
      },
    );

    socket.on("voice-peer-left", (payload: { peerId: string }) => {
      // Handle peer left
      console.log("Peer left", payload.peerId);
    });

    socket.on(
      "voice-speaking",
      (payload: { peerId: string; speaking: boolean }) => {
        // Handle speaking state
        console.log("Speaking state", payload);
      },
    );

    return () => {
      socket.off("voice-new-producer");
      socket.off("voice-presence");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.user, voiceChannel.voiceChannelId]);

  useEffect(() => {
    if (!socketRef.current || !selectedChannelId) return;
    socketRef.current.emit("join-channel", { channelId: selectedChannelId });
    return () => {
      socketRef.current?.emit("leave-channel", {
        channelId: selectedChannelId,
      });
    };
  }, [selectedChannelId]);

  // ── Auto-join voice from URL ─────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || !search.voice || !socketRef.current) return;
    if (voiceChannel.voiceChannelId === search.voice || !channels.length)
      return;
    const target = channels.find(
      (c) => c._id === search.voice && c.type === "VOICE",
    );
    if (!target) return;
    void voiceChannel.joinVoiceChannel(target._id);
  }, [channels, search.voice, session?.user, voiceChannel]);

  // ── Audio devices setup ──────────────────────────────────────────────────
  useEffect(() => {
    void voiceChannel.refreshDevices();
    if (!navigator.mediaDevices) return;
    const onDeviceChange = () => {
      void voiceChannel.refreshDevices();
      // Handle device change if in voice channel
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () =>
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        onDeviceChange,
      );
  }, [voiceChannel]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      void voiceChannel.leaveVoiceChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Early returns ────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <div className="rounded-2xl border border-surface-3 bg-surface-3 p-6 text-sm text-muted-foreground">
        Chargement de la session...
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="rounded-xl border border-surface-3 bg-surface-3 p-8 text-foreground">
        <h2 className="text-2xl font-semibold">Connexion requise</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Client prive d'entreprise. Le serveur est deja deployee sur votre
          infrastructure.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Aller vers login
        </Link>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-92px)] rounded-2xl border border-surface-3 bg-surface-base p-2 text-foreground shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(124,90,246,0.08)]">
      {/* Mobile top bar */}
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-surface-3 bg-surface-3 p-2 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-3"
          onClick={() => setShowMobileNav((p) => !p)}
        >
          {showMobileNav ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <Menu className="h-4 w-4" />
          )}
        </Button>
        <select
          value={selectedWorkspaceId}
          className="h-10 min-w-0 flex-1 rounded-md border border-surface-4 bg-surface-3 px-3 text-sm text-foreground outline-none"
          onChange={(e) => {
            setSelectedWorkspaceId(e.target.value);
            resetChannelSelection();
            setSelectedDmUserId("");
            setShowMobileNav(false);
          }}
        >
          {workspaces.map((item) => (
            <option key={item.workspaceId} value={item.workspaceId}>
              {item.name}
            </option>
          ))}
        </select>
        {voiceChannel.voiceChannelId ? (
          <Badge className="border-accent/30 bg-accent/15 text-[10px] text-accent">
            Live
          </Badge>
        ) : null}
      </div>

      <div className="grid h-full grid-cols-1 overflow-hidden rounded-xl md:grid-cols-[76px_300px_1fr] xl:grid-cols-[76px_300px_1fr_280px]">
        {/* Workspace switcher sidebar */}
        <WorkspaceSidebar
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={setSelectedWorkspaceId}
        />

        {/* Channel sidebar */}
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
          showMobileNav={showMobileNav}
          onSelectChannel={setSelectedChannelId}
        />

        {/* Main chat area */}
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

        {/* Admin/Settings sidebar */}
        <div className="hidden xl:flex xl:flex-col">
          {/* Voice panel when in voice channel */}
          {selectedChannel?.type === "VOICE" && !selectedDmMember ? (
            <VoicePanel
              voiceChannelId={voiceChannel.voiceChannelId}
              selectedChannelId={selectedChannelId}
              selectedChannel={selectedChannel}
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
              diagnostics={voiceChannel.diagnostics}
              showDiagPanel={voiceChannel.showDiagPanel}
              voiceError={voiceChannel.voiceError}
              voiceJoining={voiceChannel.voiceJoining}
              sessionUser={session.user}
              onJoinVoice={voiceChannel.joinVoiceChannel}
              onLeaveVoice={voiceChannel.leaveVoiceChannel}
              onToggleMic={voiceChannel.toggleMicrophone}
              onToggleDeafen={voiceChannel.toggleDeafen}
              onRefreshDevices={voiceChannel.refreshDevices}
              onToggleLoopback={voiceChannel.toggleLoopbackTest}
              onSelectInputDevice={voiceChannel.onSelectInputDevice}
              onSelectOutputDevice={voiceChannel.onSelectOutputDevice}
              onToggleAudioProcessing={voiceChannel.onToggleAudioProcessing}
              onSetShowDiagPanel={voiceChannel.setShowDiagPanel}
            />
          ) : (
            /* Settings panel */
            <SettingsPanel
              selectedWorkspaceId={selectedWorkspaceId}
              selectedWorkspaceMembership={selectedWorkspaceMembership}
              selectedChannel={selectedChannel}
              workspaceSettings={workspaceSettings}
              canModerateRoles={canModerateRoles}
              workspaceName={formHandlers.workspaceName}
              setWorkspaceName={formHandlers.setWorkspaceName}
              inviteCode={formHandlers.inviteCode}
              setInviteCode={formHandlers.setInviteCode}
              inviteLink={formHandlers.inviteLink}
              setInviteLink={formHandlers.setInviteLink}
              pendingMutations={formHandlers.pendingMutations}
              mutationError={formHandlers.mutationError}
              onCreateWorkspace={formHandlers.onCreateWorkspace}
              onGenerateInvite={formHandlers.onGenerateInvite}
              onJoinInvite={formHandlers.onJoinInvite}
              onUpdateSettings={formHandlers.onUpdateSettings}
            />
          )}

          {/* Member panel */}
          <MemberPanel
            members={members}
            sessionUserId={session.user.id}
            canModerateRoles={canModerateRoles}
            onUpdateMemberRole={formHandlers.onUpdateMemberRole}
            onKickMember={formHandlers.onKickMember}
          />
        </div>
      </div>

      {/* Mobile bottom join/invite section */}
      <div className="mt-2 grid gap-2 xl:hidden">
        <form
          className="grid gap-2 rounded-lg border border-surface-3 bg-surface p-3 sm:grid-cols-2"
          onSubmit={formHandlers.onJoinInvite}
        >
          <input
            value={formHandlers.inviteCode}
            onChange={(e) => formHandlers.setInviteCode(e.target.value)}
            placeholder="Code invitation"
            className="h-10 rounded-md border border-surface-3 bg-surface-2 px-3 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={formHandlers.pendingMutations.has("joinInvite")}
            className="h-10 rounded-md border border-surface-3 bg-surface-3 text-xs font-semibold text-muted-foreground hover:border-accent/30 hover:text-accent-soft"
          >
            Rejoindre
          </button>
        </form>
        {formHandlers.mutationError ? (
          <p className="rounded border border-red-500/50 bg-red-900/20 p-2 text-xs text-red-400">
            {formHandlers.mutationError}
          </p>
        ) : null}
      </div>

      {/* Onboarding banner */}
      {workspaces !== undefined &&
      !workspaces.length &&
      !onboardingDismissed ? (
        <div className="mt-2 rounded-xl border border-surface-3 bg-gradient-to-br from-surface-3 to-surface p-6">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
            Welcome
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-foreground">
            Create your first workspace
          </h3>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Start by creating a workspace, then add text and voice channels. You
            can also join with an invite code.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <form
              className="flex gap-2"
              onSubmit={formHandlers.onCreateWorkspace}
            >
              <input
                value={formHandlers.workspaceName}
                onChange={(e) => formHandlers.setWorkspaceName(e.target.value)}
                placeholder="Workspace name"
                className="h-11 flex-1 rounded-md border border-surface-4 bg-surface-3 px-3 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <Button type="submit" className="h-11 px-4">
                Create
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-4"
              onClick={() => setOnboardingDismissed(true)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
