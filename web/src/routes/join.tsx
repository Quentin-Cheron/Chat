import { Input } from "@/components/ui/input";
import { resolveInviteCode } from "@/lib/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Clock3, Server } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type RecentTarget = {
  code: string;
  targetUrl: string;
  at: string;
};

const RECENT_KEY = "privatechat_recent_targets_v1";

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  component: JoinPage,
});

function JoinPage() {
  const search = Route.useSearch();
  const [code, setCode] = useState(search.code || "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentTarget[]>(() =>
    readRecentTargets(),
  );

  const submitLabel = useMemo(
    () => (loading ? "Redirection..." : "Rejoindre"),
    [loading],
  );

  useEffect(() => {
    if (!search.code) return;
    void joinWithCode(search.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.code]);

  async function joinWithCode(codeValue: string) {
    const directInvite = extractInviteFromInput(codeValue);
    if (directInvite) {
      window.location.href = directInvite.redirectTo;
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const resolved = await resolveInviteCode(codeValue.trim());
      const updated = updateRecentTargets({
        code: resolved.code,
        targetUrl: resolved.targetUrl,
        at: new Date().toISOString(),
      });
      setRecent(updated);
      window.location.href = resolved.redirectTo;
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? simplifyResolverError(joinError.message)
          : "Code invalide ou expiré.",
      );
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    await joinWithCode(code);
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Rejoindre un espace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Collez un lien d'invitation direct ou entrez un code.
        </p>
      </div>

      <div className="rounded-2xl border border-surface-3 bg-surface p-6 shadow-xl shadow-black/30">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <label
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              htmlFor="invite-code"
            >
              Lien ou code d'invitation
            </label>
            <Input
              id="invite-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="https://chat.monserveur.com/invite/bM8q3xK9"
              className="border-surface-3 bg-surface-2 text-foreground placeholder:text-muted-foreground/40 focus-accent"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-danger/20 bg-danger-bg/30 px-3 py-2.5 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent-gradient py-2.5 text-sm font-semibold text-white shadow-accent transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitLabel}
            {!loading ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </form>
      </div>

      {recent.length ? (
        <div className="mt-4 rounded-xl border border-surface-3 bg-surface p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Derniers serveurs résolus
          </p>
          <div className="grid gap-2">
            {recent.map((item) => (
              <button
                key={`${item.code}:${item.at}`}
                type="button"
                onClick={() => {
                  setCode(item.code);
                  void joinWithCode(item.code);
                }}
                className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-2 px-3 py-2.5 text-left transition-all hover:border-accent/20 hover:bg-surface-3"
              >
                <div>
                  <p className="flex items-center gap-2 text-sm text-foreground">
                    <Server className="h-3.5 w-3.5 text-accent" />
                    {item.targetUrl}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/60">
                    code: {item.code}
                  </p>
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatRelative(item.at)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-muted-foreground">
        Vous avez déjà un compte ?{" "}
        <Link
          to="/login"
          className="font-semibold text-accent transition-colors hover:text-accent-soft"
        >
          Connexion
        </Link>
      </p>
    </div>
  );
}

function simplifyResolverError(message: string): string {
  if (message.includes("Invite code not found"))
    return "Ce code est introuvable.";
  if (message.includes("Invite code expired")) return "Ce code a expiré.";
  if (message.includes("Rate limit exceeded"))
    return "Trop de tentatives. Réessayez dans une minute.";
  if (message.includes("HTTP 429"))
    return "Trop de tentatives. Réessayez dans une minute.";
  if (message.includes("HTTP 404"))
    return "Resolver indisponible. Utilisez un lien d'invitation direct.";
  return message;
}

function readRecentTargets(): RecentTarget[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentTarget[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 5);
  } catch {
    return [];
  }
}

function updateRecentTargets(target: RecentTarget): RecentTarget[] {
  const current = readRecentTargets();
  const next = [
    target,
    ...current.filter((item) => item.code !== target.code),
  ].slice(0, 5);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

function formatRelative(dateIso: string): string {
  const date = new Date(dateIso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return date.toLocaleDateString();
}

function extractInviteFromInput(
  input: string,
): { code: string; redirectTo: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://"))
    return null;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/invite\/([^/]+)/);
    if (!match?.[1]) return null;
    const inviteCode = decodeURIComponent(match[1]);
    return {
      code: inviteCode,
      redirectTo: `${url.origin}/invite/${encodeURIComponent(inviteCode)}`,
    };
  } catch {
    return null;
  }
}
