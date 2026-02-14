import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changePassword, getPasswordStatus } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";

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

  const statusQuery = useQuery({
    queryKey: ["password-status"],
    queryFn: getPasswordStatus,
    enabled: Boolean(session?.user),
  });

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      await statusQuery.refetch();
      await navigate({ to: "/app" });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Echec du changement de mot de passe.",
      );
    },
  });

  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) {
      void navigate({
        to: "/login",
        search: { redirect: "/security/change-password" },
      });
      return;
    }

    if (statusQuery.data && !statusQuery.data.mustChangePassword) {
      void navigate({ to: "/app" });
    }
  }, [navigate, session?.user, sessionPending, statusQuery.data]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError("Le nouveau mot de passe doit contenir au moins 10 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmation du nouveau mot de passe ne correspond pas.");
      return;
    }

    mutation.mutate();
  }

  if (sessionPending || statusQuery.isPending) {
    return (
      <div className="rounded-xl border border-[#2f3136] bg-[#141518] p-6 text-sm text-slate-300">
        Verification de votre session de securite...
      </div>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-lg border-[#2f3136] bg-[#16181c] text-slate-100 shadow-none reveal">
      <CardHeader>
        <CardTitle className="text-3xl text-slate-100">
          Securite du compte
        </CardTitle>
        <CardDescription className="text-slate-400">
          Pour terminer l'installation, vous devez remplacer le mot de passe
          initial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-slate-200"
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
              className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-slate-200"
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
              className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-slate-200"
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
              className="border-[#2f3136] bg-[#101216] text-slate-100 placeholder:text-slate-500"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="border-[#2f4f73] bg-[#2f4f73] text-white hover:bg-[#274566]"
          >
            {mutation.isPending
              ? "Mise a jour..."
              : "Mettre a jour le mot de passe"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
