import { readAudioSettings, writeAudioSettings, type AudioSettings } from "@/lib/audio-settings";
import { useEffect, useState } from "react";

export function useAudioSettings() {
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    readAudioSettings(),
  );
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);

  function logDiagnostic(message: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setDiagnostics((prev) => [line, ...prev].slice(0, 40));
  }

  function persistAudioSettings(next: AudioSettings) {
    const saved = writeAudioSettings(next);
    setAudioSettings(saved);
    return saved;
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
        tmp.getTracks().forEach((t) => t.stop());
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      setInputDevices(inputs);
      setOutputDevices(outputs);
      logDiagnostic(
        `Peripheriques: ${inputs.length} entree(s), ${outputs.length} sortie(s).`,
      );
      if (
        audioSettings.inputDeviceId &&
        !inputs.some((d) => d.deviceId === audioSettings.inputDeviceId)
      ) {
        persistAudioSettings({ ...audioSettings, inputDeviceId: "" });
        logDiagnostic("Micro selectionne indisponible, retour au defaut.");
      }
      if (
        audioSettings.outputDeviceId &&
        !outputs.some((d) => d.deviceId === audioSettings.outputDeviceId)
      ) {
        persistAudioSettings({ ...audioSettings, outputDeviceId: "" });
        logDiagnostic("Sortie selectionnee indisponible, retour au defaut.");
      }
    } catch (e) {
      logDiagnostic(
        `Echec enumerateDevices: ${String((e as Error)?.message || e)}`,
      );
    }
  }

  useEffect(() => {
    void refreshDevices();
    if (!navigator.mediaDevices) return;
    const onDeviceChange = () => {
      logDiagnostic("Changement detecte dans les peripheriques audio.");
      void refreshDevices();
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, []);

  return {
    audioSettings,
    setAudioSettings,
    inputDevices,
    outputDevices,
    diagnostics,
    logDiagnostic,
    persistAudioSettings,
    refreshDevices,
  };
}
