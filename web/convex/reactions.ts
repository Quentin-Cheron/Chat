import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireMember } from "./_helpers";

// Returns reactions grouped by messageId for all messages in a channel
export const listForChannel = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return {};

    await requireMember(ctx, channel.workspaceId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();

    const result: Record<string, Array<{ emoji: string; userId: string }>> = {};

    await Promise.all(
      messages.map(async (msg) => {
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q) => q.eq("messageId", msg._id))
          .collect();
        if (reactions.length > 0) {
          result[msg._id] = reactions.map((r) => ({
            emoji: r.emoji,
            userId: r.userId,
          }));
        }
      }),
    );

    return result;
  },
});

// Toggle a reaction — adds if not present, removes if already reacted with same emoji
export const toggle = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, { messageId, emoji }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message introuvable");

    const channel = await ctx.db.get(msg.channelId);
    if (!channel) throw new Error("Canal introuvable");

    const authId = await requireAuth(ctx);
    await requireMember(ctx, channel.workspaceId);

    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_user_emoji", (q) =>
        q.eq("messageId", messageId).eq("userId", authId).eq("emoji", emoji),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.insert("reactions", { messageId, userId: authId, emoji });
    }
  },
});
