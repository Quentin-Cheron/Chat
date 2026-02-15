import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireMember, requireModerator } from "./_helpers";

// Liste tous les workspaces dont l'utilisateur est membre
export const list = query({
  args: {},
  handler: async (ctx) => {
    const authId = await requireAuth(ctx);
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", authId))
      .collect();

    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const workspace = await ctx.db.get(m.workspaceId);
        if (!workspace) return null;
        return {
          workspaceId: m.workspaceId,
          name: workspace.name,
          role: m.role,
          memberId: m._id,
        };
      }),
    );
    return workspaces.filter(Boolean);
  },
});

// Crée un workspace avec les canaux par défaut et ajoute le créateur comme OWNER
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const authId = await requireAuth(ctx);
    if (!name.trim()) throw new Error("Le nom est requis");

    const workspaceId = await ctx.db.insert("workspaces", {
      name: name.trim(),
      ownerId: authId,
      allowMemberChannelCreation: true,
      allowMemberInviteCreation: false,
    });

    // Membre OWNER
    await ctx.db.insert("members", {
      workspaceId,
      userId: authId,
      role: "OWNER",
    });

    // Canaux par défaut
    await ctx.db.insert("channels", {
      workspaceId,
      name: "general",
      slug: "general",
      type: "TEXT",
      position: 0,
    });
    await ctx.db.insert("channels", {
      workspaceId,
      name: "random",
      slug: "random",
      type: "TEXT",
      position: 1,
    });

    return workspaceId;
  },
});

// Paramètres du workspace
export const getSettings = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireMember(ctx, workspaceId);
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Workspace introuvable");
    return {
      allowMemberChannelCreation: workspace.allowMemberChannelCreation,
      allowMemberInviteCreation: workspace.allowMemberInviteCreation,
    };
  },
});

// Met à jour les paramètres (OWNER/ADMIN seulement)
export const updateSettings = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    allowMemberChannelCreation: v.optional(v.boolean()),
    allowMemberInviteCreation: v.optional(v.boolean()),
  },
  handler: async (ctx, { workspaceId, ...settings }) => {
    await requireModerator(ctx, workspaceId);
    const patch: Record<string, boolean> = {};
    if (settings.allowMemberChannelCreation !== undefined)
      patch.allowMemberChannelCreation = settings.allowMemberChannelCreation;
    if (settings.allowMemberInviteCreation !== undefined)
      patch.allowMemberInviteCreation = settings.allowMemberInviteCreation;
    await ctx.db.patch(workspaceId, patch);
  },
});
