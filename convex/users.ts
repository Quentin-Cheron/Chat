import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

// Retourne le profil de l'utilisateur connecté (depuis la table users Convex)
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
  },
});

// Change le mot de passe via better-auth
export const changePassword = mutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.changePassword({
      body: {
        currentPassword: args.currentPassword,
        newPassword: args.newPassword,
      },
      headers,
    });
  },
});

// Met à jour le nom d'affichage via better-auth
export const updateUser = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateUser({
      body: { name: args.name, image: args.image },
      headers,
    });
    // Sync dans la table users Convex
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
        .unique();
      if (user) {
        const patch: { name?: string; image?: string } = {};
        if (args.name) patch.name = args.name;
        if (args.image !== undefined) patch.image = args.image;
        await ctx.db.patch(user._id, patch);
      }
    }
  },
});

// Vérifie si l'utilisateur doit changer son mot de passe
export const getPasswordStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { mustChangePassword: false };
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    return { mustChangePassword: user?.mustChangePassword ?? false };
  },
});

// Marque le mot de passe comme changé (plus besoin de changer)
export const clearMustChangePassword = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (user) {
      await ctx.db.patch(user._id, { mustChangePassword: false });
    }
  },
});
