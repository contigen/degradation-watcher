import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const assetData = await req.json();
    if (!assetData || !assetData.id) {
      return NextResponse.json({ error: 'Asset ID and data are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const docToSave = {
      ...assetData,
      createdAt: now,
      updatedAt: now,
    };

    // Save with Admin SDK to bypass client security rules
    await adminDb.collection('assets').doc(assetData.id).set(docToSave);

    // Call imagery service in background to trigger Sentinel-2 pipeline
    const imageryUrl = process.env.IMAGERY_SERVICE_URL || 'https://imagery-service-hotx43jlqq-uc.a.run.app';
    fetch(`${imageryUrl}/run/${assetData.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => {
      console.warn('Background imagery fetch notification:', err);
    });

    return NextResponse.json({ status: 'success', assetId: assetData.id });
  } catch (error: unknown) {
    console.error('Failed to create asset via Admin SDK:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
