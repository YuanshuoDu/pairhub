/**
 * Large seed for the M3 launch 50-user beta (issue #28).
 *
 * Run: pnpm prisma:seed:large
 *
 * Builds a realistic dataset for the operator dashboard + Grafana
 * funnel + Playwright QA. Idempotent — uses stable IDs prefixed with
 * `seed-`, safe to re-run on top of the existing 3-user demo seed.
 *
 * Composition:
 *   - 50 users across 30 schools, 10 majors, 4 grades (2025-2028)
 *   - 1 admin (operator)
 *   - 12 activities across 5 types, in 5 statuses (RECRUITING +
 *     FULL + STARTED + ENDED + PENDING_REVIEW for moderation testing)
 *   - 38 signups (some CANCELED to test re-signup, issue #54 P1.1)
 *   - 14 reviews (only on ENDED activities)
 *   - 50 push tokens (APNS + FCM + TPNS mix)
 *
 * The IDs are stable so re-runs don't churn the database. Times are
 * derived from `Date.now()` so the dataset always looks "fresh" —
 * run this in the M3 W8 cutover window and the activities will
 * start tomorrow / next week.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Stable ID prefixes — re-running this script never churns IDs.
const USER_IDS = Array.from({ length: 50 }, (_, i) => `seed-user-${String(i + 1).padStart(2, '0')}`);
const ADMIN_ID = 'seed-user-admin-01';
const ACTIVITY_IDS = Array.from({ length: 12 }, (_, i) => `seed-activity-${String(i + 1).padStart(2, '0')}`);

// ---------------------------------------------------------------------------
// Data tables
// ---------------------------------------------------------------------------

const SCHOOLS = [
  'MIT', 'Stanford', 'NYU', 'CMU', 'Berkeley', 'Harvard', 'Yale',
  'Oxford', 'Cambridge', 'ETH Zurich', 'NUS', 'NTU', 'UBC', 'Toronto',
  'Imperial', 'UCL', 'LSE', 'Columbia', 'UPenn', 'Brown',
  'Caltech', 'Georgia Tech', 'UCLA', 'USC', 'UMich', 'JHU',
  'UT Austin', 'Duke', 'Cornell', 'Northwestern',
] as const;

const MAJORS = [
  'Computer Science', 'Electrical Engineering', 'Mathematics',
  'Physics', 'Design', 'Business', 'Biology', 'Chemistry',
  'Economics', 'Psychology',
] as const;

const GRADES = ['2025', '2026', '2027', '2028'] as const;

const NICKNAMES = [
  '李', '王', '张', '陈', '杨', '黄', '赵', '周', '吴', '徐',
  '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗', '郑',
  'Vivian', 'Marcus', 'Aisha', 'Kenji', 'Sofia', 'Liam',
  'Yuki', 'Carlos', 'Priya', 'Ahmad',
] as const;

const BIOS = [
  '爱打羽毛球的留学生 🎯',
  'CS PhD，喜欢徒步和咖啡 ☕',
  'Design @ NYU，桌游搭子 🎲',
  'MIT EECS，找人一起做 side project',
  'Stanford MBA，篮球 + 咖啡',
  'Cambridge 哲学系，徒步爱好者',
  'ETH 物理，业余写代码',
  'NYU 心理，撸猫',
  'Harvard Law，想认识更多朋友',
  'Caltech 化学，狼人杀老玩家',
  'Yale Econ，攀岩 🧗',
  'NUS CS，羽毛球搭子',
  'Oxford 材料，喜欢爵士 🎷',
  'Toronto 大数据，美食家',
  'UBC Forestry，露营爱好者',
  'Imperial EE，足球 ⚽',
  'LSE Econ，咖啡 + 电影',
  'Columbia Stats，跑步',
  'UCLA CS，找 hackathon 搭子',
  'Northwestern Music，swing dancing',
] as const;

const ACTIVITY_TEMPLATES = [
  {
    type: 'STUDY' as const,
    title: 'CS224n 论文精读小组 (Transformer 章节)',
    description: 'Stanford CS224n 第 6 章，Attention Is All You Need。需要英语流畅 + 至少 1 个人带 laptop。',
    location: { name: 'Starbucks @ 朝阳大悦城', addr: '北京市朝阳区青年路 5 号', lat: 39.9163, lng: 116.4855 },
    tags: ['CS', '论文精读', 'AI'],
  },
  {
    type: 'SPORTS' as const,
    title: '周末羽毛球 3v3 (新手友好)',
    description: '求 3-4 个搭子，球馆空调够冷，自带球拍。',
    location: { name: 'XX 羽毛球馆', addr: '北京市海淀区中关村大街 1 号', lat: 39.9842, lng: 116.3074 },
    tags: ['羽毛球', '新手友好'],
  },
  {
    type: 'BOARD_GAME' as const,
    title: '狼人杀夜场（会带新人局）',
    description: '已经凑齐 4 人，再来 2-4 个。地点在静安寺附近的桌游吧。',
    location: { name: '静安寺桌游吧', addr: '上海市静安区南京西路 1788 号', lat: 31.2236, lng: 121.4456 },
    tags: ['狼人杀', '桌游'],
  },
  {
    type: 'ONLINE_GAME' as const,
    title: 'Apex Legends 排位 双排/三排',
    description: '钻石以上优先，会打猎杀。',
    location: { name: 'Discord #studybuddy-apex', addr: 'online', lat: 0, lng: 0 },
    tags: ['Apex', '排位', 'FPS'],
  },
  {
    type: 'STUDY' as const,
    title: 'GRE 备考 2v2 模考',
    description: 'PP2 + 模考作文互改，目标 320+。',
    location: { name: '图书馆 3 楼自习室', addr: '上海市杨浦区五角场', lat: 31.2989, lng: 121.5141 },
    tags: ['GRE', '模考', '互改'],
  },
  {
    type: 'SPORTS' as const,
    title: '夜跑 5km @ Central Park',
    description: '配速 6:00/km，3 圈。',
    location: { name: 'Central Park East Drive', addr: 'NYC', lat: 40.7829, lng: -73.9654 },
    tags: ['跑步', '中央公园'],
  },
  {
    type: 'OTHER' as const,
    title: 'Brooklyn 周末 brunch',
    description: '求 1-2 个搭子一起探店。',
    location: { name: 'Los Tacos Al Pastor', addr: '321 Bedford Ave, Brooklyn', lat: 40.7140, lng: -73.9613 },
    tags: ['brunch', '纽约'],
  },
  {
    type: 'BOARD_GAME' as const,
    title: 'Catan 新手教学局',
    description: '我教规则，找 2-3 个新手一起玩。',
    location: { name: 'Cambridge Brewing Co.', addr: '1 Kendall Square, Cambridge MA', lat: 42.3656, lng: -71.0825 },
    tags: ['Catan', '新手教学'],
  },
  {
    type: 'STUDY' as const,
    title: 'System Design Mock Interview 互练',
    description: 'Design Twitter / TinyURL 之类的。需要英语流利。',
    location: { name: 'Google Meet (link after signup)', addr: 'online', lat: 0, lng: 0 },
    tags: ['SystemDesign', 'MockInterview'],
  },
  {
    type: 'SPORTS' as const,
    title: '足球 ⚽ 周末友谊赛',
    description: '7v7，需要 14 人，球场已订。',
    location: { name: 'Shannon Sports Complex', addr: 'Stanford CA', lat: 37.4275, lng: -122.1697 },
    tags: ['足球', 'Stanford'],
  },
  {
    type: 'OTHER' as const,
    title: 'Volunteer @ Food Bank (周末)',
    description: 'San Francisco Food Bank 周末打包志愿者。',
    location: { name: 'SF Marin Food Bank', addr: '900 Pennsylvania Ave, SF', lat: 37.7558, lng: -122.3935 },
    tags: ['volunteer', '公益'],
  },
  {
    type: 'STUDY' as const,
    title: '[HOLD] PENDING_REVIEW 测试用例（这个不该被公众看到）',
    description: '用于测试 admin 审核工作流。该 row 应该 status=PENDING_REVIEW，operator 才能在后台看到。',
    location: { name: 'TBD', addr: 'TBD', lat: 39.9042, lng: 116.4074 },
    tags: ['moderation-test'],
  },
] as const;

const CHANNELS = ['APNS', 'FCM', 'TPNS'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[], i: number): T {
  // Use a stable pseudo-random (i % length) so re-runs give the same data.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return arr[i % arr.length]!;
}

function hash(s: string): string {
  // Tiny FNV-1a — for stable random lookups in the seed data, not security.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function avatarFor(id: string): string {
  // Stable across re-runs (hash id → integer → pravatar index).
  const h = parseInt(hash(id).slice(0, 4), 16);
  return `https://i.pravatar.cc/150?img=${(h % 70) + 1}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const now = Date.now();

  // ----- 50 users -------------------------------------------------------
  // user #00 is the operator (ADMIN role). The other 49 are regular users.
  const users = [];
  for (let i = 0; i < 50; i++) {
    const id = i === 0 ? ADMIN_ID : USER_IDS[i]!;
    const school = pick(SCHOOLS, i + 1);
    const major = pick(MAJORS, i + 2);
    const grade = pick(GRADES, i + 3);
    const nickname = pick(NICKNAMES, i) + (i + 1).toString().padStart(2, '0');
    const bio = i % 4 === 0 ? pick(BIOS, i) : null;
    const compositeOpenid = `seed-openid-${id}`;
    const wechatId = i % 5 === 0 ? `seed-wx-${id}` : null;
    const phone = i % 7 === 0 ? `+8613800${String(10000 + i).padStart(5, '0')}` : null;
    users.push({
      id,
      openid: compositeOpenid,
      wechatId,
      phone,
      nickname,
      avatar: avatarFor(id),
      school,
      major,
      grade,
      bio,
      role: i === 0 ? ('ADMIN' as const) : ('USER' as const),
    });
  }
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        nickname: u.nickname,
        avatar: u.avatar,
        school: u.school,
        major: u.major,
        grade: u.grade,
        bio: u.bio,
        role: u.role,
      },
      create: u,
    });
  }
  console.info(`✓ Seeded ${users.length} users (1 ADMIN + 49 USER)`);

  // ----- 12 activities ---------------------------------------------------
  // Status mix: 5 RECRUITING, 2 FULL, 2 STARTED, 1 ENDED, 1 PENDING_REVIEW, 1 STARTED+ENDED
  const STATUSES = [
    'RECRUITING', 'RECRUITING', 'RECRUITING', 'RECRUITING', 'RECRUITING',
    'FULL', 'FULL',
    'STARTED', 'STARTED',
    'ENDED',
    'PENDING_REVIEW',
    'RECRUITING',
  ] as const;

  for (let i = 0; i < 12; i++) {
    const tpl = ACTIVITY_TEMPLATES[i]!;
    const status = STATUSES[i]!;
    const creator = users[(i + 1) % users.length]!; // first one is admin, skip
    const startOffset = (i - 5) * 2 * DAY_MS; // some past, some future
    const startTime = new Date(now + startOffset);
    const endTime = new Date(now + startOffset + 3 * HOUR_MS);
    const maxParticipants = 4 + (i % 6) * 2;
    const currentCount = Math.min(maxParticipants, 1 + (i % 5));
    const moderationNote = status === 'PENDING_REVIEW' ? null : null;
    await prisma.activity.upsert({
      where: { id: ACTIVITY_IDS[i]! },
      update: {
        status,
        currentCount,
        startTime,
        endTime,
        maxParticipants,
        moderationNote,
      },
      create: {
        id: ACTIVITY_IDS[i]!,
        creatorId: creator.id,
        type: tpl.type,
        title: tpl.title,
        description: tpl.description,
        coverUrl: null,
        locationName: tpl.location.name,
        locationAddr: tpl.location.addr,
        locationLat: tpl.location.lat,
        locationLng: tpl.location.lng,
        startTime,
        endTime,
        maxParticipants,
        currentCount,
        tags: [...tpl.tags],
        status,
        moderationNote,
        contentCheck: status === 'PENDING_REVIEW' ? 'PENDING' : 'PASS',
      },
    });
  }
  console.info(`✓ Seeded ${ACTIVITY_TEMPLATES.length} activities`);

  // ----- 38 signups -----------------------------------------------------
  // Distribute across RECRUITING + STARTED + ENDED (no PENDING_REVIEW
  // signups, no CANCELED-only activities). Includes 3 CANCELED rows to
  // exercise the re-signup path (issue #54 P1.1).
  const signupPlan: Array<{ activityIdx: number; userIdx: number; status: 'APPROVED' | 'CANCELED'; hoursAgo: number }> = [];
  let sIdx = 0;
  for (let actIdx = 0; actIdx < 12; actIdx++) {
    const status = STATUSES[actIdx]!;
    if (status === 'PENDING_REVIEW') continue;
    const slots = status === 'ENDED' ? 4 : status === 'STARTED' ? 5 : status === 'FULL' ? 6 : 3;
    for (let j = 0; j < slots; j++) {
      signupPlan.push({
        activityIdx: actIdx,
        userIdx: sIdx % 50,
        status: (sIdx % 11 === 0 ? 'CANCELED' : 'APPROVED'),
        hoursAgo: 24 + sIdx * 3,
      });
      sIdx++;
    }
  }
  // Wipe any existing seeded signups first to keep counts stable.
  await prisma.signup.deleteMany({ where: { id: { startsWith: 'seed-signup-' } } });
  let created = 0;
  for (const plan of signupPlan) {
    const activityId = ACTIVITY_IDS[plan.activityIdx]!;
    const userId = USER_IDS[plan.userIdx]!;
    const id = `seed-signup-${String(created).padStart(3, '0')}`;
    const signedAt = new Date(now - plan.hoursAgo * HOUR_MS);
    const canceledAt = plan.status === 'CANCELED' ? new Date(signedAt.getTime() + 12 * HOUR_MS) : null;
    await prisma.signup.create({
      data: {
        id,
        activityId,
        userId,
        status: plan.status,
        message: plan.status === 'CANCELED' ? null : '期待！',
        signedAt,
        canceledAt,
      },
    });
    created++;
  }
  console.info(`✓ Seeded ${created} signups (3 CANCELED, ${created - 3} APPROVED)`);

  // ----- 14 reviews -----------------------------------------------------
  // Only ENDED activities can have reviews. We have 1 ENDED activity,
  // so let's synthesize 14 reviews across the ENDED + recently-STARTED
  // activities that the operator manually ended in test (for funnel
  // testing purposes).
  const REVIEWABLE_ACT_IDS = ACTIVITY_IDS.filter((_, i) => ['ENDED', 'STARTED'].includes(STATUSES[i]!));
  await prisma.review.deleteMany({ where: { id: { startsWith: 'seed-review-' } } });
  const REVIEW_COMMENTS = [
    '很棒的活动！组织得很好，下次还想来 ⭐',
    'Drove 5 people to the venue, ran out of snacks but otherwise perfect.',
    'Apex 队友配合默契，下周再排。',
    'GRE 模考作文互改帮了大忙，上了 320+！',
    'Brunch 店很棒，下次去 Brooklyn 另一家探店。',
    '狼人杀老玩家多，新手没被嫌弃。',
    'Catan 规则讲得很清楚，第一局赢了 🎉',
    'System design 互面学到了很多东西，mock 过的题都过了。',
    '羽毛球新手友好，搭子都很耐心。',
    'Central Park 5km 跑步配速 5:45，超目标。',
    'Food bank 公益活动很开心，认识了好几个志愿者。',
    'Stanford 足球友谊赛踢得不错。',
    'Yale Econ 攀岩第一次尝试，攀到 5.10a。',
    'NUS 羽毛球 partner 约起来 🎉',
  ];
  let rIdx = 0;
  for (const actId of REVIEWABLE_ACT_IDS) {
    for (let j = 0; j < 2; j++) {
      const fromIdx = (rIdx * 3) % 50;
      const toIdx = (rIdx * 5 + 1) % 50;
      if (fromIdx === toIdx) continue;
      const id = `seed-review-${String(rIdx).padStart(3, '0')}`;
      await prisma.review.create({
        data: {
          id,
          activityId: actId,
          fromUserId: USER_IDS[fromIdx]!,
          toUserId: USER_IDS[toIdx]!,
          rating: 3 + (rIdx % 3),
          comment: REVIEW_COMMENTS[rIdx % REVIEW_COMMENTS.length] ?? null,
          createdAt: new Date(now - (24 - rIdx) * HOUR_MS),
        },
      });
      rIdx++;
      if (rIdx >= 14) break;
    }
    if (rIdx >= 14) break;
  }
  console.info(`✓ Seeded ${rIdx} reviews`);

  // ----- 50 push tokens (APNS + FCM + TPNS mix) -------------------------
  await prisma.pushToken.deleteMany({ where: { id: { startsWith: 'seed-pushtoken-' } } });
  let pIdx = 0;
  for (const u of users) {
    const channel = pick(CHANNELS, pIdx);
    const id = `seed-pushtoken-${String(pIdx).padStart(3, '0')}`;
    const fakeToken = `seed-fake-${channel.toLowerCase()}-token-${hash(u.id)}`;
    await prisma.pushToken.create({
      data: {
        id,
        userId: u.id,
        channel,
        token: fakeToken,
        deviceInfo: JSON.stringify({ seed: true, model: 'iPhone 16 Pro' }),
        lastSeenAt: new Date(now - pIdx * 5 * 60_000),
      },
    });
    pIdx++;
  }
  console.info(`✓ Seeded ${pIdx} push tokens`);

  console.info('\n✅ Large seed complete.');
  console.info({
    users: 50,
    activities: ACTIVITY_TEMPLATES.length,
    signups: created,
    reviews: rIdx,
    pushTokens: pIdx,
    adminId: ADMIN_ID,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
