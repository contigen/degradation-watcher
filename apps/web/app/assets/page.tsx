"use client";

import { useEffect, useState } from "react";
import { subscribeToAssets } from "../../lib/firestore";
import type { Asset } from "../../lib/types";
import { RISK_COLORS } from "../../lib/types";
import { formatDistanceToNow, parseISO } from "date-fns";

type SortKey = "name" | "score" | "type" | "velocity";

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "bridge" | "farmland">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToAssets((a) => {
      setAssets(a);
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const setDir = setSortDir;

  const sorted = [...assets]
    .filter((a) => filter === "all" || a.type === filter)
    .sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === "score") {
        va = a.currentRisk?.score ?? 0;
        vb = b.currentRisk?.score ?? 0;
      } else if (sortKey === "velocity") {
        va = a.currentRisk?.velocity ?? 0;
        vb = b.currentRisk?.velocity ?? 0;
      } else if (sortKey === "name") {
        va = a.name;
        vb = b.name;
      } else {
        va = a.type;
        vb = b.type;
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
          <span style={{ color: "#22d3ee", fontSize: 10 }}>
            {sortDir === "desc" ? "↓" : "↑"}
          </span>
        )}
      </span>
    </th>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Asset Registry</h1>
        <p className="page-subtitle">
          {assets.length} assets · Bridges and farmland · Sentinel-2 monitored
        </p>
      </div>

      <div className="page-body">
        {/* Filter strip */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["all", "bridge", "farmland"] as const).map((f) => (
            <button
              key={f}
              className={`btn ${filter === f ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "6px 14px" }}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "bridge" ? "🌉 Bridges" : "🌾 Farmland"}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {["critical", "high", "moderate", "low"].map((level) => {
              const count = assets.filter((a) => a.currentRisk?.level === level).length;
              return count > 0 ? (
                <span key={level} className={`risk-badge risk-badge--${level}`}>
                  {count} {level}
                </span>
              ) : null;
            })}
          </div>
        </div>

        {/* Table */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#4a6080", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
              Loading assets…
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Asset" k="name" />
                  <SortHeader label="Type" k="type" />
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
                  const color = RISK_COLORS[level];
                  const velocity = asset.currentRisk?.velocity ?? 0;
                  const updatedAt = asset.currentRisk?.updatedAt;

                  return (
                    <tr key={asset.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: "#e2eaf4" }}>{asset.name}</div>
                        <div className="mono" style={{ fontSize: 10, marginTop: 2 }}>
                          {asset.coordinates.lat.toFixed(3)}, {asset.coordinates.lng.toFixed(3)}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 13 }}>
                          {asset.type === "bridge" ? "🌉" : "🌾"} {asset.type}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 80,
                            height: 4,
                            background: "#1e2836",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%",
                              width: `${asset.currentRisk?.score ?? 0}%`,
                              background: color,
                              borderRadius: 2,
                            }} />
                          </div>
                          <span className="mono" style={{ color, minWidth: 28 }}>
                            {asset.currentRisk?.score ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`risk-badge risk-badge--${level}`}>
                          {level}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`velocity velocity--${
                            velocity > 0 ? "up" : velocity < 0 ? "down" : "flat"
                          }`}
                          style={{ fontSize: 12 }}
                        >
                          {velocity > 0 ? "↑" : velocity < 0 ? "↓" : "→"}
                          {" "}{Math.abs(velocity)}/cycle
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: "#4a6080", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {updatedAt
                            ? formatDistanceToNow(parseISO(updatedAt), { addSuffix: true })
                            : "never"}
                        </span>
                      </td>
                      <td>
                        <a
                          href={`/assets/${asset.id}`}
                          className="btn btn--ghost"
                          style={{ padding: "4px 12px", fontSize: 11 }}
                        >
                          View →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
