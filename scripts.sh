#!/bin/bash

# Helper scripts for WhatsApp AI Bot

case "$1" in
  "setup")
    echo "🚀 Setting up WhatsApp AI Bot..."
    echo ""
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    echo "✅ Node.js installed: $(node -v)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is not installed."
        exit 1
    fi
    echo "✅ npm installed: $(npm -v)"
    
    # Install dependencies
    echo ""
    echo "📦 Installing dependencies..."
    npm install
    
    # Create .env if not exists
    if [ ! -f .env ]; then
        echo ""
        echo "📝 Creating .env file..."
        cp .env.example .env
        echo "✅ .env file created. Please edit it with your configuration."
    else
        echo "ℹ️  .env file already exists"
    fi
    
    # Create directories
    echo ""
    echo "📁 Creating directories..."
    mkdir -p wa-session uploads logs
    
    echo ""
    echo "✅ Setup completed!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Edit .env file with your configuration"
    echo "2. Setup database: npm run setup-db"
    echo "3. Start application: npm start"
    ;;
    
  "setup-db")
    echo "📊 Setting up database..."
    
    # Check if .env exists
    if [ ! -f .env ]; then
        echo "❌ .env file not found. Run './scripts.sh setup' first."
        exit 1
    fi
    
    # Load .env
    export $(cat .env | grep -v '^#' | xargs)
    
    echo "Creating database: $DB_NAME"
    
    # Try to create database
    if command -v createdb &> /dev/null; then
        createdb $DB_NAME 2>/dev/null && echo "✅ Database created" || echo "ℹ️  Database may already exist"
    else
        echo "⚠️  createdb not found. Please create database manually:"
        echo "   sudo -u postgres createdb $DB_NAME"
    fi
    
    # Run seed
    echo ""
    echo "🌱 Seeding database..."
    npm run seed
    
    echo ""
    echo "✅ Database setup completed!"
    ;;
    
  "start")
    echo "🚀 Starting WhatsApp AI Bot..."
    npm start
    ;;
    
  "dev")
    echo "🔧 Starting in development mode..."
    npm run dev
    ;;
    
  "pm2-start")
    echo "🚀 Starting with PM2..."
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        echo "❌ PM2 is not installed. Installing PM2..."
        npm install -g pm2
    fi
    
    # Start with ecosystem file
    if [ -f ecosystem.config.cjs ]; then
        pm2 start ecosystem.config.cjs
    else
        pm2 start src/index.js --name whatsapp-bot
    fi
    
    pm2 save
    echo ""
    echo "✅ Bot started with PM2"
    echo "📊 View logs: pm2 logs whatsapp-bot"
    echo "📈 Monitor: pm2 monit"
    ;;
    
  "pm2-stop")
    echo "⏸️  Stopping PM2 process..."
    pm2 stop whatsapp-bot
    echo "✅ Bot stopped"
    ;;
    
  "pm2-restart")
    echo "🔄 Restarting PM2 process..."
    pm2 restart whatsapp-bot
    echo "✅ Bot restarted"
    ;;
    
  "pm2-logs")
    echo "📋 Viewing logs..."
    pm2 logs whatsapp-bot
    ;;
    
  "reset-session")
    echo "🔄 Resetting WhatsApp session..."
    
    # Stop PM2 if running
    pm2 stop whatsapp-bot 2>/dev/null
    
    # Remove session
    rm -rf wa-session/*
    echo "✅ Session removed"
    
    # Restart PM2 if it was running
    pm2 start whatsapp-bot 2>/dev/null && echo "✅ Bot restarted" || echo "ℹ️  Start bot manually with: npm start"
    ;;
    
  "backup")
    echo "💾 Creating backup..."
    
    # Load .env
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    # Create backup directory
    mkdir -p backups
    
    # Backup filename with timestamp
    BACKUP_FILE="backups/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    # Backup database
    if command -v pg_dump &> /dev/null; then
        pg_dump $DB_NAME > $BACKUP_FILE
        echo "✅ Database backed up to: $BACKUP_FILE"
    else
        echo "❌ pg_dump not found. Cannot backup database."
    fi
    
    # Backup .env
    cp .env "backups/.env_$(date +%Y%m%d_%H%M%S)"
    echo "✅ .env backed up"
    
    echo ""
    echo "✅ Backup completed"
    ;;
    
  "restore")
    if [ -z "$2" ]; then
        echo "❌ Usage: ./scripts.sh restore <backup_file>"
        exit 1
    fi
    
    echo "🔄 Restoring from backup: $2"
    
    # Load .env
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    # Restore database
    if command -v psql &> /dev/null; then
        psql $DB_NAME < $2
        echo "✅ Database restored"
    else
        echo "❌ psql not found. Cannot restore database."
    fi
    ;;
    
  "clean")
    echo "🧹 Cleaning up..."
    
    # Clean logs
    rm -rf logs/*
    echo "✅ Logs cleaned"
    
    # Clean uploads (be careful!)
    read -p "⚠️  Clean uploads directory? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf uploads/*
        echo "✅ Uploads cleaned"
    fi
    
    echo ""
    echo "✅ Cleanup completed"
    ;;
    
  "test")
    echo "🧪 Running tests..."
    
    # Check if token is provided
    if [ -z "$2" ]; then
        echo "Usage: ./scripts.sh test <jwt_token>"
        exit 1
    fi
    
    TOKEN=$2
    BASE_URL="${3:-http://localhost:3000/api}"
    
    echo "Testing API at: $BASE_URL"
    echo ""
    
    # Test status
    echo "📊 Testing WhatsApp status..."
    curl -s -X GET "$BASE_URL/whatsapp/status" \
      -H "Authorization: Bearer $TOKEN" | jq .
    
    echo ""
    echo "📊 Testing dashboard stats..."
    curl -s -X GET "$BASE_URL/stats/dashboard" \
      -H "Authorization: Bearer $TOKEN" | jq .
    
    echo ""
    echo "✅ Tests completed"
    ;;
    
  "help"|*)
    echo "WhatsApp AI Bot - Helper Scripts"
    echo ""
    echo "Usage: ./scripts.sh <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  setup              - Initial setup (install dependencies, create .env)"
    echo "  setup-db           - Setup database (create DB, run migrations)"
    echo "  start              - Start bot in production mode"
    echo "  dev                - Start bot in development mode"
    echo "  pm2-start          - Start bot with PM2"
    echo "  pm2-stop           - Stop PM2 process"
    echo "  pm2-restart        - Restart PM2 process"
    echo "  pm2-logs           - View PM2 logs"
    echo "  reset-session      - Reset WhatsApp session"
    echo "  backup             - Create database backup"
    echo "  restore <file>     - Restore database from backup"
    echo "  clean              - Clean logs and temporary files"
    echo "  test <token>       - Test API endpoints"
    echo "  help               - Show this help message"
    echo ""
    ;;
esac