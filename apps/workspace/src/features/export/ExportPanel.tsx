import { Download, Save } from "lucide-react";
import { useState } from "react";

import type { ExportCapabilityItem, ReportFormat } from "@dwg/contracts";

import { useExport } from "./useExport";
import "./styles.css";

export function ExportPanel() {
  const { capabilities, error } = useExport();
  const [destination, setDestination] = useState("");
  const reports = capabilities?.capabilities.filter((item) => item.kind === "report") ?? [];
  const drawings = capabilities?.capabilities.filter((item) => item.kind === "drawing") ?? [];
  const destinationStatus = destination.trim() ? "Destination selected; Save As is unavailable." : "Destination required";

  return (
    <section aria-label="Export" className="export-panel" role="region">
      <header><strong>Export</strong><span>Read-only workspace</span></header>
      {error && <p className="export-error" role="alert">{error}</p>}
      {!capabilities && !error && <p className="export-loading" role="status">Loading export capabilities…</p>}
      <section aria-labelledby="report-export-heading" className="export-group">
        <h2 id="report-export-heading">Report export</h2>
        <p>Download inspection reports only. These controls never write a drawing.</p>
        <div className="export-actions">
          {reports.map((item) => <ReportAction capability={item} key={item.format} />)}
        </div>
      </section>
      <section aria-labelledby="drawing-save-heading" className="export-group drawing-save">
        <h2 id="drawing-save-heading">Drawing Save As</h2>
        <p>Source CAD files stay read-only. Save As will create a copy only when an export module is installed.</p>
        <label>
          <span>Save As destination</span>
          <input aria-label="Save As destination" onChange={(event) => setDestination(event.target.value)} placeholder="Choose a destination" value={destination} />
        </label>
        <p className="destination-status" role="status">{destinationStatus}</p>
        <div className="export-actions">
          {drawings.map((item) => <DrawingAction capability={item} key={item.format} />)}
        </div>
      </section>
    </section>
  );
}

function ReportAction({ capability }: { capability: ExportCapabilityItem }) {
  const label = `Download ${capability.format.toUpperCase() as Uppercase<ReportFormat>} report`;
  return <button disabled={!capability.available} title={capability.reason ?? undefined}><Download size={13} />{label}<small>{capability.reason}</small></button>;
}

function DrawingAction({ capability }: { capability: ExportCapabilityItem }) {
  return <button disabled={!capability.available} title={capability.reason ?? undefined}><Save size={13} />Save As {capability.format.toUpperCase()}<small>{capability.reason}</small></button>;
}
