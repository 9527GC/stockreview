#!/bin/bash

# Stock Review Backend Entrypoint
# Usage: ./entrypoint.sh [prod|dev]

ENV=${1:-dev}

cd /home/devbox/project

if [ "$ENV" = "prod" ]; then
    echo "Starting production server..."

    # 仅在 node_modules 不存在或 package.json 更新时才安装依赖，
    # 避免每次 Pod 重启都重新下载生产依赖，缩短启动时间。
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        echo "Installing production dependencies..."
        npm ci --only=production
        touch node_modules
    else
        echo "Production dependencies already installed, skipping npm ci"
    fi

    NODE_ENV=production npm run start:prod
else
    echo "Starting development server..."
    npm run dev
fi
