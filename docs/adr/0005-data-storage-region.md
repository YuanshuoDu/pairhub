# ADR-0005: 数据存储地域 — AWS only

> **状态**：Accepted · 2026-06-05
> **决策人**：@杜元朔 · **CTO 提报**：@Oracle Hermes

## Context

StudyBuddy 的目标用户是**海外留学生**（全球范围内的留学生群体），主要市场在北美、欧洲、澳洲、东南亚等海外地区。

之前的方案（v0.2）：国内腾讯云 + 海外 AWS 双地域、按用户地域路由。

**新判断**：

1. **目标用户结构变化**：从"以中国留学生为主"（v0.2 假设）调整为"以**全球**留学生为主"（v1.0 调整）。中国市场不再是主战场。
2. **运维复杂度**：双地域部署需要维护两套基础设施、两份数据库同步、跨地域网络配置 — 对一个 12 周 MVP 团队是灾难性负担。
3. **延迟一致性**：单地域部署所有用户体验延迟一致（都是海外 → 海外），符合目标用户分布。
4. **合规要求**：GDPR、CCPA 等海外隐私法规要求数据落地明确，单地域更易合规声明。

## Decision

**采用方案 A 修订版：单地域部署 — AWS Frankfurt（欧洲中部）作为主区域**

| 资源 | 选型 | 备注 |
|------|------|------|
| 主区域 | **AWS Frankfurt (eu-central-1)** | 欧洲中部，网络质量对北美/欧洲/中东都较好；GDPR 合规 |
| 备区域 | **AWS us-east-1**（N. Virginia）| 灾备 + 北美用户加速 |
| 容器 | AWS ECS Fargate | 无服务器容器，免运维 |
| 数据库 | AWS RDS PostgreSQL 16（Multi-AZ）| 主 + 同步备 |
| 缓存 | AWS ElastiCache Redis 7 | cluster mode |
| 对象存储 | AWS S3 | 头像 / 活动封面 / UGC |
| CDN | AWS CloudFront | 全球边缘节点 |
| 消息队列 | AWS SQS + SNS | 推送、异步任务 |
| 监控 | CloudWatch + Grafana Cloud | 日志 + 指标 |
| 错误追踪 | Sentry.io（自管 / cloud）| 前后端统一 |

## Consequences

### 优点
- ✅ **运维简单**：单区域，无需同步、跨地域配置
- ✅ **海外用户延迟低**：主区域 Frankfurt，对欧美用户延迟 < 50ms
- ✅ **GDPR 合规明确**：数据在欧盟内，符合 GDPR
- ✅ **成本可控**：单套基础设施，省钱
- ✅ **故障域清晰**：Multi-AZ 高可用、us-east-1 灾备

### 缺点
- ❌ **国内用户访问慢**：从中国访问 AWS Frankfurt 延迟 250-400ms（已不在目标用户范围）
- ❌ **微信小程序体验**：小程序后端在海外，**国内用户访问会慢**（但小程序本身是微信生态，主要服务国内，这是矛盾点 — 见 ADR-0006）
- ❌ **国内备案 / ICP**：不在国内部署，免去备案麻烦

### 缓解
- 国内小程序用户：用 CloudFront 亚洲边缘节点 + AWS Global Accelerator 优化（中国 → 海外路径）
- 如未来国内用户量大：单独部署国内集群（不在 MVP 范围）

## 部署目标

| 环境 | 区域 | 用途 |
|------|------|------|
| dev | 本地 Docker Compose | 开发 |
| staging | AWS Frankfurt (eu-central-1) | 预发布、CI 自动部署 |
| prod | AWS Frankfurt (eu-central-1) | 生产，Multi-AZ |

## 隐私 / 合规

| 法规 | 适用 | 合规措施 |
|------|------|----------|
| **GDPR** | 欧盟用户 | 数据在 Frankfurt；用户协议明确；用户数据导出 / 删除 API（v1.1） |
| **CCPA** | 加州用户 | 同上 + 不卖用户数据 |
| **中国《个保法》** | 中国大陆用户 | **不在国内部署**；不主动服务中国大陆用户 |
| **数据最小化** | 所有 | 只收集必要字段；30 天未登录自动 anonymize |

## 成本估算（M2 阶段，月）

| 资源 | 估算 | 备注 |
|------|------|------|
| ECS Fargate（2 task × 0.5 vCPU × 1GB）| ~$30 | 业务低峰 |
| RDS PostgreSQL（db.t4g.medium Multi-AZ）| ~$80 | |
| ElastiCache Redis（cache.t4g.micro）| ~$15 | |
| S3 + CloudFront | ~$10 | 低流量 |
| CloudWatch + Sentry | ~$25 | |
| **合计** | **~$160/月** | 50 人内测阶段 |
| 正式发布后预估 | ~$500-1500/月 | 视用户量 |

## 替代方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. **AWS Frankfurt only**（已选）| 见上 | 国内用户体验差 |
| B. Google Cloud Platform | 同等质量 | 团队 AWS 经验更多 |
| C. Vercel + Neon | serverless 简单 | 长期成本高、控制力弱 |
| D. Cloudflare Workers + D1 | 边缘部署延迟低 | 复杂业务（事务、关系查询）不友好 |

## 监控

- 关键 SLI：API P95 < 300ms、错误率 < 0.5%、DB 连接池 < 80%
- 告警：CloudWatch Alarms → Slack/飞书
- Dashboard：Grafana Cloud（与 Sentry 联动）

## 验证

- M1-W4：部署到 staging，curl /health 200
- M2-W5：auth/user/activity 业务 API 部署 staging
- M2-W7：端到端 E2E 测试
- M2-W8：50 人内测（覆盖 3 大洲）
- M3-W9：prod 上线

## Watch-outs

- **RDS Multi-AZ failover 时间 ~60s**：业务需重试机制（Fastify retry plugin）
- **CloudFront 缓存失效**：活动数据需带 cache-control 头，避免脏读
- **S3 上传**：前端直传需要 pre-signed URL（见 ADR-0003 auth）

---

Refs:
- [CTO 规划 §0 决策摘要](../cto-roadmap-v1.0.md)
- [ADR-0001: Flutter 选型](./0001-flutter-for-mobile.md)
- [ADR-0003: 多端鉴权策略](./0003-auth-strategy.md)
- [ADR-0006: 地图选型（待写）](./0006-mapbox-for-global.md)
