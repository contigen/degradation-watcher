#!/bin/bash
# ============================================================
# Setup Cloud Scheduler to trigger imagery service every 5 days
# Run AFTER deploy.sh completes
# ============================================================

set -euo pipefail

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:-us-central1}"

source infrastructure/.service-urls.env

SA="degradation-watcher-sa@${PROJECT}.iam.gserviceaccount.com"

echo "⏱️  Setting up Cloud Scheduler..."

# Delete if exists
gcloud scheduler jobs delete imagery-batch-trigger \
  --location="$REGION" \
  --project="$PROJECT" \
  --quiet 2>/dev/null || true

# Every 5 days at 02:00 UTC (off-peak, good satellite availability)
gcloud scheduler jobs create http imagery-batch-trigger \
  --location="$REGION" \
  --project="$PROJECT" \
  --schedule="0 2 */5 * *" \
  --uri="${IMAGERY_URL}/run" \
  --http-method=POST \
  --oidc-service-account-email="$SA" \
  --oidc-token-audience="${IMAGERY_URL}" \
  --attempt-deadline=540s \
  --description="Trigger Sentinel-2 imagery fetch for all monitored assets"

echo "   ✓ Scheduler job: imagery-batch-trigger"
echo "   Schedule: 0 2 */5 * * (every 5 days at 02:00 UTC)"
echo "   Target: ${IMAGERY_URL}/run"
echo ""
echo "   To trigger immediately for testing:"
echo "   gcloud scheduler jobs run imagery-batch-trigger --location=$REGION --project=$PROJECT"
echo ""
echo "   Or trigger a single asset:"
echo "   curl -H 'Authorization: Bearer \$(gcloud auth print-identity-token)' \\"
echo "     -X POST ${IMAGERY_URL}/run/bridge_pittsburgh_fort_pitt"
