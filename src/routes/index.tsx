import { createFileRoute } from "@tanstack/react-router";
import { ColorSatApp } from "../components/color-sat-app";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return <ColorSatApp />;
}
