#!/bin/bash
# ============================================================
# Wire Pub/Sub push subscriptions → Cloud Run services
# Run AFTER deploy.sh completes
# ============================================================

set -euo pipefail

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:-us-central1}"

# Load service URLs written by deploy.sh
source infrastructure/.service-urls.env

SA="degradation-watcher-sa@${PROJECT}.iam.gserviceaccount.com"

echo "🔗 Wiring Pub/Sub subscriptions..."

# Helper: create or replace a push subscription
create_push_sub() {
  local NAME="$1"
  local TOPIC="$2"
  local ENDPOINT="$3"

  # Delete if exists
  gcloud pubsub subscriptions delete "$NAME" \
    --project="$PROJECT" --quiet 2>/dev/null || true

  gcloud pubsub subscriptions create "$NAME" \
    --topic="$TOPIC" \
    --push-endpoint="$ENDPOINT" \
    --push-auth-service-account="$SA" \
    --ack-deadline=300 \
    --message-retention-duration=7d \
    --expiration-period=never \
    --project="$PROJECT"

  echo "   ✓ $NAME → $ENDPOINT"
}

# imagery-ready → orchestrator
create_push_sub \
  "imagery-ready-to-orchestrator" \
  "imagery-ready" \
  "${ORCH_URL}/pubsub"

# context-enricher-trigger → context-enricher
create_push_sub \
  "context-trigger-to-enricher" \
  "context-enricher-trigger" \
  "${CONTEXT_URL}/pubsub"

# risk-scorer-trigger → risk-scorer
create_push_sub \
  "risk-trigger-to-scorer" \
  "risk-scorer-trigger" \
  "${RISK_URL}/pubsub"

# response-drafter-trigger → response-drafter
create_push_sub \
  "drafter-trigger-to-drafter" \
  "response-drafter-trigger" \
  "${DRAFTER_URL}/pubsub"

echo ""
echo "✅ All Pub/Sub subscriptions wired."
echo ""
echo "Pipeline flow:"
echo "  Cloud Scheduler"
echo "    → imagery-service /run"
echo "    → [Pub/Sub: imagery-ready]"
echo "    → degradation-orchestrator"
echo "    → [Pub/Sub: context-enricher-trigger] → context-enricher"
echo "    → [Pub/Sub: risk-scorer-trigger]      → risk-scorer"
echo "    → [Pub/Sub: response-drafter-trigger] → response-drafter"
