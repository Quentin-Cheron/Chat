import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createChannel,
  createInvite,
  createWorkspace,
  getPasswordStatus,
  getResolverJoinLink,
  getShareInviteLink,
  getWorkspaceSettings,
  joinInvite,
  listChannels,
  listMessages,
  listWorkspaceMembers,
  listWorkspaces,
  sendMessage,
  updateWorkspaceMemberRole,
  updateWorkspaceSettings,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useAppStore } from "@/store/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Crown,
  Hash,
  MessageSquare,
  Mic,
  MicOff,
  PhoneCall,
  Plus,
  Send,
  Shield,
  ShieldCheck,
  Users,
  Volume2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export const Route = createFileRoute("/app")({
  component: AppPage,
});

function AppPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const selectedChannelId = useAppStore((s) => s.selectedChannelId);
  const messageDraft = useAppStore((s) => s.messageDraft);
  const setSelectedWorkspaceId = useAppStore((s) => s.setSelectedWorkspaceId);
  const setSelectedChannelId = useAppStore((s) => s.setSelectedChannelId);
  const setMessageDraft = useAppStore((s) => s.setMessageDraft);
  const resetChannelSelection = useAppStore((s) => s.resetChannelSelection);

  const [workspaceName, setWorkspaceName] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"TEXT" | "VOICE">("TEXT");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [resolverInviteLink, setResolverInviteLink] = useState("");
  const [voiceChannelId, setVoiceChannelId] = useState("");
  const [voiceParticipants, setVoiceParticipants] = useState<string[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
    enabled: Boolean(session?.user),
  });

  const selectedWorkspaceMembership = useMemo(
    () =>
      (workspacesQuery.data || []).find(
        (w) => w.workspace.id === selectedWorkspaceId,
      ) || null,
    [workspacesQuery.data, selectedWorkspaceId],
  );

  useEffect(() => {
    if (!workspacesQuery.data?.length) {
      setSelectedWorkspaceId("");
      resetChannelSelection();
      return;
    }

    if (
      !selectedWorkspaceId ||
      !workspacesQuery.data.some((w) => w.workspace.id === selectedWorkspaceId)
    ) {
      setSelectedWorkspaceId(workspacesQuery.data[0].workspace.id);
      resetChannelSelection();
    }
  }, [
    workspacesQuery.data,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    resetChannelSelection,
  ]);

  const channelsQuery = useQuery({
    queryKey: ["channels", selectedWorkspaceId],
    queryFn: () => listChannels(selectedWorkspaceId),
    enabled: Boolean(selectedWorkspaceId),
  });

  const selectedChannel = useMemo(
    () =>
      (channelsQuery.data || []).find((c) => c.id === selectedChannelId) ||
      null,
    [channelsQuery.data, selectedChannelId],
  );

  useEffect(() => {
    if (!channelsQuery.data?.length) {
      setSelectedChannelId("");
      return;
    }

    if (
      !selectedChannelId ||
      !channelsQuery.data.some((c) => c.id === selectedChannelId)
    ) {
      setSelectedChannelId(channelsQuery.data[0].id);
    }
  }, [channelsQuery.data, selectedChannelId, setSelectedChannelId]);

  useEffect(() => {
    if (!voiceChannelId || !channelsQuery.data) return;
    const stillExists = channelsQuery.data.some(
      (channel) => channel.id === voiceChannelId,
    );
    if (!stillExists) {
      void leaveVoiceChannel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsQuery.data, voiceChannelId]);

  const messagesQuery = useQuery({
    queryKey: ["messages", selectedChannelId],
    queryFn: () => listMessages(selectedChannelId),
    enabled: Boolean(selectedChannelId),
  });

  const membersQuery = useQuery({
    queryKey: ["workspace-members", selectedWorkspaceId],
    queryFn: () => listWorkspaceMembers(selectedWorkspaceId),
    enabled: Boolean(selectedWorkspaceId),
  });

  const passwordStatusQuery = useQuery({
    queryKey: ["password-status"],
    queryFn: getPasswordStatus,
    enabled: Boolean(session?.user),
  });

  const workspaceSettingsQuery = useQuery({
    queryKey: ["workspace-settings", selectedWorkspaceId],
    queryFn: () => getWorkspaceSettings(selectedWorkspaceId),
    enabled: Boolean(selectedWorkspaceId),
  });

  useEffect(() => {
    if (!session?.user) return;
    if (passwordStatusQuery.data?.mustChangePassword) {
      void navigate({ to: "/security/change-password" });
    }
  }, [navigate, passwordStatusQuery.data?.mustChangePassword, session?.user]);

  useEffect(() => {
    if (!session?.user || socketRef.current) {
      return;
    }

    const socket: Socket = io("/ws", {
      withCredentials: true,
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("message:new", () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    });

    socket.on(
      "voice-peers",
      async (payload: { channelId: string; peers: string[] }) => {
        if (!payload?.channelId || !Array.isArray(payload.peers)) return;
        const stream = await ensureLocalAudioStream();
        for (const peerId of payload.peers) {
          await createPeerConnection(payload.channelId, peerId, stream, true);
        }
      },
    );

    socket.on(
      "voice-signal",
      async (payload: {
        channelId: string;
        fromId: string;
        description?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      }) => {
        if (!payload?.channelId || !payload?.fromId) return;
        const stream = await ensureLocalAudioStream();
        const peer = await createPeerConnection(
          payload.channelId,
          payload.fromId,
          stream,
          false,
        );
        if (payload.description) {
          await peer.setRemoteDescription(
            new RTCSessionDescription(payload.description),
          );
          if (payload.description.type === "offer") {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socketRef.current?.emit("voice-signal", {
              channelId: payload.channelId,
              targetId: payload.fromId,
              description: answer,
            });
          }
        }
        if (payload.candidate) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            // Can happen transiently when remote description is not set yet.
          }
        }
      },
    );

    socket.on("voice-peer-left", (payload: { peerId: string }) => {
      const peerId = payload?.peerId;
      if (!peerId) return;
      const existing = peerConnectionsRef.current.get(peerId);
      existing?.close();
      peerConnectionsRef.current.delete(peerId);
      setVoiceParticipants((prev) => prev.filter((id) => id !== peerId));
      const audio = remoteAudioRef.current.get(peerId);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        remoteAudioRef.current.delete(peerId);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient, session?.user]);

  useEffect(() => {
    if (!socketRef.current || !selectedChannelId) {
      return;
    }
    socketRef.current.emit("join-channel", { channelId: selectedChannelId });
    return () => {
      socketRef.current?.emit("leave-channel", {
        channelId: selectedChannelId,
      });
    };
  }, [selectedChannelId]);

  const createWorkspaceMutation = useMutation({
    mutationFn: (name: string) => createWorkspace(name),
    onSuccess: async () => {
      setWorkspaceName("");
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const createChannelMutation = useMutation({
    mutationFn: ({
      workspaceId,
      name,
      type,
    }: {
      workspaceId: string;
      name: string;
      type: "TEXT" | "VOICE";
    }) => createChannel(workspaceId, name, type),
    onSuccess: async () => {
      setChannelName("");
      setChannelType("TEXT");
      await queryClient.invalidateQueries({
        queryKey: ["channels", selectedWorkspaceId],
      });
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: (workspaceId: string) => createInvite(workspaceId),
    onSuccess: (data) => {
      setInviteLink(getShareInviteLink(data.code));
      setResolverInviteLink(getResolverJoinLink(data.code) ?? "");
    },
  });

  const joinInviteMutation = useMutation({
    mutationFn: (code: string) => joinInvite(code),
    onSuccess: async () => {
      setInviteCode("");
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({
      channelId,
      content,
    }: {
      channelId: string;
      content: string;
    }) => sendMessage(channelId, content),
    onSuccess: async () => {
      setMessageDraft("");
      await queryClient.invalidateQueries({
        queryKey: ["messages", selectedChannelId],
      });
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: "ADMIN" | "MEMBER";
    }) => updateWorkspaceMemberRole(selectedWorkspaceId, memberId, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-members", selectedWorkspaceId],
      });
    },
  });

  const updateWorkspaceSettingsMutation = useMutation({
    mutationFn: (payload: {
      allowMemberChannelCreation?: boolean;
      allowMemberInviteCreation?: boolean;
    }) => updateWorkspaceSettings(selectedWorkspaceId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-settings", selectedWorkspaceId],
      });
    },
  });

  const latestError = useMemo(() => {
    return (
      createWorkspaceMutation.error ||
      createChannelMutation.error ||
      createInviteMutation.error ||
      joinInviteMutation.error ||
      sendMessageMutation.error ||
      updateMemberRoleMutation.error ||
      updateWorkspaceSettingsMutation.error ||
      workspacesQuery.error ||
      channelsQuery.error ||
      messagesQuery.error ||
      workspaceSettingsQuery.error ||
      membersQuery.error
    );
  }, [
    createWorkspaceMutation.error,
    createChannelMutation.error,
    createInviteMutation.error,
    joinInviteMutation.error,
    sendMessageMutation.error,
    updateMemberRoleMutation.error,
    updateWorkspaceSettingsMutation.error,
    workspacesQuery.error,
    channelsQuery.error,
    messagesQuery.error,
    workspaceSettingsQuery.error,
    membersQuery.error,
  ]);

  const canModerateRoles =
    selectedWorkspaceMembership?.role === "OWNER" ||
    selectedWorkspaceMembership?.role === "ADMIN";

  async function ensureLocalAudioStream(): Promise<MediaStream> {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getAudioTracks().forEach((track) => {
      track.enabled = micEnabled;
    });
    localStreamRef.current = stream;
    return stream;
  }

  async function createPeerConnection(
    channelId: string,
    peerId: string,
    localStream: MediaStream,
    initiator: boolean,
  ): Promise<RTCPeerConnection> {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) {
      return existing;
    }

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    localStream.getTracks().forEach((track) => {
      peer.addTrack(track, localStream);
    });

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      socketRef.current?.emit("voice-signal", {
        channelId,
        targetId: peerId,
        candidate: event.candidate.toJSON(),
      });
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      let audio = remoteAudioRef.current.get(peerId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        remoteAudioRef.current.set(peerId, audio);
      }
      audio.srcObject = stream;
      void audio.play().catch(() => {
        // Browser autoplay policies may require user interaction first.
      });
    };

    peer.onconnectionstatechange = () => {
      if (
        peer.connectionState === "disconnected" ||
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        peerConnectionsRef.current.delete(peerId);
        setVoiceParticipants((prev) => prev.filter((id) => id !== peerId));
        const audio = remoteAudioRef.current.get(peerId);
        if (audio) {
          audio.pause();
          audio.srcObject = null;
          remoteAudioRef.current.delete(peerId);
        }
      }
    };

    peerConnectionsRef.current.set(peerId, peer);
    setVoiceParticipants((prev) =>
      prev.includes(peerId) ? prev : [...prev, peerId],
    );

    if (initiator) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit("voice-signal", {
        channelId,
        targetId: peerId,
        description: offer,
      });
    }

    return peer;
  }

  async function joinVoiceChannel(channelId: string) {
    if (voiceChannelId === channelId) {
      return;
    }
    await leaveVoiceChannel();
    await ensureLocalAudioStream();
    setVoiceChannelId(channelId);
    socketRef.current?.emit("join-voice", { channelId });
  }

  async function leaveVoiceChannel() {
    if (voiceChannelId) {
      socketRef.current?.emit("leave-voice", { channelId: voiceChannelId });
    }

    for (const [, peer] of peerConnectionsRef.current) {
      peer.close();
    }
    peerConnectionsRef.current.clear();
    for (const [, audio] of remoteAudioRef.current) {
      audio.pause();
      audio.srcObject = null;
    }
    remoteAudioRef.current.clear();
    setVoiceParticipants([]);
    setVoiceChannelId("");

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }

  function toggleMicrophone() {
    const next = !micEnabled;
    setMicEnabled(next);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
  }

  useEffect(() => {
    return () => {
      void leaveVoiceChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceName.trim()) return;
    createWorkspaceMutation.mutate(workspaceName.trim());
  }

  function onCreateChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspaceId || !channelName.trim()) return;
    createChannelMutation.mutate({
      workspaceId: selectedWorkspaceId,
      name: channelName.trim(),
      type: channelType,
    });
  }

  function onJoinInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteCode.trim()) return;
    joinInviteMutation.mutate(inviteCode.trim());
  }

  function onSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChannelId || !messageDraft.trim()) return;
    sendMessageMutation.mutate({
      channelId: selectedChannelId,
      content: messageDraft.trim(),
    });
  }

  if (isPending) {
    return (
      <div className="rounded-2xl border border-[#d3dae6] bg-white p-6 text-sm text-slate-700">
        Chargement de la session...
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="rounded-xl border border-[#d3dae6] bg-white p-8 text-slate-900">
        <h2 className="text-2xl font-semibold">Connexion requise</h2>
        <p className="mt-2 text-sm text-slate-600">
          Client prive d'entreprise. Le serveur est deja deployee sur votre
          infrastructure.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block rounded-md bg-[#2f4f73] px-4 py-2 text-sm font-semibold text-white"
        >
          Aller vers login
        </Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-92px)] rounded-2xl border border-[#d3dae6] bg-[#eef3f9] p-2 text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
      <div className="grid h-full grid-cols-1 overflow-hidden rounded-xl md:grid-cols-[78px_280px_1fr] xl:grid-cols-[78px_280px_1fr_280px]">
        <aside className="hidden border-r border-[#d7deea] bg-[#f8fafd] p-3 md:block">
          <button className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#2f4f73] text-lg font-bold text-white shadow-lg shadow-[#2f4f7340]">
            PC
          </button>
          <div className="space-y-2 overflow-y-auto pr-1">
            {(workspacesQuery.data || []).map((item) => (
              <button
                key={item.workspace.id}
                onClick={() => {
                  setSelectedWorkspaceId(item.workspace.id);
                  resetChannelSelection();
                }}
                className={`group relative grid h-12 w-12 place-items-center rounded-2xl text-xs font-bold transition ${
                  selectedWorkspaceId === item.workspace.id
                    ? "bg-[#2f4f73] text-white"
                    : "bg-[#e9eef6] text-slate-700 hover:bg-[#dbe4f0]"
                }`}
                title={item.workspace.name}
              >
                <span className="absolute -left-3 h-8 w-1 rounded-r-full bg-white opacity-0 transition group-hover:opacity-70" />
                {item.workspace.name.slice(0, 2).toUpperCase()}
              </button>
            ))}
          </div>
        </aside>

        <aside className="border-r border-[#d7deea] bg-[#f3f6fb] p-3">
          <h2 className="mb-3 truncate text-sm font-semibold text-slate-900">
            {selectedWorkspaceMembership?.workspace.name || "Groupe"}
          </h2>
          <div className="space-y-1">
            {(channelsQuery.data || []).map((channel) => (
              <button
                key={channel.id}
                onClick={() => setSelectedChannelId(channel.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  selectedChannelId === channel.id
                    ? "bg-[#dce6f3] text-slate-900"
                    : "text-slate-700 hover:bg-[#e6edf7]"
                }`}
              >
                {channel.type === "VOICE" ? (
                  <Volume2 className="h-4 w-4 opacity-85" />
                ) : (
                  <Hash className="h-4 w-4 opacity-85" />
                )}
                <span className="truncate">{channel.slug}</span>
                {channel.type === "VOICE" ? (
                  <span className="ml-auto rounded border border-[#c7d3e4] px-1.5 py-0.5 text-[10px] uppercase">
                    voice
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <form className="mt-4 flex gap-2" onSubmit={onCreateChannel}>
            <select
              value={channelType}
              onChange={(event) =>
                setChannelType(event.target.value as "TEXT" | "VOICE")
              }
              className="h-9 rounded border border-[#c7d3e4] bg-white px-2 text-[11px] text-slate-700 outline-none"
            >
              <option value="TEXT">text</option>
              <option value="VOICE">voice</option>
            </select>
            <Input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder={
                channelType === "VOICE" ? "new-voice" : "new-channel"
              }
              className="h-9 border-[#c7d3e4] bg-white px-2 text-xs text-slate-900 placeholder:text-slate-500"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={
                selectedWorkspaceMembership?.role === "MEMBER" &&
                !workspaceSettingsQuery.data?.allowMemberChannelCreation
              }
              className="h-9 border-[#c7d3e4] bg-white px-2 text-slate-700 hover:bg-[#edf2f9]"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </form>

          <div className="mt-4 rounded-lg border border-[#d3dae6] bg-white p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">
              Workspace actif
            </p>
            <p className="mt-1 truncate text-sm font-medium text-slate-900">
              {selectedWorkspaceMembership?.workspace.name || "None"}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <Users className="h-3.5 w-3.5" />
              {selectedWorkspaceMembership?.workspace._count.members || 0}{" "}
              membres
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <MessageSquare className="h-3.5 w-3.5" />
              {selectedWorkspaceMembership?.workspace._count.channels || 0}{" "}
              channels
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col bg-white">
          <header className="flex h-14 items-center justify-between border-b border-[#e2e8f2] px-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {selectedChannel?.type === "VOICE" ? (
                <Volume2 className="h-4 w-4 text-slate-500" />
              ) : (
                <Hash className="h-4 w-4 text-slate-500" />
              )}
              {selectedChannel?.slug || "channel"}
            </div>
            <div className="flex items-center gap-2">
              {selectedChannel?.type === "VOICE" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-[#c7d3e4] bg-white px-2 text-[11px] text-slate-700 hover:bg-[#edf2f9]"
                    onClick={() =>
                      voiceChannelId === selectedChannel.id
                        ? void leaveVoiceChannel()
                        : void joinVoiceChannel(selectedChannel.id)
                    }
                  >
                    <PhoneCall className="mr-1 h-3.5 w-3.5" />
                    {voiceChannelId === selectedChannel.id
                      ? "Quitter vocal"
                      : "Rejoindre vocal"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!voiceChannelId}
                    className="h-8 border-[#c7d3e4] bg-white px-2 text-[11px] text-slate-700 hover:bg-[#edf2f9]"
                    onClick={toggleMicrophone}
                  >
                    {micEnabled ? (
                      <Mic className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <MicOff className="mr-1 h-3.5 w-3.5" />
                    )}
                    {micEnabled ? "Micro on" : "Micro off"}
                  </Button>
                  <Badge className="border-[#c8d5e8] bg-[#edf3fb] text-[10px] tracking-wider text-[#2f4f73]">
                    {voiceParticipants.length + (voiceChannelId ? 1 : 0)} en
                    vocal
                  </Badge>
                </>
              ) : null}
              <Badge className="border-[#c8d5e8] bg-[#edf3fb] text-[10px] tracking-wider text-[#2f4f73]">
                {selectedWorkspaceMembership?.role || "MEMBER"}
              </Badge>
            </div>
          </header>

          <section className="flex-1 space-y-2 overflow-auto p-4">
            {selectedChannel?.type === "VOICE" ? (
              <div className="rounded-lg border border-dashed border-[#d3dae6] bg-[#f7f9fc] p-5 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">
                  Canal vocal actif
                </p>
                <p className="mt-2">
                  Rejoignez ce salon avec "Rejoindre vocal", puis
                  activez/désactivez votre micro.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Participants connectes:{" "}
                  {voiceParticipants.length + (voiceChannelId ? 1 : 0)}
                </p>
              </div>
            ) : (messagesQuery.data || []).length ? (
              (messagesQuery.data || []).map((msg) => (
                <article
                  key={msg.id}
                  className="rounded-md px-2 py-1.5 hover:bg-[#f4f7fc]"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {msg.author.name}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                  </p>
                  <p className="text-sm text-slate-700">{msg.content}</p>
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-[#d3dae6] bg-[#f7f9fc] p-5 text-sm text-slate-600">
                Aucun message pour le moment. Commencez votre canal de
                collaboration.
              </div>
            )}
          </section>

          <form
            onSubmit={onSendMessage}
            className="border-t border-[#e2e8f2] p-3"
          >
            <div className="flex items-center gap-2 rounded-lg border border-[#d3dae6] bg-[#f8fafd] px-3 py-2">
              <input
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                disabled={selectedChannel?.type === "VOICE"}
                placeholder={
                  selectedChannel
                    ? `Message #${selectedChannel.slug}`
                    : "Select a channel"
                }
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={
                  !selectedChannelId ||
                  sendMessageMutation.isPending ||
                  selectedChannel?.type === "VOICE"
                }
                className="rounded-md bg-[#2f4f73] p-2 text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </main>

        <aside className="hidden overflow-y-auto border-l border-[#d7deea] bg-[#f3f6fb] p-4 xl:block">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Administration
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Gardez vos donnees chez vous, operez simplement.
          </p>

          <form className="mt-3 grid gap-2" onSubmit={onCreateWorkspace}>
            <Input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Nom workspace"
              className="h-10 border-[#c7d3e4] bg-white text-xs text-slate-900 placeholder:text-slate-500"
            />
            <Button
              type="submit"
              size="sm"
              className="h-10 border-[#2f4f73] bg-[#2f4f73] text-xs text-white hover:bg-[#274566]"
            >
              Creer workspace
            </Button>
          </form>

          <form className="mt-3 grid gap-2" onSubmit={onJoinInvite}>
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Code invitation"
              className="h-10 border-[#c7d3e4] bg-white text-xs text-slate-900 placeholder:text-slate-500"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-10 border-[#c7d3e4] bg-white text-xs text-slate-700 hover:bg-[#edf2f9]"
            >
              Join workspace
            </Button>
          </form>

          {selectedWorkspaceId ? (
            <Button
              onClick={() => createInviteMutation.mutate(selectedWorkspaceId)}
              size="sm"
              disabled={
                selectedWorkspaceMembership?.role === "MEMBER" &&
                !workspaceSettingsQuery.data?.allowMemberInviteCreation
              }
              className="mt-3 h-10 w-full border-[#2f4f73] bg-[#2f4f73] text-xs text-white hover:bg-[#274566]"
            >
              Generer lien d'invitation
            </Button>
          ) : null}

          {inviteLink ? (
            <div className="mt-3 space-y-2 rounded-md border border-[#d3dae6] bg-white p-2 text-[11px] text-slate-700">
              <p className="font-semibold text-slate-900">
                Lien direct (recommande)
              </p>
              <p className="break-all">{inviteLink}</p>
              {resolverInviteLink ? (
                <>
                  <p className="font-semibold text-slate-900">
                    Lien via resolver (optionnel)
                  </p>
                  <p className="break-all">{resolverInviteLink}</p>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-md border border-[#d3dae6] bg-white p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">Informations</p>
            <p className="mt-2 flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" />
              Role: {selectedWorkspaceMembership?.role || "-"}
            </p>
            <p className="mt-1">
              Channel actif: {selectedChannel?.slug || "-"}
            </p>
          </div>

          <div className="mt-4 rounded-md border border-[#d3dae6] bg-white p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">
              Permissions du groupe
            </p>
            <label className="mt-2 flex items-center justify-between gap-3 text-[12px]">
              Membres peuvent creer des channels
              <input
                type="checkbox"
                disabled={
                  !canModerateRoles || updateWorkspaceSettingsMutation.isPending
                }
                checked={
                  workspaceSettingsQuery.data?.allowMemberChannelCreation ??
                  true
                }
                onChange={(event) =>
                  updateWorkspaceSettingsMutation.mutate({
                    allowMemberChannelCreation: event.target.checked,
                  })
                }
              />
            </label>
            <label className="mt-2 flex items-center justify-between gap-3 text-[12px]">
              Membres peuvent creer des invitations
              <input
                type="checkbox"
                disabled={
                  !canModerateRoles || updateWorkspaceSettingsMutation.isPending
                }
                checked={
                  workspaceSettingsQuery.data?.allowMemberInviteCreation ??
                  false
                }
                onChange={(event) =>
                  updateWorkspaceSettingsMutation.mutate({
                    allowMemberInviteCreation: event.target.checked,
                  })
                }
              />
            </label>
          </div>

          <div className="mt-4 rounded-md border border-[#d3dae6] bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Membres du groupe
            </p>
            <div className="mt-2 space-y-2">
              {(membersQuery.data || []).map((member) => (
                <div
                  key={member.id}
                  className="rounded-md border border-[#e2e8f2] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {member.user.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {member.user.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-600">
                      {member.role === "OWNER" ? (
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                      ) : null}
                      {member.role === "ADMIN" ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-[#2f4f73]" />
                      ) : null}
                      {member.role}
                    </div>
                  </div>
                  {canModerateRoles &&
                  member.role !== "OWNER" &&
                  member.userId !== session.user.id ? (
                    <div className="mt-2">
                      <select
                        value={member.role}
                        disabled={updateMemberRoleMutation.isPending}
                        className="h-7 w-full rounded border border-[#c7d3e4] bg-white px-2 text-[11px] text-slate-700 outline-none"
                        onChange={(event) => {
                          const role = event.target.value as "ADMIN" | "MEMBER";
                          if (role === member.role) return;
                          updateMemberRoleMutation.mutate({
                            memberId: member.id,
                            role,
                          });
                        }}
                      >
                        <option value="MEMBER">member</option>
                        <option value="ADMIN">admin</option>
                      </select>
                    </div>
                  ) : null}
                </div>
              ))}
              {!membersQuery.data?.length ? (
                <p className="text-[11px] text-slate-500">
                  Aucun membre dans ce groupe.
                </p>
              ) : null}
            </div>
          </div>

          {latestError ? (
            <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
              {String((latestError as Error).message || latestError)}
            </p>
          ) : null}
        </aside>
      </div>

      <div className="mt-2 grid gap-2 xl:hidden">
        <form
          className="grid gap-2 rounded-lg border border-[#d3dae6] bg-white p-3 sm:grid-cols-2"
          onSubmit={onJoinInvite}
        >
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Code invitation"
            className="h-10 border-[#c7d3e4] bg-white text-xs text-slate-900 placeholder:text-slate-500"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-10 border-[#c7d3e4] bg-white text-xs text-slate-700 hover:bg-[#edf2f9]"
          >
            Join workspace
          </Button>
        </form>
        {latestError ? (
          <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
            {String((latestError as Error).message || latestError)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
