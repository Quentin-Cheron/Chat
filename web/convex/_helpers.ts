import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export async function requireMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<{
  member: {
    _id: Id<"members">;
    workspaceId: Id<"workspaces">;
    userId: string;
    role: string;
  };
  authId: string;
}> {
  const authId = await requireAuth(ctx);
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", authId),
    )
    .unique();
  if (!member) throw new Error("Not a member of this workspace");
  return { member, authId };
}

export async function requireModerator(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<{
  member: {
    _id: Id<"members">;
    workspaceId: Id<"workspaces">;
    userId: string;
    role: string;
  };
  authId: string;
}> {
  const data = await requireMember(ctx, workspaceId);
  if (data.member.role === "MEMBER")
    throw new Error("Insufficient permissions");
  return data;
}

export function canModerate(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}
