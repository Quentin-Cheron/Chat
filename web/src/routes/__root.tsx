import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { QueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { MessageSquareMore } from "lucide-react";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootLayout,
  },
);

function RootLayout() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAppRoute = pathname.startsWith("/app");
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");

  return (
    <div
      className={
        isAppRoute
          ? "min-h-screen w-full bg-[#eaf0f8] px-3 py-3"
          : "mx-auto min-h-screen w-full max-w-5xl px-4 pb-10 pt-5 sm:px-6"
      }
    >
      <header
        className={
          isAppRoute
            ? "mb-3 flex items-center justify-between rounded-xl border border-[#d3dae6] bg-white px-4 py-3"
            : "mb-5 flex items-center justify-between rounded-2xl border border-[#2f3136] bg-[#141518] px-4 py-3"
        }
      >
        <Link
          to="/"
          className={isAppRoute ? "flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-800" : "flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-100"}
        >
          <MessageSquareMore className="h-5 w-5" />
          PRIVATECHAT WORKSPACE
        </Link>
        <nav className={isAppRoute ? "flex items-center gap-2 text-slate-700" : "flex items-center gap-2 text-slate-100"}>
          {!isAuthRoute ? (
            <Link
              to="/app"
              className={
                isAppRoute
                  ? "rounded-md border border-[#2f4f73] bg-[#2f4f73] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white"
                  : "rounded-md border border-[#3a3c42] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#35373c]"
              }
            >
              App
            </Link>
          ) : null}
          {!isAppRoute ? (
            <Link
              to="/join"
              className={isAppRoute ? "rounded-md border border-[#c7d3e4] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#edf2f9]" : "rounded-md border border-[#3a3c42] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#35373c]"}
            >
              Join Code
            </Link>
          ) : null}

          {!session?.user ? (
            <Link
              to="/login"
              className={isAppRoute ? "rounded-md border border-[#c7d3e4] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#edf2f9]" : "rounded-md border border-[#3a3c42] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#35373c]"}
            >
              Login
            </Link>
          ) : null}
          {!session?.user ? (
            <Link
              to="/register"
              className={isAppRoute ? "rounded-md border border-[#c7d3e4] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#edf2f9]" : "rounded-md border border-[#3a3c42] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#35373c]"}
            >
              Register
            </Link>
          ) : null}
          {session?.user?.email ? (
            <Link
              to="/profile"
              className={isAppRoute ? "rounded-md border border-[#c7d3e4] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#edf2f9]" : "rounded-md border border-[#3a3c42] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#35373c]"}
            >
              Profile
            </Link>
          ) : null}

          {isPending ? <Badge variant="default">...</Badge> : null}
          {session?.user?.email ? (
            <Badge className={isAppRoute ? "border-[#c7d3e4] bg-[#edf3fb] text-[#2f4f73]" : "border-[#3a3c42] bg-[#1d2025] text-slate-200"} variant="default">
              {session.user.email}
            </Badge>
          ) : null}
          {session?.user?.email ? (
            <Button
              variant="outline"
              size="sm"
              className={isAppRoute ? "h-8 border-[#c7d3e4] bg-white px-3 text-[11px] text-slate-700 hover:bg-[#edf2f9]" : "h-8 border-[#3a3c42] bg-[#141518] px-3 text-[11px] text-slate-100 hover:bg-[#35373c]"}
              onClick={async () => {
                await authClient.signOut();
                await refetch();
              }}
            >
              Logout
            </Button>
          ) : null}
          {!isAppRoute && !isAuthRoute ? (
            <Badge className="border-[#2f4f73] bg-[#152436] text-[#c7dcf6]" variant="default">
              Vos donnees, votre serveur
            </Badge>
          ) : null}
        </nav>
      </header>

      <Outlet />
    </div>
  );
}
