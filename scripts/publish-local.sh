#!/bin/bash

# Script to publish plugin to local registry using yalc
# This replaces the non-functional `npx medusa plugin:publish` command

set -e

echo "📦 Building plugin..."
npm run build

echo "📤 Publishing to local registry..."
yalc publish

echo "✅ Plugin published successfully!"
echo ""
echo "To install in your Medusa application:"
echo "  cd /path/to/your-medusa-app"
echo "  yalc add @trendtri/medusa-plugin-printify"
echo ""
echo "To watch for changes during development:"
echo "  yalc push --watch"
