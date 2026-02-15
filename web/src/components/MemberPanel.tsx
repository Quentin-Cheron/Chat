import { Badge } from "@/components/ui/badge";
import { Crown, Shield, UserMinus, Users } from "lucide-react";

type Member = {
  _id: string;
  userId: string;
  role: string;
  name: string;
  email: string;
  image?: string | null;
};

type Props = {
  members: Member[];
  sessionUserId: string;
  canModerateRoles: boolean;
  onUpdateMemberRole: (
    memberId: string,
    role: "ADMIN" | "MEMBER",
  ) => Promise<void>;
  onKickMember: (memberId: string) => Promise<void>;
};

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  OWNER: {
    label: "Owner",
    className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  },
  ADMIN: {
    label: "Admin",
    className: "border-accent/30 bg-accent/10 text-accent-soft",
  },
  MEMBER: {
    label: "Member",
    className: "border-surface-4 bg-surface-4 text-muted-foreground",
  },
};

export function MemberPanel({
  members,
  sessionUserId,
  canModerateRoles,
  onUpdateMemberRole,
  onKickMember,
}: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-surface-3 bg-surface">
      <div className="flex items-center gap-2 border-b border-surface-3 px-3 py-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Members
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {members.length}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {members.map((member) => {
          const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.MEMBER;
          const isMe = member.userId === sessionUserId;
          const canModify =
            canModerateRoles && !isMe && member.role !== "OWNER";
          return (
            <li
              key={member._id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-3"
            >
              {/* Avatar */}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-4 text-xs font-bold text-foreground">
                {member.image ? (
                  <img
                    src={member.image}
                    alt={member.name}
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  member.name.charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {member.name}
                  {isMe && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      (vous)
                    </span>
                  )}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {member.email}
                </p>
              </div>

              {/* Role badge */}
              <Badge className={`shrink-0 text-[10px] ${badge.className}`}>
                {member.role === "OWNER" && (
                  <Crown className="mr-1 h-2.5 w-2.5" />
                )}
                {member.role === "ADMIN" && (
                  <Shield className="mr-1 h-2.5 w-2.5" />
                )}
                {badge.label}
              </Badge>

              {/* Moderation actions */}
              {canModify && (
                <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                  {member.role === "MEMBER" && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-accent"
                      onClick={() =>
                        void onUpdateMemberRole(member._id, "ADMIN")
                      }
                      title="Promote to Admin"
                    >
                      <Shield className="h-3 w-3" />
                    </button>
                  )}
                  {member.role === "ADMIN" && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-accent"
                      onClick={() =>
                        void onUpdateMemberRole(member._id, "MEMBER")
                      }
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
