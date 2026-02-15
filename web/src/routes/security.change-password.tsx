import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/security/change-password")({
  component: SecurityChangePasswordPage,
});

function SecurityChangePasswordPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const passwordStatus = useQuery(
    api.users.getPasswordStatus,
    session?.user ? {} : "skip",
  );
  const changePasswordMut = useMutation(api.users.changePassword);
  const clearMustChange = useMutation(api.users.clearMustChangePassword);

  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) {
      void navigate({
        to: "/login",
        search: { redirect: "/security/change-password" },
      });
      return;
    }
    if (passwordStatus && !passwordStatus.mustChangePassword) {
      void navigate({ to: "/app" });
    }
  }, [navigate, session?.user, sessionPending, passwordStatus]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 10) {
      setError("Le nouveau mot de passe doit contenir au moins 10 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmation du nouveau mot de passe ne correspond pas.");
      return;
    }
    setPending(true);
    try {
      await changePasswordMut({ currentPassword, newPassword });
      await clearMustChange({});
      await navigate({ to: "/app" });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Échec du changement de mot de passe.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sessionPending || passwordStatus === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-xl border border-surface-3 bg-surface p-6 text-sm text-muted-foreground">
          Vérification de votre session de sécurité...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-warning to-orange-600 shadow-lg shadow-orange-900/40">
            <ShieldAlert className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Sécurité du compte
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pour terminer l'installation, vous devez remplacer le mot de passe
            initial.
          </p>
        </div>

        <div className="rounded-2xl border border-warning/20 bg-surface p-8 shadow-xl shadow-black/40">
          <div className="mb-5 rounded-lg border border-warning/20 bg-warning-bg/20 px-4 py-3 text-xs text-warning">
            Action requise · Votre mot de passe temporaire doit être changé
            avant de continuer.
          </div>

          <form className="grid gap-5" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="current-password"
              >
                Mot de passe temporaire
              </label>
              <Input
                id="current-password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="border-surface-3 bg-surface-2 text-foreground placeholder:text-muted-foreground/50 focus:border-warning/50 focus:ring-1 focus:ring-warning/20 focus:outline-none"
                placeholder="••••••••••"
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="new-password"
              >
                Nouveau mot de passe
              </label>
              <Input
                id="new-password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border-surface-3 bg-surface-2 text-foreground placeholder:text-muted-foreground/50 focus-accent"
                placeholder="10 caractères minimum"
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="confirm-password"
              >
                Confirmer le nouveau mot de passe
              </label>
              <Input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              disabled={pending}
              className="mt-1 w-full rounded-xl bg-accent-gradient py-2.5 text-sm font-semibold text-white shadow-accent transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Mise à jour..." : "Mettre à jour le mot de passe"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
