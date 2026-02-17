import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageSquareMore } from "lucide-react";
import { FormEvent, useState } from "react";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message || "Connexion échouée");
      return;
    }
    await navigate({ to: search.redirect || "/app" });
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <MessageSquareMore className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Connexion</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accédez à votre espace de collaboration privé
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/40">
          <form className="grid gap-5" onSubmit={onSubmit}>
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
                className="border-border bg-input text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
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
                className="border-border bg-input text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                placeholder="••••••••••"
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              Pas de compte ?{" "}
              <Link
                to="/register"
                className="font-semibold text-primary transition-colors hover:opacity-80"
              >
                Créer un compte
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Vos données restent sur votre serveur
        </p>
      </div>
    </div>
  );
}
