import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

// Récupère l'authId (sub du JWT) de l'utilisateur connecté
export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Non authentifié");
  return identity.subject; // = userId better-auth
}

// Vérifie que l'utilisateur est membre d'un workspace et retourne son membership
export async function requireMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  const authId = await requireAuth(ctx);
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", authId),
    )
    .unique();
  if (!member) throw new Error("Vous n'êtes pas membre de ce workspace");
  return { member, authId };
}

// Vérifie que l'utilisateur est OWNER ou ADMIN
export async function requireModerator(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  const { member, authId } = await requireMember(ctx, workspaceId);
  if (member.role === "MEMBER") throw new Error("Permissions insuffisantes");
  return { member, authId };
}

export function canModerate(role: string) {
  return role === "OWNER" || role === "ADMIN";
}
