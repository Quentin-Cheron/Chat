import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireMember } from "./_helpers";

// Liste les messages d'un canal — live query, se met à jour automatiquement
export const list = query({
  args: {
    channelId: v.id("channels"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { channelId, cursor }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return { messages: [], hasMore: false, nextCursor: null };

    await requireMember(ctx, channel.workspaceId);

    const PAGE_SIZE = 50;

    const result = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .order("desc")
      .paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });

    return {
      messages: result.page.reverse(),
      hasMore: !result.isDone,
      nextCursor: result.continueCursor,
    };
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

    const user = await ctx.db.get(authId as any);

    return ctx.db.insert("messages", {
      channelId,
      authorId: authId,
      authorName: user?.name ?? "Utilisateur",
      content: content.trim(),
    });
  },
});

// Envoie un message avec pièces jointes
export const sendWithAttachments = mutation({
  args: {
    channelId: v.id("channels"),
    content: v.string(),
    attachments: v.array(
      v.object({
        storageKey: v.string(),
        url: v.string(),
        name: v.string(),
        size: v.number(),
        mimeType: v.string(),
      }),
    ),
  },
  handler: async (ctx, { channelId, content, attachments }) => {
    if (!content.trim() && attachments.length === 0)
      throw new Error("Message vide");

    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("Canal introuvable");
    if (channel.type === "VOICE")
      throw new Error("Impossible d'envoyer dans un canal vocal");

    const authId = await requireAuth(ctx);
    await requireMember(ctx, channel.workspaceId);

    const user = await ctx.db.get(authId as any);

    return ctx.db.insert("messages", {
      channelId,
      authorId: authId,
      authorName: user?.name ?? "Utilisateur",
      content: content.trim(),
      attachments,
    });
  },
});

// Modifie un message (auteur uniquement)
export const update = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, { messageId, content }) => {
    if (!content.trim()) throw new Error("Message vide");

    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message introuvable");

    const authId = await requireAuth(ctx);
    const channel = await ctx.db.get(msg.channelId);
    if (!channel) throw new Error("Canal introuvable");

    await requireMember(ctx, channel.workspaceId);

    if (msg.authorId !== authId)
      throw new Error("Vous ne pouvez modifier que vos propres messages");

    await ctx.db.patch(messageId, {
      content: content.trim(),
      editedAt: Date.now(),
    });
  },
});

// Supprime un message (auteur ou modérateur)
export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message introuvable");

    const authId = await requireAuth(ctx);
    const channel = await ctx.db.get(msg.channelId);
    if (!channel) throw new Error("Canal introuvable");

    const { member } = await requireMember(ctx, channel.workspaceId);

    const canDelete =
      msg.authorId === authId ||
      member.role === "OWNER" ||
      member.role === "ADMIN";

    if (!canDelete) throw new Error("Permission refusée");

    // Supprimer aussi les réactions liées
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .collect();
    await Promise.all(reactions.map((r) => ctx.db.delete(r._id)));

    await ctx.db.delete(messageId);
  },
});
