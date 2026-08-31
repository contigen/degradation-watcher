'use client';

import { useEffect, useState } from "react";
import {
  subscribeToAssets,
  subscribeToAlerts,
  acknowledgeAlert,
} from "../../lib/firestore";
import type { Asset, Alert } from "../../lib/types";
import { RISK_COLORS } from "../../lib/types";
import AssetMap from "../../components/map/AssetMap";
import RiskScoreChart from "../../components/charts/RiskScoreChart";
import AlertFeed from "../../components/ui/AlertFeed";
import ScoreRing from "../../components/ui/ScoreRing";
import SubmitAssetModal from "../../components/ui/SubmitAssetModal";
import Link from "next/link";

export default function DashboardPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub1 = subscribeToAssets((a) => {
      const farmlands = a.filter((item) => !item.type || item.type === "farmland");
      setAssets(farmlands);
      setLoading(false);
    });
    const unsub2 = subscribeToAlerts(setAlerts);
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Aggregate stats
  const criticalCount = assets.filter((a) => a.currentRisk?.level === "critical").length;
  const highCount = assets.filter((a) => a.currentRisk?.level === "high").length;
  const pendingAlerts = alerts.filter((a) => a.status === "pending").length;
  const avgScore =
    assets.length > 0
      ? Math.round(
          assets.reduce((sum, a) => sum + (a.currentRisk?.score ?? 0), 0) / assets.length
        )
      : 0;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-data), monospace" }} className="lowercase">
      {/* Page header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 className="page-title" style={{ fontSize: "18px", textTransform: "lowercase" }}>Dashboard</h1>
          <p className="page-subtitle" style={{ fontSize: "12px" }}>
            {assets.length} farmlands monitored · Sentinel-2 NDVI refresh every 5 days
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
          <span>+</span> Submit Farmland
        </button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: "auto" }}>
        {/* Stat strip */}
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <div className="stat-cell">
            <div className="stat-label">Farmlands Monitored</div>
            <div className="stat-value">{assets.length}</div>
            <div className="stat-sub">Agricultural parcels</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">Critical Stress</div>
            <div className="stat-value" style={{ color: RISK_COLORS.critical }}>
              {criticalCount}
            </div>
            <div className="stat-sub">Immediate mitigation</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">High Risk</div>
            <div className="stat-value" style={{ color: RISK_COLORS.high }}>
              {highCount}
            </div>
            <div className="stat-sub">Inspect within 30 days</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">Pending Alerts</div>
            <div className="stat-value" style={{ color: pendingAlerts > 0 ? RISK_COLORS.high : "inherit" }}>
              {pendingAlerts}
            </div>
            <div className="stat-sub">Awaiting operator review</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">Fleet Avg Score</div>
            <div className="stat-value">{avgScore}</div>
            <div className="stat-sub">Out of 100 max risk</div>
          </div>
        </div>

        {/* Main grid: map + alerts */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Map */}
          <div className="card" style={{ minHeight: 480 }}>
            <div className="card-header">
              <span className="card-title">Agricultural Asset Map</span>
              <span style={{ fontSize: 11, color: "#60a5fa" }}>
                {assets.length} active parcels
              </span>
            </div>
            <div style={{ height: 440 }}>
              {!loading && (
                <AssetMap
                  assets={assets}
                  onAssetSelect={setSelectedAsset}
                  selectedAssetId={selectedAsset?.id}
                />
              )}
            </div>
          </div>

          {/* Alert feed */}
          <div className="card" style={{ display: "flex", flexDirection: "column" }}>
            <div className="card-header">
              <span className="card-title">Live Alerts</span>
              {pendingAlerts > 0 && (
                <span
                  className="risk-badge risk-badge--critical"
                  style={{ fontSize: 10 }}
                >
                  {pendingAlerts} pending
                </span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <AlertFeed
                alerts={alerts.slice(0, 12)}
                onAcknowledge={acknowledgeAlert}
              />
            </div>
          </div>
        </div>

        {/* Selected asset detail */}
        {selectedAsset && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                {selectedAsset.name}
                <span style={{ marginLeft: 8, opacity: 0.5 }}>
                  — 🌾 {selectedAsset.metadata?.cropType || "farmland"}
                </span>
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  className={"risk-badge risk-badge--" + (selectedAsset.currentRisk?.level ?? "low")}
                >
                  {selectedAsset.currentRisk?.level ?? "unscored"}
                </span>
                <Link href={"/assets/" + selectedAsset.id} className="btn btn--ghost" style={{ padding: "4px 12px" }}>
                  Full analysis →
                </Link>
                <button
                  className="btn btn--ghost"
                  style={{ padding: "4px 12px" }}
                  onClick={() => setSelectedAsset(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 24, alignItems: "start" }}>
                <ScoreRing
                  score={selectedAsset.currentRisk?.score ?? 0}
                  level={selectedAsset.currentRisk?.level ?? "low"}
                  size={100}
                />
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div className="stat-label">Coordinates</div>
                      <div style={{ fontSize: 11, color: "#60a5fa", marginTop: 4 }}>
                        {selectedAsset.coordinates.lat.toFixed(4)},&nbsp;
                        {selectedAsset.coordinates.lng.toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Crop & Area</div>
                      <div style={{ marginTop: 4, fontSize: 13, textTransform: "capitalize" }}>
                        🌾 {selectedAsset.metadata?.cropType || "crops"} · {selectedAsset.metadata?.fieldAreaHectares ? selectedAsset.metadata.fieldAreaHectares + "ha" : "180ha"}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Score velocity</div>
                      <div
                        className={"velocity velocity--" + (
                          (selectedAsset.currentRisk?.velocity ?? 0) > 0
                            ? "up"
                            : (selectedAsset.currentRisk?.velocity ?? 0) < 0
                            ? "down"
                            : "flat"
                        )}
                        style={{ marginTop: 4 }}
                      >
                        {(selectedAsset.currentRisk?.velocity ?? 0) > 0 ? "↑" : (selectedAsset.currentRisk?.velocity ?? 0) < 0 ? "↓" : "→"}
                        &nbsp;{Math.abs(selectedAsset.currentRisk?.velocity ?? 0)} pts / cycle
                      </div>
                    </div>
                  </div>
                  <RiskScoreChart assetId={selectedAsset.id} compact />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submission Modal */}
      <SubmitAssetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
