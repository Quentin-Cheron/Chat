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
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/register");

  if (isAppRoute) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen w-full bg-surface-base px-4 pb-10 pt-5 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between rounded-xl border border-surface-3 bg-surface px-4 py-3 shadow-lg shadow-black/30">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-wide text-slate-100 transition-opacity hover:opacity-80"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-gradient shadow-accent">
              <MessageSquareMore className="h-4 w-4 text-white" />
            </div>
            <span className="text-foreground">PRIVATECHAT</span>
          </Link>

          <nav className="flex items-center gap-2">
            {!isAuthRoute ? (
              <Link
                to="/app"
                className="rounded-lg bg-accent-gradient px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white shadow-accent transition-opacity hover:opacity-90"
              >
                App
              </Link>
            ) : null}
            {!isAppRoute ? (
              <Link
                to="/join"
                className="rounded-lg border border-surface-3 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 transition-all hover:border-accent/30 hover:bg-surface-3 hover:text-slate-100"
              >
                Join Code
              </Link>
            ) : null}
            {!session?.user ? (
              <Link
                to="/login"
                className="rounded-lg border border-surface-3 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 transition-all hover:border-accent/30 hover:bg-surface-3 hover:text-slate-100"
              >
                Login
              </Link>
            ) : null}
            {!session?.user ? (
              <Link
                to="/register"
                className="rounded-lg border border-surface-3 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 transition-all hover:border-accent/30 hover:bg-surface-3 hover:text-slate-100"
              >
                Register
              </Link>
            ) : null}
            {session?.user?.email ? (
              <Link
                to="/settings"
                className="rounded-lg border border-surface-3 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 transition-all hover:border-accent/30 hover:bg-surface-3 hover:text-slate-100"
              >
                Settings
              </Link>
            ) : null}
            {isPending ? (
              <span className="rounded-full bg-surface-3 px-3 py-1 text-xs text-muted-foreground">
                ...
              </span>
            ) : null}
            {session?.user?.email ? (
              <span className="rounded-full border border-surface-3 bg-surface-2 px-3 py-1 text-xs text-muted-foreground">
                {session.user.email}
              </span>
            ) : null}
            {session?.user?.email ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg border border-surface-3 bg-transparent px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:border-danger/40 hover:bg-danger-bg/20 hover:text-danger"
                onClick={async () => {
                  await authClient.signOut();
                  await refetch();
                }}
              >
                Logout
              </Button>
            ) : null}
            {!isAppRoute && !isAuthRoute ? (
              <Badge
                className="border-accent/20 bg-accent/10 text-accent-soft"
                variant="default"
              >
                Vos données, votre serveur
              </Badge>
            ) : null}
          </nav>
        </header>

        <Outlet />
      </div>
    </div>
  );
}
