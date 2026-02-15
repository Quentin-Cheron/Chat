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
import {
  readAudioSettings,
  writeAudioSettings,
  type AudioSettings,
} from "@/lib/audio-settings";
import { authClient } from "@/lib/auth-client";
import { useAppStore } from "@/store/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AudioLines,
  Crown,
  Hash,
  Headphones,
  Loader2,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PanelLeftClose,
  PhoneCall,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Device } from "mediasoup-client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

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

type TransportParams = {
  id: string;
  iceParameters: Record<string, unknown>;
  iceCandidates: Array<Record<string, unknown>>;
  dtlsParameters: Record<string, unknown>;
};

function AppPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const search = Route.useSearch();
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
  const [deafened, setDeafened] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceRoster, setVoiceRoster] = useState<
    Record<string, { name: string; email: string; speaking: boolean }>
  >({});
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    readAudioSettings(),
  );
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [loopbackTesting, setLoopbackTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [selectedDmUserId, setSelectedDmUserId] = useState("");
  const [voiceJoining, setVoiceJoining] = useState(false);
  const [showDiagPanel, setShowDiagPanel] = useState(false);
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
  const localStreamRef = useRef<MediaStream | null>(null);
  const loopbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<ReturnType<
    Device["createSendTransport"]
  > | null>(null);
  const recvTransportRef = useRef<ReturnType<
    Device["createRecvTransport"]
  > | null>(null);
  const producerRef = useRef<{
    close: () => void;
    replaceTrack: (options: { track: MediaStreamTrack }) => Promise<void>;
  } | null>(null);
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
  function logDiagnostic(message: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setDiagnostics((prev) => [line, ...prev].slice(0, 40));
  }

  function persistAudioSettings(next: AudioSettings) {
    const saved = writeAudioSettings(next);
    setAudioSettings(saved);
    return saved;
  }

  useEffect(() => {
    if (!workspacesQuery.data?.length) {
      setSelectedWorkspaceId("");
      resetChannelSelection();
      return;
    }

    const workspaceFromSearch =
      search.workspace &&
      workspacesQuery.data.some((w) => w.workspace.id === search.workspace)
        ? search.workspace
        : "";

    if (workspaceFromSearch && workspaceFromSearch !== selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaceFromSearch);
      return;
    }

    if (
      !selectedWorkspaceId ||
      !workspacesQuery.data.some((w) => w.workspace.id === selectedWorkspaceId)
    ) {
      setSelectedWorkspaceId(workspacesQuery.data[0].workspace.id);
    }
  }, [
    workspacesQuery.data,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    resetChannelSelection,
    search.workspace,
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
  const textChannels = useMemo(
    () =>
      (channelsQuery.data || []).filter((channel) => channel.type === "TEXT"),
    [channelsQuery.data],
  );
  const voiceChannels = useMemo(
    () =>
      (channelsQuery.data || []).filter((channel) => channel.type === "VOICE"),
    [channelsQuery.data],
  );

  useEffect(() => {
    if (!channelsQuery.data?.length) {
      setSelectedChannelId("");
      return;
    }

    const channelFromSearch =
      search.channel && channelsQuery.data.some((c) => c.id === search.channel)
        ? search.channel
        : "";

    if (channelFromSearch && channelFromSearch !== selectedChannelId) {
      setSelectedDmUserId("");
      setSelectedChannelId(channelFromSearch);
      return;
    }

    if (
      !selectedDmUserId &&
      (!selectedChannelId ||
        !channelsQuery.data.some((c) => c.id === selectedChannelId))
    ) {
      setSelectedChannelId(channelsQuery.data[0].id);
    }
  }, [
    channelsQuery.data,
    selectedDmUserId,
    setSelectedChannelId,
    search.channel,
  ]);

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
    if (!session?.user) return;
    const nextWorkspace = selectedWorkspaceId || undefined;
    const nextChannel = selectedChannelId || undefined;
    const nextVoice = voiceChannelId || undefined;
    if (
      search.workspace === nextWorkspace &&
      search.channel === nextChannel &&
      search.voice === nextVoice
    ) {
      return;
    }
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
    voiceChannelId,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "privatechat_onboarding_dismissed",
        onboardingDismissed ? "1" : "0",
      );
    } catch {
      // ignore storage failures
    }
  }, [onboardingDismissed]);

  useEffect(() => {
    voiceChannelIdRef.current = voiceChannelId;
  }, [voiceChannelId]);

  useEffect(() => {
    if (!session?.user) return;
    if (!search.voice) return;
    if (!socketRef.current) return;
    if (voiceChannelId === search.voice) return;
    if (!channelsQuery.data?.length) return;
    const voiceTarget = channelsQuery.data.find(
      (channel) => channel.id === search.voice && channel.type === "VOICE",
    );
    if (!voiceTarget) return;
    void joinVoiceChannel(voiceTarget.id);
  }, [channelsQuery.data, search.voice, session?.user, voiceChannelId]);

  useEffect(() => {
    void refreshDevices();
    if (!navigator.mediaDevices) return;
    const onDeviceChange = () => {
      logDiagnostic("Changement detecte dans les peripheriques audio.");
      void refreshDevices();
      if (voiceChannelIdRef.current) {
        void replaceOutgoingTrack("device-change").catch((error) => {
          setVoiceError(humanizeVoiceError(error));
        });
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        onDeviceChange,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void applyOutputDeviceToRemoteAudio(audioSettings.outputDeviceId);
    if (loopbackAudioRef.current && "setSinkId" in loopbackAudioRef.current) {
      void (
        loopbackAudioRef.current as HTMLAudioElement & {
          setSinkId(id: string): Promise<void>;
        }
      )
        .setSinkId(audioSettings.outputDeviceId || "")
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSettings.outputDeviceId]);

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = micEnabled && !deafened;
    });
    if (!micEnabled && voiceChannelIdRef.current) {
      void voiceRequest<{ ok: boolean }>({
        action: "setSpeaking",
        data: { channelId: voiceChannelIdRef.current, speaking: false },
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micEnabled, deafened]);

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
  const dmMembers = useMemo(
    () =>
      (membersQuery.data || []).filter(
        (member) => member.userId !== session?.user?.id,
      ),
    [membersQuery.data, session?.user?.id],
  );
  const selectedDmMember = useMemo(
    () =>
      dmMembers.find((member) => member.userId === selectedDmUserId) || null,
    [dmMembers, selectedDmUserId],
  );

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
        setVoiceParticipants(peers);
        setVoiceRoster(roster);
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
          payload.channelId !== voiceChannelIdRef.current
        ) {
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

    socket.on(
      "voice-speaking",
      (payload: { peerId: string; speaking: boolean }) => {
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
      },
    );

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

  const deleteChannelMutation = useMutation({
    mutationFn: (channelId: string) => deleteChannel(channelId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["channels", selectedWorkspaceId],
      });
    },
  });

  const kickMemberMutation = useMutation({
    mutationFn: (memberId: string) => kickMember(selectedWorkspaceId, memberId),
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
      deleteChannelMutation.error ||
      kickMemberMutation.error ||
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

  function buildAudioConstraints(
    settings: AudioSettings,
    mode: "exact" | "ideal" | "default",
  ): MediaTrackConstraints {
    const base: MediaTrackConstraints = {
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      channelCount: 1,
      sampleRate: { ideal: 48000 },
    };
    if (!settings.inputDeviceId || mode === "default") {
      return base;
    }
    if (mode === "exact") {
      return { ...base, deviceId: { exact: settings.inputDeviceId } };
    }
    return { ...base, deviceId: { ideal: settings.inputDeviceId } };
  }

  async function refreshDevices(forcePermission = false) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      logDiagnostic("enumerateDevices non supporte sur ce navigateur.");
      return;
    }
    try {
      if (
        forcePermission &&
        navigator.mediaDevices.getUserMedia &&
        !inputDevices.some((d) => d.label)
      ) {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach((track) => track.stop());
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      setInputDevices(inputs);
      setOutputDevices(outputs);
      logDiagnostic(
        `Peripheriques audio detectes: ${inputs.length} entree(s), ${outputs.length} sortie(s).`,
      );

      if (
        audioSettings.inputDeviceId &&
        !inputs.some((d) => d.deviceId === audioSettings.inputDeviceId)
      ) {
        persistAudioSettings({ ...audioSettings, inputDeviceId: "" });
        logDiagnostic(
          "Micro selectionne indisponible, retour au peripherique par defaut.",
        );
      }
      if (
        audioSettings.outputDeviceId &&
        !outputs.some((d) => d.deviceId === audioSettings.outputDeviceId)
      ) {
        persistAudioSettings({ ...audioSettings, outputDeviceId: "" });
        logDiagnostic(
          "Sortie selectionnee indisponible, retour a la sortie par defaut.",
        );
      }
    } catch (error) {
      logDiagnostic(
        `Echec enumerateDevices: ${String((error as Error)?.message || error)}`,
      );
    }
  }

  async function applyOutputDeviceToRemoteAudio(outputDeviceId: string) {
    for (const [, audio] of remoteAudioRef.current) {
      if (!("setSinkId" in audio)) continue;
      try {
        await (
          audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }
        ).setSinkId(outputDeviceId || "");
      } catch {
        logDiagnostic(
          "Impossible d'appliquer la sortie audio au flux distant.",
        );
      }
    }
  }

  async function acquireMicStream(
    settings: AudioSettings,
  ): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("media-devices-unsupported");
    }
    const attempts: Array<MediaTrackConstraints> = [
      buildAudioConstraints(settings, "exact"),
      buildAudioConstraints(settings, "ideal"),
      buildAudioConstraints(settings, "default"),
    ];
    let lastError: unknown = null;
    for (let i = 0; i < attempts.length; i += 1) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: attempts[i],
        });
        logDiagnostic(`Micro acquis (tentative ${i + 1}/${attempts.length}).`);
        return stream;
      } catch (error) {
        lastError = error;
        logDiagnostic(
          `Echec getUserMedia tentative ${i + 1}: ${
            error instanceof DOMException ? `${error.name}` : String(error)
          }`,
        );
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("audio-capture-failed");
  }

  function attachLocalStream(stream: MediaStream) {
    const previous = localStreamRef.current;
    if (previous && previous !== stream) {
      previous.getTracks().forEach((track) => track.stop());
    }
    stream.getAudioTracks().forEach((track) => {
      track.enabled = micEnabled && !deafened;
    });
    localStreamRef.current = stream;
    startLocalSpeakingDetection(stream);
  }

  async function ensureLocalAudioStream(
    forceReacquire = false,
  ): Promise<MediaStream> {
    if (!forceReacquire && localStreamRef.current) {
      return localStreamRef.current;
    }
    const stream = await acquireMicStream(audioSettings);
    attachLocalStream(stream);
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
        const speaking = micEnabled && !deafened && rms > 0.035;
        setMicLevel(Math.min(100, Math.round(rms * 220)));
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
    setMicLevel(0);
    lastSpeakingRef.current = false;
    setLocalSpeaking(false);
  }

  async function replaceOutgoingTrack(reason: string) {
    if (!voiceChannelIdRef.current || !sendTransportRef.current) return;
    const stream = await ensureLocalAudioStream(true);
    const nextTrack = stream.getAudioTracks()[0];
    if (!nextTrack) {
      throw new Error("no-audio-track");
    }
    if (producerRef.current) {
      await producerRef.current.replaceTrack({ track: nextTrack });
      logDiagnostic(`Piste micro remplacee (${reason}).`);
      return;
    }
    const producer = await sendTransportRef.current.produce({
      track: nextTrack,
    });
    producerRef.current = producer as unknown as {
      close: () => void;
      replaceTrack: (options: { track: MediaStreamTrack }) => Promise<void>;
    };
    producerIdRef.current = producer.id;
    logDiagnostic(`Producer audio recree (${reason}).`);
  }

  async function consumeProducer(
    channelId: string,
    producerId: string,
  ): Promise<void> {
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
    if (audioSettings.outputDeviceId && "setSinkId" in audio) {
      void (
        audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }
      )
        .setSinkId(audioSettings.outputDeviceId)
        .catch(() => undefined);
    }
    audio.muted = deafened;
    void audio.play().catch(() => undefined);
  }

  async function setupMediasoupVoice(
    channelId: string,
    stream: MediaStream,
  ): Promise<void> {
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
      producerRef.current = producer as unknown as {
        close: () => void;
        replaceTrack: (options: { track: MediaStreamTrack }) => Promise<void>;
      };
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
      setVoiceJoining(true);
      setVoiceError(null);
      await leaveVoiceChannel();
      const stream = await ensureLocalAudioStream();
      setVoiceRoster({});
      setVoiceParticipants([]);
      setVoiceChannelId(channelId);
      await setupMediasoupVoice(channelId, stream);
      logDiagnostic(`Canal vocal rejoint: ${channelId}`);
    } catch (error) {
      await leaveVoiceChannel();
      setVoiceError(humanizeVoiceError(error));
      logDiagnostic(
        `Join vocal echoue: ${String((error as Error)?.message || error)}`,
      );
    } finally {
      setVoiceJoining(false);
    }
  }

  async function leaveVoiceChannel() {
    const activeVoiceChannelId = voiceChannelIdRef.current;
    if (activeVoiceChannelId) {
      try {
        await voiceRequest<{ ok: boolean }>({
          action: "setSpeaking",
          data: { channelId: activeVoiceChannelId, speaking: false },
        });
        await voiceRequest<{ channelId: string }>({
          action: "leave",
          data: { channelId: activeVoiceChannelId },
        });
      } catch {
        // ignore if socket already disconnected
      }
    }

    producerRef.current?.close();
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    producerRef.current = null;
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

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (loopbackAudioRef.current) {
      loopbackAudioRef.current.pause();
      loopbackAudioRef.current.srcObject = null;
      loopbackAudioRef.current = null;
    }
    setLoopbackTesting(false);
    stopLocalSpeakingDetection();
    logDiagnostic("Canal vocal quitte et ressources nettoyees.");
  }

  function toggleMicrophone() {
    const next = !micEnabled;
    setMicEnabled(next);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next && !deafened;
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

  function toggleDeafen() {
    const next = !deafened;
    setDeafened(next);
    if (next && micEnabled) {
      setMicEnabled(false);
    }
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next && micEnabled;
    });
    for (const [, audio] of remoteAudioRef.current) {
      audio.muted = next;
    }
    logDiagnostic(
      next
        ? "Mode sourdine globale active."
        : "Mode sourdine globale desactive.",
    );
  }

  async function toggleLoopbackTest() {
    if (loopbackTesting) {
      if (loopbackAudioRef.current) {
        loopbackAudioRef.current.pause();
        loopbackAudioRef.current.srcObject = null;
        loopbackAudioRef.current = null;
      }
      setLoopbackTesting(false);
      return;
    }
    try {
      const stream = await ensureLocalAudioStream();
      const monitor = new Audio();
      monitor.autoplay = true;
      monitor.srcObject = stream;
      monitor.muted = false;
      if (audioSettings.outputDeviceId && "setSinkId" in monitor) {
        await (
          monitor as HTMLAudioElement & { setSinkId(id: string): Promise<void> }
        ).setSinkId(audioSettings.outputDeviceId);
      }
      await monitor.play();
      loopbackAudioRef.current = monitor;
      setLoopbackTesting(true);
      logDiagnostic("Test loopback demarre.");
    } catch (error) {
      setVoiceError(humanizeVoiceError(error));
      logDiagnostic(
        `Test loopback echoue: ${String((error as Error)?.message || error)}`,
      );
    }
  }

  function humanizeVoiceError(error: unknown): string {
    if (
      error instanceof Error &&
      error.message === "media-devices-unsupported"
    ) {
      return "Ce navigateur ne supporte pas la capture micro.";
    }
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") {
        return "Permission micro refusee. Autorisez le micro dans le navigateur et le systeme puis rechargez.";
      }
      if (
        error.name === "NotFoundError" ||
        error.name === "OverconstrainedError"
      ) {
        return "Aucun micro compatible detecte. Verifiez le peripherique selectionne.";
      }
      if (error.name === "NotReadableError" || error.name === "AbortError") {
        return "Le micro est deja utilise par une autre application. Fermez-la puis reessayez.";
      }
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

  async function onSelectInputDevice(deviceId: string) {
    const next = persistAudioSettings({
      ...audioSettings,
      inputDeviceId: deviceId,
    });
    setVoiceError(null);
    if (!voiceChannelIdRef.current) return;
    try {
      await ensureLocalAudioStream(true);
      await replaceOutgoingTrack("input-device-change");
      logDiagnostic(`Micro actif: ${deviceId || "defaut systeme"}`);
    } catch (error) {
      setVoiceError(humanizeVoiceError(error));
      persistAudioSettings({
        ...next,
        inputDeviceId: audioSettings.inputDeviceId,
      });
    }
  }

  function onSelectOutputDevice(deviceId: string) {
    persistAudioSettings({ ...audioSettings, outputDeviceId: deviceId });
    void applyOutputDeviceToRemoteAudio(deviceId);
    logDiagnostic(`Sortie active: ${deviceId || "defaut systeme"}`);
  }

  function onToggleAudioProcessing(
    key: "echoCancellation" | "noiseSuppression" | "autoGainControl",
  ) {
    const next = persistAudioSettings({
      ...audioSettings,
      [key]: !audioSettings[key],
    });
    if (voiceChannelIdRef.current) {
      void ensureLocalAudioStream(true)
        .then(() => replaceOutgoingTrack(`${key}-toggle`))
        .catch((error) => setVoiceError(humanizeVoiceError(error)));
    }
    logDiagnostic(
      `${key} ${next[key] ? "active" : "desactive"}${
        voiceChannelIdRef.current ? " (reinit micro)" : ""
      }.`,
    );
  }

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

  return (
    <div className="h-[calc(100vh-92px)] rounded-2xl border border-surface-3 bg-surface-base p-2 text-foreground shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(124,90,246,0.08)]">
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-surface-3 bg-surface-3 p-2 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-3"
          onClick={() => setShowMobileNav((prev) => !prev)}
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
          onChange={(event) => {
            setSelectedWorkspaceId(event.target.value);
            resetChannelSelection();
            setSelectedDmUserId("");
            setShowMobileNav(false);
          }}
        >
          {(workspacesQuery.data || []).map((item) => (
            <option key={item.workspace.id} value={item.workspace.id}>
              {item.workspace.name}
            </option>
          ))}
        </select>
        {voiceChannelId ? (
          <Badge className="border-accent/30 bg-accent/15 text-[10px] text-accent">
            Live
          </Badge>
        ) : null}
      </div>

      <div className="grid h-full grid-cols-1 overflow-hidden rounded-xl md:grid-cols-[76px_300px_1fr] xl:grid-cols-[76px_300px_1fr_280px]">
        <aside className="hidden flex-col items-center border-r border-surface-3 bg-surface-base p-3 md:flex">
          <button className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-dim text-sm font-black text-white shadow-lg shadow-accent/30 ring-1 ring-accent/40">
            PC
          </button>
          <div className="w-full space-y-2 overflow-y-auto">
            {(workspacesQuery.data || []).map((item) => (
              <button
                key={item.workspace.id}
                onClick={() => {
                  setSelectedWorkspaceId(item.workspace.id);
                  resetChannelSelection();
                  setSelectedDmUserId("");
                }}
                className={`group relative grid h-11 w-11 place-items-center rounded-xl text-xs font-black tracking-wide transition-all duration-150 ${
                  selectedWorkspaceId === item.workspace.id
                    ? "bg-gradient-to-br from-accent to-accent-dim text-white shadow-md shadow-accent/25 ring-1 ring-accent/50"
                    : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-muted-foreground"
                }`}
                title={item.workspace.name}
              >
                <span
                  className={`absolute -left-3 w-1 rounded-r-full bg-accent transition-all duration-150 ${selectedWorkspaceId === item.workspace.id ? "h-8 opacity-100" : "h-4 opacity-0 group-hover:opacity-60"}`}
                />
                {item.workspace.name.slice(0, 2).toUpperCase()}
              </button>
            ))}
          </div>
        </aside>

        <aside
          className={`flex flex-col border-r border-surface-3 bg-surface ${
            showMobileNav
              ? "absolute inset-y-0 left-0 z-20 w-[88%] max-w-[340px] p-3"
              : "hidden p-3 md:flex"
          }`}
        >
          <div className="mb-4 border-b border-surface-3 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Workspace
            </p>
            <h2 className="mt-1 truncate text-sm font-bold text-foreground">
              {selectedWorkspaceMembership?.workspace.name || "Aucun workspace"}
            </h2>
          </div>

          {channelsQuery.isPending && !channelsQuery.data ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-9 animate-pulse rounded-md bg-surface-3"
                />
              ))}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Channels
              </p>
              <div className="space-y-0.5">
                {textChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-all duration-100 ${
                      selectedChannelId === channel.id && !selectedDmUserId
                        ? "bg-accent/20 text-accent-soft ring-1 ring-accent/20"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-muted-foreground"
                    }`}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        setSelectedDmUserId("");
                        setShowMobileNav(false);
                      }}
                    >
                      <Hash
                        className={`h-4 w-4 shrink-0 ${selectedChannelId === channel.id && !selectedDmUserId ? "text-accent" : "opacity-50"}`}
                      />
                      <span className="truncate font-medium">
                        {channel.slug}
                      </span>
                    </button>
                    {canModerateRoles && channel.slug !== "general" ? (
                      <button
                        onClick={() => {
                          if (!confirm(`Supprimer #${channel.slug} ?`)) return;
                          deleteChannelMutation.mutate(channel.id);
                        }}
                        disabled={deleteChannelMutation.isPending}
                        className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-red-900/40 hover:text-red-400 group-hover:flex"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {!textChannels.length ? (
                  <p className="rounded-md border border-dashed border-surface-3 px-2 py-2 text-xs text-muted-foreground">
                    Aucun channel texte.
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Voice
              </p>
              <div className="space-y-0.5">
                {voiceChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-all duration-100 ${
                      selectedChannelId === channel.id && !selectedDmUserId
                        ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-muted-foreground"
                    }`}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        setSelectedDmUserId("");
                        setShowMobileNav(false);
                      }}
                    >
                      <Volume2
                        className={`h-4 w-4 shrink-0 ${selectedChannelId === channel.id && !selectedDmUserId ? "text-emerald-400" : "opacity-50"}`}
                      />
                      <span className="truncate font-medium">
                        {channel.slug}
                      </span>
                      <span className="ml-auto rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500/70">
                        voice
                      </span>
                    </button>
                    {canModerateRoles ? (
                      <button
                        onClick={() => {
                          if (!confirm(`Supprimer #${channel.slug} ?`)) return;
                          deleteChannelMutation.mutate(channel.id);
                        }}
                        disabled={deleteChannelMutation.isPending}
                        className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-red-900/40 hover:text-red-400 group-hover:flex"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                DMs
              </p>
              <div className="space-y-0.5">
                {dmMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => {
                      setSelectedDmUserId(member.userId);
                      setSelectedChannelId("");
                      setShowMobileNav(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-all duration-100 ${
                      selectedDmUserId === member.userId
                        ? "bg-accent/20 text-accent-soft ring-1 ring-accent/20"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-muted-foreground"
                    }`}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-accent">
                      {member.user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate font-medium">
                      {member.user.name}
                    </span>
                  </button>
                ))}
                {!dmMembers.length ? (
                  <p className="rounded-md border border-dashed border-surface-3 px-2 py-2 text-xs text-muted-foreground">
                    Aucun contact direct.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <form
            className="mt-auto border-t border-surface-3 pt-3 flex gap-2"
            onSubmit={onCreateChannel}
          >
            <select
              value={channelType}
              onChange={(event) =>
                setChannelType(event.target.value as "TEXT" | "VOICE")
              }
              className="h-9 rounded-md border border-surface-3 bg-surface-2 px-2 text-xs text-muted-foreground outline-none focus:border-accent/50"
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
              className="h-9 border-surface-3 bg-surface-2 px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent/50"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={
                selectedWorkspaceMembership?.role === "MEMBER" &&
                !workspaceSettingsQuery.data?.allowMemberChannelCreation
              }
              className="h-9 border-surface-3 bg-accent/10 px-2 text-accent hover:bg-accent/20"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </form>
        </aside>

        <main className="flex min-h-0 flex-col bg-surface-2">
          <header className="flex min-h-14 items-center justify-between gap-2 border-b border-surface-3 bg-surface-2/80 px-4 py-2 backdrop-blur-sm">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {selectedWorkspaceMembership?.workspace.name || "Workspace"}
              </p>
              <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                {selectedDmMember ? (
                  <MessageSquare className="h-4 w-4 text-accent" />
                ) : null}
                {!selectedDmMember && selectedChannel?.type === "VOICE" ? (
                  <Volume2 className="h-4 w-4 text-emerald-400" />
                ) : null}
                {!selectedDmMember && selectedChannel?.type !== "VOICE" ? (
                  <Hash className="h-4 w-4 text-accent" />
                ) : null}
                <span className="truncate">
                  {selectedDmMember
                    ? selectedDmMember.user.name
                    : selectedChannel?.slug || "channel"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedChannel?.type === "VOICE" && !selectedDmMember ? (
                <>
                  <button
                    type="button"
                    disabled={voiceJoining}
                    onClick={() =>
                      voiceChannelId === selectedChannel.id
                        ? void leaveVoiceChannel()
                        : void joinVoiceChannel(selectedChannel.id)
                    }
                    className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-all ${
                      voiceChannelId === selectedChannel.id
                        ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/30"
                        : "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25 hover:bg-emerald-500/25"
                    }`}
                  >
                    {voiceJoining ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PhoneCall className="h-3.5 w-3.5" />
                    )}
                    {voiceChannelId === selectedChannel.id ? "Leave" : "Join"}
                  </button>
                  <button
                    type="button"
                    disabled={!voiceChannelId || deafened}
                    onClick={toggleMicrophone}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-xs transition-all ${
                      !micEnabled || deafened
                        ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
                        : "bg-surface-3 text-muted-foreground hover:bg-surface-4"
                    }`}
                  >
                    {micEnabled && !deafened ? (
                      <Mic className="h-3.5 w-3.5" />
                    ) : (
                      <MicOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={!voiceChannelId}
                    onClick={toggleDeafen}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-xs transition-all ${
                      deafened
                        ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
                        : "bg-surface-3 text-muted-foreground hover:bg-surface-4"
                    }`}
                  >
                    {deafened ? (
                      <VolumeX className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-bold tracking-wider text-emerald-400 ring-1 ring-emerald-500/20">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    {voiceParticipants.length + (voiceChannelId ? 1 : 0)}
                  </span>
                </>
              ) : null}
              <span
                className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${
                  selectedWorkspaceMembership?.role === "OWNER"
                    ? "bg-amber-500/10 text-amber-400 ring-amber-500/25"
                    : selectedWorkspaceMembership?.role === "ADMIN"
                      ? "bg-accent/15 text-accent-soft ring-accent/25"
                      : "bg-surface-3 text-muted-foreground ring-surface-4"
                }`}
              >
                {selectedWorkspaceMembership?.role || "MEMBER"}
              </span>
            </div>
          </header>

          <section className="flex-1 space-y-2 overflow-auto p-4">
            {!workspacesQuery.isPending &&
            !workspacesQuery.data?.length &&
            !onboardingDismissed ? (
              <div className="rounded-xl border border-surface-3 bg-gradient-to-br from-surface-3 to-surface p-6">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  Welcome
                </p>
                <h3 className="mt-1 text-2xl font-extrabold text-foreground">
                  Create your first workspace
                </h3>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Start by creating a workspace, then add text and voice
                  channels. You can also join with an invite code.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <form className="flex gap-2" onSubmit={onCreateWorkspace}>
                    <Input
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Workspace name"
                      className="h-11 border-surface-4 bg-surface-3 text-sm"
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

            {selectedDmMember ? (
              <div className="rounded-lg border border-dashed border-surface-3 bg-surface-3 p-6 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">
                  DM preview with {selectedDmMember.user.name}
                </p>
                <p className="mt-2">
                  Direct message channels are shown in navigation and are ready
                  for backend wiring.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Current build keeps compatibility with existing channel-based
                  messaging APIs.
                </p>
              </div>
            ) : selectedChannel?.type === "VOICE" ? (
              <div className="space-y-3 rounded-lg border border-surface-3 bg-surface-3 p-4 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-surface-3 bg-surface-3 text-muted-foreground">
                    <AudioLines className="mr-1 h-3.5 w-3.5" />
                    Mic level
                  </Badge>
                  <div className="h-2 min-w-[160px] flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full transition-all ${micLevel > 18 ? "bg-emerald-500" : "bg-accent"}`}
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {micLevel}%
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Input device
                    <select
                      value={audioSettings.inputDeviceId}
                      onChange={(e) => void onSelectInputDevice(e.target.value)}
                      className="mt-1 h-10 w-full rounded border border-surface-4 bg-surface-3 px-2 text-sm text-muted-foreground outline-none"
                    >
                      <option value="">System default</option>
                      {inputDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Mic ${device.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Output device
                    <select
                      value={audioSettings.outputDeviceId}
                      onChange={(e) => onSelectOutputDevice(e.target.value)}
                      className="mt-1 h-10 w-full rounded border border-surface-4 bg-surface-3 px-2 text-sm text-muted-foreground outline-none"
                    >
                      <option value="">System default</option>
                      {outputDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label ||
                            `Speaker ${device.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-[12px]"
                    onClick={() => void refreshDevices(true)}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Refresh devices
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-[12px]"
                    onClick={() => void toggleLoopbackTest()}
                  >
                    <Headphones className="mr-1 h-3.5 w-3.5" />
                    {loopbackTesting ? "Stop loopback" : "Start loopback"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-[12px]"
                    onClick={() => setShowDiagPanel((prev) => !prev)}
                  >
                    <MonitorUp className="mr-1 h-3.5 w-3.5" />
                    {showDiagPanel ? "Hide diagnostics" : "Show diagnostics"}
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex min-h-11 items-center gap-2 rounded-md border border-surface-3 bg-surface-3 px-3 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={audioSettings.echoCancellation}
                      onChange={() =>
                        onToggleAudioProcessing("echoCancellation")
                      }
                    />
                    Echo cancellation
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border border-surface-3 bg-surface-3 px-3 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={audioSettings.noiseSuppression}
                      onChange={() =>
                        onToggleAudioProcessing("noiseSuppression")
                      }
                    />
                    Noise suppression
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border border-surface-3 bg-surface-3 px-3 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={audioSettings.autoGainControl}
                      onChange={() =>
                        onToggleAudioProcessing("autoGainControl")
                      }
                    />
                    Auto gain control
                  </label>
                </div>

                <div className="grid gap-2">
                  {voiceChannelId ? (
                    <div
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                        localSpeaking
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-surface-3 bg-surface-3 text-muted-foreground"
                      }`}
                    >
                      <span className="font-semibold">
                        {session.user.name || session.user.email} (you)
                      </span>
                      <span className="uppercase tracking-wide">
                        {localSpeaking ? "speaking" : "idle"}
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
                            : "border-surface-3 bg-surface-3 text-muted-foreground"
                        }`}
                      >
                        <span className="font-semibold">
                          {peer.name || peer.email}
                        </span>
                        <span className="uppercase tracking-wide">
                          {peer.speaking ? "speaking" : "idle"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {showDiagPanel ? (
                  <div className="rounded-md border border-surface-3 bg-surface-3 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Media diagnostics
                    </p>
                    <div className="mt-2 max-h-40 overflow-auto space-y-1 text-[11px] text-muted-foreground">
                      {diagnostics.length ? (
                        diagnostics.map((line, index) => (
                          <p key={`${line}-${index}`}>{line}</p>
                        ))
                      ) : (
                        <p>No diagnostics yet.</p>
                      )}
                    </div>
                  </div>
                ) : null}

                {voiceError ? (
                  <p className="mt-1 rounded border border-red-500/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
                    {voiceError}
                  </p>
                ) : null}
              </div>
            ) : messagesQuery.isPending && !messagesQuery.data ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-12 animate-pulse rounded-md bg-surface"
                  />
                ))}
              </div>
            ) : (messagesQuery.data || []).length ? (
              (messagesQuery.data || []).map((msg) => (
                <article
                  key={msg.id}
                  className="group flex gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-3"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-accent-dim/20 text-xs font-bold text-accent-soft ring-1 ring-accent/20">
                    {msg.author.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {msg.author.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {msg.content}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-muted-foreground">
                  <Hash className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Aucun message
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dites bonjour à votre équipe !
                </p>
              </div>
            )}
          </section>

          <form
            onSubmit={onSendMessage}
            className="border-t border-surface-3 p-3"
          >
            <div className="flex items-center gap-2 rounded-xl border border-surface-3 bg-surface px-4 py-2.5 transition-colors focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20">
              <input
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                disabled={
                  selectedChannel?.type === "VOICE" || Boolean(selectedDmMember)
                }
                placeholder={
                  selectedDmMember
                    ? "DM backend hookup pending"
                    : selectedChannel
                      ? `Message #${selectedChannel.slug}`
                      : "Select a channel"
                }
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={
                  !selectedChannelId ||
                  Boolean(selectedDmMember) ||
                  sendMessageMutation.isPending ||
                  selectedChannel?.type === "VOICE"
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-dim text-white shadow-md shadow-accent/25 transition-all hover:shadow-accent/40 disabled:opacity-30"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </main>

        <aside className="hidden overflow-y-auto border-l border-surface-3 bg-surface p-4 xl:block">
          <div className="mb-4 border-b border-surface-3 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Administration
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Gérez votre serveur
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-surface-3 bg-surface-2 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Nouveau workspace
              </p>
              <form className="grid gap-2" onSubmit={onCreateWorkspace}>
                <Input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Nom du workspace"
                  className="h-9 border-surface-3 bg-surface text-xs text-foreground placeholder:text-muted-foreground focus:border-accent/50"
                />
                <button
                  type="submit"
                  className="h-9 w-full rounded-md bg-gradient-to-r from-accent to-accent-dim text-xs font-semibold text-white shadow-md shadow-accent/20 hover:shadow-accent/30"
                >
                  Créer workspace
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-surface-3 bg-surface-2 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Rejoindre
              </p>
              <form className="grid gap-2" onSubmit={onJoinInvite}>
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Code d'invitation"
                  className="h-9 border-surface-3 bg-surface text-xs text-foreground placeholder:text-muted-foreground focus:border-accent/50"
                />
                <button
                  type="submit"
                  className="h-9 w-full rounded-md border border-surface-3 bg-surface-3 text-xs font-semibold text-muted-foreground hover:border-accent/30 hover:text-accent-soft"
                >
                  Rejoindre
                </button>
              </form>
            </div>

            {selectedWorkspaceId ? (
              <button
                onClick={() => createInviteMutation.mutate(selectedWorkspaceId)}
                disabled={
                  selectedWorkspaceMembership?.role === "MEMBER" &&
                  !workspaceSettingsQuery.data?.allowMemberInviteCreation
                }
                className="h-9 w-full rounded-md border border-accent/30 bg-accent/10 text-xs font-semibold text-accent-soft hover:bg-accent/20 disabled:opacity-40"
              >
                Générer lien d'invitation
              </button>
            ) : null}

            {inviteLink ? (
              <div className="rounded-lg border border-surface-3 bg-surface-2 p-3 text-[11px] text-muted-foreground">
                <p className="mb-1 font-semibold text-muted-foreground">
                  Lien direct
                </p>
                <p className="break-all font-mono text-[10px] text-accent">
                  {inviteLink}
                </p>
                {resolverInviteLink ? (
                  <>
                    <p className="mb-1 mt-2 font-semibold text-muted-foreground">
                      Via resolver
                    </p>
                    <p className="break-all font-mono text-[10px] text-accent">
                      {resolverInviteLink}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-surface-3 bg-surface-2 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Infos
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Shield className="h-3 w-3 text-accent" />
                  <span
                    className={`font-semibold ${selectedWorkspaceMembership?.role === "OWNER" ? "text-amber-400" : selectedWorkspaceMembership?.role === "ADMIN" ? "text-accent-soft" : "text-muted-foreground"}`}
                  >
                    {selectedWorkspaceMembership?.role || "-"}
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <Hash className="h-3 w-3 text-accent" />
                  {selectedChannel?.slug || "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-surface-3 bg-surface-2 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Permissions
            </p>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Membres créent des channels</span>
                <input
                  type="checkbox"
                  disabled={
                    !canModerateRoles ||
                    updateWorkspaceSettingsMutation.isPending
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
                  className="accent-accent"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Membres créent des invitations</span>
                <input
                  type="checkbox"
                  disabled={
                    !canModerateRoles ||
                    updateWorkspaceSettingsMutation.isPending
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
                  className="accent-accent"
                />
              </label>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-surface-3 bg-surface-2 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Membres
            </p>
            <div className="mt-2 space-y-1.5">
              {(membersQuery.data || []).map((member) => {
                const isMe = member.userId === session.user.id;
                const canEdit =
                  canModerateRoles && member.role !== "OWNER" && !isMe;
                const canKick =
                  canEdit &&
                  !(
                    selectedWorkspaceMembership?.role === "ADMIN" &&
                    member.role === "ADMIN"
                  );
                return (
                  <div
                    key={member.id}
                    className="rounded-lg border border-surface-3 bg-surface-3 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">
                        {member.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {member.user.name}
                          {isMe ? (
                            <span className="ml-1 text-muted-foreground">
                              (vous)
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {member.user.email}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {member.role === "OWNER" ? (
                          <span className="flex items-center gap-1 rounded-full bg-amber-900/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/40">
                            <Crown className="h-3 w-3" />
                            Owner
                          </span>
                        ) : member.role === "ADMIN" ? (
                          <span className="flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/40">
                            <ShieldCheck className="h-3 w-3" />
                            Admin
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-surface-4">
                            Member
                          </span>
                        )}
                        {canKick ? (
                          <button
                            onClick={() => {
                              if (!confirm(`Expulser ${member.user.name} ?`))
                                return;
                              kickMemberMutation.mutate(member.id);
                            }}
                            disabled={kickMemberMutation.isPending}
                            title="Expulser"
                            className="ml-1 rounded p-1 text-muted-foreground hover:bg-red-900/20 hover:text-red-400"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          onClick={() => {
                            if (member.role === "MEMBER") return;
                            updateMemberRoleMutation.mutate({
                              memberId: member.id,
                              role: "MEMBER",
                            });
                          }}
                          disabled={updateMemberRoleMutation.isPending}
                          className={`flex-1 rounded border py-1 text-[11px] font-medium transition-colors ${
                            member.role === "MEMBER"
                              ? "border-accent bg-accent text-white"
                              : "border-surface-4 bg-surface-3 text-muted-foreground hover:bg-surface-3"
                          }`}
                        >
                          Member
                        </button>
                        <button
                          onClick={() => {
                            if (member.role === "ADMIN") return;
                            updateMemberRoleMutation.mutate({
                              memberId: member.id,
                              role: "ADMIN",
                            });
                          }}
                          disabled={updateMemberRoleMutation.isPending}
                          className={`flex-1 rounded border py-1 text-[11px] font-medium transition-colors ${
                            member.role === "ADMIN"
                              ? "border-accent bg-accent text-white"
                              : "border-surface-4 bg-surface-3 text-muted-foreground hover:bg-surface-3"
                          }`}
                        >
                          Admin
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!membersQuery.data?.length ? (
                <p className="text-[11px] text-muted-foreground">
                  Aucun membre dans ce groupe.
                </p>
              ) : null}
            </div>
          </div>

          {latestError ? (
            <p className="mt-3 rounded border border-red-500/50 bg-red-900/20 p-2 text-xs text-red-400">
              {String((latestError as Error).message || latestError)}
            </p>
          ) : null}
        </aside>
      </div>

      <div className="mt-2 grid gap-2 xl:hidden">
        <form
          className="grid gap-2 rounded-lg border border-surface-3 bg-surface p-3 sm:grid-cols-2"
          onSubmit={onJoinInvite}
        >
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Code invitation"
            className="h-10 border-surface-3 bg-surface-2 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="h-10 rounded-md border border-surface-3 bg-surface-3 text-xs font-semibold text-muted-foreground hover:border-accent/30 hover:text-accent-soft"
          >
            Rejoindre
          </button>
        </form>
        {latestError ? (
          <p className="rounded border border-red-500/50 bg-red-900/20 p-2 text-xs text-red-400">
            {String((latestError as Error).message || latestError)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
