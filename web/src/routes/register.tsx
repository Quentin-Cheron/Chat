import { FormEvent, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/register')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message || 'Registration failed');
      return;
    }

    await navigate({ to: search.redirect || '/app' });
  }

  return (
    <Card className="mx-auto w-full max-w-lg border-[#2f3136] bg-[#16181c] text-slate-100 shadow-none reveal">
      <CardHeader>
        <CardTitle className="text-3xl text-slate-100">Creer un compte</CardTitle>
        <CardDescription className="text-slate-400">Onboarding rapide sur votre instance privee.</CardDescription>
        <p className="text-xs text-slate-500">Mode entreprise: souverainete des donnees et acces controle.</p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-200" htmlFor="name">Name</label>
            <Input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-200" htmlFor="email">Email</label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-200" htmlFor="password">Password</label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500" />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" disabled={loading} className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]">{loading ? 'Creation...' : 'Creer mon compte'}</Button>
          <p className="text-sm text-slate-400">
            Deja inscrit ? <Link to="/login" className="font-semibold text-accent underline">Connexion</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
