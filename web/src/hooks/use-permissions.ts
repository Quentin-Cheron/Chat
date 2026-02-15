import { useMemo } from "react";

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export type WorkspaceSettings = {
  allowMemberChannelCreation: boolean;
  allowMemberInviteCreation: boolean;
};

export type Membership = {
  role: MemberRole;
  userId: string;
};

export type TargetMember = {
  role: MemberRole;
  userId: string;
};

// ─── Pure utility functions (no hooks, easily testable) ──────────────────────

export function canModerate(role: MemberRole | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canDeleteChannel(
  role: MemberRole | undefined,
  channelSlug: string,
): boolean {
  if (!canModerate(role)) return false;
  return channelSlug !== "general";
}

export function canCreateChannel(
  role: MemberRole | undefined,
  settings: WorkspaceSettings | undefined,
): boolean {
  if (!role) return false;
  if (role === "OWNER" || role === "ADMIN") return true;
  return settings?.allowMemberChannelCreation ?? true;
}

export function canCreateInvite(
  role: MemberRole | undefined,
  settings: WorkspaceSettings | undefined,
): boolean {
  if (!role) return false;
  if (role === "OWNER" || role === "ADMIN") return true;
  return settings?.allowMemberInviteCreation ?? false;
}

export function canEditMemberRole(
  actorRole: MemberRole | undefined,
  target: TargetMember,
  currentUserId: string | undefined,
): boolean {
  if (!canModerate(actorRole)) return false;
  if (target.role === "OWNER") return false;
  if (target.userId === currentUserId) return false;
  return true;
}

export function canKickMember(
  actorRole: MemberRole | undefined,
  target: TargetMember,
  currentUserId: string | undefined,
): boolean {
  if (!canEditMemberRole(actorRole, target, currentUserId)) return false;
  // Admins cannot kick other admins
  if (actorRole === "ADMIN" && target.role === "ADMIN") return false;
  return true;
}

export function getRoleBadgeClass(role: MemberRole | undefined): string {
  if (role === "OWNER")
    return "bg-amber-500/10 text-amber-400 ring-amber-500/25";
  if (role === "ADMIN")
    return "bg-[#7c5af6]/15 text-[#a78bfa] ring-[#7c5af6]/25";
  return "bg-[#1e2536] text-[#636e82] ring-[#252d3d]";
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePermissions(
  membership: Membership | null | undefined,
  settings: WorkspaceSettings | undefined,
  currentUserId: string | undefined,
) {
  return useMemo(() => {
    const role = membership?.role;

    return {
      role,
      isOwner: role === "OWNER",
      isAdmin: role === "ADMIN",
      isMember: role === "MEMBER",

      can: {
        moderate: canModerate(role),

        deleteChannel: (channelSlug: string) =>
          canDeleteChannel(role, channelSlug),

        createChannel: () => canCreateChannel(role, settings),

        createInvite: () => canCreateInvite(role, settings),

        editMemberRole: (target: TargetMember) =>
          canEditMemberRole(role, target, currentUserId),

        kickMember: (target: TargetMember) =>
          canKickMember(role, target, currentUserId),
      },

      ui: {
        roleBadgeClass: getRoleBadgeClass(role),
      },
    };
  }, [membership, settings, currentUserId]);
}
