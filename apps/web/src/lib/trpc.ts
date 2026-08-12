import type * as App from "@app/trpc";
import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";

export const queryClient = new QueryClient();
export const trpc = createTRPCReact<App.AppRouter>();
export const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: "/api" })] });
