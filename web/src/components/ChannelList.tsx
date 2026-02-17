import { cn } from "@/lib/utils";
import { ChevronDown, Hash, Mic, Plus, Trash2 } from "lucide-react";
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
  | { allowMemberChannelCreation: boolean; allowMemberInviteCreation: boolean }
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
  const [textCollapsed, setTextCollapsed] = useState(false);
  const [voiceCollapsed, setVoiceCollapsed] = useState(false);

  const role = selectedWorkspaceMembership?.role ?? "";
  const canModerate = role === "OWNER" || role === "ADMIN";
  const canCreateChannel = canModerate || workspaceSettings?.allowMemberChannelCreation;

  const textChannels = channels.filter((c) => c.type === "TEXT");
  const voiceChannels = channels.filter((c) => c.type === "VOICE");

  return (
    <aside
      className={cn(
        "flex w-[220px] shrink-0 flex-col border-r border-border bg-card",
        showMobileNav ? "flex" : "hidden md:flex",
      )}
    >
      {/* Workspace header */}
      <div className="flex h-12 items-center border-b border-border px-3 shadow-sm">
        <h2 className="flex-1 truncate text-sm font-bold text-foreground">
          {selectedWorkspaceMembership?.name ?? "Workspace"}
        </h2>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-2">
        {textChannels.length > 0 && (
          <div className="mb-1">
            <button
              type="button"
              className="mb-0.5 flex w-full items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
              onClick={() => setTextCollapsed((p) => !p)}
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", textCollapsed && "-rotate-90")} />
              Text
              {canCreateChannel && (
                <Plus
                  className="ml-auto h-3.5 w-3.5 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); setChannelType("TEXT"); setShowCreateForm(true); }}
                />
              )}
            </button>
            {!textCollapsed && (
              <ul className="space-y-0.5 px-1">
                {textChannels.map((c) => (
                  <ChannelItem
                    key={c._id}
                    channel={c}
                    isSelected={c._id === selectedChannelId}
                    canModerate={canModerate}
                    onSelect={onSelectChannel}
                    onRemove={onRemoveChannel}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div className="mb-1">
            <button
              type="button"
              className="mb-0.5 flex w-full items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
              onClick={() => setVoiceCollapsed((p) => !p)}
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", voiceCollapsed && "-rotate-90")} />
              Voice
              {canCreateChannel && (
                <Plus
                  className="ml-auto h-3.5 w-3.5 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); setChannelType("VOICE"); setShowCreateForm(true); }}
                />
              )}
            </button>
            {!voiceCollapsed && (
              <ul className="space-y-0.5 px-1">
                {voiceChannels.map((c) => (
                  <ChannelItem
                    key={c._id}
                    channel={c}
                    isSelected={c._id === selectedChannelId}
                    canModerate={canModerate}
                    onSelect={onSelectChannel}
                    onRemove={onRemoveChannel}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {canCreateChannel && selectedWorkspaceMembership && !showCreateForm && (
          <button
            type="button"
            className="mx-1 mt-1 flex w-[calc(100%-8px)] items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add channel
          </button>
        )}

        {showCreateForm && (
          <form
            className="mx-1 mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-input p-2"
            onSubmit={(e) => { onCreateChannel(e); setShowCreateForm(false); }}
          >
            <input
              autoFocus
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="channel-name"
              className="h-7 rounded border border-border bg-muted px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value as "TEXT" | "VOICE")}
              className="h-7 rounded border border-border bg-muted px-2 text-xs text-foreground"
            >
              <option value="TEXT">Text</option>
              <option value="VOICE">Voice</option>
            </select>
            <div className="flex gap-1">
              <button
                type="submit"
                className="h-7 flex-1 rounded bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Create
              </button>
              <button
                type="button"
                className="h-7 rounded px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* User area */}
      <div className="border-t border-border px-2 py-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
            {selectedWorkspaceMembership?.name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {selectedWorkspaceMembership?.name ?? "—"}
            </p>
            <p className="truncate text-[10px] capitalize text-muted-foreground">
              {role.toLowerCase()}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ChannelItem({
  channel,
  isSelected,
  canModerate,
  onSelect,
  onRemove,
}: {
  channel: Channel;
  isSelected: boolean;
  canModerate: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => onSelect(channel._id)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
          isSelected
            ? "bg-secondary font-medium text-secondary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {channel.type === "VOICE" ? (
          <Mic className="h-3.5 w-3.5 shrink-0 opacity-60" />
        ) : (
          <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" />
        )}
        <span className="truncate text-sm">{channel.name}</span>
      </button>
      {canModerate && channel.slug !== "general" && (
        <button
          type="button"
          className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
          onClick={() => void onRemove(channel._id)}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
