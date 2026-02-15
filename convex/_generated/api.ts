/* eslint-disable */
/**
 * Generated API for your Convex functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

function createNamespace(prefix: string): any {
  return new Proxy({} as any, {
    get(_target, module: string) {
      return new Proxy({} as any, {
        get(_t, fn: string) {
          return `${prefix}${String(module)}:${String(fn)}` as any;
        },
      });
    },
  });
}

export const api: {
  workspaces: {
    list: FunctionReference<"query", "public", Record<string, never>, any>;
    create: FunctionReference<"mutation", "public", any, any>;
    getSettings: FunctionReference<
      "query",
      "public",
      { workspaceId: string },
      any
    >;
    updateSettings: FunctionReference<"mutation", "public", any, any>;
  };
  channels: {
    list: FunctionReference<"query", "public", { workspaceId: string }, any>;
    create: FunctionReference<"mutation", "public", any, any>;
    remove: FunctionReference<"mutation", "public", { channelId: string }, any>;
  };
  messages: {
    list: FunctionReference<"query", "public", { channelId: string }, any>;
    send: FunctionReference<"mutation", "public", any, any>;
  };
  members: {
    list: FunctionReference<"query", "public", { workspaceId: string }, any>;
    updateRole: FunctionReference<"mutation", "public", any, any>;
    kick: FunctionReference<"mutation", "public", any, any>;
  };
  invites: {
    create: FunctionReference<"mutation", "public", any, any>;
    join: FunctionReference<"mutation", "public", { code: string }, any>;
  };
  users: {
    me: FunctionReference<"query", "public", Record<string, never>, any>;
    changePassword: FunctionReference<"mutation", "public", any, any>;
    updateUser: FunctionReference<"mutation", "public", any, any>;
    getPasswordStatus: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      any
    >;
    clearMustChangePassword: FunctionReference<
      "mutation",
      "public",
      Record<string, never>,
      any
    >;
    syncUser: FunctionReference<"mutation", "public", any, any>;
  };
  auth: {
    getCurrentUser: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      any
    >;
  };
} = createNamespace("");

export const internal: {
  resolver: {
    resolve: FunctionReference<"query", "internal", { code: string }, any>;
    register: FunctionReference<"mutation", "internal", any, any>;
    incrementResolveCount: FunctionReference<
      "mutation",
      "internal",
      { code: string },
      any
    >;
    purgeExpired: FunctionReference<
      "mutation",
      "internal",
      Record<string, never>,
      any
    >;
    stats: FunctionReference<"query", "internal", Record<string, never>, any>;
  };
} = createNamespace("internal:");
