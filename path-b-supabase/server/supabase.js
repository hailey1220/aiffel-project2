// ─────────────────────────────────────────────────────────────
// Supabase 연결 + 로그인 확인
//
// - 키는 .env에서만 읽습니다. 화면(public/)에는 키가 전혀 없습니다.
// - publishable 키 + '사용자 로그인 토큰'으로 접속하므로 RLS가 적용됩니다.
// - 로그인 토큰은 httpOnly 쿠키에 담겨서, 화면의 자바스크립트가 읽을 수 없습니다.
// - 로그인 처리는 Supabase 공식 라이브러리(@supabase/ssr)가 합니다.
// ─────────────────────────────────────────────────────────────
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key || url.includes('xxxx') || key.includes('xxxx')) {
  console.error('\n[설정 필요] .env에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 실제 값으로 넣어 주세요. (.env.example 참고)\n');
  process.exit(1);
}

// 실수로 관리자 키를 넣으면 RLS가 무시되므로 아예 시작하지 않습니다.
function looksLikeAdminKey(k) {
  if (k.startsWith('sb_secret_')) return true;
  if (k.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString());
      return payload.role === 'service_role';
    } catch { return false; }
  }
  return false;
}
if (looksLikeAdminKey(key)) {
  console.error('\n[위험] SUPABASE_PUBLISHABLE_KEY에 secret(관리자) 키가 들어 있습니다.');
  console.error('이 앱은 RLS를 적용하기 위해 publishable 키(sb_publishable_...)만 사용합니다.\n');
  process.exit(1);
}

const secure = process.env.NODE_ENV === 'production'; // 배포(HTTPS)에서는 Secure 쿠키
const cookieRules = { httpOnly: true, sameSite: 'lax', secure, path: '/' };

// 요청 하나에 Supabase 연결 하나. (사용자끼리 섞이지 않도록 절대 공유하지 않음)
export function supabaseFor(req, res) {
  return createServerClient(url, key, {
    cookieOptions: cookieRules,
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie ?? '').map(({ name, value }) => ({
          name, value: value ?? '',
        }));
      },
      setAll(cookiesToSet, headers) {
        if (res.headersSent) return;
        for (const { name, value, options } of cookiesToSet) {
          res.append('Set-Cookie', serializeCookieHeader(name, value, { ...options, ...cookieRules }));
        }
        for (const [h, v] of Object.entries(headers ?? {})) res.setHeader(h, v);
      },
    },
  });
}

// 로그인한 사용자만 통과시키는 문지기
// getClaims()는 토큰 서명을 검증하고, 만료됐으면 자동으로 새 토큰으로 바꿔 줍니다.
export async function requireUser(req, res, next) {
  try {
    const supabase = supabaseFor(req, res);
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    req.supabase = supabase;
    req.user = { id: data.claims.sub, email: data.claims.email };
    next();
  } catch (err) {
    next(err);
  }
}
