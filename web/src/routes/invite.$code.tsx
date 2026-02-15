import { joinInvite } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogIn, MessageSquareMore, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/invite/$code")({
  component: InvitePage,
});

function InvitePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [joinState, setJoinState] = useState<"idle" | "joining" | "done">(
    "idle",
  );

  const joinMutation = useMutation({
    mutationFn: (inviteCode: string) => joinInvite(inviteCode),
    onSuccess: async () => {
      setJoinState("done");
      await navigate({ to: "/app" });
    },
  });

  useEffect(() => {
    if (isPending || !session?.user || joinState !== "idle") return;
    setJoinState("joining");
    joinMutation.mutate(code);
  }, [code, isPending, joinMutation, joinState, session?.user]);

  const errorMessage = useMemo(() => {
    const mutationError = joinMutation.error;
    if (!mutationError) return null;
    if (!(mutationError instanceof Error))
      return "Impossible de rejoindre cet espace.";
    if (mutationError.message.includes("Invite not found"))
      return "Invitation introuvable. Vérifiez votre code d'accès.";
    if (mutationError.message.includes("Invite expired"))
      return "Invitation expirée. Demandez un nouveau code.";
    return mutationError.message;
  }, [joinMutation.error]);

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-xl border border-surface-3 bg-surface p-6 text-sm text-muted-foreground">
          Vérification de session...
        </div>
      </div>
    );
  }

  if (!session?.user) {
    const redirect = `/invite/${code}`;
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-gradient shadow-accent">
              <MessageSquareMore className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Invitation reçue
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connectez-vous pour rejoindre cet espace privé
            </p>
            <div className="mt-2 inline-block rounded-full border border-surface-3 bg-surface-2 px-3 py-1 font-mono text-xs text-muted-foreground">
              code: {code}
            </div>
          </div>

          <div className="rounded-2xl border border-surface-3 bg-surface p-6 shadow-xl shadow-black/40">
            <div className="grid gap-3">
              <Link
                to="/login"
                search={{ redirect }}
                className="flex items-center justify-center gap-2 rounded-xl bg-accent-gradient py-2.5 text-sm font-semibold text-white shadow-accent transition-opacity hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Se connecter
              </Link>
              <Link
                to="/register"
                search={{ redirect }}
                className="flex items-center justify-center gap-2 rounded-xl border border-surface-3 bg-surface-2 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:border-accent/30 hover:text-foreground"
              >
                <UserPlus className="h-4 w-4" />
                Créer un compte
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-surface-3 bg-surface p-8 text-center shadow-xl shadow-black/40">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-gradient shadow-accent">
            <MessageSquareMore className="h-7 w-7 text-white" />
          </div>
          <h1 className="mb-1 text-xl font-bold text-foreground">
            Rejoindre l'espace
          </h1>
          <p className="mb-6 font-mono text-sm text-muted-foreground">
            Code: {code}
          </p>

          {joinMutation.isPending || joinState === "joining" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Association de votre compte en cours...
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-lg border border-danger/20 bg-danger-bg/30 px-4 py-3 text-sm text-danger">
              {errorMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <Link
              to="/join"
              className="mt-3 inline-block rounded-lg border border-surface-3 bg-surface-2 px-4 py-2 text-sm text-muted-foreground hover:border-accent/30 hover:text-foreground"
            >
              Utiliser un autre code
            </Link>
          ) : null}

          {joinState === "done" ? (
            <p className="text-sm text-success">
              Espace rejoint. Redirection...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
