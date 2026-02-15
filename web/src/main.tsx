import "@/styles.css";
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
