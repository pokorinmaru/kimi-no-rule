// The two entries (指示書 第6.9節): the child's flow, and the adults' try route on #/try. The try route is never
// reached from a child's screen; it is linked from the grown-up's screen and from the README.
import { useEffect, useState } from "react";
import { App } from "./App.tsx";
import type { FlowApi } from "./flow/session.ts";
import { TryApp } from "./try/TryApp.tsx";

export const TRY_HASH = "#/try";

const current = (): string => (typeof window === "undefined" ? "" : window.location.hash);

export function Root({ api }: { api?: FlowApi | null }) {
  const [hash, setHash] = useState(current);
  useEffect(() => {
    const on = (): void => setHash(current());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const apiProp = api === undefined ? {} : { api };
  return hash === TRY_HASH ? <TryApp {...apiProp} /> : <App {...apiProp} />;
}
