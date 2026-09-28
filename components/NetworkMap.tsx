"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { RouteSegment } from "@/lib/types";

export interface NetworkMapProps {
  originId: string | null;
  destinationId: string | null;
  segments: RouteSegment[];
  transferIds: string[];
  hint: string;
  onSelectStation: (id: string) => void;
}

const NetworkMapScene = dynamic(() => import("./NetworkMapScene").then((mod) => mod.NetworkMapScene), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#080b10]" aria-hidden />,
});

export function NetworkMap(props: NetworkMapProps) {
  return (
    <MapBoundary>
      <NetworkMapScene {...props} />
    </MapBoundary>
  );
}

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#080b10] px-6 text-center text-sm text-zinc-400">
          The 3D map could not start in this browser.
        </div>
      );
    }
    return this.props.children;
  }
}
