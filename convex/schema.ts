import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Miroir des users better-auth (sync depuis le JWT)
  users: defineTable({
    // L'id vient du JWT better-auth (subject)
    authId: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
    mustChangePassword: v.optional(v.boolean()),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"]),

  workspaces: defineTable({
    name: v.string(),
    ownerId: v.string(), // authId
    allowMemberChannelCreation: v.boolean(),
    allowMemberInviteCreation: v.boolean(),
  }).index("by_owner", ["ownerId"]),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(), // authId
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
    authorId: v.string(), // authId
    authorName: v.string(),
    content: v.string(),
  }).index("by_channel", ["channelId"]),

  invites: defineTable({
    workspaceId: v.id("workspaces"),
    code: v.string(),
    createdById: v.string(), // authId
    expiresAt: v.optional(v.number()), // ms timestamp
    maxUses: v.optional(v.number()),
    useCount: v.number(),
    revoked: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_workspace", ["workspaceId"]),

  // Resolver cross-instance
  inviteRoutes: defineTable({
    code: v.string(),
    targetUrl: v.string(),
    expiresAt: v.optional(v.number()), // ms timestamp
    resolveCount: v.number(),
    lastResolvedAt: v.optional(v.number()),
  }).index("by_code", ["code"]),
});
