#!/bin/bash
set -e

echo "🚀 Starting LiveTS development environment..."

# Function to handle cleanup
cleanup() {
    echo "🛑 Stopping development servers..."
    jobs -p | xargs -r kill
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start TypeScript compiler in watch mode
echo "👀 Starting TypeScript watch mode..."
cd packages/core
npm run build:watch &
cd ../..

# Start client build in watch mode
echo "👀 Starting client build watch mode..."
cd packages/client
npm run build:watch &
cd ../..

# Start the example application
echo "🌟 Starting counter example..."
cd examples/counter
npm run dev &
cd ../..

echo "✨ Development environment ready!"
echo "📖 Check the README for available URLs"

# Wait for background processes
wait