"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function WorkspaceLoading() {
  return (
    <div
      className="workspace-loading"
      role="status"
      aria-label="Loading your workspace"
      aria-busy="true"
    >
      <span className="sr-only">Loading your workspace…</span>
      <div className="loading-metrics" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div className="loading-card" key={index}>
            <div className="loading-line" />
            <div className="loading-line loading-line-short" />
          </div>
        ))}
      </div>
      <div className="loading-card" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div className="loading-line" key={index} />
        ))}
      </div>
    </div>
  );
}

export function WorkspaceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <h2>Workspace unavailable</h2>
      <p>{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

export class ViewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <WorkspaceError
          message="This view could not open. Reload the page to try again."
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
