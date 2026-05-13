#!/bin/bash
# Register Telegram webhook after n8n is live at your domain
# Run from the Droplet after docker compose up -d
# Usage: bash scripts/register-webhook.sh

set -e

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$DOMAIN" ] || [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
  echo "Load .env first: set -a && source .env && set +a"
  exit 1
fi

WEBHOOK_URL="https://${DOMAIN}/webhook/telegram-callback"

echo "==> Registering Telegram webhook..."
echo "    URL: $WEBHOOK_URL"
echo ""

RESPONSE=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}&secret_token=${TELEGRAM_WEBHOOK_SECRET}")
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo ""
  echo "✅ Webhook registered successfully"
else
  echo ""
  echo "❌ Webhook registration failed. Check that:"
  echo "   - n8n is running: docker compose ps"
  echo "   - HTTPS is working: curl https://${DOMAIN}"
  echo "   - Telegram node in n8n has path set to 'telegram-callback'"
fi

echo ""
echo "==> Verifying webhook..."
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool 2>/dev/null || curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
