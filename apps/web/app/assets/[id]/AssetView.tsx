'use client'
import { useState } from 'react'
import Image from 'next/image'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, ReferenceLine } from 'recharts'
import Link from 'next/link'

type AssetData = {
  id: string
  name?: string
  type?: string
  currentRisk?: {
    score?: number
    level?: string
    velocity?: number
  }
  coordinates?: {
    lat?: number
    lng?: number
  }
  metadata?: {
    cropType?: string
    structureType?: string
    fieldAreaHectares?: number
  }
  monitoring?: {
    frequencyDays?: number
  }
}

type RecordData = {
  id?: string
  captureDate?: string
  imageUrls?: string[]
  imageComparisonUrls?: string[]
  visualAnalysis?: {
    changeSeverity?: number
    confidence?: number
    reasoning?: string
    recommendedAction?: string
  }
  riskScore?: {
    score?: number
    riskLevel?: string
    components?: {
      visualChangeScore?: number
      weatherStressScore?: number
      seismicScore?: number
      ageScore?: number
    }
  }
}

export default function AssetView({ asset, records }: { asset: AssetData, records: RecordData[] }) {
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0)
  const selectedRecord = records[selectedRecordIndex] || records[0]
  const score = asset?.currentRisk?.score ?? 0

  const chartData = [...records].reverse().map((r, i) => {
    const recSeverity = r.visualAnalysis?.changeSeverity ?? 1
    return {
      name: r.captureDate ? new Date(r.captureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Cap ' + (i + 1),
      captureDate: r.captureDate,
      score: r.riskScore?.score ?? (recSeverity * 8 + (r.riskScore?.components?.seismicScore ?? 8)),
      severity: recSeverity,
    }
  })

  let images: string[] = []
  if (selectedRecord?.imageComparisonUrls && selectedRecord.imageComparisonUrls.length > 0) {
    images = selectedRecord.imageComparisonUrls.filter((u: string) => u.endsWith('.png'))
  } else if (selectedRecord?.imageUrls && selectedRecord.imageUrls.length > 0) {
    const pngsInRecord = selectedRecord.imageUrls.filter((u: string) => u.endsWith('.png'))
    if (pngsInRecord.length > 1) {
      images = pngsInRecord
    } else if (pngsInRecord.length === 1) {
      const currentPng = pngsInRecord[0]
      const previousRecord = records[selectedRecordIndex + 1]
      const previousPng = previousRecord?.imageUrls?.find((u: string) => u.endsWith('.png'))
      if (previousPng && previousPng !== currentPng) {
        images = [previousPng, currentPng]
      } else {
        images = [currentPng]
      }
    }
  }

  const visualSeverity = selectedRecord?.visualAnalysis?.changeSeverity ?? 0
  const components = selectedRecord?.riskScore?.components
  const visualScore = components?.visualChangeScore ?? Math.round(visualSeverity * 8)
  const weatherScore = components?.weatherStressScore ?? 0
  const seismicScore = components?.seismicScore ?? 8
  const ageScore = components?.ageScore ?? 0
  const displayScore = components
    ? visualScore + weatherScore + seismicScore + ageScore
    : score

  return (
    <div className="max-w-7xl mx-auto space-y-6 lowercase font-mono pb-20">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-5">
        <div className="flex items-center gap-4">
          <Link href="/assets" className="text-gray-500 hover:text-white transition-colors text-xs">
            ← all assets
          </Link>
          <h1 className="text-lg font-semibold text-white ml-2">{asset?.name || asset?.id}</h1>
          <div className="px-2 py-0.5 border border-[#2f2f2f] text-blue-400 text-xs">
            {asset?.currentRisk?.level || 'moderate'}
          </div>
          <div className="text-gray-500 text-xs flex items-center gap-1">
            <span>{asset?.type || 'farmland'}</span>
          </div>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-[#1f1f1f] bg-[#050505] p-5">
          <div className="text-gray-500 text-xs mb-3">recommended action</div>
          <div className="text-blue-400 font-medium text-xs mb-3">
            {selectedRecord?.visualAnalysis?.recommendedAction?.replace(/_/g, ' ') || 'schedule inspection'}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 flex items-center justify-center rounded-full border-2 border-blue-500/30">
              <span className="text-lg font-semibold text-white">{displayScore}</span>
            </div>
            <div className="text-xs text-gray-500">
              <div className="text-gray-300 mb-0.5">score velocity</div>
              <div className="text-gray-400">↑ {asset?.currentRisk?.velocity ?? 2} pts/cycle</div>
              <div className="mt-1.5 text-blue-400/80 text-[11px]">
                {asset?.coordinates?.lat?.toFixed(4)}, {asset?.coordinates?.lng?.toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        <div className="border border-[#1f1f1f] bg-[#050505] p-5 flex flex-col justify-between">
          <div className="text-gray-500 text-xs">crop / structure</div>
          <div>
            <div className="text-white text-base font-medium">
              {asset?.metadata?.cropType || asset?.metadata?.structureType || 'Almonds'}
            </div>
            <div className="text-gray-500 text-xs mt-1">
              {asset?.metadata?.fieldAreaHectares ? (asset.metadata.fieldAreaHectares + 'ha') : '190ha'}
            </div>
          </div>
        </div>

        <div className="border border-[#1f1f1f] bg-[#050505] p-5 flex flex-col justify-between">
          <div className="text-gray-500 text-xs">monitoring cadence</div>
          <div>
            <div className="text-white text-base font-medium">
              {asset?.monitoring?.frequencyDays ? (asset.monitoring.frequencyDays + 'd') : '5d'}
            </div>
            <div className="text-gray-500 text-xs mt-1">Sentinel-2</div>
          </div>
        </div>

        <div className="border border-[#1f1f1f] bg-[#050505] p-5 flex flex-col justify-between">
          <div className="text-gray-500 text-xs">records</div>
          <div>
            <div className="text-white text-base font-medium">{records.length}</div>
            <div className="text-gray-500 text-xs mt-1">captures logged</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="border border-[#1f1f1f] bg-[#050505] p-5">
        <div className="flex justify-between text-gray-500 text-xs mb-4">
          <span>risk score history</span>
          <span>last {records.length} captures</span>
        </div>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <ReferenceLine y={40} stroke="#1f1f1f" strokeDasharray="3 3" />
              <ReferenceLine y={70} stroke="#1f1f1f" strokeDasharray="3 3" />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#050505',
                  border: '1px solid #2f2f2f',
                  fontSize: '11px',
                  color: '#fff',
                }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#000', stroke: '#3b82f6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Timeline (Interactive) */}
        <div className="border border-[#1f1f1f] bg-[#050505] p-5 lg:col-span-1">
          <div className="text-gray-500 text-xs mb-5 uppercase tracking-wider">
            capture timeline
          </div>
          <div className="space-y-4 relative pl-4 border-l border-[#1f1f1f]">
            {records.map((r, i) => {
              const isSelected = i === selectedRecordIndex
              const sev = r.visualAnalysis?.changeSeverity ?? 0
              return (
                <div
                  key={i}
                  onClick={() => setSelectedRecordIndex(i)}
                  className={
                    "relative cursor-pointer p-2.5 transition-all " +
                    (isSelected
                      ? "bg-[#0e131b] border border-[#23354d]"
                      : "hover:bg-[#0a0a0a] border border-transparent")
                  }
                >
                  <div
                    className={
                      "absolute -left-[23px] top-4 w-2 h-2 rounded-full transition-all " +
                      (isSelected
                        ? "bg-blue-400 ring-4 ring-blue-500/20"
                        : "bg-gray-600")
                    }
                  ></div>
                  <div className="text-xs text-gray-300 font-medium mb-1">
                    {r.captureDate}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "text-[11px] px-1.5 py-0.5 border " +
                        (sev >= 4
                          ? "text-orange-400 border-orange-950 bg-orange-950/20"
                          : "text-blue-400 border-blue-950 bg-blue-950/20")
                      }
                    >
                      severity {sev}/5
                    </span>
                    {isSelected && (
                      <span className="text-[10px] text-blue-400">● active</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Analysis Detail for Selected Capture */}
        <div className="border border-[#1f1f1f] bg-[#050505] p-5 lg:col-span-3 flex flex-col space-y-5">
          <div className="flex justify-between items-center pb-3 border-b border-[#1f1f1f]">
            <span className="text-gray-400 text-xs font-medium">
              analysis — {selectedRecord?.captureDate}
            </span>
            <span className="border border-[#2f2f2f] px-2 py-0.5 text-blue-400 text-xs">
              severity {visualSeverity}/5
            </span>
          </div>

          <div>
            <div className="text-gray-500 text-xs mb-3">
              temporal diffing (satellite imagery)
            </div>

            {images.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {images
                  .filter((u) => u.endsWith('png'))
                  .map((url, i, arr) => (
                    <div
                      key={i}
                      className="border border-[#1f1f1f] bg-[#000000]"
                    >
                      <div className="text-gray-500 text-[10px] p-2 border-b border-[#1f1f1f] flex justify-between">
                        <span>
                          {arr.length > 1
                            ? i === 0
                              ? 'previous capture'
                              : 'current capture'
                            : 'current capture'}
                        </span>
                        <span className="text-gray-600">Sentinel-2 Visual</span>
                      </div>
                      <div className="relative w-full aspect-[16/9]">
                        <Image
                          src={url.replace(
                            'gs://',
                            'https://storage.googleapis.com/'
                          )}
                          alt="Satellite view"
                          fill
                          style={{ objectFit: 'cover' }}
                          sizes="(max-width: 768px) 100vw, 50vw"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="h-48 border border-[#1f1f1f] flex items-center justify-center text-gray-500 text-xs">
                no imagery available for this capture
              </div>
            )}
          </div>

          <div>
            <div className="text-gray-500 text-xs mb-2">
              gemini multimodal analysis
            </div>
            <div className="border border-[#1f1f1f] p-4 text-gray-300 text-xs leading-relaxed border-l-2 border-l-blue-500 bg-[#080808]">
              {selectedRecord?.visualAnalysis?.reasoning ||
                'No visual analysis commentary available for this capture.'}
            </div>
          </div>

          <div>
            <div className="text-gray-500 text-xs mb-2">score breakdown</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="border border-[#1f1f1f] bg-[#080808] p-3 flex justify-between items-center">
                <span className="text-gray-500 text-xs">visual change</span>
                <span className="text-white font-medium text-xs">
                  {visualScore}/40
                </span>
              </div>
              <div className="border border-[#1f1f1f] bg-[#080808] p-3 flex justify-between items-center">
                <span className="text-gray-500 text-xs">weather stress</span>
                <span className="text-white font-medium text-xs">
                  {weatherScore}/30
                </span>
              </div>
              <div className="border border-[#1f1f1f] bg-[#080808] p-3 flex justify-between items-center">
                <span className="text-gray-500 text-xs">seismic</span>
                <span className="text-white font-medium text-xs">
                  {seismicScore}/15
                </span>
              </div>
              <div className="border border-[#1f1f1f] bg-[#080808] p-3 flex justify-between items-center">
                <span className="text-gray-500 text-xs">asset age</span>
                <span className="text-white font-medium text-xs">
                  {ageScore}/15
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
