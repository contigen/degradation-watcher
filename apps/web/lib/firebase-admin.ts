import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// In a real app, use a service account key or ADC.
// For GCP/Cloud Run, ADC is used automatically if no cert is provided.
if (!getApps().length) {
  initializeApp({ projectId: 'cloudrun-project-476210' });
}

export const adminDb = getFirestore();
