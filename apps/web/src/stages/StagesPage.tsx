// The adults' page of every stage picture (#/stages): each problem's scenes side by side, without motion, so a
// person and the scene check can look at all of them at once. Never linked from a child's screen.
import { ObjectSceneView } from "../draw/ObjectScene.tsx";
import { sceneCases } from "./scenes.ts";

export const STAGES_HASH = "#/stages";

export function StagesPage() {
  const cases = sceneCases();
  return (
    <main style={{ padding: 16, background: "#fff", color: "#1f2933", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>Stage pictures (adults only): {cases.length} scenes</h1>
      <div style={{ display: "grid", gap: 24 }}>
        {cases.map((c) => (
          <section key={c.id} data-scene={c.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{c.id}</p>
            <p style={{ margin: "0 0 4px" }}>{c.problemText}</p>
            <p style={{ margin: "0 0 8px", color: "#52606d" }}>{c.world}</p>
            <div data-scene-picture>
              <ObjectSceneView scene={c.scene} reducedMotion label={c.id} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
