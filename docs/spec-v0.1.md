# StudyBuddy — 需求规格 v0.1

> 状态：草稿 v0.1 — 待 @美国hermes 输出初版，@Oracle Hermes review  
> 最后更新：2026-06-01

> ⚠️ **交付原则**：本文档每条结论必须可验证、可评审。详见 [delivery-standards.md](./delivery-standards.md)。

## 1. 核心定位

**StudyBuddy** = 留学生搭子活动平台

一句话：**让留学生 30 秒内找到一个能一起去图书馆 / 打球 / 开黑的搭子。**

## 2. 目标用户

| 画像 | 描述 | 主要场景 |
|------|------|----------|
| A 学业型 | 硕士/博士新生 | 自习、讨论、找同专业同学 |
| B 运动型 | 喜欢打球/跑步 | 周末约球、夜跑 |
| C 娱乐型 | 想玩桌游/开黑 | 周中开黑、周末桌游局 |
| D 社交型 | 想认识新朋友 | 主题局、城市探索 |

## 3. 核心场景（MVP 必须）

| # | 场景 | 优先级 |
|---|------|--------|
| 1 | 创建活动（自习/运动/桌游/开黑） | P0 |
| 2 | 浏览活动列表（按位置/时间/类型筛选） | P0 |
| 3 | 报名活动 / 退出活动 | P0 |
| 4 | 活动详情页（位置、参与者、人数上限） | P0 |
| 5 | 微信登录（手机号 + 微信一键） | P0 |
| 6 | 个人主页（我创建/我参加） | P1 |
| 7 | 活动私聊群（小程序内） | P2 |
| 8 | 评价搭子（双向评分） | P3 |

## 4. 活动类型 v1

| 类型 | 子类 | 关键字段 |
|------|------|----------|
| 自习 | 图书馆/咖啡厅/讨论室 | 地点（带地图选点）、科目、起止时间、人数 |
| 运动 | 羽毛球/网球/跑步/篮球/足球 | 场地、装备要求、人数 |
| 桌游 | 三国杀/狼人杀/UNO | 地点、人数、桌游类型 |
| 开黑 | 王者/原神/吃鸡/LOL | 游戏 ID 段位、组队人数、语音平台 |
| 其他 | 自由文本 | 标题、描述、地点、时间、人数 |

## 5. 数据模型 v1（待 schema 设计）

```
User      { id, openid, nickname, avatar, school, major, wechat, phone, created_at }
Activity  { id, creator_id, type, title, description, location{lat,lng,addr,place_name},
            start_time, end_time, max_participants, tags, status, created_at }
Signup    { id, activity_id, user_id, status(pending/approved/canceled), signed_at }
Message   { id, activity_id, user_id, content, created_at }  -- 群消息（M2）
Review    { id, activity_id, from_user, to_user, rating, comment, created_at }  -- M3
```

## 6. 核心流程（活动生命周期）

```
[创建] -> [报名中] -> [已满 / 截止] -> [进行中] -> [已结束] -> [可评价]
                  \-> [已取消]
```

## 7. 后续迭代

- 活动标签 / 兴趣匹配推荐
- 同学校 / 同专业优先展示
- 拼车出行
- 多语言（中/英）

## 8. 待定（需 @杜元朔 决策）

- [ ] **登录方式**：仅微信？还是要手机号 + 密码？
- [ ] **认证要求**：是否需要学生认证？
- [ ] **内容审核**：UGC 是否需要接入微信内容安全 API？
- [ ] **支付**：MVP 是否需要押金/分摊？
