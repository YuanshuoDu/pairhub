#!/usr/bin/env bash
# dev-up.sh — 本地开发环境一键启动
# 启动 PostgreSQL（docker）+ 等待就绪 + 打印连接信息
set -euo pipefail

echo "🚀 Pairhub 本地环境启动..."

# 检查 docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker 未安装，请先安装 Docker"
  exit 1
fi

# 启动 postgres 容器
CONTAINER_NAME=pairhub-pg
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "📦 创建 postgres 容器..."
  docker run -d \
    --name ${CONTAINER_NAME} \
    -e POSTGRES_USER=pairhub \
    -e POSTGRES_PASSWORD=pairhub \
    -e POSTGRES_DB=pairhub \
    -p 5432:5432 \
    -v pairhub_pgdata:/var/lib/postgresql/data \
    postgres:16
else
  echo "📦 postgres 容器已存在，启动中..."
  docker start ${CONTAINER_NAME}
fi

# 等待就绪
echo "⏳ 等待 PostgreSQL 就绪..."
for i in {1..30}; do
  if docker exec ${CONTAINER_NAME} pg_isready -U pairhub >/dev/null 2>&1; then
    echo "✅ PostgreSQL 已就绪"
    break
  fi
  sleep 1
done

cat <<EOF

🎉 本地环境就绪：
  DATABASE_URL=postgres://pairhub:pairhub@localhost:5432/pairhub

下一步：
  cd server && pnpm install && pnpm dev

EOF
