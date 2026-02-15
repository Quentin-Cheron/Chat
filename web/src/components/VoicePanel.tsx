import { Button } from "@/components/ui/button";
import type { AudioSettings } from "@/lib/audio-settings";
import { cn } from "@/lib/utils";
import {
  Activity,
  ChevronDown,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX,
} from "lucide-react";

type Channel = {
  _id: string;
  name: string;
  type: "TEXT" | "VOICE";
};

type VoiceParticipant = { peerId: string; name: string; email: string };
type VoiceRosterEntry = { name: string; email: string; speaking: boolean };

type Props = {
  voiceChannelId: string;
  selectedChannelId: string;
  selectedChannel: Channel | null;
  micLevel: number;
  audioSettings: AudioSettings;
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  voiceParticipants: VoiceParticipant[];
  voiceRoster: Record<string, VoiceRosterEntry>;
  localSpeaking: boolean;
  micEnabled: boolean;
  deafened: boolean;
  loopbackTesting: boolean;
  diagnostics: string[];
  showDiagPanel: boolean;
  voiceError: string;
  voiceJoining: boolean;
  sessionUser: { id: string; name: string; email: string };
  onJoinVoice: (channelId: string) => Promise<void>;
  onLeaveVoice: () => Promise<void>;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onRefreshDevices: (force?: boolean) => Promise<void>;
  onToggleLoopback: () => Promise<void>;
  onSelectInputDevice: (deviceId: string) => void;
  onSelectOutputDevice: (deviceId: string) => void;
  onToggleAudioProcessing: (
    key: "echoCancellation" | "noiseSuppression" | "autoGainControl",
  ) => void;
  onSetShowDiagPanel: (v: boolean) => void;
};

