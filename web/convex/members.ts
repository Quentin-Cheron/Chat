import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMember, requireModerator } from "./_helpers";

// Récupère un user Better Auth par son authId (subject du JWT)
async function getUserByAuthId(
  ctx: { db: { query: Function } },
  authId: string,
) {
  return ctx.db
    .query("user")
    .withIndex("userId", (q: any) => q.eq("userId", authId))
    .unique();
}

// Liste les membres d'un workspace avec leurs infos utilisateur
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireMember(ctx, workspaceId);

    const memberships = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const result = await Promise.all(
      memberships.map(async (m) => {
        const user = await getUserByAuthId(ctx, m.userId);
        return {
          _id: m._id,
          userId: m.userId,
          role: m.role,
          name: user?.name ?? "Utilisateur",
          email: user?.email ?? "",
          image: user?.image,
        };
      }),
    );
    return result;
  },
});

// Change le rôle d'un membre
export const updateRole = mutation({
  args: {
    memberId: v.id("members"),
    role: v.union(v.literal("ADMIN"), v.literal("MEMBER")),
  },
  handler: async (ctx, { memberId, role }) => {
    const target = await ctx.db.get(memberId);
    if (!target) throw new Error("Membre introuvable");

    const { member: actor, authId } = await requireModerator(
      ctx,
      target.workspaceId,
    );

    if (target.role === "OWNER")
      throw new Error("Impossible de modifier le rôle du propriétaire");
    if (target.userId === authId)
      throw new Error("Vous ne pouvez pas modifier votre propre rôle");
    if (actor.role === "ADMIN" && target.role === "ADMIN")
      throw new Error("Un admin ne peut pas modifier le rôle d'un autre admin");

    await ctx.db.patch(memberId, { role });
  },
});

// Expulse un membre
export const kick = mutation({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, { memberId }) => {
    const target = await ctx.db.get(memberId);
    if (!target) throw new Error("Membre introuvable");

    const { member: actor, authId } = await requireModerator(
      ctx,
      target.workspaceId,
    );

    if (target.role === "OWNER")
      throw new Error("Impossible d'expulser le propriétaire");
    if (target.userId === authId)
      throw new Error("Vous ne pouvez pas vous expulser vous-même");
    if (actor.role === "ADMIN" && target.role === "ADMIN")
      throw new Error("Un admin ne peut pas expulser un autre admin");

    await ctx.db.delete(memberId);
  },
});
