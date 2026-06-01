#!/bin/bash

echo "🏥 Medical AI Agent Platform - Installation"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    echo "   Download: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"

# Create .env if not exists
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  Please edit .env file and add your API key:"
    echo "   LLM_API_KEY=your-api-key-here"
else
    echo "✅ .env file already exists"
fi

# Create data directories
echo ""
echo "📁 Creating data directories..."
mkdir -p data/{conversations,datasets,vectors,uploads,memory}
echo "✅ Data directories created"

echo ""
echo "🎉 Installation complete!"
echo ""
echo "To start the server:"
echo "  npm start"
echo ""
echo "Then open: http://localhost:3000"
