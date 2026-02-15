import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCode(code: string): string {
  const normalized = code.trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(normalized)) {
    throw new Error("Invalid invite code format.");
  }
  return normalized;
}

function normalizeTargetUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Invalid targetUrl.");
  }
  const isHttps = parsed.protocol === "https:";
  const isHttpLocalhost =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (!isHttps && !isHttpLocalhost) {
    throw new Error("targetUrl must use https (or http on localhost).");
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed.toString().replace(/\/$/, "");
}

// ── Public query (resolve) ────────────────────────────────────────────────────

export const resolve = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code);
    const route = await ctx.db
      .query("inviteRoutes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();

    if (!route) throw new Error("Invite code not found.");
    if (route.expiresAt && route.expiresAt < Date.now()) {
      throw new Error("Invite code expired.");
    }

    return {
      code: route.code,
      targetUrl: route.targetUrl,
      redirectTo: `${route.targetUrl}/invite/${route.code}`,
      expiresAt: route.expiresAt ?? null,
    };
  },
});

// ── Internal mutations (appelées depuis http.ts avec vérif token) ─────────────

export const register = internalMutation({
  args: {
    code: v.string(),
    targetUrl: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { code, targetUrl, expiresAt }) => {
    const normalizedCode = normalizeCode(code);
    const normalizedUrl = normalizeTargetUrl(targetUrl);

    const existing = await ctx.db
      .query("inviteRoutes")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        targetUrl: normalizedUrl,
        expiresAt: expiresAt ?? undefined,
      });
      return {
        code: normalizedCode,
        targetUrl: normalizedUrl,
        expiresAt: expiresAt ?? null,
      };
    }

    await ctx.db.insert("inviteRoutes", {
      code: normalizedCode,
      targetUrl: normalizedUrl,
      expiresAt: expiresAt ?? undefined,
      resolveCount: 0,
    });
    return {
      code: normalizedCode,
      targetUrl: normalizedUrl,
      expiresAt: expiresAt ?? null,
    };
  },
});

export const incrementResolveCount = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const route = await ctx.db
      .query("inviteRoutes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!route) return;
    await ctx.db.patch(route._id, {
      resolveCount: route.resolveCount + 1,
      lastResolvedAt: Date.now(),
    });
  },
});

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("inviteRoutes")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();
    for (const route of expired) {
      if (route.expiresAt !== undefined) {
        await ctx.db.delete(route._id);
      }
    }
    return {
      deleted: expired.filter((r) => r.expiresAt !== undefined).length,
      ts: new Date().toISOString(),
    };
  },
});

export const stats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db.query("inviteRoutes").collect();
    const active = all.filter((r) => !r.expiresAt || r.expiresAt > now);
    const expired = all.filter((r) => r.expiresAt && r.expiresAt <= now);
    const top = [...all]
      .sort((a, b) => b.resolveCount - a.resolveCount)
      .slice(0, 10)
      .map((r) => ({
        code: r.code,
        targetUrl: r.targetUrl,
        resolveCount: r.resolveCount,
        lastResolvedAt: r.lastResolvedAt ?? null,
        expiresAt: r.expiresAt ?? null,
      }));
    return {
      totalRoutes: all.length,
      activeRoutes: active.length,
      expiredRoutes: expired.length,
      topCodes: top,
      ts: new Date().toISOString(),
    };
  },
});
