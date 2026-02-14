import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { changePassword, getProfile, updateAccount } from "@/lib/api";
import { readAudioSettings, writeAudioSettings } from "@/lib/audio-settings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type SettingsTab = "account" | "security" | "audio" | "notifications";

type NotificationSettings = {
  muteAll: boolean;
  messageSounds: boolean;
  voiceSounds: boolean;
  desktopAlerts: boolean;
};

const NOTIFICATION_SETTINGS_KEY = "privatechat_notification_settings_v1";

function readNotificationSettings(): NotificationSettings {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) {
      return {
        muteAll: false,
        messageSounds: true,
        voiceSounds: true,
        desktopAlerts: true,
      };
    }
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      muteAll: parsed.muteAll ?? false,
      messageSounds: parsed.messageSounds ?? true,
      voiceSounds: parsed.voiceSounds ?? true,
      desktopAlerts: parsed.desktopAlerts ?? true,
    };
  } catch {
    return {
      muteAll: false,
      messageSounds: true,
      voiceSounds: true,
      desktopAlerts: true,
    };
  }
}

function writeNotificationSettings(value: NotificationSettings) {
  try {
    window.localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

function SettingsPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: Boolean(session?.user),
  });

  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioSettings, setAudioSettings] = useState(readAudioSettings);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [monitorEnabled, setMonitorEnabled] = useState(true);
  const [voiceThreshold, setVoiceThreshold] = useState(22);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(readNotificationSettings);

  const micStreamRef = useRef<MediaStream | null>(null);
  const monitorAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      void navigate({ to: "/login", search: { redirect: "/settings" } });
    }
  }, [navigate, session?.user, sessionPending]);

  useEffect(() => {
    if (profileQuery.data) {
      setName(profileQuery.data.name || "");
      setEmail(profileQuery.data.email || "");
    }
  }, [profileQuery.data]);

  useEffect(() => {
    void refreshDevices();
    return () => {
      stopMicTest();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (monitorAudioRef.current) {
      monitorAudioRef.current.muted = !monitorEnabled || !pushToTalkActive;
    }
  }, [monitorEnabled, pushToTalkActive]);

  useEffect(() => {
    writeNotificationSettings(notificationSettings);
  }, [notificationSettings]);

  const accountMutation = useMutation({
    mutationFn: () =>
      updateAccount({
        name,
        email,
        currentPassword: currentPasswordForEmail || undefined,
      }),
    onSuccess: async () => {
      setSettingsError(null);
      setCurrentPasswordForEmail("");
      setSettingsSuccess("Compte mis a jour.");
      await profileQuery.refetch();
    },
    onError: (error) => {
      setSettingsSuccess(null);
      setSettingsError(error instanceof Error ? error.message : "Mise a jour du compte impossible.");
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setPasswordError(null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSettingsSuccess("Mot de passe mis a jour.");
    },
    onError: (error) => {
      setSettingsSuccess(null);
      setPasswordError(error instanceof Error ? error.message : "Changement de mot de passe impossible.");
    },
  });

  const emailChanged = useMemo(
    () => Boolean(profileQuery.data?.email && email && profileQuery.data.email !== email),
    [email, profileQuery.data?.email],
  );

  const isVoiceDetected = micLevel >= voiceThreshold;

  async function refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === "audioinput"));
      setOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
    } catch {
      setAudioError("Impossible de lister les peripheriques audio.");
    }
  }

  async function requestAudioPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await refreshDevices();
      setAudioError(null);
    } catch {
      setAudioError("Autorisation micro refusee par le systeme ou le navigateur.");
    }
  }

  async function startMicTest() {
    try {
      setAudioError(null);
      stopMicTest();
      const constraints: MediaStreamConstraints = {
        audio: audioSettings.inputDeviceId
          ? { deviceId: { exact: audioSettings.inputDeviceId } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const monitor = new Audio();
      monitor.autoplay = true;
      monitor.muted = true;
      monitor.srcObject = stream;
      const sinkId = audioSettings.outputDeviceId;
      if (sinkId && "setSinkId" in monitor) {
        await (monitor as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(sinkId);
      }
      await monitor.play().catch(() => undefined);
      monitorAudioRef.current = monitor;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
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
        setMicLevel(Math.min(100, Math.round(rms * 220)));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setPushToTalkActive(false);
      setIsTestingMic(true);
    } catch {
      setAudioError("Test micro impossible. Verifiez les permissions systeme.");
    }
  }

  function stopMicTest() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsTestingMic(false);
    setMicLevel(0);
    setPushToTalkActive(false);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (monitorAudioRef.current) {
      monitorAudioRef.current.pause();
      monitorAudioRef.current.srcObject = null;
      monitorAudioRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }

  function onAudioSettingsChange(next: { inputDeviceId?: string; outputDeviceId?: string }) {
    const updated = writeAudioSettings({
      inputDeviceId: next.inputDeviceId ?? audioSettings.inputDeviceId,
      outputDeviceId: next.outputDeviceId ?? audioSettings.outputDeviceId,
    });
    setAudioSettings(updated);
  }

  function onUpdateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);
    if (name.trim().length < 2) {
      setSettingsError("Le nom doit contenir au moins 2 caracteres.");
      return;
    }
    if (!email.includes("@")) {
      setSettingsError("Email invalide.");
      return;
    }
    if (emailChanged && !currentPasswordForEmail) {
      setSettingsError("Le mot de passe actuel est requis pour changer l'email.");
      return;
    }
    accountMutation.mutate();
  }

  function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setSettingsSuccess(null);
    if (!currentPassword || !newPassword) {
      setPasswordError("Remplissez tous les champs.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("Le nouveau mot de passe doit contenir au moins 10 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmation ne correspond pas.");
      return;
    }
    passwordMutation.mutate();
  }

  if (sessionPending || profileQuery.isPending) {
    return <div className="rounded-xl border border-[#2f3136] bg-[#141518] p-6 text-sm text-slate-300">Chargement des parametres...</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <Card className="h-fit border-[#2f3136] bg-[#16181c] text-slate-100 shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Settings</CardTitle>
          <CardDescription className="text-slate-400">Compte, securite, audio, notifications.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <TabButton active={activeTab === "account"} onClick={() => setActiveTab("account")}>Account</TabButton>
          <TabButton active={activeTab === "security"} onClick={() => setActiveTab("security")}>Security</TabButton>
          <TabButton active={activeTab === "audio"} onClick={() => setActiveTab("audio")}>Audio</TabButton>
          <TabButton active={activeTab === "notifications"} onClick={() => setActiveTab("notifications")}>Notifications</TabButton>
        </CardContent>
      </Card>

      <Card className="border-[#2f3136] bg-[#16181c] text-slate-100 shadow-none reveal">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-100">
            {activeTab === "account" ? "Account" : null}
            {activeTab === "security" ? "Security" : null}
            {activeTab === "audio" ? "Audio" : null}
            {activeTab === "notifications" ? "Notifications" : null}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {activeTab === "account" ? "Nom utilisateur et email." : null}
            {activeTab === "security" ? "Mot de passe et securite d'acces." : null}
            {activeTab === "audio" ? "Entree/sortie audio + test micro." : null}
            {activeTab === "notifications" ? "Comportement des alertes et sons." : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {activeTab === "account" ? (
            <form className="grid gap-3" onSubmit={onUpdateAccount}>
              <label className="text-sm text-slate-300">Nom</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100" />
              <label className="text-sm text-slate-300">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100" />
              {emailChanged ? (
                <>
                  <label className="text-sm text-slate-300">Mot de passe actuel (requis si email change)</label>
                  <Input type="password" value={currentPasswordForEmail} onChange={(e) => setCurrentPasswordForEmail(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100" />
                </>
              ) : null}
              {settingsError ? <p className="text-xs text-red-400">{settingsError}</p> : null}
              {settingsSuccess ? <p className="text-xs text-emerald-400">{settingsSuccess}</p> : null}
              <Button type="submit" disabled={accountMutation.isPending} className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]">
                {accountMutation.isPending ? "Mise a jour..." : "Enregistrer compte"}
              </Button>
            </form>
          ) : null}

          {activeTab === "security" ? (
            <form className="grid gap-3" onSubmit={onChangePassword}>
              <label className="text-sm text-slate-300">Mot de passe actuel</label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100" />
              <label className="text-sm text-slate-300">Nouveau mot de passe</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100" />
              <label className="text-sm text-slate-300">Confirmer</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100" />
              {passwordError ? <p className="text-xs text-red-400">{passwordError}</p> : null}
              {settingsSuccess ? <p className="text-xs text-emerald-400">{settingsSuccess}</p> : null}
              <Button type="submit" disabled={passwordMutation.isPending} className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]">
                {passwordMutation.isPending ? "Mise a jour..." : "Changer mot de passe"}
              </Button>
            </form>
          ) : null}

          {activeTab === "audio" ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" className="border-[#3a3c42] bg-[#141518] text-slate-100 hover:bg-[#35373c]" onClick={() => void requestAudioPermission()}>
                  Autoriser micro
                </Button>
                <Button type="button" variant="outline" className="border-[#3a3c42] bg-[#141518] text-slate-100 hover:bg-[#35373c]" onClick={() => void refreshDevices()}>
                  Rafraichir peripheriques
                </Button>
              </div>
              <label className="text-sm text-slate-300">Micro (entree)</label>
              <select
                value={audioSettings.inputDeviceId}
                onChange={(e) => onAudioSettingsChange({ inputDeviceId: e.target.value })}
                className="h-10 rounded border border-[#2f3136] bg-[#101216] px-2 text-sm text-slate-100 outline-none"
              >
                <option value="">Defaut systeme</option>
                {inputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Micro ${device.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>

              <label className="text-sm text-slate-300">Sortie (haut-parleur)</label>
              <select
                value={audioSettings.outputDeviceId}
                onChange={(e) => onAudioSettingsChange({ outputDeviceId: e.target.value })}
                className="h-10 rounded border border-[#2f3136] bg-[#101216] px-2 text-sm text-slate-100 outline-none"
              >
                <option value="">Defaut systeme</option>
                {outputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Sortie ${device.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>

              <label className="text-sm text-slate-300">Seuil de detection voix ({voiceThreshold})</label>
              <input
                type="range"
                min={5}
                max={80}
                value={voiceThreshold}
                onChange={(e) => setVoiceThreshold(Number(e.target.value))}
              />

              <div className="h-2 overflow-hidden rounded bg-[#101216]">
                <div className={`h-full transition-all ${isVoiceDetected ? "bg-emerald-500" : "bg-[#2f4f73]"}`} style={{ width: `${micLevel}%` }} />
              </div>

              <div className="flex flex-wrap gap-2">
                {!isTestingMic ? (
                  <Button type="button" onClick={() => void startMicTest()} className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]">
                    Tester le micro
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={stopMicTest} className="border-[#3a3c42] bg-[#141518] text-slate-100 hover:bg-[#35373c]">
                      Arreter le test
                    </Button>
                    <Button
                      type="button"
                      onMouseDown={() => setPushToTalkActive(true)}
                      onMouseUp={() => setPushToTalkActive(false)}
                      onMouseLeave={() => setPushToTalkActive(false)}
                      onTouchStart={() => setPushToTalkActive(true)}
                      onTouchEnd={() => setPushToTalkActive(false)}
                      variant="outline"
                      className="border-[#3a3c42] bg-[#141518] text-slate-100 hover:bg-[#35373c]"
                    >
                      Maintenir pour s'entendre
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Astuce: "Maintenir pour s'entendre" simule un mode push-to-talk de test comme sur Discord.
              </p>
              {audioError ? <p className="text-xs text-red-400">{audioError}</p> : null}
            </div>
          ) : null}

          {activeTab === "notifications" ? (
            <div className="grid gap-3">
              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                Muet global
                <input
                  type="checkbox"
                  checked={notificationSettings.muteAll}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({ ...prev, muteAll: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                Sons messages
                <input
                  type="checkbox"
                  disabled={notificationSettings.muteAll}
                  checked={notificationSettings.messageSounds}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({ ...prev, messageSounds: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                Sons vocal
                <input
                  type="checkbox"
                  disabled={notificationSettings.muteAll}
                  checked={notificationSettings.voiceSounds}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({ ...prev, voiceSounds: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                Notifications desktop
                <input
                  type="checkbox"
                  disabled={notificationSettings.muteAll}
                  checked={notificationSettings.desktopAlerts}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({ ...prev, desktopAlerts: e.target.checked }))
                  }
                />
              </label>
              <p className="text-xs text-slate-400">
                Preferences stockees localement sur cet appareil (MVP).
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-md border px-3 py-2 text-left text-sm ${
        props.active
          ? "border-[#2f4f73] bg-[#2f4f73] text-white"
          : "border-[#3a3c42] bg-[#141518] text-slate-200 hover:bg-[#35373c]"
      }`}
    >
      {props.children}
    </button>
  );
}
