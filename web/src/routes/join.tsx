import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Clock3, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { resolveInviteCode } from '@/lib/api';

type RecentTarget = {
  code: string;
  targetUrl: string;
  at: string;
};

const RECENT_KEY = 'privatechat_recent_targets_v1';

export const Route = createFileRoute('/join')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === 'string' ? search.code : '',
  }),
  component: JoinPage,
});

function JoinPage() {
  const search = Route.useSearch();
  const [code, setCode] = useState(search.code || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentTarget[]>(() => readRecentTargets());

  const submitLabel = useMemo(() => (loading ? 'Redirection...' : 'Rejoindre'), [loading]);

  useEffect(() => {
    if (!search.code) {
      return;
    }
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
      const updated = updateRecentTargets({ code: resolved.code, targetUrl: resolved.targetUrl, at: new Date().toISOString() });
      setRecent(updated);
      window.location.href = resolved.redirectTo;
    } catch (joinError) {
      setError(joinError instanceof Error ? simplifyResolverError(joinError.message) : 'Code invalide ou expire.');
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    await joinWithCode(code);
  }

  return (
    <Card className="mx-auto w-full max-w-xl border-[#2f3136] bg-[#16181c] text-slate-100 shadow-none reveal">
      <CardHeader>
        <CardTitle className="text-3xl text-slate-100">Rejoindre un espace</CardTitle>
        <CardDescription className="text-slate-400">
          Collez un lien d'invitation direct. Le code resolver reste supporte en fallback.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-200" htmlFor="invite-code">Lien ou code invitation</label>
            <Input
              id="invite-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: https://chat.client.com/invite/bM8q3xK9"
              className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500"
            />
          </div>

          {error ? <p className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</p> : null}
          <Button type="submit" disabled={loading} className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]">
            {submitLabel}
          </Button>
        </form>

        {recent.length ? (
          <div className="rounded-lg border border-[#2f3136] bg-[#101216] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Derniers serveurs resolus</p>
            <div className="grid gap-2">
              {recent.map((item) => (
                <button
                  key={`${item.code}:${item.at}`}
                  type="button"
                  onClick={() => {
                    setCode(item.code);
                    void joinWithCode(item.code);
                  }}
                  className="flex items-center justify-between rounded-md border border-[#2f3136] bg-[#141518] px-3 py-2 text-left hover:bg-[#1b1e23]"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm text-slate-200">
                      <Server className="h-4 w-4 text-slate-500" />
                      {item.targetUrl}
                    </p>
                    <p className="text-xs text-slate-500">code: {item.code}</p>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatRelative(item.at)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-sm text-slate-400">
          Vous avez deja un compte ? <Link to="/login" className="font-semibold text-[#7cb2ea] underline">Connexion</Link>
        </p>
      </CardContent>
    </Card>
  );
}

function simplifyResolverError(message: string): string {
  if (message.includes('Invite code not found')) {
    return 'Ce code est introuvable.';
  }
  if (message.includes('Invite code expired')) {
    return 'Ce code a expire.';
  }
  if (message.includes('Rate limit exceeded')) {
    return 'Trop de tentatives. Reessayez dans une minute.';
  }
  if (message.includes('HTTP 429')) {
    return 'Trop de tentatives. Reessayez dans une minute.';
  }
  if (message.includes('HTTP 404')) {
    return 'Resolver indisponible. Utilisez un lien d\'invitation direct.';
  }
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
  const next = [target, ...current.filter((item) => item.code !== target.code)].slice(0, 5);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

function formatRelative(dateIso: string): string {
  const date = new Date(dateIso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'a l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return date.toLocaleDateString();
}

function extractInviteFromInput(input: string): { code: string; redirectTo: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/invite\/([^/]+)/);
    if (!match?.[1]) {
      return null;
    }
    const inviteCode = decodeURIComponent(match[1]);
    return { code: inviteCode, redirectTo: `${url.origin}/invite/${encodeURIComponent(inviteCode)}` };
  } catch {
    return null;
  }
}
