export type AudioSettings = {
  inputDeviceId: string;
  outputDeviceId: string;
};

const AUDIO_SETTINGS_KEY = "privatechat_audio_settings_v1";

export function readAudioSettings(): AudioSettings {
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) {
      return { inputDeviceId: "", outputDeviceId: "" };
    }
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      inputDeviceId: parsed.inputDeviceId || "",
      outputDeviceId: parsed.outputDeviceId || "",
    };
  } catch {
    return { inputDeviceId: "", outputDeviceId: "" };
  }
}

export function writeAudioSettings(value: AudioSettings): AudioSettings {
  const next = {
    inputDeviceId: value.inputDeviceId || "",
    outputDeviceId: value.outputDeviceId || "",
  };
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  return next;
}
