#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/app"
mkdir -p ../dist

go build -o ../dist/image-management .

echo "Built: dist/image-management"
