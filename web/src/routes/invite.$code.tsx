import { authClient } from "@/lib/auth-client";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { LogIn, MessageSquareMore, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";

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
  const [joinError, setJoinError] = useState<string | null>(null);

  const joinInviteMut = useMutation(api.invites.join);

  useEffect(() => {
    if (isPending || !session?.user || joinState !== "idle") return;
    setJoinState("joining");
    joinInviteMut({ code })
      .then(() => {
        setJoinState("done");
        return navigate({ to: "/app" });
      })
      .catch((e: unknown) => {
        setJoinError(
          e instanceof Error
            ? e.message
            : "Impossible de rejoindre cet espace.",
        );
        setJoinState("idle");
      });
  }, [code, isPending, joinInviteMut, joinState, session?.user, navigate]);

  const errorMessage = useMemo(() => {
    if (!joinError) return null;
    if (
      joinError.includes("Invite not found") ||
      joinError.includes("introuvable")
    )
      return "Invitation introuvable. Vérifiez votre code d'accès.";
    if (joinError.includes("expir"))
      return "Invitation expirée. Demandez un nouveau code.";
    return joinError;
  }, [joinError]);

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
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
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-sm">
              <MessageSquareMore className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Invitation reçue
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connectez-vous pour rejoindre cet espace privé
            </p>
            <div className="mt-2 inline-block rounded-full border border-border bg-input px-3 py-1 font-mono text-xs text-muted-foreground">
              code: {code}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/40">
            <div className="grid gap-3">
              <Link
                to="/login"
                search={{ redirect }}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Se connecter
              </Link>
              <Link
                to="/register"
                search={{ redirect }}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-input py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
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
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-xl shadow-black/40">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <MessageSquareMore className="h-7 w-7 text-white" />
          </div>
          <h1 className="mb-1 text-xl font-bold text-foreground">
            Rejoindre l'espace
          </h1>
          <p className="mb-6 font-mono text-sm text-muted-foreground">
            Code: {code}
          </p>

          {joinState === "joining" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Association de votre compte en cours...
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <Link
              to="/join"
              className="mt-3 inline-block rounded-lg border border-border bg-input px-4 py-2 text-sm text-muted-foreground hover:border-primary/30 hover:text-foreground"
            >
              Utiliser un autre code
            </Link>
          ) : null}

          {joinState === "done" ? (
            <p className="text-sm text-green-500">
              Espace rejoint. Redirection...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
