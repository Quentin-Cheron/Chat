export type AudioSettings = {
  inputDeviceId: string;
  outputDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

const AUDIO_SETTINGS_KEY = "privatechat_audio_settings_v1";

export function readAudioSettings(): AudioSettings {
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) {
      return {
        inputDeviceId: "",
        outputDeviceId: "",
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
    }
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      inputDeviceId: parsed.inputDeviceId || "",
      outputDeviceId: parsed.outputDeviceId || "",
      echoCancellation: parsed.echoCancellation ?? true,
      noiseSuppression: parsed.noiseSuppression ?? true,
      autoGainControl: parsed.autoGainControl ?? true,
    };
  } catch {
    return {
      inputDeviceId: "",
      outputDeviceId: "",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
  }
}

export function writeAudioSettings(value: AudioSettings): AudioSettings {
  const next = {
    inputDeviceId: value.inputDeviceId || "",
    outputDeviceId: value.outputDeviceId || "",
    echoCancellation: value.echoCancellation ?? true,
    noiseSuppression: value.noiseSuppression ?? true,
    autoGainControl: value.autoGainControl ?? true,
  };
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  return next;
}
