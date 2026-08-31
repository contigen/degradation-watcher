import { adminDb } from "../../../lib/firebase-admin";
import AssetView from "./AssetView";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id: assetId } = await params;

  const assetDoc = await adminDb.collection("assets").doc(assetId).get();
  const asset = assetDoc.exists ? { id: assetDoc.id, ...assetDoc.data() } : null;

  const recordsSnap = await adminDb
    .collection("assets")
    .doc(assetId)
    .collection("degradation_records")
    .orderBy("captureDate", "desc")
    .get();
  const records = recordsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!asset) {
    return (
      <div className="text-gray-500 p-10 lowercase font-mono text-sm">
        asset not found.
      </div>
    );
  }

  return <AssetView asset={asset} records={records} />;
}