export function VoicePanel({
  voiceChannelId,
  selectedChannelId,
  selectedChannel,
  micLevel,
  audioSettings,
  inputDevices,
  outputDevices,
  voiceParticipants,
  voiceRoster,
  localSpeaking,
  micEnabled,
  deafened,
  loopbackTesting,
  diagnostics,
  showDiagPanel,
  voiceError,
  voiceJoining,
  sessionUser,
  onJoinVoice,
  onLeaveVoice,
  onToggleMic,
  onToggleDeafen,
  onRefreshDevices,
  onToggleLoopback,
  onSelectInputDevice,
  onSelectOutputDevice,
  onToggleAudioProcessing,
  onSetShowDiagPanel,
}: Props) {
  const isConnected = voiceChannelId === selectedChannelId;

  return (
    <div className="flex flex-col gap-2 overflow-y-auto rounded-xl border border-surface-3 bg-surface p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-accent" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Voice
        </span>
        {isConnected && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
            Live
          </span>
        )}
      </div>

      {/* Channel name */}
      {selectedChannel && (
        <p className="truncate text-xs font-medium text-foreground">
          🔊 {selectedChannel.name}
        </p>
      )}

      {/* Error */}
      {voiceError && (
        <p className="rounded border border-red-500/40 bg-red-900/20 px-2 py-1.5 text-xs text-red-400">
          {voiceError}
        </p>
      )}

      {/* Join / Leave */}
      {isConnected ? (
        <div className="flex flex-col gap-1.5">
          {/* Mic level */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Mic</span>
            <div className="flex-1 overflow-hidden rounded-full bg-surface-4">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  localSpeaking ? "bg-green-400" : "bg-accent/50",
                )}
                style={{ width: `${micLevel}%` }}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-surface-3 text-xs transition-colors hover:bg-surface-3",
                micEnabled ? "text-foreground" : "text-red-400",
              )}
              onClick={onToggleMic}
            >
              {micEnabled ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5" />
              )}
              {micEnabled ? "Mute" : "Unmute"}
            </button>
            <button
              type="button"
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-surface-3 text-xs transition-colors hover:bg-surface-3",
                deafened ? "text-red-400" : "text-foreground",
              )}
              onClick={onToggleDeafen}
            >
              {deafened ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {deafened ? "Undeafen" : "Deafen"}
            </button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-500/30 p-0 text-red-400 hover:bg-red-400/10"
              onClick={() => void onLeaveVoice()}
              title="Leave voice"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={voiceJoining || !selectedChannelId}
          onClick={() =>
            selectedChannelId && void onJoinVoice(selectedChannelId)
          }
        >
          <PhoneCall className="h-3.5 w-3.5" />
          {voiceJoining ? "Joining..." : "Join voice"}
        </Button>
      )}

      {/* Participants */}
      {isConnected && voiceParticipants.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Participants ({voiceParticipants.length})
          </p>
          <ul className="space-y-1">
            {voiceParticipants.map((p) => {
              const info = voiceRoster[p.peerId];
              return (
                <li key={p.peerId} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      info?.speaking ? "bg-green-400" : "bg-surface-4",
                    )}
                  />
                  <span className="truncate text-xs text-foreground">
                    {info?.name ?? p.name ?? p.peerId.slice(0, 8)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Local user in voice */}
      {isConnected && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-3 px-2 py-1.5">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              localSpeaking ? "bg-green-400" : "bg-surface-4",
            )}
          />
          <span className="flex-1 truncate text-xs text-foreground">
            {sessionUser.name}
          </span>
          {!micEnabled && <MicOff className="h-3 w-3 text-red-400" />}
          {deafened && <VolumeX className="h-3 w-3 text-red-400" />}
        </div>
      )}

      {/* Audio settings */}
      <div className="border-t border-surface-3 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Audio settings
        </p>

        {/* Input device */}
        <div className="mb-1.5">
          <label className="mb-0.5 block text-[10px] text-muted-foreground">
            Microphone
          </label>
          <div className="flex gap-1">
            <select
              value={audioSettings.inputDeviceId}
              onChange={(e) => onSelectInputDevice(e.target.value)}
              className="h-7 flex-1 rounded border border-surface-4 bg-surface-3 px-1.5 text-xs text-foreground"
            >
              <option value="">Default</option>
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId.slice(0, 20)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-surface-4 text-muted-foreground hover:text-foreground"
              onClick={() => void onRefreshDevices(true)}
              title="Refresh devices"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Output device */}
        {outputDevices.length > 0 && (
          <div className="mb-1.5">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">
              Output
            </label>
            <select
              value={audioSettings.outputDeviceId}
              onChange={(e) => onSelectOutputDevice(e.target.value)}
              className="h-7 w-full rounded border border-surface-4 bg-surface-3 px-1.5 text-xs text-foreground"
            >
              <option value="">Default</option>
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId.slice(0, 20)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Processing options */}
        <div className="space-y-1">
          {(
            [
              { key: "echoCancellation", label: "Echo cancel" },
              { key: "noiseSuppression", label: "Noise suppress" },
              { key: "autoGainControl", label: "Auto gain" },
            ] as const
          ).map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <input
                type="checkbox"
                checked={audioSettings[key]}
                onChange={() => onToggleAudioProcessing(key)}
                className="rounded"
              />
              {label}
            </label>
          ))}
        </div>

        {/* Loopback test */}
        <button
          type="button"
          className={cn(
            "mt-2 flex h-7 w-full items-center justify-center rounded-md border border-surface-3 text-xs transition-colors hover:bg-surface-3",
            loopbackTesting ? "text-accent" : "text-muted-foreground",
          )}
          onClick={() => void onToggleLoopback()}
        >
          {loopbackTesting
            ? "Stop loopback test"
            : "Test microphone (loopback)"}
        </button>
      </div>

      {/* Diagnostics */}
      <div className="border-t border-surface-3 pt-2">
        <button
          type="button"
          className="flex w-full items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => onSetShowDiagPanel(!showDiagPanel)}
        >
          <Activity className="h-3 w-3" />
          Diagnostics
          <ChevronDown
            className={cn(
              "ml-auto h-3 w-3 transition-transform",
              showDiagPanel && "rotate-180",
            )}
          />
        </button>
        {showDiagPanel && (
          <div className="mt-1 max-h-32 overflow-y-auto rounded border border-surface-4 bg-surface-3 p-1.5">
            {diagnostics.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No events.</p>
            ) : (
              diagnostics.map((line, i) => (
                <p
                  key={i}
                  className="font-mono text-[10px] leading-4 text-muted-foreground"
                >
                  {line}
                </p>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
