import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth, requireMember } from "./_helpers";

function generateCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// Crée un lien d'invitation (expire dans 24h)
export const create = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const { member, authId } = await requireMember(ctx, workspaceId);
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Workspace introuvable");

    // Vérif permissions
    if (
      member.role === "MEMBER" &&
      !workspace.allowMemberInviteCreation
    ) {
      throw new Error("Les membres ne peuvent pas créer d'invitations");
    }

    const code = generateCode();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h

    await ctx.db.insert("invites", {
      workspaceId,
      code,
      createdById: authId,
      expiresAt,
      useCount: 0,
      revoked: false,
    });

    return { code };
  },
});

// Rejoindre un workspace via code d'invitation
export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const authId = await requireAuth(ctx);

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();

    if (!invite) throw new Error("Invitation introuvable");
    if (invite.revoked) throw new Error("Invitation révoquée");
    if (invite.expiresAt && invite.expiresAt < Date.now())
      throw new Error("Invitation expirée");
    if (invite.maxUses && invite.useCount >= invite.maxUses)
      throw new Error("Limite d'utilisations atteinte");

    // Vérifier si déjà membre
    const existing = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("userId", authId),
      )
      .unique();
    if (existing) return invite.workspaceId; // Déjà membre, pas d'erreur

    await ctx.db.insert("members", {
      workspaceId: invite.workspaceId,
      userId: authId,
      role: "MEMBER",
    });

    await ctx.db.patch(invite._id, { useCount: invite.useCount + 1 });

    return invite.workspaceId;
  },
});
