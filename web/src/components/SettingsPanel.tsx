import { Button } from "@/components/ui/button";
import { Copy, Link, Plus, Settings } from "lucide-react";
import type { FormEvent } from "react";

type Channel = {
  _id: string;
  name: string;
  type: "TEXT" | "VOICE";
};

type WorkspaceMembership = {
  workspaceId: string;
  name: string;
  role: string;
} | null;

type WorkspaceSettings = {
  allowMemberChannelCreation: boolean;
  allowMemberInviteCreation: boolean;
} | null | undefined;

type Props = {
  selectedWorkspaceId: string;
  selectedWorkspaceMembership: WorkspaceMembership;
  selectedChannel: Channel | null;
  workspaceSettings: WorkspaceSettings;
  canModerateRoles: boolean;
  workspaceName: string;
  setWorkspaceName: (v: string) => void;
  inviteCode: string;
  setInviteCode: (v: string) => void;
  inviteLink: string;
  setInviteLink: (v: string) => void;
  pendingMutations: Set<string>;
  mutationError: string;
  onCreateWorkspace: (e: FormEvent) => void;
  onGenerateInvite: (e: FormEvent) => void;
  onJoinInvite: (e: FormEvent) => void;
  onUpdateSettings: (settings: {
    allowMemberChannelCreation?: boolean;
    allowMemberInviteCreation?: boolean;
  }) => Promise<void>;
};

export function SettingsPanel({
  selectedWorkspaceId,
  selectedWorkspaceMembership,
  workspaceSettings,
  canModerateRoles,
  workspaceName,
  setWorkspaceName,
  inviteCode,
  setInviteCode,
  inviteLink,
  setInviteLink,
  pendingMutations,
  mutationError,
  onCreateWorkspace,
  onGenerateInvite,
  onJoinInvite,
  onUpdateSettings,
}: Props) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto rounded-xl border border-surface-3 bg-surface p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Settings
        </span>
      </div>

      {/* Error */}
      {mutationError && (
        <p className="rounded border border-red-500/40 bg-red-900/20 px-2 py-1.5 text-xs text-red-400">
          {mutationError}
        </p>
      )}

      {/* Create workspace */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          New Workspace
        </p>
        <form onSubmit={onCreateWorkspace} className="flex gap-1.5">
          <input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Workspace name"
            className="h-8 flex-1 rounded-md border border-surface-4 bg-surface-3 px-2 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            disabled={!workspaceName.trim() || pendingMutations.has("createWorkspace")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      {/* Invite management */}
      {selectedWorkspaceId && (
        <div className="border-t border-surface-3 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Invite
          </p>

          {/* Generate invite */}
          <form onSubmit={onGenerateInvite} className="mb-2">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-8 w-full gap-1.5 text-xs"
              disabled={pendingMutations.has("generateInvite")}
            >
              <Link className="h-3.5 w-3.5" />
              Generate invite link
            </Button>
          </form>

          {inviteLink && (
            <div className="mb-2 flex items-center gap-1 rounded-md border border-surface-4 bg-surface-3 p-1.5">
              <p className="flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {inviteLink}
              </p>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => void navigator.clipboard.writeText(inviteLink).catch(() => {})}
                title="Copy"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Join via code */}
          <form onSubmit={onJoinInvite} className="flex gap-1.5">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code"
              className="h-8 flex-1 rounded-md border border-surface-4 bg-surface-3 px-2 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 shrink-0 px-2 text-xs"
              disabled={!inviteCode.trim() || pendingMutations.has("joinInvite")}
            >
              Join
            </Button>
          </form>
        </div>
      )}

      {/* Workspace settings (admin only) */}
      {canModerateRoles && workspaceSettings && (
        <div className="border-t border-surface-3 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Workspace settings
          </p>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              Members can create channels
              <input
                type="checkbox"
                checked={workspaceSettings.allowMemberChannelCreation}
                onChange={() =>
                  void onUpdateSettings({
                    allowMemberChannelCreation: !workspaceSettings.allowMemberChannelCreation,
                  })
                }
                className="rounded"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              Members can create invites
              <input
                type="checkbox"
                checked={workspaceSettings.allowMemberInviteCreation}
                onChange={() =>
                  void onUpdateSettings({
                    allowMemberInviteCreation: !workspaceSettings.allowMemberInviteCreation,
                  })
                }
                className="rounded"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
