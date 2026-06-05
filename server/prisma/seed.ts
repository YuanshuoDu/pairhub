/**
 * Seed data for local dev
 * Run: pnpm prisma:seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user1 = await prisma.user.upsert({
    where: { openid: 'demo-openid-alice' },
    update: {},
    create: {
      openid: 'demo-openid-alice',
      nickname: 'Alice',
      avatar: 'https://i.pravatar.cc/150?img=1',
      school: 'MIT',
      major: 'CS',
      grade: '2026',
      bio: '爱打羽毛球的留学生',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { openid: 'demo-openid-bob' },
    update: {},
    create: {
      openid: 'demo-openid-bob',
      nickname: 'Bob',
      avatar: 'https://i.pravatar.cc/150?img=2',
      school: 'Stanford',
      major: 'EE',
      grade: '2025',
    },
  });

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const activity = await prisma.activity.upsert({
    where: { id: 'demo-activity-1' },
    update: {},
    create: {
      id: 'demo-activity-1',
      creatorId: user1.id,
      type: 'SPORTS',
      title: '周末羽毛球 3v3 (新手友好)',
      description: '求 3-4 个搭子，球馆空调够冷，自带球拍。',
      locationName: 'XX 羽毛球馆',
      locationAddr: '北京市海淀区中关村大街 1 号',
      locationLat: 39.9842,
      locationLng: 116.3074,
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000),
      maxParticipants: 8,
      currentCount: 2,
      tags: ['羽毛球', '新手友好'],
      status: 'RECRUITING',
      contentCheck: 'PASS',
    },
  });

  await prisma.signup.upsert({
    where: { activityId_userId: { activityId: activity.id, userId: user1.id } },
    update: {},
    create: { activityId: activity.id, userId: user1.id, status: 'APPROVED' },
  });
  await prisma.signup.upsert({
    where: { activityId_userId: { activityId: activity.id, userId: user2.id } },
    update: {},
    create: { activityId: activity.id, userId: user2.id, status: 'APPROVED' },
  });

  // eslint-disable-next-line no-console
  console.log('✅ Seed completed');
  // eslint-disable-next-line no-console
  console.log({ users: [user1.id, user2.id], activity: activity.id });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
