"use client";
import { useState } from "react";

type JsonRecord = Record<string, unknown>;
export default function AgStageTestPage() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(stage: "deep" | "committee") {
    setError(""); setBusy(true);
    try {
      const parsed = JSON.parse(input) as JsonRecord;
      const payload = stage === "deep" ? { catalyst: parsed.catalyst ?? parsed } : { research: parsed.research ?? parsed };
      const response = await fetch(stage === "deep" ? "/api/accelerated-growth/deep-preview" : "/api/accelerated-growth/committee-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      const data = await response.json();
      setOutput(JSON.stringify(data, null, 2));
      if (!response.ok) setError("Stage failed (HTTP " + response.status + "). Review response below.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to run stage."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">AG Research Stage Diagnostics</h1>
    <p className="text-sm text-gray-600">Paper-only, read-only research tests. Paste the entire prior-stage JSON response below. Deep research requires a SUPPORTED/MIXED catalyst; Committee requires a PROCEED deep-research result. No investment decisions or trades are saved.</p>
    <label htmlFor="ag-stage-input" className="block font-semibold">Prior-stage JSON</label>
    <textarea id="ag-stage-input" aria-label="Prior-stage JSON" className="h-64 w-full rounded border p-3 font-mono text-xs" value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste the full catalyst or deep-research JSON response here" />
    <div className="flex flex-wrap gap-3"><button disabled={busy || !input.trim()} className="rounded bg-blue-800 px-4 py-2 text-white disabled:opacity-50" onClick={()=>run("deep")}>Run Deep Research</button><button disabled={busy || !input.trim()} className="rounded bg-gray-800 px-4 py-2 text-white disabled:opacity-50" onClick={()=>run("committee")}>Run Committee</button></div>
    {busy && <p role="status">Research is running. Do not navigate away.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {output && <><label htmlFor="ag-stage-output" className="block font-semibold">Result (copy this for the next stage)</label><textarea id="ag-stage-output" readOnly value={output} className="h-80 w-full rounded border p-3 font-mono text-xs" /><button className="rounded border px-3 py-2" onClick={()=>{setInput(output);setOutput("");}}>Use Result as Next Input</button></>}
  </main>;
}
