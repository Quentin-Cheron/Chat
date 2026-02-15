import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMember, requireModerator } from "./_helpers";

// Liste les canaux d'un workspace (live query)
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireMember(ctx, workspaceId);
    return ctx.db
      .query("channels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("asc")
      .collect();
  },
});

// Crée un canal (vérifie les permissions selon les settings)
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    type: v.union(v.literal("TEXT"), v.literal("VOICE")),
  },
  handler: async (ctx, { workspaceId, name, type }) => {
    const { member } = await requireMember(ctx, workspaceId);
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Workspace introuvable");

    // Vérif permissions
    if (
      member.role === "MEMBER" &&
      !workspace.allowMemberChannelCreation
    ) {
      throw new Error("Les membres ne peuvent pas créer de canaux");
    }

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    if (!slug) throw new Error("Nom de canal invalide");

    // Vérif unicité
    const existing = await ctx.db
      .query("channels")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceId", workspaceId).eq("slug", slug),
      )
      .unique();
    if (existing) throw new Error("Un canal avec ce nom existe déjà");

    // Position = nb de canaux existants
    const allChannels = await ctx.db
      .query("channels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    return ctx.db.insert("channels", {
      workspaceId,
      name: name.trim(),
      slug,
      type,
      position: allChannels.length,
    });
  },
});

// Supprime un canal (interdit pour "general", OWNER/ADMIN seulement)
export const remove = mutation({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Canal introuvable");
    if (channel.slug === "general") throw new Error("Impossible de supprimer #general");

    await requireModerator(ctx, channel.workspaceId);

    // Supprimer les messages du canal
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();
    await Promise.all(messages.map((m) => ctx.db.delete(m._id)));

    await ctx.db.delete(channelId);
  },
});
