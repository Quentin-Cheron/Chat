import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageSquareMore } from "lucide-react";
import { FormEvent, useState } from "react";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      setError(signUpError.message || "Inscription échouée");
      return;
    }
    await navigate({ to: search.redirect || "/app" });
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-gradient shadow-accent">
            <MessageSquareMore className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Créer un compte
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Onboarding rapide sur votre instance privée
          </p>
        </div>

        <div className="rounded-2xl border border-surface-3 bg-surface p-8 shadow-xl shadow-black/40">
          <form className="grid gap-5" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="name"
              >
                Nom
              </label>
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-surface-3 bg-surface-2 text-foreground placeholder:text-muted-foreground/50 focus-accent"
                placeholder="Votre nom"
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="email"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-surface-3 bg-surface-2 text-foreground placeholder:text-muted-foreground/50 focus-accent"
                placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="password"
              >
                Mot de passe
              </label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-surface-3 bg-surface-2 text-foreground placeholder:text-muted-foreground/50 focus-accent"
                placeholder="••••••••••"
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
              className="mt-1 w-full rounded-xl bg-accent-gradient py-2.5 text-sm font-semibold text-white shadow-accent transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Création..." : "Créer mon compte"}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              Déjà inscrit ?{" "}
              <Link
                to="/login"
                className="font-semibold text-accent transition-colors hover:text-accent-soft"
              >
                Connexion
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Mode entreprise · Souveraineté des données · Accès contrôlé
        </p>
      </div>
    </div>
  );
}
