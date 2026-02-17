import { cn } from "@/lib/utils";
import type { AudioSettings } from "@/lib/audio-settings";
import {
  ChevronDown,
  Copy,
  Crown,
  Link,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Settings,
  Shield,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = { _id: string; name: string; type: "TEXT" | "VOICE" };
type Member = { _id: string; userId: string; role: string; name: string; email: string; image?: string | null };
type WorkspaceMembership = { workspaceId: string; name: string; role: string } | null;
type WorkspaceSettings = { allowMemberChannelCreation: boolean; allowMemberInviteCreation: boolean } | null | undefined;
type VoiceParticipant = { peerId: string; name: string; email: string };
type VoiceRosterEntry = { name: string; email: string; speaking: boolean };

type Tab = "members" | "settings" | "voice";

type Props = {
  // common
  selectedWorkspaceId: string;
  selectedWorkspaceMembership: WorkspaceMembership;
  selectedChannel: Channel | null;
  workspaceSettings: WorkspaceSettings;
  canModerateRoles: boolean;
  sessionUser: { id: string; name: string; email: string };
  // members
  members: Member[];
  onUpdateMemberRole: (memberId: string, role: "ADMIN" | "MEMBER") => Promise<void>;
  onKickMember: (memberId: string) => Promise<void>;
  // settings
  inviteCode: string;
  setInviteCode: (v: string) => void;
  inviteLink: string;
  setInviteLink: (v: string) => void;
  pendingMutations: Set<string>;
  mutationError: string;
  onGenerateInvite: (e: FormEvent) => void;
  onJoinInvite: (e: FormEvent) => void;
  onUpdateSettings: (settings: { allowMemberChannelCreation?: boolean; allowMemberInviteCreation?: boolean }) => Promise<void>;
  // voice
  voiceChannelId: string;
  selectedChannelId: string;
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
  onJoinVoice: (channelId: string) => Promise<void>;
  onLeaveVoice: () => Promise<void>;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onRefreshDevices: (force?: boolean) => Promise<void>;
  onToggleLoopback: () => Promise<void>;
  onSelectInputDevice: (deviceId: string) => void;
  onSelectOutputDevice: (deviceId: string) => void;
  onToggleAudioProcessing: (key: "echoCancellation" | "noiseSuppression" | "autoGainControl") => void;
  onSetShowDiagPanel: (v: boolean) => void;
};

// ─── ROLE badge ───────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  OWNER: { label: "Owner", className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  ADMIN: { label: "Admin", className: "text-primary bg-primary/10 border-primary/20" },
  MEMBER: { label: "Member", className: "text-muted-foreground bg-secondary border-border" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RightSidebar(props: Props) {
  const isVoiceChannel = props.selectedChannel?.type === "VOICE";
  const defaultTab: Tab = isVoiceChannel ? "voice" : "members";
  const [tab, setTab] = useState<Tab>(defaultTab);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "members", label: "Members", icon: <Users className="h-3.5 w-3.5" /> },
    { id: "settings", label: "Settings", icon: <Settings className="h-3.5 w-3.5" /> },
    { id: "voice", label: "Voice", icon: <Mic className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-l border-border bg-card">
      {/* Tab bar */}
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "members" && <MembersTab {...props} />}
        {tab === "settings" && <SettingsTab {...props} />}
        {tab === "voice" && <VoiceTab {...props} />}
      </div>
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({ members, sessionUser, canModerateRoles, onUpdateMemberRole, onKickMember }: Props) {
  const online = members; // could split online/offline later

  return (
    <div className="py-2">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Members — {members.length}
      </p>
      <ul className="space-y-0.5 px-2">
        {online.map((member) => {
          const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.MEMBER;
          const isMe = member.userId === sessionUser.id;
          const canModify = canModerateRoles && !isMe && member.role !== "OWNER";

          return (
            <li
              key={member._id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                  {member.image ? (
                    <img src={member.image} alt={member.name} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    member.name.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-xs font-medium text-foreground">
                  {member.name}
                  {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">{member.email}</p>
              </div>

              {/* Role icon */}
              {member.role === "OWNER" && <Crown className="h-3 w-3 shrink-0 text-yellow-400" />}
              {member.role === "ADMIN" && <Shield className="h-3 w-3 shrink-0 text-primary" />}

              {/* Actions on hover */}
              {canModify && (
                <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                  {member.role === "MEMBER" && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-primary"
                      onClick={() => void onUpdateMemberRole(member._id, "ADMIN")}
                      title="Promote to Admin"
                    >
                      <Shield className="h-3 w-3" />
                    </button>
                  )}
                  {member.role === "ADMIN" && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
                      onClick={() => void onUpdateMemberRole(member._id, "MEMBER")}
                      title="Demote to Member"
                    >
                      <UserMinus className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-red-400"
                    onClick={() => void onKickMember(member._id)}
                    title="Kick"
                  >
                    <UserMinus className="h-3 w-3" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({
  selectedWorkspaceId,
  workspaceSettings,
  canModerateRoles,
  inviteCode,
  setInviteCode,
  inviteLink,
  setInviteLink,
  pendingMutations,
  mutationError,
  onGenerateInvite,
  onJoinInvite,
  onUpdateSettings,
}: Props) {
  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Error */}
      {mutationError && (
        <p className="rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {mutationError}
        </p>
      )}



      {/* Invite */}
      {selectedWorkspaceId && (
        <Section title="Invite">
          <form onSubmit={onGenerateInvite} className="mb-2">
            <button
              type="submit"
              disabled={pendingMutations.has("generateInvite")}
              className="flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-border bg-input text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground disabled:opacity-40"
            >
              <Link className="h-3.5 w-3.5" />
              Generate invite link
            </button>
          </form>

          {inviteLink && (
            <div className="mb-2 rounded-lg border border-border bg-input p-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">Link</span>
                <p className="flex-1 truncate font-mono text-[10px] text-muted-foreground">{inviteLink}</p>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => void navigator.clipboard.writeText(inviteLink).catch(() => {})}
                  title="Copy link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">Code</span>
                <p className="flex-1 font-mono text-xs font-bold text-foreground tracking-widest">
                  {inviteLink.split("/invite/")[1]}
                </p>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => void navigator.clipboard.writeText(inviteLink.split("/invite/")[1] ?? "").catch(() => {})}
                  title="Copy code"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={onJoinInvite} className="flex gap-1.5">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code"
              className="h-8 flex-1 rounded-lg border border-border bg-input px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inviteCode.trim() || pendingMutations.has("joinInvite")}
              className="h-8 rounded-lg border border-border bg-input px-3 text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground disabled:opacity-40"
            >
              Join
            </button>
          </form>
        </Section>
      )}

      {/* Workspace settings (admin only) */}
      {canModerateRoles && workspaceSettings && (
        <Section title="Permissions">
          <div className="space-y-2">
            <Toggle
              label="Members can create channels"
              checked={workspaceSettings.allowMemberChannelCreation}
              onChange={() =>
                void onUpdateSettings({ allowMemberChannelCreation: !workspaceSettings.allowMemberChannelCreation })
              }
            />
            <Toggle
              label="Members can create invites"
              checked={workspaceSettings.allowMemberInviteCreation}
              onChange={() =>
                void onUpdateSettings({ allowMemberInviteCreation: !workspaceSettings.allowMemberInviteCreation })
              }
            />
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex cursor-pointer items-center justify-between gap-2 text-xs text-foreground">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-primary bg-primary" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ─── Voice Tab ────────────────────────────────────────────────────────────────

function VoiceTab({
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
}: Props) {
  const isConnected = voiceChannelId === selectedChannelId;
  const isVoiceChannel = selectedChannel?.type === "VOICE";

  if (!isVoiceChannel && !isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Mic className="h-8 w-8 text-secondary" />
        <p className="text-xs text-muted-foreground">Select a voice channel to join.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Current channel */}
      {selectedChannel && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
          <Mic className={cn("h-4 w-4 shrink-0", isConnected ? "text-primary" : "text-muted-foreground")} />
          <span className="flex-1 truncate text-sm font-medium text-foreground">{selectedChannel.name}</span>
          {isConnected && (
            <span className="flex items-center gap-1 text-[10px] text-green-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Live
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {voiceError && (
        <p className="rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {voiceError}
        </p>
      )}

      {/* Join / Controls */}
      {isConnected ? (
        <div className="flex flex-col gap-2">
          {/* Mic level bar */}
          <div className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 overflow-hidden rounded-full bg-secondary h-1.5">
              <div
                className={cn("h-full rounded-full transition-all", localSpeaking ? "bg-green-500" : "bg-primary/50")}
                style={{ width: `${micLevel}%` }}
              />
            </div>
          </div>

          {/* Control buttons */}
          <div className="grid grid-cols-3 gap-1.5">
            <VoiceBtn
              onClick={onToggleMic}
              active={!micEnabled}
              activeClass="text-red-400 border-red-500/30 bg-red-500/10"
              title={micEnabled ? "Mute" : "Unmute"}
              icon={micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            />
            <VoiceBtn
              onClick={onToggleDeafen}
              active={deafened}
              activeClass="text-red-400 border-red-500/30 bg-red-500/10"
              title={deafened ? "Undeafen" : "Deafen"}
              icon={deafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            />
            <VoiceBtn
              onClick={() => void onLeaveVoice()}
              active={false}
              activeClass=""
              title="Leave voice"
              icon={<PhoneOff className="h-4 w-4" />}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            />
          </div>

          {/* Local user */}
          <div className="flex items-center gap-2 rounded-lg bg-muted px-2 py-2">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", localSpeaking ? "bg-green-500" : "bg-secondary")} />
            <span className="flex-1 truncate text-xs font-medium text-foreground">{sessionUser.name}</span>
            {!micEnabled && <MicOff className="h-3 w-3 text-red-400" />}
            {deafened && <VolumeX className="h-3 w-3 text-red-400" />}
          </div>

          {/* Participants */}
          {voiceParticipants.length > 0 && (
            <Section title={`Participants (${voiceParticipants.length})`}>
              <ul className="space-y-1">
                {voiceParticipants.map((p) => {
                  const info = voiceRoster[p.peerId];
                  return (
                    <li key={p.peerId} className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", info?.speaking ? "bg-green-500" : "bg-secondary")} />
                      <span className="truncate text-xs text-foreground">
                        {info?.name ?? p.name ?? p.peerId.slice(0, 8)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={voiceJoining || !selectedChannelId}
          onClick={() => selectedChannelId && void onJoinVoice(selectedChannelId)}
          className="flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
        >
          <PhoneCall className="h-4 w-4" />
          {voiceJoining ? "Joining..." : "Join voice"}
        </button>
      )}

      {/* Audio settings */}
      <Section title="Audio">
        {/* Input */}
        <div className="mb-2">
          <label className="mb-1 block text-[10px] text-muted-foreground">Microphone</label>
          <div className="flex gap-1">
            <select
              value={audioSettings.inputDeviceId}
              onChange={(e) => onSelectInputDevice(e.target.value)}
              className="h-7 flex-1 rounded-lg border border-border bg-input px-2 text-xs text-foreground"
            >
              <option value="">Default</option>
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 20)}</option>
              ))}
            </select>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
              onClick={() => void onRefreshDevices(true)}
              title="Refresh"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Output */}
        {outputDevices.length > 0 && (
          <div className="mb-2">
            <label className="mb-1 block text-[10px] text-muted-foreground">Output</label>
            <select
              value={audioSettings.outputDeviceId}
              onChange={(e) => onSelectOutputDevice(e.target.value)}
              className="h-7 w-full rounded-lg border border-border bg-input px-2 text-xs text-foreground"
            >
              <option value="">Default</option>
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 20)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Processing toggles */}
        <div className="space-y-2">
          {(
            [
              { key: "echoCancellation", label: "Echo cancellation" },
              { key: "noiseSuppression", label: "Noise suppression" },
              { key: "autoGainControl", label: "Auto gain control" },
            ] as const
          ).map(({ key, label }) => (
            <Toggle
              key={key}
              label={label}
              checked={audioSettings[key]}
              onChange={() => onToggleAudioProcessing(key)}
            />
          ))}
        </div>

        {/* Loopback */}
        <button
          type="button"
          onClick={() => void onToggleLoopback()}
          className={cn(
            "mt-2 flex h-7 w-full items-center justify-center rounded-lg border text-xs transition-colors",
            loopbackTesting
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {loopbackTesting ? "Stop mic test" : "Test microphone"}
        </button>
      </Section>

    </div>
  );
}

function VoiceBtn({
  onClick,
  active,
  activeClass,
  title,
  icon,
  className,
}: {
  onClick: () => void;
  active: boolean;
  activeClass: string;
  title: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && activeClass,
        className,
      )}
    >
      {icon}
    </button>
  );
}
