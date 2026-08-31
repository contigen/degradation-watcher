import { initializeApp, getApps } from 'firebase/app'
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  getDoc,
  updateDoc,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import type { Asset, Alert, DegradationRecord, RiskScore } from './types'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
}



const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const db = getFirestore(app)

// ── Assets ──────────────────────────────────────────────────

export async function getAllAssets(): Promise<Asset[]> {
  const snap = await getDocs(collection(db, 'assets'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Asset)
}

export async function getAsset(id: string): Promise<Asset | null> {
  const snap = await getDoc(doc(db, 'assets', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Asset) : null
}

export function subscribeToAssets(
  callback: (assets: Asset[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'assets'), where('monitoring.active', '==', true)),
    snap => {
      const assets = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Asset)
      callback(assets)
    },
  )
}

// ── Degradation Records ─────────────────────────────────────

export async function getDegradationHistory(
  assetId: string,
  maxRecords = 20,
): Promise<DegradationRecord[]> {
  const snap = await getDocs(
    query(
      collection(db, 'assets', assetId, 'degradation_records'),
      orderBy('captureDate', 'desc'),
      limit(maxRecords),
    ),
  )
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as DegradationRecord)
    .reverse()
}

export function subscribeToDegradationHistory(
  assetId: string,
  callback: (records: DegradationRecord[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'assets', assetId, 'degradation_records'),
      orderBy('captureDate', 'desc'),
      limit(30),
    ),
    snap => {
      const records = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as DegradationRecord)
        .reverse()
      callback(records)
    },
  )
}

// ── Alerts ──────────────────────────────────────────────────

export async function getPendingAlerts(): Promise<Alert[]> {
  const snap = await getDocs(
    query(
      collection(db, 'alerts'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(50),
    ),
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Alert)
}

export function subscribeToAlerts(
  callback: (alerts: Alert[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'alerts'),
      where('status', 'in', ['pending', 'acknowledged']),
      orderBy('createdAt', 'desc'),
      limit(50),
    ),
    snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Alert))
    },
  )
}

export async function acknowledgeAlert(
  alertId: string,
  userId = 'operator',
): Promise<void> {
  await updateDoc(doc(db, 'alerts', alertId), {
    status: 'acknowledged',
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: userId,
  })
}

export async function resolveAlert(alertId: string): Promise<void> {
  await updateDoc(doc(db, 'alerts', alertId), {
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
  })
}

// ── Risk Scores ─────────────────────────────────────────────

export async function getRiskScoreHistory(
  assetId: string,
): Promise<RiskScore[]> {
  const snap = await getDocs(
    query(
      collection(db, 'risk_scores'),
      where('assetId', '==', assetId),
      orderBy('scoredAt', 'asc'),
      limit(30),
    ),
  )
  return snap.docs.map(d => d.data() as RiskScore)
}

// ── Pipeline Logs ───────────────────────────────────────────

export function subscribeToPipelineLogs(
  assetId: string,
  callback: (
    logs: Array<{
      event: string
      timestamp: string
      details: Record<string, unknown>
    }>,
  ) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'pipeline_logs'),
      where('assetId', '==', assetId),
      orderBy('timestamp', 'desc'),
      limit(20),
    ),
    snap => {
      callback(
        snap.docs.map(
          d =>
            d.data() as {
              event: string
              timestamp: string
              details: Record<string, unknown>
            },
        ),
      )
    },
  )
}
