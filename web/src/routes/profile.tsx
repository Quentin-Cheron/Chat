import { FormEvent, useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { getProfile, updateProfile } from '@/lib/api';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: Boolean(session?.user),
  });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      void navigate({ to: '/login', search: { redirect: '/profile' } });
    }
  }, [navigate, session?.user, sessionPending]);

  useEffect(() => {
    if (profileQuery.data?.name) {
      setName(profileQuery.data.name);
    }
  }, [profileQuery.data?.name]);

  const updateMutation = useMutation({
    mutationFn: () => updateProfile({ name }),
    onSuccess: async () => {
      setError(null);
      await profileQuery.refetch();
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : 'Mise a jour impossible.');
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('Le nom doit contenir au moins 2 caracteres.');
      return;
    }
    updateMutation.mutate();
  }

  if (sessionPending || profileQuery.isPending) {
    return <div className="rounded-xl border border-[#2f3136] bg-[#141518] p-6 text-sm text-slate-300">Chargement du profil...</div>;
  }

  return (
    <Card className="mx-auto w-full max-w-2xl border-[#2f3136] bg-[#16181c] text-slate-100 shadow-none reveal">
      <CardHeader>
        <CardTitle className="text-3xl text-slate-100">Profil utilisateur</CardTitle>
        <CardDescription className="text-slate-400">Informations de compte pour votre instance privee.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2 rounded-lg border border-[#2f3136] bg-[#101216] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
          <p className="text-sm font-semibold text-slate-100">{profileQuery.data?.email || '-'}</p>
        </div>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-200" htmlFor="profile-name">Nom affiche</label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500"
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" disabled={updateMutation.isPending} className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]">
            {updateMutation.isPending ? 'Mise a jour...' : 'Enregistrer le profil'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
