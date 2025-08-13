#!/bin/bash
set -e

echo "🔨 Building LiveTS..."

# Build Rust core first
echo "📦 Building Rust core..."
cd packages/rust-core
npm run build
cd ../..

# Build TypeScript core
echo "📦 Building TypeScript core..."
cd packages/core
npm run build
cd ../..

# Build client connector
echo "📦 Building client connector..."
cd packages/client
npm run build
cd ../..

# Build examples
echo "📦 Building examples..."
cd examples/counter
npm run build
cd ../..

echo "✅ Build complete!"