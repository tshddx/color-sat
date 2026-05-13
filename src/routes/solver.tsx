import { createFileRoute } from "@tanstack/react-router";
import { SolverApp } from "../components/solver/solver-app";

export const Route = createFileRoute("/solver")({ component: SolverPage });

function SolverPage() {
  return <SolverApp />;
}
