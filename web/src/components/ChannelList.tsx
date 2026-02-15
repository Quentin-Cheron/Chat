import { cn } from "@/lib/utils";
import { Hash, Mic, Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

type Channel = {
  _id: string;
  name: string;
  slug: string;
  type: "TEXT" | "VOICE";
};

type Member = {
  _id: string;
  userId: string;
  role: string;
  name: string;
};

type WorkspaceMembership = {
  workspaceId: string;
  name: string;
  role: string;
} | null;

type WorkspaceSettings =
  | {
      allowMemberChannelCreation: boolean;
      allowMemberInviteCreation: boolean;
    }
  | null
  | undefined;

type Props = {
  channels: Channel[];
  members: Member[];
  selectedChannelId: string;
  selectedWorkspaceMembership: WorkspaceMembership;
  workspaceSettings: WorkspaceSettings;
  channelName: string;
  setChannelName: (v: string) => void;
  channelType: "TEXT" | "VOICE";
  setChannelType: (v: "TEXT" | "VOICE") => void;
  onCreateChannel: (e: FormEvent) => void;
  onRemoveChannel: (channelId: string) => Promise<void>;
  showMobileNav: boolean;
  onSelectChannel: (id: string) => void;
};

export function ChannelList({
  channels,
  members,
  selectedChannelId,
  selectedWorkspaceMembership,
  workspaceSettings,
  channelName,
  setChannelName,
  channelType,
  setChannelType,
  onCreateChannel,
  onRemoveChannel,
  showMobileNav,
  onSelectChannel,
}: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const role = selectedWorkspaceMembership?.role ?? "";
  const canModerate = role === "OWNER" || role === "ADMIN";
  const canCreateChannel =
    canModerate || workspaceSettings?.allowMemberChannelCreation;

  const textChannels = channels.filter((c) => c.type === "TEXT");
  const voiceChannels = channels.filter((c) => c.type === "VOICE");

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-surface-3 bg-surface",
        showMobileNav ? "flex" : "hidden md:flex",
      )}
    >
      {/* Workspace name header */}
      <div className="border-b border-surface-3 px-3 py-3">
        <h2 className="truncate text-sm font-bold text-foreground">
          {selectedWorkspaceMembership?.name ?? "Workspace"}
        </h2>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {role}
        </p>
      </div>

      {/* Channel sections */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Text channels */}
        <ChannelSection
          label="Text"
          icon={<Hash className="h-3 w-3" />}
          channels={textChannels}
          selectedChannelId={selectedChannelId}
          canModerate={canModerate}
          onSelectChannel={onSelectChannel}
          onRemoveChannel={onRemoveChannel}
        />

        {/* Voice channels */}
        <ChannelSection
          label="Voice"
          icon={<Mic className="h-3 w-3" />}
          channels={voiceChannels}
          selectedChannelId={selectedChannelId}
          canModerate={canModerate}
          onSelectChannel={onSelectChannel}
          onRemoveChannel={onRemoveChannel}
        />
      </div>

      {/* Create channel */}
      {canCreateChannel && selectedWorkspaceMembership && (
        <div className="border-t border-surface-3 p-2">
          {showCreateForm ? (
            <form
              onSubmit={(e) => {
                onCreateChannel(e);
                setShowCreateForm(false);
              }}
              className="flex flex-col gap-1.5"
            >
              <input
                autoFocus
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="channel-name"
                className="h-8 rounded-md border border-surface-4 bg-surface-3 px-2 text-xs text-foreground placeholder:text-muted-foreground"
              />
              <select
                value={channelType}
                onChange={(e) =>
                  setChannelType(e.target.value as "TEXT" | "VOICE")
                }
                className="h-8 rounded-md border border-surface-4 bg-surface-3 px-2 text-xs text-foreground"
              >
                <option value="TEXT">Text</option>
                <option value="VOICE">Voice</option>
              </select>
              <div className="flex gap-1">
                <button
                  type="submit"
                  className="h-7 flex-1 rounded-md bg-accent px-2 text-xs font-semibold text-white"
                >
                  Create
                </button>
                <button
                  type="button"
                  className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="flex h-7 w-full items-center justify-start gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-surface-3 hover:text-foreground"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add channel
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function ChannelSection({
  label,
  icon,
  channels,
  selectedChannelId,
  canModerate,
  onSelectChannel,
  onRemoveChannel,
}: {
  label: string;
  icon: React.ReactNode;
  channels: { _id: string; name: string; slug: string }[];
  selectedChannelId: string;
  canModerate: boolean;
  onSelectChannel: (id: string) => void;
  onRemoveChannel: (id: string) => Promise<void>;
}) {
  if (!channels.length) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1 px-1">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <ul className="space-y-0.5">
        {channels.map((c) => (
          <li key={c._id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectChannel(c._id)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
                c._id === selectedChannelId
                  ? "bg-accent/15 font-semibold text-accent"
                  : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
              )}
            >
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {label === "Voice" ? "🔊" : "#"}
              </span>
              <span className="truncate">{c.name}</span>
            </button>
            {canModerate && c.slug !== "general" && (
              <button
                type="button"
                className="hidden shrink-0 rounded p-1 text-muted-foreground hover:text-red-400 group-hover:block"
                onClick={() => void onRemoveChannel(c._id)}
                title="Delete channel"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
