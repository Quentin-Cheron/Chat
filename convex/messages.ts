import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireMember } from "./_helpers";

// Liste les messages d'un canal — live query, se met à jour automatiquement
export const list = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return [];

    await requireMember(ctx, channel.workspaceId);

    return ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .order("asc")
      .take(50);
  },
});

// Envoie un message dans un canal
export const send = mutation({
  args: {
    channelId: v.id("channels"),
    content: v.string(),
  },
  handler: async (ctx, { channelId, content }) => {
    if (!content.trim()) throw new Error("Message vide");

    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Canal introuvable");
    if (channel.type === "VOICE")
      throw new Error("Impossible d'envoyer dans un canal vocal");

    const authId = await requireAuth(ctx);
    await requireMember(ctx, channel.workspaceId);

    // Récupérer le nom de l'auteur depuis la table users
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    return ctx.db.insert("messages", {
      channelId,
      authorId: authId,
      authorName: user?.name ?? "Utilisateur",
      content: content.trim(),
    });
  },
});
