#!/bin/bash
# SmartJob Hunter — DigitalOcean Droplet Setup
# Run this on a fresh Ubuntu 22.04 Droplet as root (or with sudo)
# Usage: bash setup-droplet.sh

set -e

echo "==> Updating system..."
apt-get update -y && apt-get upgrade -y

echo "==> Installing Docker..."
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Starting Docker..."
systemctl enable docker
systemctl start docker

echo "==> Creating app directory..."
mkdir -p /opt/smartjob
echo ""
echo "✅ Docker installed successfully"
echo ""
echo "Next steps:"
echo "  1. Upload your project files to /opt/smartjob/ (use scp or git clone)"
echo "  2. cd /opt/smartjob"
echo "  3. cp .env.template .env"
echo "  4. Edit .env with your real values"
echo "  5. docker compose up -d"
echo ""
echo "Upload command (run from your local machine):"
echo "  scp -r . root@YOUR_DROPLET_IP:/opt/smartjob/"
