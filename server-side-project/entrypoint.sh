#!/bin/bash

# Stock Review Backend Entrypoint
# Usage: ./entrypoint.sh [prod|dev]

ENV=${1:-dev}

cd /home/devbox/project

if [ "$ENV" = "prod" ]; then
    echo "Starting production server..."
    NODE_ENV=production npm run start:prod
else
    echo "Starting development server..."
    npm run dev
fi
