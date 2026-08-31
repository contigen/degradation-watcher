'use client';

import { useEffect, useState } from "react";
import { subscribeToAssets } from "../../lib/firestore";
import type { Asset } from "../../lib/types";
import { RISK_COLORS } from "../../lib/types";
import { formatDistanceToNow, parseISO } from "date-fns";
import SubmitAssetModal from "../../components/ui/SubmitAssetModal";
import Link from "next/link";

type SortKey = "name" | "score" | "crop" | "area" | "velocity";

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToAssets((a) => {
      // Focus on farmland assets
      const farmlands = a.filter((item) => !item.type || item.type === "farmland");
      setAssets(farmlands);
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...assets].sort((a, b) => {
    let va: number | string = 0, vb: number | string = 0;
    if (sortKey === "score") {
      va = a.currentRisk?.score ?? 0;
      vb = b.currentRisk?.score ?? 0;
    } else if (sortKey === "velocity") {
      va = a.currentRisk?.velocity ?? 0;
      vb = b.currentRisk?.velocity ?? 0;
    } else if (sortKey === "name") {
      va = a.name;
      vb = b.name;
    } else if (sortKey === "crop") {
      va = a.metadata?.cropType || "";
      vb = b.metadata?.cropType || "";
    } else if (sortKey === "area") {
      va = a.metadata?.fieldAreaHectares ?? 0;
      vb = b.metadata?.fieldAreaHectares ?? 0;
    }
    if (typeof va === "string") {
      return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    }
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => toggleSort(k)}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {sortKey === k && (
          <span style={{ color: "#60a5fa", fontSize: 10 }}>
            {sortDir === "desc" ? "↓" : "↑"}
          </span>
        )}
      </span>
    </th>
  );

  return (
    <div style={{ fontFamily: "var(--font-data), monospace" }} className="lowercase">
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 className="page-title" style={{ fontSize: "18px", textTransform: "lowercase" }}>Farmland Registry</h1>
          <p className="page-subtitle" style={{ fontSize: "12px" }}>
            {assets.length} agricultural parcels · Sentinel-2 satellite monitored · 5-day cadence
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            background: "#0f172a",
            border: "1px solid #2563eb",
            color: "#93c5fd",
            padding: "8px 16px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "inherit",
          }}
        >
          <span>+</span> Submit Farmland for Monitoring
        </button>
      </div>

      <div className="page-body">
        {/* Metric Summary Strip */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", color: "#666", marginRight: "8px", textTransform: "uppercase" }}>
            Risk Status:
          </span>
          {["critical", "high", "moderate", "low"].map((level) => {
            const count = assets.filter((a) => (a.currentRisk?.level || "low") === level).length;
            return (
              <span key={level} className={"risk-badge risk-badge--" + level}>
                {count} {level}
              </span>
            );
          })}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "11px", color: "#666" }}>
            Target: agricultural vegetation & soil degradation
          </span>
        </div>

        {/* Table */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#666", fontSize: 12 }}>
              Loading farmland registry…
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#666", fontSize: 12 }}>
              No farmland assets registered yet.
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setIsModalOpen(true)}
                  style={{
                    background: "#1e3a8a",
                    border: "1px solid #3b82f6",
                    color: "#fff",
                    padding: "6px 14px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  + Submit Your First Farmland Asset
                </button>
              </div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Parcel / Farm" k="name" />
                  <SortHeader label="Crop" k="crop" />
                  <SortHeader label="Area" k="area" />
                  <SortHeader label="Risk score" k="score" />
                  <th>Risk level</th>
                  <SortHeader label="Velocity" k="velocity" />
                  <th>Last updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((asset) => {
                  const level = asset.currentRisk?.level ?? "low";
                  const color = RISK_COLORS[level] || "#3b82f6";
                  const velocity = asset.currentRisk?.velocity ?? 0;
                  const updatedAt = asset.currentRisk?.updatedAt;
                  const crop = asset.metadata?.cropType || "crops";
                  const area = asset.metadata?.fieldAreaHectares;
                  const soil = asset.metadata?.soilType;

                  return (
                    <tr key={asset.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: "#fff" }}>{asset.name}</div>
                        <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                          {asset.coordinates.lat.toFixed(3)}, {asset.coordinates.lng.toFixed(3)}
                          {soil ? " · " + soil : ""}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: "#93c5fd", textTransform: "capitalize" }}>
                          🌾 {crop.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: "#aaa" }}>
                          {area ? area + " ha" : "—"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 70,
                            height: 4,
                            background: "#1f1f1f",
                            borderRadius: 0,
                            overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%",
                              width: (asset.currentRisk?.score ?? 0) + "%",
                              background: color,
                            }} />
                          </div>
                          <span style={{ color, minWidth: 28, fontWeight: 600 }}>
                            {asset.currentRisk?.score ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={"risk-badge risk-badge--" + level}>
                          {level}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: velocity > 0 ? "#f97316" : velocity < 0 ? "#3b82f6" : "#666", fontSize: 11 }}>
                          {velocity > 0 ? "↑" : velocity < 0 ? "↓" : "→"}
                          {" "}{Math.abs(velocity)}/cycle
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: "#666" }}>
                          {updatedAt
                            ? formatDistanceToNow(parseISO(updatedAt), { addSuffix: true })
                            : "never"}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={"/assets/" + asset.id}
                          className="btn btn--ghost"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          View analysis →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Submission Modal */}
      <SubmitAssetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
