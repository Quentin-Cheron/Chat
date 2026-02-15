import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent, createAuth } from "./betterAuth/auth";

// Retourne le profil de l'utilisateur connecté via Better Auth
export const me = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
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
  },
});

// Vérifie si l'utilisateur doit changer son mot de passe
// Better Auth ne gère pas mustChangePassword nativement — retourne toujours false
export const getPasswordStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return { mustChangePassword: false };
    return { mustChangePassword: false };
  },
});

// No-op : mustChangePassword n'est plus stocké dans une table custom
export const clearMustChangePassword = mutation({
  args: {},
  handler: async (_ctx) => {
    // no-op
  },
});
