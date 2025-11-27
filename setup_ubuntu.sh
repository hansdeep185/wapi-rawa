#!/bin/bash

# WhatsApp AI Bot - Ubuntu Server Setup Script
# This script installs all required dependencies for running the bot on Ubuntu Server

set -e

echo "🚀 WhatsApp AI Bot - Ubuntu Server Setup"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
  echo "⚠️  Please don't run this script as root"
  exit 1
fi

# Update package list
echo "📦 Updating package list..."
sudo apt-get update

# Install Node.js (if not already installed)
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js already installed: $(node -v)"
fi

# Install Chromium and dependencies
echo "📦 Installing Chromium and dependencies..."
sudo apt-get install -y \
    chromium-browser \
    chromium-codecs-ffmpeg \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1

# Install additional dependencies for headless mode
echo "📦 Installing additional dependencies..."
sudo apt-get install -y \
    gconf-service \
    libgconf-2-4 \
    libappindicator1 \
    libappindicator3-1 \
    libxss1 \
    libxtst6 \
    xvfb

# Install PostgreSQL (if needed)
read -p "📊 Do you want to install PostgreSQL? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Installing PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-contrib
    
    echo "✅ PostgreSQL installed"
    echo "⚠️  Don't forget to:"
    echo "   1. Create database: sudo -u postgres createdb whatsapp_ai_bot"
    echo "   2. Create user: sudo -u postgres createuser your_username"
    echo "   3. Grant privileges: sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE whatsapp_ai_bot TO your_username;\""
fi

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install project dependencies
if [ -f "package.json" ]; then
    echo "📦 Installing project dependencies..."
    npm install
else
    echo "⚠️  package.json not found. Make sure you're in the project directory."
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p wa-session
mkdir -p uploads
mkdir -p logs

# Set permissions
chmod 755 wa-session
chmod 755 uploads
chmod 755 logs

# Find Chromium path
CHROMIUM_PATH=$(which chromium-browser)
echo ""
echo "✅ Setup completed successfully!"
echo ""
echo "📝 Chromium installed at: $CHROMIUM_PATH"
echo ""
echo "📋 Next steps:"
echo "1. Copy .env.example to .env: cp .env.example .env"
echo "2. Update .env file with your configuration"
echo "3. Set WA_CHROMIUM_PATH=$CHROMIUM_PATH in .env"
echo "4. Create database and run migrations"
echo "5. Start the application: npm start"
echo ""
echo "🚀 For production with PM2:"
echo "   pm2 start src/index.js --name whatsapp-bot"
echo "   pm2 save"
echo "   pm2 startup"
echo ""