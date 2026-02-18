import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tables as authTables } from "./betterAuth/schema";

export default defineSchema({
  ...authTables,

  workspaces: defineTable({
    name: v.string(),
    ownerId: v.string(),
    allowMemberChannelCreation: v.boolean(),
    allowMemberInviteCreation: v.boolean(),
  }),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(v.literal("OWNER"), v.literal("ADMIN"), v.literal("MEMBER")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  channels: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    slug: v.string(),
    type: v.union(v.literal("TEXT"), v.literal("VOICE")),
    position: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_slug", ["workspaceId", "slug"]),

  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.string(),
    authorName: v.string(),
    content: v.string(),
    editedAt: v.optional(v.number()),
    attachments: v.optional(
      v.array(
        v.object({
          storageKey: v.string(),
          url: v.string(),
          name: v.string(),
          size: v.number(),
          mimeType: v.string(),
        }),
      ),
    ),
  }).index("by_channel", ["channelId"]),

  reactions: defineTable({
    messageId: v.id("messages"),
    userId: v.string(),
    emoji: v.string(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"]),

  invites: defineTable({
    workspaceId: v.id("workspaces"),
    code: v.string(),
    createdById: v.string(),
    expiresAt: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    useCount: v.number(),
    revoked: v.boolean(),
  }).index("by_code", ["code"]),
});
