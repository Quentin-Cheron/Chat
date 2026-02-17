import "@/styles.css";

// Apply saved theme before React renders to avoid flash
(function () {
  const fonts: Record<string, string> = {
    "nature":      '"DM Sans", sans-serif',
    "tangerine":   '"Inter", sans-serif',
    "darkmatter":  '"Geist Mono", ui-monospace, monospace',
    "clean-slate": '"Inter", sans-serif',
    "claude":      'ui-sans-serif, system-ui, -apple-system, sans-serif',
    "notebook":    '"Architects Daughter", sans-serif',
  };
  try {
    const theme = window.localStorage.getItem("privatechat_theme_v1") ?? "nature";
    document.documentElement.classList.add("dark");
    if (theme && theme !== "nature") document.documentElement.setAttribute("data-theme", theme);
    if (fonts[theme]) document.body.style.fontFamily = fonts[theme];
  } catch { /* ignore */ }
})();

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import React from "react";
import { createRoot } from "react-dom/client";
import { authClient } from "./lib/auth-client";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3210",
);

const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (rootElement && !rootElement.innerHTML) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ConvexBetterAuthProvider>
    </React.StrictMode>,
  );
}
