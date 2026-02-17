import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { User } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      void navigate({ to: "/login", search: { redirect: "/profile" } });
    }
  }, [navigate, session?.user, sessionPending]);

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session?.user?.name]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await authClient.updateUser({
      name: name.trim(),
    });
    setSaving(false);
    if (updateError) {
      setError(updateError.message || "Mise à jour impossible.");
      return;
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  }

  if (sessionPending) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Chargement du profil...
      </div>
    );
  }

  const user = session?.user;
  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-white shadow-sm">
          {initials}
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {user?.name || "—"}
          </h1>
          <p className="text-sm text-muted-foreground">{user?.email || "—"}</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Email
        </p>
        <p className="text-sm font-medium text-foreground">
          {user?.email || "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Pour changer l'email, rendez-vous dans Paramètres → Compte.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Nom affiché</p>
        </div>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-border bg-input text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            placeholder="Votre nom"
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {success ? (
            <p className="text-sm text-green-500">Profil mis à jour.</p>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Mise à jour..." : "Enregistrer le profil"}
          </button>
        </form>
      </div>
    </div>
  );
}
