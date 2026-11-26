"use client";
import { createRoot } from "react-dom/client";
import Providers from "@/app/providers";
import Home from "@/app/page";
import TripPage from "@/app/trip/page";
import GiftView from "@/app/share/[slug]/GiftView";
import { usePath } from "./router";

function App() {
  const path = usePath();
  if (path === "/trip") return <TripPage />;
  const m = path.match(/^\/share\/([a-z0-9-]+)$/i);
  if (m) return <GiftView slug={m[1]} />;
  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <Providers>
    <App />
  </Providers>,
);
