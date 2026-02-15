import { ConvexReactClient } from "convex/react";

export const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3210",
);
