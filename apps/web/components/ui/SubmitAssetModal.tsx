'use client';

import { useState, useEffect, useRef } from "react";
import type { Asset } from "../../lib/types";

type SubmitAssetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (assetId: string) => void;
};

const PRESETS = [
  { name: "Salinas Valley Lettuce & Greens", lat: 36.6777, lng: -121.6555, crop: "lettuce", area: 120, soil: "Salinas clay loam", irrigation: "drip" },
  { name: "San Joaquin Valley Vineyards", lat: 36.7468, lng: -119.7726, crop: "grapes", area: 210, soil: "San Joaquin loam", irrigation: "drip" },
  { name: "Imperial Valley Alfalfa", lat: 32.8349, lng: -115.5684, crop: "alfalfa", area: 310, soil: "Imperial silty clay", irrigation: "furrow" },
  { name: "Sacramento Valley Rice Fields", lat: 39.1413, lng: -121.6297, crop: "rice", area: 450, soil: "Willows clay", irrigation: "flood" },
];

export default function SubmitAssetModal({ isOpen, onClose, onSuccess }: SubmitAssetModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("36.7783");
  const [lng, setLng] = useState("-119.4179");
  const [cropType, setCropType] = useState("almonds");
  const [area, setArea] = useState("180");
  const [soilType, setSoilType] = useState("Hanford sandy loam");
  const [irrigationType, setIrrigationType] = useState("drip");
  const [alertThreshold, setAlertThreshold] = useState("60");
  const [frequencyDays, setFrequencyDays] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    setLat(preset.lat.toString());
    setLng(preset.lng.toString());
    setCropType(preset.crop);
    setArea(preset.area.toString());
    setSoilType(preset.soil);
    setIrrigationType(preset.irrigation);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedArea = parseFloat(area) || 100;
    const parsedThreshold = parseInt(alertThreshold, 10) || 60;
    const parsedFreq = parseInt(frequencyDays, 10) || 5;

    if (!name.trim()) {
      setError("Please enter a farm or parcel name");
      return;
    }
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setError("Please enter valid decimal coordinates (lat/lng)");
      return;
    }

    setSubmitting(true);
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24);
      const assetId = "farm_" + cropType.toLowerCase() + "_" + slug + "_" + Math.random().toString(36).slice(2, 6);

      const assetData: Omit<Asset, "createdAt" | "updatedAt"> = {
        id: assetId,
        name: name.trim(),
        type: "farmland",
        coordinates: {
          lat: parsedLat,
          lng: parsedLng,
        },
        bbox: {
          north: parsedLat + 0.05,
          south: parsedLat - 0.05,
          east: parsedLng + 0.05,
          west: parsedLng - 0.05,
        },
        metadata: {
          cropType: cropType.trim().toLowerCase(),
          fieldAreaHectares: parsedArea,
          soilType: soilType.trim(),
          irrigationType: irrigationType.trim(),
          sourceDataset: "USER_SUBMITTED",
        },
        monitoring: {
          active: true,
          frequencyDays: parsedFreq,
          alertThreshold: parsedThreshold,
          notifyEmails: [],
        },
        currentRisk: {
          level: "low",
          score: 0,
          velocity: 0,
          updatedAt: new Date().toISOString(),
        },
      };

      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to create asset" }));
        throw new Error(errData.error || "Failed to register asset in Firestore");
      }

      if (onSuccess) onSuccess(assetId);
      onClose();
    } catch (err: unknown) {
      console.error("Failed to submit asset:", err);
      setError(err instanceof Error ? err.message : "Failed to register asset in Firestore");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#050505",
          border: "1px solid #222",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          fontFamily: "var(--font-data), monospace",
          color: "#e5e5e5",
          padding: "28px",
          boxShadow: "0 0 50px rgba(0,0,0,0.9)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", borderBottom: "1px solid #1f1f1f", paddingBottom: "14px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
              Agricultural Ingest
            </div>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0 }}>
              Submit Farmland for Satellite Monitoring
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#666", fontSize: "16px", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Quick Presets */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#666", marginBottom: "8px" }}>
            Quick Agricultural Presets
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {PRESETS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleApplyPreset(p)}
                style={{
                  fontSize: "11px",
                  background: "#0c0f14",
                  border: "1px solid #1f2f45",
                  color: "#93c5fd",
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                + {p.name.split(" ")[0]} ({p.crop})
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: "#2d0c0e", border: "1px solid #7f1d1d", color: "#ef4444", padding: "10px 14px", fontSize: "11px", marginBottom: "16px" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Farm Name */}
          <div>
            <label style={{ fontSize: "10px", textTransform: "uppercase", color: "#777", display: "block", marginBottom: "4px" }}>
              Farm / Parcel Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Salinas Valley Broccoli Field #4"
              style={{
                width: "100%",
                background: "#000",
                border: "1px solid #262626",
                color: "#fff",
                padding: "8px 12px",
                fontSize: "12px",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Coordinates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "10px", textTransform: "uppercase", color: "#777", display: "block", marginBottom: "4px" }}>
                Latitude (deg N) *
              </label>
              <input
                type="text"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="36.7783"
                style={{
                  width: "100%",
                  background: "#000",
                  border: "1px solid #262626",
                  color: "#fff",
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: "10px", textTransform: "uppercase", color: "#777", display: "block", marginBottom: "4px" }}>
                Longitude (deg W) *
              </label>
              <input
                type="text"
                required
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-119.4179"
                style={{
                  width: "100%",
                  background: "#000",
                  border: "1px solid #262626",
                  color: "#fff",
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Crop & Field Area */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "10px", textTransform: "uppercase", color: "#777", display: "block", marginBottom: "4px" }}>
                Crop Type
              </label>
              <select
                value={cropType}
                onChange={(e) => setCropType(e.target.value)}
                style={{
                  width: "100%",
                  background: "#000",
                  border: "1px solid #262626",
                  color: "#fff",
                  padding: "8px 10px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              >
                <option value="almonds">Almonds (Orchard)</option>
                <option value="corn">Corn (Grain / Silage)</option>
                <option value="winter_wheat">Winter Wheat</option>
                <option value="soybeans">Soybeans</option>
                <option value="grapes">Wine / Table Grapes</option>
                <option value="citrus">Citrus (Oranges / Lemons)</option>
                <option value="apples">Apples</option>
                <option value="cotton">Cotton</option>
                <option value="peanuts">Peanuts</option>
                <option value="lettuce">Lettuce / Leafy Greens</option>
                <option value="rice">Rice (Paddy)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "10px", textTransform: "uppercase", color: "#777", display: "block", marginBottom: "4px" }}>
                Area (Hectares)
              </label>
              <input
                type="number"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="180"
                style={{
                  width: "100%",
                  background: "#000",
                  border: "1px solid #262626",
                  color: "#fff",
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Soil & Irrigation */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "10px", textTransform: "uppercase", color: "#777", display: "block", marginBottom: "4px" }}>
                Soil Classification
              </label>
              <input
                type="text"
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                placeholder="e.g. Sandy loam"
                style={{
                  width: "100%",
                  background: "#000",
                  border: "1px solid #262626",
                  color: "#fff",
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: "10px", textTransform: "uppercase", color: "#777", display: "block", marginBottom: "4px" }}>
                Irrigation Mechanism
              </label>
              <select
                value={irrigationType}
                onChange={(e) => setIrrigationType(e.target.value)}
                style={{
                  width: "100%",
                  background: "#000",
                  border: "1px solid #262626",
                  color: "#fff",
                  padding: "8px 10px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              >
                <option value="drip">Drip Irrigation (Precision)</option>
                <option value="center_pivot">Center Pivot (Sprinkler)</option>
                <option value="furrow">Furrow / Surface Flood</option>
                <option value="micro-sprinkler">Micro-Sprinkler</option>
                <option value="micro-jet">Micro-Jet</option>
                <option value="rainfed">Rainfed (Dryland)</option>
              </select>
            </div>
          </div>

          {/* Cadence & Alert Threshold */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#0a0a0a", border: "1px solid #1a1a1a", padding: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#666", marginBottom: "4px" }}>
                Satellite Cadence
              </div>
              <div style={{ fontSize: "12px", color: "#93c5fd" }}>
                5-day Sentinel-2 Revisit
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#666", marginBottom: "4px" }}>
                Alert Risk Trigger
              </div>
              <div style={{ fontSize: "12px", color: "#f59e0b" }}>
                Risk Score ≥ {alertThreshold}/100
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px", borderTop: "1px solid #1f1f1f", paddingTop: "16px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #333",
                color: "#999",
                padding: "8px 16px",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: "#1e3a8a",
                border: "1px solid #3b82f6",
                color: "#fff",
                padding: "8px 20px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {submitting ? "Registering Farmland…" : "Submit for Sentinel-2 Monitoring →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
