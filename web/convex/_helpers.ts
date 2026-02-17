import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

// Auth safe
export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  try {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) return null;

    return identity.subject;

  } catch (err) {
    console.error("requireAuth error:", err);
    return null;
  }
}

// Member safe
export async function requireMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  try {
    const authId = await requireAuth(ctx);

    if (!authId) return null;

    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", authId),
      )
      .unique();

    if (!member) return null;

    return { member, authId };

  } catch (err) {
    console.error("requireMember error:", err);
    return null;
  }
}

// Moderator safe
export async function requireModerator(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  try {
    const data = await requireMember(ctx, workspaceId);

    if (!data) return null;

    if (data.member.role === "MEMBER") return null;

    return data;

  } catch (err) {
    console.error("requireModerator error:", err);
    return null;
  }
}

export function canModerate(role: string) {
  return role === "OWNER" || role === "ADMIN";
}
