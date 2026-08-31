"use client";

import { useEffect, useRef, useState } from "react";
import type { Asset } from "../../lib/types";
import { RISK_COLORS } from "../../lib/types";

interface AssetMapProps {
  assets: Asset[];
  onAssetSelect?: (asset: Asset) => void;
  selectedAssetId?: string;
}

// Map marker colours by risk level
function getRiskColor(asset: Asset): string {
  return RISK_COLORS[asset.currentRisk?.level ?? "low"];
}

export default function AssetMap({ assets, onAssetSelect, selectedAssetId }: AssetMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Dynamic import to avoid SSR issues with MapLibre
    import("maplibre-gl").then(({ default: maplibregl }) => {
      import("maplibre-gl/dist/maplibre-gl.css");

      const map = new maplibregl.Map({
        container: mapContainer.current!,
        // Free dark satellite-style tiles from Stadia Maps
        style: {
          version: 8,
          sources: {
            "stadia-dark": {
              type: "raster",
              tiles: [
                "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}@2x.jpg",
              ],
              tileSize: 256,
              attribution: "© Stadia Maps © OpenStreetMap contributors",
            },
          },
          layers: [{ id: "background", type: "raster", source: "stadia-dark" }],
        },
        center: [-98.5, 39.5], // Continental US centre
        zoom: 4,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        setMapLoaded(true);
        mapRef.current = map;
      });
    });

    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Render markers whenever assets or map changes
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      const map = mapRef.current as { remove: () => void } & {
        flyTo: (opts: unknown) => void;
      };

      // Clear existing markers
      markersRef.current.forEach((m) => (m as { remove: () => void }).remove());
      markersRef.current = [];

      assets.forEach((asset) => {
        const color = getRiskColor(asset);
        const isSelected = asset.id === selectedAssetId;
        const size = isSelected ? 16 : 11;

        // Custom marker element
        const el = document.createElement("div");
        el.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${color};
          border: ${isSelected ? "2px solid white" : "1.5px solid rgba(255,255,255,0.4)"};
          cursor: pointer;
          box-shadow: 0 0 ${isSelected ? "12px" : "6px"} ${color}88;
          transition: all 0.2s;
          position: relative;
        `;

        // Pulse ring for critical assets
        if (asset.currentRisk?.level === "critical") {
          const ring = document.createElement("div");
          ring.style.cssText = `
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            border: 1.5px solid ${color};
            animation: ping 1.5s ease-out infinite;
            opacity: 0;
          `;
          el.appendChild(ring);

          // Inject ping keyframe if not present
          if (!document.getElementById("ping-style")) {
            const style = document.createElement("style");
            style.id = "ping-style";
            style.textContent = `
              @keyframes ping {
                0% { transform: scale(1); opacity: 0.7; }
                100% { transform: scale(2.2); opacity: 0; }
              }
            `;
            document.head.appendChild(style);
          }
        }

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([asset.coordinates.lng, asset.coordinates.lat])
          .addTo(mapRef.current as Parameters<typeof maplibregl.Marker.prototype.addTo>[0]);

        // Tooltip popup
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "asset-popup",
        }).setHTML(`
          <div style="
            background: #0f1318;
            border: 1px solid #1e2836;
            border-radius: 6px;
            padding: 10px 14px;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 11px;
            color: #e2eaf4;
            min-width: 160px;
          ">
            <div style="font-weight:600;margin-bottom:4px;font-family:'Inter',sans-serif;font-size:12px;">
              ${asset.name}
            </div>
            <div style="color:#8fa3bc;margin-bottom:8px;">${asset.type}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:${color};font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">
                ${asset.currentRisk?.level ?? "unscored"}
              </span>
              <span style="color:#60a5fa;">
                ${asset.currentRisk?.score ?? "—"}/100
              </span>
            </div>
          </div>
        `);

        el.addEventListener("mouseenter", () => {
          (marker as { setPopup: (p: unknown) => unknown }).setPopup(popup);
          popup.addTo(mapRef.current as Parameters<typeof popup.addTo>[0]);
        });
        el.addEventListener("mouseleave", () => popup.remove());
        el.addEventListener("click", () => onAssetSelect?.(asset));

        markersRef.current.push(marker);
      });
    });
  }, [assets, mapLoaded, selectedAssetId, onAssetSelect]);

  // Fly to selected asset
  useEffect(() => {
    if (!selectedAssetId || !mapRef.current) return;
    const asset = assets.find((a) => a.id === selectedAssetId);
    if (!asset) return;
    (mapRef.current as { flyTo: (opts: unknown) => void }).flyTo({
      center: [asset.coordinates.lng, asset.coordinates.lat],
      zoom: 12,
      duration: 1200,
      essential: true,
    });
  }, [selectedAssetId, assets]);

  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100%", background: "#080c10" }}
    />
  );
}
