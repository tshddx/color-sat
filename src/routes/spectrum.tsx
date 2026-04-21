import { createFileRoute } from "@tanstack/react-router";
import { SpectrumExplorer } from "../components/spectrum-explorer";

export const Route = createFileRoute("/spectrum")({ component: SpectrumPage });

function SpectrumPage() {
  return <SpectrumExplorer />;
}
