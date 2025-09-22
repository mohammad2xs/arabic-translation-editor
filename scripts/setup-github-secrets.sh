#!/bin/bash

# GitHub Secrets Setup Script
# This script helps you add the remaining secrets to GitHub easily

echo "🔐 GitHub Secrets Setup"
echo "======================"
echo ""

# Function to add secret
add_secret() {
    local secret_name=$1
    local secret_description=$2
    local secret_url=$3

    echo "📝 Setting up: $secret_name"
    echo "Description: $secret_description"
    if [ -n "$secret_url" ]; then
        echo "Get it from: $secret_url"
    fi
    echo ""

    read -s -p "Enter $secret_name (input hidden): " secret_value
    echo ""

    if [ -n "$secret_value" ]; then
        gh secret set "$secret_name" --body "$secret_value" --repo mohammad2xs/arabic-translation-editor
        echo "✅ $secret_name added successfully!"
    else
        echo "⚠️  Skipped $secret_name (empty value)"
    fi
    echo ""
}

echo "Adding the remaining required secrets..."
echo ""

# Required secrets
add_secret "VERCEL_TOKEN" "Vercel deployment token" "https://vercel.com/account/tokens"
add_secret "ANTHROPIC_API_KEY" "Your Claude API key" "https://console.anthropic.com/"
add_secret "VERCEL_BLOB_READ_WRITE_TOKEN" "Vercel Blob storage token" "https://vercel.com/dashboard/stores"

# Optional secrets
echo "Optional secrets (press Enter to skip):"
echo ""
add_secret "ELEVENLABS_API_KEY" "ElevenLabs TTS API key (optional)" "https://elevenlabs.io/app/speech-synthesis"

echo "🎉 Secret setup complete!"
echo ""
echo "✅ Already added:"
echo "   - VERCEL_ORG_ID"
echo "   - VERCEL_PROJECT_ID"
echo "   - SHARE_KEY (generated)"
echo "   - NEXT_PUBLIC_APP_URL"
echo ""
echo "🚀 Your GitHub Actions workflow is now ready!"
echo "   Check: https://github.com/mohammad2xs/arabic-translation-editor/actions"