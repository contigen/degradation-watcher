#!/bin/bash
# ============================================================
# Degradation Watcher — GCP Infrastructure Setup
# Run once after enabling APIs:
#   gcloud services enable run.googleapis.com pubsub.googleapis.com
#     firestore.googleapis.com cloudscheduler.googleapis.com
#     aiplatform.googleapis.com
# ============================================================

set -euo pipefail

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:-us-central1}"
GCS_BUCKET="${GCS_BUCKET:-${PROJECT}-degradation-imagery}"

echo "🛰️  Setting up Degradation Watcher infrastructure"
echo "   Project: $PROJECT | Region: $REGION"

# ── GCS Bucket ───────────────────────────────────────────────
echo ""
echo "── Creating GCS bucket..."
gcloud storage buckets create "gs://$GCS_BUCKET" \
  --project="$PROJECT" \
  --location="$REGION" \
  --uniform-bucket-level-access 2>/dev/null || echo "   Bucket already exists"

# ── Firestore ────────────────────────────────────────────────
echo ""
echo "── Initialising Firestore (Native mode)..."
gcloud firestore databases create \
  --project="$PROJECT" \
  --location="$REGION" \
  --type=firestore-native 2>/dev/null || echo "   Firestore already initialised"

# Create composite indexes
echo "   Creating Firestore indexes..."
cat > /tmp/firestore.indexes.json << 'EOF'
{
  "indexes": [
    {
      "collectionGroup": "alerts",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "risk_scores",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "assetId", "order": "ASCENDING"},
        {"fieldPath": "scoredAt", "order": "ASCENDING"}
      ]
    },
    {
      "collectionGroup": "pipeline_logs",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "assetId", "order": "ASCENDING"},
        {"fieldPath": "timestamp", "order": "DESCENDING"}
      ]
    }
  ],
  "fieldOverrides": []
}
EOF
gcloud firestore indexes create /tmp/firestore.indexes.json \
  --project="$PROJECT" 2>/dev/null || echo "   Indexes already exist or pending creation"

# ── Pub/Sub Topics ───────────────────────────────────────────
echo ""
echo "── Creating Pub/Sub topics..."

TOPICS=(
  "imagery-ready"
  "context-enricher-trigger"
  "analyst-trigger"
  "risk-scorer-trigger"
  "risk-result"
  "response-drafter-trigger"
  "alert-created"
)

for TOPIC in "${TOPICS[@]}"; do
  gcloud pubsub topics create "$TOPIC" \
    --project="$PROJECT" 2>/dev/null || echo "   Topic $TOPIC already exists"
  echo "   ✓ $TOPIC"
done

# ── Pub/Sub Subscriptions (push to Cloud Run) ─────────────────
echo ""
echo "── Creating push subscriptions..."
echo "   (Services must be deployed first — run deploy.sh, then rerun this)"

create_push_sub() {
  local TOPIC="$1"
  local SERVICE="$2"
  local SUB_NAME="$3"
  local ENDPOINT="https://${SERVICE}-$(gcloud run services describe $SERVICE \
    --region=$REGION --project=$PROJECT \
    --format='value(status.url)' 2>/dev/null | sed 's|https://||' | cut -d- -f1 2>/dev/null || echo 'PENDING').a.run.app/pubsub"

  gcloud pubsub subscriptions create "$SUB_NAME" \
    --topic="$TOPIC" \
    --push-endpoint="$ENDPOINT" \
    --ack-deadline=300 \
    --message-retention-duration=7d \
    --project="$PROJECT" 2>/dev/null || echo "   Sub $SUB_NAME already exists"
}

# Will be wired after services are deployed
echo "   Run infrastructure/wire-subscriptions.sh after deploying Cloud Run services"

# ── Service Account ──────────────────────────────────────────
echo ""
echo "── Creating service account..."
gcloud iam service-accounts create degradation-watcher-sa \
  --display-name="Degradation Watcher Service Account" \
  --project="$PROJECT" 2>/dev/null || echo "   SA already exists"

SA="degradation-watcher-sa@${PROJECT}.iam.gserviceaccount.com"

ROLES=(
  "roles/datastore.user"
  "roles/pubsub.publisher"
  "roles/pubsub.subscriber"
  "roles/storage.objectAdmin"
  "roles/aiplatform.user"
  "roles/run.invoker"
)

for ROLE in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" \
    --role="$ROLE" \
    --quiet 2>/dev/null || true
done
echo "   ✓ Service account $SA configured"

# ── Cloud Scheduler ──────────────────────────────────────────
echo ""
echo "── Creating Cloud Scheduler job (every 5 days)..."

# The scheduler will call the imagery service's /run endpoint
# Service URL will be set after deployment
echo "   Run infrastructure/setup-scheduler.sh after deploying imagery service"

echo ""
echo "✅ Infrastructure setup complete."
echo ""
echo "Next steps:"
echo "  1. Deploy services:   bash infrastructure/deploy.sh"
echo "  2. Wire Pub/Sub:      bash infrastructure/wire-subscriptions.sh"
echo "  3. Setup scheduler:   bash infrastructure/setup-scheduler.sh"
echo "  4. Seed Firestore:    node infrastructure/seed-assets.js"
echo "  5. Run dashboard:     cd apps/web && npm run dev"
