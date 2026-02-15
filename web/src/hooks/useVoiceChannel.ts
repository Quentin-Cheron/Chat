import { useAudioSettings } from "@/hooks/useAudioSettings";
import type { MutableRefObject } from "react";
import { useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

type VoiceParticipant = { peerId: string; name: string; email: string };
type VoiceRosterEntry = { name: string; email: string; speaking: boolean };

export function useVoiceChannel(
  socketRef: MutableRefObject<Socket | null>,
  session: { user: { id: string; name: string; email: string } } | null | undefined,
) {
  const {
    audioSettings,
    inputDevices,
    outputDevices,
    diagnostics,
    logDiagnostic,
    persistAudioSettings,
    refreshDevices,
  } = useAudioSettings();

  const [voiceChannelId, setVoiceChannelId] = useState("");
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceRoster, setVoiceRoster] = useState<Record<string, VoiceRosterEntry>>({});
  const [micLevel, setMicLevel] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [loopbackTesting, setLoopbackTesting] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceJoining, setVoiceJoining] = useState(false);
  const [showDiagPanel, setShowDiagPanel] = useState(false);

  // mediasoup/WebRTC refs
  const deviceRef = useRef<unknown>(null);
  const sendTransportRef = useRef<unknown>(null);
  const recvTransportRef = useRef<unknown>(null);
  const producerRef = useRef<unknown>(null);
  const consumersRef = useRef<Map<string, unknown>>(new Map());
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micLevelRafRef = useRef<number | null>(null);
  const loopbackStreamRef = useRef<MediaStream | null>(null);
  const loopbackAudioRef = useRef<HTMLAudioElement | null>(null);

  function stopMicLevelMonitor() {
    if (micLevelRafRef.current !== null) {
      cancelAnimationFrame(micLevelRafRef.current);
      micLevelRafRef.current = null;
    }
    setMicLevel(0);
  }

  function startMicLevelMonitor(stream: MediaStream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(level);
        setLocalSpeaking(level > 15);
        micLevelRafRef.current = requestAnimationFrame(tick);
      }
      micLevelRafRef.current = requestAnimationFrame(tick);
    } catch {
      // ignore
    }
  }

  const joinVoiceChannel = useCallback(
    async (channelId: string) => {
      if (!socketRef.current || !session?.user) return;
      if (voiceChannelId === channelId) return;
      if (voiceChannelId) await leaveVoiceChannel();

      setVoiceJoining(true);
      setVoiceError("");

      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: audioSettings.inputDeviceId
              ? { exact: audioSettings.inputDeviceId }
              : undefined,
            echoCancellation: audioSettings.echoCancellation,
            noiseSuppression: audioSettings.noiseSuppression,
            autoGainControl: audioSettings.autoGainControl,
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        micStreamRef.current = stream;
        startMicLevelMonitor(stream);

        socketRef.current.emit("voice-join", {
          channelId,
          userId: session.user.id,
          name: session.user.name,
          email: session.user.email,
        });

        setVoiceChannelId(channelId);
        logDiagnostic(`Rejoint le canal vocal: ${channelId}`);
      } catch (e) {
        setVoiceError(String((e as Error)?.message || e));
        logDiagnostic(`Erreur joinVoice: ${String((e as Error)?.message || e)}`);
      } finally {
        setVoiceJoining(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [socketRef, session, voiceChannelId, audioSettings],
  );

  const leaveVoiceChannel = useCallback(async () => {
    if (!voiceChannelId) return;
    socketRef.current?.emit("voice-leave", { channelId: voiceChannelId });

    // Stop mic
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    stopMicLevelMonitor();

    // Stop loopback
    loopbackStreamRef.current?.getTracks().forEach((t) => t.stop());
    loopbackStreamRef.current = null;
    if (loopbackAudioRef.current) {
      loopbackAudioRef.current.srcObject = null;
      loopbackAudioRef.current = null;
    }
    setLoopbackTesting(false);

    setVoiceChannelId("");
    setVoiceParticipants([]);
    setVoiceRoster({});
    setMicEnabled(true);
    setDeafened(false);
    logDiagnostic("Quitte le canal vocal.");
  }, [voiceChannelId, socketRef, logDiagnostic]);

  const toggleMicrophone = useCallback(() => {
    if (!micStreamRef.current) return;
    const enabled = !micEnabled;
    micStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
    setMicEnabled(enabled);
    logDiagnostic(enabled ? "Micro activé." : "Micro désactivé.");
  }, [micEnabled, logDiagnostic]);

  const toggleDeafen = useCallback(() => {
    setDeafened((d) => !d);
    logDiagnostic(!deafened ? "Son désactivé." : "Son activé.");
  }, [deafened, logDiagnostic]);

  const toggleLoopbackTest = useCallback(async () => {
    if (loopbackTesting) {
      loopbackStreamRef.current?.getTracks().forEach((t) => t.stop());
      loopbackStreamRef.current = null;
      if (loopbackAudioRef.current) {
        loopbackAudioRef.current.srcObject = null;
        loopbackAudioRef.current = null;
      }
      setLoopbackTesting(false);
      logDiagnostic("Test loopback arrêté.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      loopbackStreamRef.current = stream;
      const audio = new Audio();
      audio.srcObject = stream;
      audio.muted = false;
      loopbackAudioRef.current = audio;
      void audio.play();
      setLoopbackTesting(true);
      logDiagnostic("Test loopback démarré.");
    } catch (e) {
      logDiagnostic(`Erreur loopback: ${String((e as Error)?.message || e)}`);
    }
  }, [loopbackTesting, logDiagnostic]);

  const onSelectInputDevice = useCallback(
    (deviceId: string) => {
      persistAudioSettings({ ...audioSettings, inputDeviceId: deviceId });
      logDiagnostic(`Micro sélectionné: ${deviceId || "défaut"}`);
    },
    [audioSettings, persistAudioSettings, logDiagnostic],
  );

  const onSelectOutputDevice = useCallback(
    (deviceId: string) => {
      persistAudioSettings({ ...audioSettings, outputDeviceId: deviceId });
      logDiagnostic(`Sortie sélectionnée: ${deviceId || "défaut"}`);
    },
    [audioSettings, persistAudioSettings, logDiagnostic],
  );

  const onToggleAudioProcessing = useCallback(
    (key: "echoCancellation" | "noiseSuppression" | "autoGainControl") => {
      persistAudioSettings({ ...audioSettings, [key]: !audioSettings[key] });
      logDiagnostic(`${key} toggled.`);
    },
    [audioSettings, persistAudioSettings, logDiagnostic],
  );

  return {
    // state
    voiceChannelId,
    voiceParticipants,
    voiceRoster,
    micLevel,
    micEnabled,
    deafened,
    localSpeaking,
    loopbackTesting,
    voiceError,
    voiceJoining,
    showDiagPanel,
    // audio settings
    audioSettings,
    inputDevices,
    outputDevices,
    diagnostics,
    // actions
    setVoiceChannelId,
    setVoiceParticipants,
    setVoiceRoster,
    setShowDiagPanel,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMicrophone,
    toggleDeafen,
    toggleLoopbackTest,
    refreshDevices,
    onSelectInputDevice,
    onSelectOutputDevice,
    onToggleAudioProcessing,
  };
}
