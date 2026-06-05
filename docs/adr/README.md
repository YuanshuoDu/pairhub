# Pairhub — 架构决策记录（ADR）索引

> **维护人**：@Oracle Hermes（CTO） / architect agent
> **状态**：v1.0 — 2026-06-05
> **位置**：`docs/adr/`

## 什么是 ADR？

**Architecture Decision Record（架构决策记录）** 是一份**不可变**的短文档，记录一个架构决策的：

- **Context（背景）**：为什么需要决策？约束是什么？
- **Decision（决策）**：选了哪个方案？为什么？
- **Consequences（影响）**：代价、风险、不可逆性
- **Status（状态）**：提议 / 已接受 / 已废弃 / 已替代

## 当前 ADR 清单

| # | 标题 | 状态 | 关联 |
|---|------|------|------|
| [0001](./0001-flutter-for-mobile.md) | Flutter 作为 iOS + Android 移动端实现 | ✅ Accepted | [架构 §2](../architecture-v1.0.md) |
| [0002](./0002-miniprogram-native.md) | 微信小程序采用微信原生（不混 Taro/Uni-app） | ✅ Accepted | [架构 §2](../architecture-v1.0.md) |
| [0003](./0003-auth-strategy.md) | 多端登录合并到同一 User（微信 + Apple + Google） | ✅ Accepted | [架构 §5.1](../architecture-v1.0.md) |
| [0004](./0004-state-machine-for-activity.md) | 活动生命周期用显式状态机 + Cron 扫描驱动 | ✅ Accepted | [架构 §5.4](../architecture-v1.0.md) |
| [0005](./0005-data-storage-region.md) | 数据存储地域 — 国内腾讯云 / 海外 AWS 双地域 | ✅ Accepted | [架构 §7.4](../architecture-v1.0.md) |

## ADR 写作规范

### 命名

- 编号连续 4 位：`0001-…md`
- 文件名用 kebab-case 简短描述
- 例：`0001-flutter-for-mobile.md`

### 结构（必填四段）

```markdown
# ADR-NNNN: <title>

> **状态**：Proposed / Accepted / Superseded / Deprecated
> **日期**：YYYY-MM-DD
> **决策人**：<who>
> **关联**：<其他文档链接>

## Context（背景）
<为什么需要决策？候选方案是什么？>

## Decision（决策）
<选了哪个方案？理由（按权重）？最终技术栈？>

## Consequences（影响 / 代价）
<收益、风险、不可逆性、决策后续>

## Status
<当前状态、下次 review、Owner>
```

### 评审流程

1. **新建 ADR**：在 PR 描述里写 `Proposed`，附 1-2 个备选方案对比
2. **CTO Review**：@Oracle Hermes 在 24h 内 review
3. **决策人拍板**：@YuanshuoDu 在群内明确 `Accepted`
4. **合并**：状态改为 `Accepted`，归档
5. **后续修改**：不允许原地编辑；如需推翻，写新 ADR 并 supersede 旧 ADR

### 何时需要新 ADR？

满足以下任一条件**必须**走 ADR：

- 引入新框架 / 新技术栈（如 React、Vue、Kafka）
- 改变核心数据模型（schema 重大变更）
- 改变部署架构（如新增地域、新增中间件）
- 改变鉴权 / 安全模型
- 改变前后端边界（如新增 BFF 层）

不需 ADR 的情况：
- 普通 bug fix
- 重构不改接口
- 加新 endpoint 沿用现有约定
- 配置文件变更

## 演进记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-05 | 首批 5 个 ADR（架构 v1.0 配套） |

## 交叉引用

- [architecture-v1.0.md](../architecture-v1.0.md) — 完整架构文档
- [api/v1.md](../api/v1.md) — API 规范
- [delivery-standards.md](../../delivery-standards.md) — 交付规范
- [github-interaction-rules.md](../github-interaction-rules.md) — 互动规范
