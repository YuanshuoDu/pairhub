import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import axios from 'axios';

const WX_APPID = process.env.WX_APPID ?? '';
const WX_SECRET = process.env.WX_SECRET ?? '';
const WX_LOGIN_URL = 'https://api.weixin.qq.com/sns/jscode2session';

const wxLoginSchema = z.object({
  code: z.string().min(1).max(64),
  nickname: z.string().min(1).max(50).optional(),
  avatar: z.string().url().max(500).optional(),
});

interface WxSessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/wx-login', async (req, reply) => {
    const parsed = wxLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        type: 'https://pairhub.example.com/errors/validation',
        title: 'Validation Error',
        status: 400,
        code: 'VALIDATION_ERROR',
        errors: parsed.error.flatten(),
      });
    }

    const { code, nickname, avatar } = parsed.data;

    if (!WX_APPID || !WX_SECRET) {
      app.log.error('WX_APPID / WX_SECRET not configured');
      return reply.code(500).send({
        type: 'https://pairhub.example.com/errors/config',
        title: 'Server Config Error',
        status: 500,
        code: 'WX_CONFIG_MISSING',
        detail: '服务端未配置微信 AppID/Secret',
      });
    }

    // Call WeChat jscode2session
    let wxRes: WxSessionResponse;
    try {
      const r = await axios.get<WxSessionResponse>(WX_LOGIN_URL, {
        params: { appid: WX_APPID, secret: WX_SECRET, js_code: code, grant_type: 'authorization_code' },
        timeout: 5000,
      });
      wxRes = r.data;
    } catch (e) {
      app.log.error({ err: e }, 'wx login http error');
      return reply.code(502).send({
        type: 'https://pairhub.example.com/errors/wx',
        title: 'WeChat API Error',
        status: 502,
        code: 'WX_UNAVAILABLE',
        detail: '调用微信登录接口失败',
      });
    }

    if (wxRes.errcode || !wxRes.openid) {
      app.log.warn({ wxRes }, 'wx login failed');
      return reply.code(401).send({
        type: 'https://pairhub.example.com/errors/wx',
        title: 'WeChat Login Failed',
        status: 401,
        code: 'INVALID_CODE',
        detail: wxRes.errmsg ?? '无效的 code',
        wxErrcode: wxRes.errcode,
      });
    }

    // Upsert user
    const user = await app.prisma.user.upsert({
      where: { openid: wxRes.openid },
      create: {
        openid: wxRes.openid,
        unionid: wxRes.unionid ?? null,
        nickname: nickname ?? `用户${wxRes.openid.slice(-6)}`,
        avatar: avatar ?? null,
      },
      update: {
        unionid: wxRes.unionid ?? undefined,
        nickname: nickname ?? undefined,
        avatar: avatar ?? undefined,
      },
    });

    // Sign JWT
    const token = await reply.jwtSign({
      sub: user.id,
      openid: user.openid,
    });

    return {
      data: {
        token,
        user: {
          id: user.id,
          nickname: user.nickname,
          avatar: user.avatar,
          school: user.school,
          major: user.major,
          grade: user.grade,
          bio: user.bio,
        },
      },
    };
  });
}
