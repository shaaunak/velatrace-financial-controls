"use client";

import React, { createContext, useContext, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEMO_ACTORS, DemoActor } from "@/lib/api";

interface AppStateContextValue {
  actor: DemoActor;
  setActor: (actor: DemoActor) => void;
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  selectedBatchId: string | null;
  setSelectedBatchId: (id: string | null) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
          },
        },
      })
  );
  const [actor, setActor] = useState<DemoActor>(DEMO_ACTORS[0]);
  const [workspaceId, setWorkspaceId] = useState<string>("ws_northbridge_demo");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <AppStateContext.Provider
        value={{
          actor,
          setActor,
          workspaceId,
          setWorkspaceId,
          selectedBatchId,
          setSelectedBatchId,
        }}
      >
        {children}
      </AppStateContext.Provider>
    </QueryClientProvider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within Providers");
  return ctx;
}
