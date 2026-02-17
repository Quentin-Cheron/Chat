import { Input } from "@/components/ui/input";
import { readAudioSettings, writeAudioSettings } from "@/lib/audio-settings";
import { authClient } from "@/lib/auth-client";
import { THEMES, useTheme } from "@/hooks/useTheme";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Bell, Mic, Palette, Shield, User } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type SettingsTab = "account" | "security" | "audio" | "notifications" | "appearance";

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
    if (!raw)
      return {
        muteAll: false,
        messageSounds: true,
        voiceSounds: true,
        desktopAlerts: true,
      };
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
    window.localStorage.setItem(
      NOTIFICATION_SETTINGS_KEY,
      JSON.stringify(value),
    );
  } catch {
    /* ignore */
  }
}

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: "account", label: "Compte", icon: User },
  { id: "security", label: "Sécurité", icon: Shield },
  { id: "audio", label: "Audio", icon: Mic },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Apparence", icon: Palette },
];

function SettingsPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { theme, setTheme } = useTheme();

  const updateUserMut = useMutation(api.users.updateUser);
  const changePasswordMut = useMutation(api.users.changePassword);

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
  const [accountPending, setAccountPending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioSettings, setAudioSettings] = useState(readAudioSettings);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [monitorEnabled, setMonitorEnabled] = useState(true);
  const [voiceThreshold, setVoiceThreshold] = useState(22);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(readNotificationSettings);

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
    if (session?.user) {
      setName(session.user.name || "");
      setEmail(session.user.email || "");
    }
  }, [session?.user]);

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

  const emailChanged = useMemo(
    () =>
      Boolean(session?.user?.email && email && session.user.email !== email),
    [email, session?.user?.email],
  );
  const isVoiceDetected = micLevel >= voiceThreshold;

  async function refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === "audioinput"));
      setOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
    } catch {
      setAudioError("Impossible de lister les périphériques audio.");
    }
  }

  async function requestAudioPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await refreshDevices();
      setAudioError(null);
    } catch {
      setAudioError(
        "Autorisation micro refusée par le système ou le navigateur.",
      );
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
        await (
          monitor as HTMLAudioElement & { setSinkId(id: string): Promise<void> }
        ).setSinkId(sinkId);
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
      setAudioError("Test micro impossible. Vérifiez les permissions système.");
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

  function onAudioSettingsChange(next: {
    inputDeviceId?: string;
    outputDeviceId?: string;
  }) {
    const updated = writeAudioSettings({
      inputDeviceId: next.inputDeviceId ?? audioSettings.inputDeviceId,
      outputDeviceId: next.outputDeviceId ?? audioSettings.outputDeviceId,
      echoCancellation: audioSettings.echoCancellation,
      noiseSuppression: audioSettings.noiseSuppression,
      autoGainControl: audioSettings.autoGainControl,
    });
    setAudioSettings(updated);
  }

  async function onUpdateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);
    if (name.trim().length < 2) {
      setSettingsError("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    if (!email.includes("@")) {
      setSettingsError("Email invalide.");
      return;
    }
    if (emailChanged && !currentPasswordForEmail) {
      setSettingsError(
        "Le mot de passe actuel est requis pour changer l'email.",
      );
      return;
    }
    setAccountPending(true);
    try {
      await updateUserMut({ name: name.trim() });
      if (emailChanged) {
        const { error } = await authClient.changeEmail({
          newEmail: email,
          callbackURL: window.location.origin,
        });
        if (error)
          throw new Error(error.message || "Changement email impossible.");
      }
      setCurrentPasswordForEmail("");
      setSettingsSuccess("Compte mis à jour.");
    } catch (e) {
      setSettingsError(
        e instanceof Error ? e.message : "Mise à jour impossible.",
      );
    } finally {
      setAccountPending(false);
    }
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setSettingsSuccess(null);
    if (!currentPassword || !newPassword) {
      setPasswordError("Remplissez tous les champs.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError(
        "Le nouveau mot de passe doit contenir au moins 10 caractères.",
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmation ne correspond pas.");
      return;
    }
    setPasswordPending(true);
    try {
      await changePasswordMut({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSettingsSuccess("Mot de passe mis à jour.");
    } catch (e) {
      setPasswordError(
        e instanceof Error ? e.message : "Changement impossible.",
      );
    } finally {
      setPasswordPending(false);
    }
  }

  if (sessionPending) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Chargement des paramètres...
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      {/* Sidebar nav */}
      <div className="h-fit rounded-xl border border-border bg-card p-3">
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Paramètres
        </p>
        <div className="grid gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeTab === id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${activeTab === id ? "text-primary" : "text-muted-foreground"}`}
              />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground">
            {activeTab === "account"
              ? "Compte"
              : activeTab === "security"
                ? "Sécurité"
                : activeTab === "audio"
                  ? "Audio"
                  : activeTab === "notifications"
                    ? "Notifications"
                    : "Apparence"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {activeTab === "account" ? "Nom d'utilisateur et adresse email." : null}
            {activeTab === "security" ? "Mot de passe et sécurité d'accès." : null}
            {activeTab === "audio" ? "Entrée/sortie audio et test micro." : null}
            {activeTab === "notifications" ? "Comportement des alertes et sons." : null}
            {activeTab === "appearance" ? "Thème de couleurs de l'interface." : null}
          </p>
        </div>

        {activeTab === "account" ? (
          <form className="grid max-w-md gap-4" onSubmit={onUpdateAccount}>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nom
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-border bg-input text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-border bg-input text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            {emailChanged ? (
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mot de passe actuel
                </label>
                <Input
                  type="password"
                  value={currentPasswordForEmail}
                  onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                  className="border-border bg-input text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            ) : null}
            {settingsError ? (
              <p className="text-xs text-red-400">{settingsError}</p>
            ) : null}
            {settingsSuccess ? (
              <p className="text-xs text-green-500">{settingsSuccess}</p>
            ) : null}
            <button
              type="submit"
              disabled={accountPending}
              className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {accountPending ? "Mise à jour..." : "Enregistrer"}
            </button>
          </form>
        ) : null}

        {activeTab === "security" ? (
          <form className="grid max-w-md gap-4" onSubmit={onChangePassword}>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mot de passe actuel
              </label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="border-border bg-input text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nouveau mot de passe
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border-border bg-input text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Confirmer
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-border bg-input text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            {passwordError ? (
              <p className="text-xs text-red-400">{passwordError}</p>
            ) : null}
            {settingsSuccess ? (
              <p className="text-xs text-green-500">{settingsSuccess}</p>
            ) : null}
            <button
              type="submit"
              disabled={passwordPending}
              className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {passwordPending ? "Mise à jour..." : "Changer le mot de passe"}
            </button>
          </form>
        ) : null}

        {activeTab === "audio" ? (
          <div className="grid max-w-md gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void requestAudioPermission()}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
              >
                Autoriser micro
              </button>
              <button
                type="button"
                onClick={() => void refreshDevices()}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
              >
                Rafraîchir
              </button>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Micro (entrée)
              </label>
              <select
                value={audioSettings.inputDeviceId}
                onChange={(e) =>
                  onAudioSettingsChange({ inputDeviceId: e.target.value })
                }
                className="h-10 rounded-lg border border-border bg-input px-3 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="">Défaut système</option>
                {inputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Micro ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sortie (haut-parleur)
              </label>
              <select
                value={audioSettings.outputDeviceId}
                onChange={(e) =>
                  onAudioSettingsChange({ outputDeviceId: e.target.value })
                }
                className="h-10 rounded-lg border border-border bg-input px-3 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="">Défaut système</option>
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Sortie ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Seuil de détection voix ({voiceThreshold})
              </label>
              <input
                type="range"
                min={5}
                max={80}
                value={voiceThreshold}
                onChange={(e) => setVoiceThreshold(Number(e.target.value))}
                className="accent-primary"
              />
            </div>
            <div className="overflow-hidden rounded-lg bg-input p-1">
              <div
                className={`h-2 rounded-full transition-all duration-75 ${isVoiceDetected ? "bg-green-500" : "bg-primary/50"}`}
                style={{ width: `${micLevel}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {!isTestingMic ? (
                <button
                  type="button"
                  onClick={() => void startMicTest()}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  Tester le micro
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={stopMicTest}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-muted-foreground hover:border-red-500/40 hover:text-red-400"
                  >
                    Arrêter le test
                  </button>
                  <button
                    type="button"
                    onMouseDown={() => setPushToTalkActive(true)}
                    onMouseUp={() => setPushToTalkActive(false)}
                    onMouseLeave={() => setPushToTalkActive(false)}
                    onTouchStart={() => setPushToTalkActive(true)}
                    onTouchEnd={() => setPushToTalkActive(false)}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Maintenir pour s'entendre
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70">
              "Maintenir pour s'entendre" simule un mode push-to-talk de test.
            </p>
            {audioError ? (
              <p className="text-xs text-red-400">{audioError}</p>
            ) : null}
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <div className="grid max-w-md gap-3">
            {(
              [
                { key: "muteAll", label: "Muet global", disabled: false },
                {
                  key: "messageSounds",
                  label: "Sons messages",
                  disabled: notificationSettings.muteAll,
                },
                {
                  key: "voiceSounds",
                  label: "Sons vocal",
                  disabled: notificationSettings.muteAll,
                },
                {
                  key: "desktopAlerts",
                  label: "Notifications desktop",
                  disabled: notificationSettings.muteAll,
                },
              ] as const
            ).map(({ key, label, disabled }) => (
              <label
                key={key}
                className={`flex items-center justify-between rounded-lg border border-border bg-input px-4 py-3 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-muted"} transition-all`}
              >
                <span className="text-sm text-foreground">{label}</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={notificationSettings[key]}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      [key]: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-primary"
                />
              </label>
            ))}
            <p className="text-xs text-muted-foreground/70">
              Préférences stockées localement sur cet appareil.
            </p>
          </div>
        ) : null}

        {activeTab === "appearance" ? (
          <div className="grid max-w-md gap-4">
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map((t) => {
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                      isActive
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-input hover:border-primary/40 hover:bg-muted"
                    }`}
                  >
                    {/* Color preview */}
                    <div
                      className="h-10 w-full rounded-lg"
                      style={{ background: t.bg }}
                    >
                      <div
                        className="h-full w-2/5 rounded-lg opacity-80"
                        style={{ background: t.primary }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                      {t.label}
                    </span>
                    {isActive && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground/70">
              Thème stocké localement sur cet appareil.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
