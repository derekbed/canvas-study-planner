"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/client-types";
import { jsonBody, requestJson } from "@/lib/request";

export function useWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);

  const update = useCallback((workspace: Workspace) => {
    revision.current++;
    setData(workspace);
    setError(null);
  }, []);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++revision.current;
      const workspace = await requestJson<Workspace>(
        "/api/workspace",
        "Workspace could not load.",
        { signal },
      );
      // A refresh started before a save must not replace the saved workspace.
      if (current === revision.current && !signal?.aborted) update(workspace);
    },
    [update],
  );

  const initialize = useCallback(
    (signal?: AbortSignal) => {
      return requestJson<{ accepted: boolean }>(
        "/api/eligibility",
        "Eligibility could not be checked.",
        { signal },
      )
        .then(async (result) => {
          if (signal?.aborted) return;
          setEligible(Boolean(result.accepted));
          if (result.accepted) await reload(signal);
        })
        .catch((cause) => {
          if (!signal?.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Workspace could not load.",
            );
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [reload],
  );

  useEffect(() => {
    const controller = new AbortController();
    void initialize(controller.signal);
    return () => controller.abort();
  }, [initialize]);

  const retry = useCallback(async () => {
    setLoading(true);
    setError(null);
    await initialize();
  }, [initialize]);

  const confirmAge = useCallback(async () => {
    await requestJson(
      "/api/eligibility",
      "Eligibility could not be saved.",
      jsonBody({ atLeast13: true }),
    );
    await initialize();
  }, [initialize]);

  const mutate = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      update(
        await requestJson<Workspace>(
          "/api/workspace",
          "Could not save changes.",
          jsonBody({ action, ...payload }),
        ),
      );
    },
    [update],
  );

  return {
    data,
    eligible,
    loading,
    error,
    update,
    reload,
    initialize: retry,
    confirmAge,
    mutate,
  };
}
