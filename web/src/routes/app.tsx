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
import { readAudioSettings } from "@/lib/audio-settings";
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
import { Device } from "mediasoup-client";
import { io, type Socket } from "socket.io-client";

export const Route = createFileRoute("/app")({
  component: AppPage,
});

type TransportParams = {
  id: string;
  iceParameters: Record<string, unknown>;
  iceCandidates: Array<Record<string, unknown>>;
  dtlsParameters: Record<string, unknown>;
};

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
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceRoster, setVoiceRoster] = useState<Record<string, { name: string; email: string; speaking: boolean }>>({});
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<ReturnType<Device["createSendTransport"]> | null>(null);
  const recvTransportRef = useRef<ReturnType<Device["createRecvTransport"]> | null>(null);
  const producerIdRef = useRef<string | null>(null);
  const consumedProducerIdsRef = useRef<Set<string>>(new Set());
  const pendingProducerIdsRef = useRef<Set<string>>(new Set());
  const remoteAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const speakingContextRef = useRef<AudioContext | null>(null);
  const speakingLoopRef = useRef<number | null>(null);
  const lastSpeakingRef = useRef(false);
  const voiceChannelIdRef = useRef("");

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

  useEffect(() => {
    voiceChannelIdRef.current = voiceChannelId;
  }, [voiceChannelId]);

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
      path: "/socket.io",
    });
    socketRef.current = socket;

    socket.on("message:new", () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    });

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
        if (payload.channelId !== voiceChannelIdRef.current) return;
        const me = socket.id;
        const peers = payload.participants
          .map((p) => p.peerId)
          .filter((peerId) => peerId && peerId !== me);
        const roster: Record<string, { name: string; email: string; speaking: boolean }> = {};
        payload.participants.forEach((p) => {
          if (!p.peerId || p.peerId === me) return;
          roster[p.peerId] = {
            name: p.name || "User",
            email: p.email || "",
            speaking: Boolean(p.speaking),
          };
        });
        setVoiceParticipants(peers);
        setVoiceRoster(roster);
      },
    );

    socket.on(
      "voice-new-producer",
      async (payload: { channelId: string; producerId: string; peerId: string }) => {
        if (!payload?.channelId || payload.channelId !== voiceChannelIdRef.current) {
          return;
        }
        if (!recvTransportRef.current || !deviceRef.current) {
          pendingProducerIdsRef.current.add(payload.producerId);
          return;
        }
        if (consumedProducerIdsRef.current.has(payload.producerId)) {
          return;
        }
        await consumeProducer(payload.channelId, payload.producerId);
      },
    );

    socket.on("voice-peer-left", (payload: { peerId: string }) => {
      const peerId = payload?.peerId;
      if (!peerId) return;
      const audio = remoteAudioRef.current.get(peerId);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        remoteAudioRef.current.delete(peerId);
      }
      setVoiceParticipants((prev) => prev.filter((id) => id !== peerId));
      setVoiceRoster((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    });

    socket.on("voice-speaking", (payload: { peerId: string; speaking: boolean }) => {
      if (!payload?.peerId) return;
      setVoiceRoster((prev) => {
        if (!prev[payload.peerId]) return prev;
        return {
          ...prev,
          [payload.peerId]: {
            ...prev[payload.peerId],
            speaking: payload.speaking,
          },
        };
      });
    });

    return () => {
      socket.off("voice-new-producer");
      socket.off("voice-presence");
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

  type VoiceRequestPayload =
    | {
        action: "join";
        data: {
          channelId: string;
          user: { id?: string; name?: string; email?: string };
        };
      }
    | {
        action: "leave";
        data: { channelId: string };
      }
    | {
        action: "createTransport";
        data: { channelId: string };
      }
    | {
        action: "connectTransport";
        data: {
          channelId: string;
          transportId: string;
          dtlsParameters: Record<string, unknown>;
        };
      }
    | {
        action: "produce";
        data: {
          channelId: string;
          transportId: string;
          kind: "audio";
          rtpParameters: Record<string, unknown>;
        };
      }
    | {
        action: "consume";
        data: {
          channelId: string;
          transportId: string;
          producerId: string;
          rtpCapabilities: Record<string, unknown>;
        };
      }
    | {
        action: "setSpeaking";
        data: {
          channelId: string;
          speaking: boolean;
        };
      };

  async function voiceRequest<T>(payload: VoiceRequestPayload): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) {
        reject(new Error("socket-not-connected"));
        return;
      }
      socket.emit(
        "voice:req",
        payload,
        (response: { ok: boolean; data?: T; error?: string }) => {
          if (response?.ok) {
            resolve(response.data as T);
            return;
          }
          reject(new Error(response?.error || "voice-request-failed"));
        },
      );
    });
  }

  async function ensureLocalAudioStream(): Promise<MediaStream> {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    const audioSettings = readAudioSettings();
    const constraints: MediaStreamConstraints = {
      audio: audioSettings.inputDeviceId
        ? { deviceId: { exact: audioSettings.inputDeviceId } }
        : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = micEnabled;
    });
    localStreamRef.current = stream;
    startLocalSpeakingDetection(stream);
    return stream;
  }

  function startLocalSpeakingDetection(stream: MediaStream) {
    stopLocalSpeakingDetection();
    try {
      const context = new AudioContext();
      speakingContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const speaking = micEnabled && rms > 0.035;
        if (speaking !== lastSpeakingRef.current) {
          lastSpeakingRef.current = speaking;
          setLocalSpeaking(speaking);
          if (voiceChannelIdRef.current) {
            void voiceRequest<{ ok: boolean }>({
              action: "setSpeaking",
              data: { channelId: voiceChannelIdRef.current, speaking },
            }).catch(() => undefined);
          }
        }
        speakingLoopRef.current = requestAnimationFrame(tick);
      };

      speakingLoopRef.current = requestAnimationFrame(tick);
    } catch {
      // ignore on unsupported environments
    }
  }

  function stopLocalSpeakingDetection() {
    if (speakingLoopRef.current) {
      cancelAnimationFrame(speakingLoopRef.current);
      speakingLoopRef.current = null;
    }
    if (speakingContextRef.current) {
      void speakingContextRef.current.close();
      speakingContextRef.current = null;
    }
    lastSpeakingRef.current = false;
    setLocalSpeaking(false);
  }

  async function consumeProducer(channelId: string, producerId: string): Promise<void> {
    if (!deviceRef.current || !recvTransportRef.current) {
      return;
    }
    if (consumedProducerIdsRef.current.has(producerId)) {
      return;
    }

    const consumerInfo = await voiceRequest<{
      id: string;
      producerId: string;
      kind: "audio";
      rtpParameters: Record<string, unknown>;
      peerId: string;
    }>({
      action: "consume",
      data: {
        channelId,
        transportId: recvTransportRef.current.id,
        producerId,
        rtpCapabilities: deviceRef.current.rtpCapabilities,
      },
    });

    const consumer = await recvTransportRef.current.consume({
      id: consumerInfo.id,
      producerId: consumerInfo.producerId,
      kind: consumerInfo.kind,
      rtpParameters: consumerInfo.rtpParameters,
    });

    consumedProducerIdsRef.current.add(producerId);

    const stream = new MediaStream([consumer.track]);
    let audio = remoteAudioRef.current.get(consumerInfo.peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current.set(consumerInfo.peerId, audio);
    }
    audio.srcObject = stream;
    const audioSettings = readAudioSettings();
    if (audioSettings.outputDeviceId && "setSinkId" in audio) {
      void (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> })
        .setSinkId(audioSettings.outputDeviceId)
        .catch(() => undefined);
    }
    void audio.play().catch(() => undefined);
  }

  async function setupMediasoupVoice(channelId: string, stream: MediaStream): Promise<void> {
    const joinResponse = await voiceRequest<{
      channelId: string;
      rtpCapabilities: Record<string, unknown>;
      producers: Array<{ producerId: string; peerId: string }>;
    }>({
      action: "join",
      data: {
        channelId,
        user: {
          id: session?.user?.id,
          name: session?.user?.name || "User",
          email: session?.user?.email || "",
        },
      },
    });

    const device = new Device();
    await device.load({ routerRtpCapabilities: joinResponse.rtpCapabilities });
    deviceRef.current = device;

    const sendParams = await voiceRequest<TransportParams>({
      action: "createTransport",
      data: { channelId },
    });

    const sendTransport = device.createSendTransport(sendParams);
    sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      voiceRequest<{ connected: boolean }>({
        action: "connectTransport",
        data: {
          channelId,
          transportId: sendTransport.id,
          dtlsParameters,
        },
      })
        .then(() => callback())
        .catch((error) => errback(error as Error));
    });
    sendTransport.on("produce", ({ rtpParameters }, callback, errback) => {
      voiceRequest<{ id: string }>({
        action: "produce",
        data: {
          channelId,
          transportId: sendTransport.id,
          kind: "audio",
          rtpParameters,
        },
      })
        .then((data) => callback({ id: data.id }))
        .catch((error) => errback(error as Error));
    });
    sendTransportRef.current = sendTransport;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const producer = await sendTransport.produce({ track: audioTrack });
      producerIdRef.current = producer.id;
    }

    const recvParams = await voiceRequest<TransportParams>({
      action: "createTransport",
      data: { channelId },
    });

    const recvTransport = device.createRecvTransport(recvParams);
    recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      voiceRequest<{ connected: boolean }>({
        action: "connectTransport",
        data: {
          channelId,
          transportId: recvTransport.id,
          dtlsParameters,
        },
      })
        .then(() => callback())
        .catch((error) => errback(error as Error));
    });
    recvTransportRef.current = recvTransport;

    for (const producer of joinResponse.producers) {
      await consumeProducer(channelId, producer.producerId);
    }
    if (pendingProducerIdsRef.current.size) {
      for (const producerId of Array.from(pendingProducerIdsRef.current)) {
        await consumeProducer(channelId, producerId);
      }
      pendingProducerIdsRef.current.clear();
    }
  }

  async function joinVoiceChannel(channelId: string) {
    if (voiceChannelId === channelId) {
      return;
    }
    try {
      setVoiceError(null);
      await leaveVoiceChannel();
      const stream = await ensureLocalAudioStream();
      setVoiceRoster({});
      setVoiceParticipants([]);
      setVoiceChannelId(channelId);
      await setupMediasoupVoice(channelId, stream);
    } catch (error) {
      setVoiceError(humanizeVoiceError(error));
    }
  }

  async function leaveVoiceChannel() {
    if (voiceChannelId) {
      try {
        await voiceRequest<{ ok: boolean }>({
          action: "setSpeaking",
          data: { channelId: voiceChannelId, speaking: false },
        });
        await voiceRequest<{ channelId: string }>({
          action: "leave",
          data: { channelId: voiceChannelId },
        });
      } catch {
        // ignore if socket already disconnected
      }
    }

    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    producerIdRef.current = null;
    consumedProducerIdsRef.current = new Set();
    pendingProducerIdsRef.current = new Set();
    for (const [, audio] of remoteAudioRef.current) {
      audio.pause();
      audio.srcObject = null;
    }
    remoteAudioRef.current.clear();
    setVoiceParticipants([]);
    setVoiceRoster({});
    setVoiceChannelId("");

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    stopLocalSpeakingDetection();
  }

  function toggleMicrophone() {
    const next = !micEnabled;
    setMicEnabled(next);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    if (!next && voiceChannelId) {
      setLocalSpeaking(false);
      lastSpeakingRef.current = false;
      void voiceRequest<{ ok: boolean }>({
        action: "setSpeaking",
        data: { channelId: voiceChannelId, speaking: false },
      }).catch(() => undefined);
    }
  }

  function humanizeVoiceError(error: unknown): string {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return "Micro refuse par le systeme. Autorisez le micro pour votre navigateur (OS + site) puis reessayez.";
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return "Aucun micro detecte sur cet appareil.";
    }
    return "Impossible d'activer le micro pour le vocal.";
  }

  useEffect(() => {
    return () => {
      void leaveVoiceChannel();
      stopLocalSpeakingDetection();
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
                <div className="mt-3 grid gap-2">
                  {voiceChannelId ? (
                    <div
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                        localSpeaking
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-[#d3dae6] bg-white text-slate-700"
                      }`}
                    >
                      <span className="font-semibold">
                        {session.user.name || session.user.email} (vous)
                      </span>
                      <span className="uppercase tracking-wide">
                        {localSpeaking ? "parle" : "silence"}
                      </span>
                    </div>
                  ) : null}
                  {voiceParticipants.map((peerId) => {
                    const peer = voiceRoster[peerId] || {
                      name: `Participant ${peerId.slice(0, 6)}`,
                      email: "",
                      speaking: false,
                    };
                    return (
                      <div
                        key={peerId}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                          peer.speaking
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-[#d3dae6] bg-white text-slate-700"
                        }`}
                      >
                        <span className="font-semibold">
                          {peer.name || peer.email}
                        </span>
                        <span className="uppercase tracking-wide">
                          {peer.speaking ? "parle" : "silence"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {voiceError ? (
                  <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {voiceError}
                  </p>
                ) : null}
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
