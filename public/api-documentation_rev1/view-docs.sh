#!/bin/bash

cd "/Users/akin.toksan/Desktop/Coding/Paytrail Payment API/api-documentation_rev1"

echo "📚 Paytrail API Documentation Viewer"
echo "====================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "🚀 Starting documentation server..."
echo "📍 Documentation will be available at: http://localhost:8080"
echo "📖 Open your browser and navigate to the URL above"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run serve
