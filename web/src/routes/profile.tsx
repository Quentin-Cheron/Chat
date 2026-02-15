import { Input } from "@/components/ui/input";
import { getProfile, updateProfile } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { User } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: Boolean(session?.user),
  });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      void navigate({ to: "/login", search: { redirect: "/profile" } });
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
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      await profileQuery.refetch();
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Mise à jour impossible.",
      );
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    updateMutation.mutate();
  }

  if (sessionPending || profileQuery.isPending) {
    return (
      <div className="rounded-xl border border-surface-3 bg-surface p-6 text-sm text-muted-foreground">
        Chargement du profil...
      </div>
    );
  }

  const initials = (profileQuery.data?.name || profileQuery.data?.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-surface-3 bg-surface p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-gradient text-xl font-bold text-white shadow-accent">
          {initials}
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {profileQuery.data?.name || "—"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profileQuery.data?.email || "—"}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-surface-3 bg-surface p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Email
        </p>
        <p className="text-sm font-medium text-foreground">
          {profileQuery.data?.email || "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Pour changer l'email, rendez-vous dans Paramètres → Compte.
        </p>
      </div>

      <div className="rounded-xl border border-surface-3 bg-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold text-foreground">Nom affiché</p>
        </div>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-surface-3 bg-surface-2 text-foreground placeholder:text-muted-foreground/50 focus-accent"
            placeholder="Votre nom"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {success ? (
            <p className="text-sm text-success">Profil mis à jour.</p>
          ) : null}
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded-xl bg-accent-gradient py-2.5 text-sm font-semibold text-white shadow-accent transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {updateMutation.isPending
              ? "Mise à jour..."
              : "Enregistrer le profil"}
          </button>
        </form>
      </div>
    </div>
  );
}
