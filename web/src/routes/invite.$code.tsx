import { useEffect, useMemo, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { joinInvite } from '@/lib/api';

export const Route = createFileRoute('/invite/$code')({
  component: InvitePage,
});

function InvitePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'done'>('idle');

  const joinMutation = useMutation({
    mutationFn: (inviteCode: string) => joinInvite(inviteCode),
    onSuccess: async () => {
      setJoinState('done');
      await navigate({ to: '/app' });
    },
  });

  useEffect(() => {
    if (isPending || !session?.user || joinState !== 'idle') {
      return;
    }
    setJoinState('joining');
    joinMutation.mutate(code);
  }, [code, isPending, joinMutation, joinState, session?.user]);

  const errorMessage = useMemo(() => {
    const mutationError = joinMutation.error;
    if (!mutationError) return null;
    if (!(mutationError instanceof Error)) {
      return 'Impossible de rejoindre cet espace.';
    }
    if (mutationError.message.includes('Invite not found')) {
      return "Invitation introuvable. Verifiez votre code d'acces.";
    }
    if (mutationError.message.includes('Invite expired')) {
      return 'Invitation expiree. Demandez un nouveau code.';
    }
    return mutationError.message;
  }, [joinMutation.error]);

  if (isPending) {
    return <div className="rounded-xl border border-[#d3dae6] bg-white p-6 text-sm text-slate-700">Verification de session...</div>;
  }

  if (!session?.user) {
    const redirect = `/invite/${code}`;
    return (
      <Card className="mx-auto w-full max-w-lg border-[#2f3136] bg-[#16181c] text-slate-100 shadow-none reveal">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-100">Invitation recue</CardTitle>
          <CardDescription className="text-slate-400">
            Connectez-vous pour rejoindre cet espace prive.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button asChild className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]">
            <Link to="/login" search={{ redirect }}>Se connecter</Link>
          </Button>
          <Button asChild variant="outline" className="border-[#3a3c42] bg-[#141518] text-slate-100 hover:bg-[#35373c]">
            <Link to="/register" search={{ redirect }}>Creer un compte</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-lg border-[#d3dae6] bg-white text-slate-900 shadow-none">
      <CardHeader>
        <CardTitle className="text-2xl text-slate-900">Rejoindre l'espace</CardTitle>
        <CardDescription className="text-slate-600">
          Code: <span className="font-mono">{code}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {joinMutation.isPending || joinState === 'joining' ? <p className="text-sm text-slate-600">Association de votre compte en cours...</p> : null}
        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
        {errorMessage ? (
          <Button asChild variant="outline" className="mt-3 border-[#c7d3e4] bg-white text-slate-700 hover:bg-[#edf2f9]">
            <Link to="/join">Utiliser un autre code</Link>
          </Button>
        ) : null}
        {joinState === 'done' ? <p className="text-sm text-emerald-700">Espace rejoint. Redirection...</p> : null}
      </CardContent>
    </Card>
  );
}
