import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { neon } from '@neondatabase/serverless';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  ADMIN_BOOTSTRAP_TOKEN: string;
  WEB_ORIGIN: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
};

type Vars = { user: { id: string; role: string } };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const db = (env: Env) => neon(env.DATABASE_URL);
const fail = (c: any, status: number, message: string) => c.json({ ok: false, message }, status);
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, x => String.fromCharCode(x)).join(''));
const unb64 = (value: string) => Uint8Array.from(atob(value), x => x.charCodeAt(0));

function randomOtp() {
  const max = 0x100000000;
  const ceiling = Math.floor(max / 900000) * 900000;
  let value = 0;
  do { const a = crypto.getRandomValues(new Uint32Array(1)); value = a[0]; } while (value >= ceiling);
  return String(100000 + (value % 900000));
}
async function hashOtp(code: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `${b64(salt)}:${b64(new Uint8Array(bits))}`;
}
async function verifyOtp(code: string, stored: string) {
  const [saltText, hashText] = stored.split(':');
  if (!saltText || !hashText) return false;
  const candidate = await hashOtp(code, unb64(saltText));
  const a = encoder.encode(candidate.split(':')[1]);
  const b = encoder.encode(hashText);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function sameSecret(a: string, b: string) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(a)), crypto.subtle.digest('SHA-256', encoder.encode(b))]);
  const aa = new Uint8Array(x), bb = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function issueToken(env: Env, user: { id: string; role: string }) {
  return new SignJWT({ role: user.role }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('7d').sign(encoder.encode(env.JWT_SECRET));
}

app.use('/api/*', cors({
  origin: (origin, c) => origin === c.env.WEB_ORIGIN ? origin : '',
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

app.get('/api/health', (c) => c.json({ ok: true, service: 'AVGOON API', runtime: 'cloudflare-workers', time: new Date().toISOString() }));

app.get('/api/categories', async (c) => {
  const sql = db(c.env);
  const rows = await sql`SELECT id, name, slug, description FROM "Category" ORDER BY name ASC`;
  return c.json(rows);
});

app.get('/api/products', async (c) => {
  const sql = db(c.env);
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(60, Math.max(1, Number(c.req.query('limit')) || 24));
  const q = (c.req.query('q') || '').trim();
  const category = c.req.query('category') || '';
  const where = category
    ? sql`p."isPublished" = true AND (p.name ILIKE ${'%' + q + '%'} OR p.sku ILIKE ${'%' + q + '%'}) AND c.slug = ${category}`
    : sql`p."isPublished" = true AND (p.name ILIKE ${'%' + q + '%'} OR p.sku ILIKE ${'%' + q + '%'})`;
  const [items, totals] = await Promise.all([
    sql`SELECT p.id,p.sku,p.name,p.slug,p.description,p."priceToman"::text AS "priceToman",p.stock,p.unit,p."imageUrl",p.brand,p."isPublished",p."categoryId",p."createdAt",p."updatedAt",CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id',c.id,'name',c.name,'slug',c.slug) END AS category FROM "Product" p LEFT JOIN "Category" c ON c.id=p."categoryId" WHERE ${where} ORDER BY p."createdAt" DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    sql`SELECT COUNT(*)::int AS total FROM "Product" p LEFT JOIN "Category" c ON c.id=p."categoryId" WHERE ${where}`
  ]);
  return c.json({ items, total: totals[0]?.total || 0, page, limit });
});

app.get('/api/products/:slug', async (c) => {
  const sql = db(c.env);
  const rows = await sql`SELECT p.id,p.sku,p.name,p.slug,p.description,p."priceToman"::text AS "priceToman",p.stock,p.unit,p."imageUrl",p.brand,p."isPublished",CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id',c.id,'name',c.name,'slug',c.slug) END AS category FROM "Product" p LEFT JOIN "Category" c ON c.id=p."categoryId" WHERE p.slug=${c.req.param('slug')} AND p."isPublished"=true LIMIT 1`;
  if (!rows.length) return fail(c, 404, 'محصول پیدا نشد');
  return c.json(rows[0]);
});

app.post('/api/auth/request-otp', async (c) => {
  const parsed = z.object({ target: z.string().trim().min(5).max(150), channel: z.enum(['email', 'phone']) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'اطلاعات ورود معتبر نیست');
  const { channel } = parsed.data;
  const target = channel === 'email' ? parsed.data.target.toLowerCase() : parsed.data.target.replace(/[\s-]/g, '');
  if (channel === 'email' && !/^\S+@\S+\.\S+$/.test(target)) return fail(c, 400, 'ایمیل معتبر نیست');
  if (channel === 'phone' && !/^\+?[0-9]{10,15}$/.test(target)) return fail(c, 400, 'شماره موبایل معتبر نیست');
  if (channel === 'phone') return fail(c, 503, 'ورود با پیامک هنوز به ارائه‌دهنده پیامک متصل نشده است');
  if (!c.env.BREVO_API_KEY || !c.env.BREVO_SENDER_EMAIL) return fail(c, 503, 'سرویس ایمیل هنوز پیکربندی نشده است');
  const sql = db(c.env);
  const recent = await sql`SELECT COUNT(*)::int AS n FROM "OtpCode" WHERE target=${target} AND channel='email' AND "createdAt">NOW()-INTERVAL '15 minutes'`;
  if ((recent[0]?.n || 0) >= 5) return fail(c, 429, 'تعداد درخواست‌ها بیش از حد مجاز است؛ بعداً دوباره تلاش کنید');
  const code = randomOtp();
  const codeHash = await hashOtp(code);
  const id = crypto.randomUUID();
  await sql`INSERT INTO "OtpCode"(id,target,channel,"codeHash","expiresAt") VALUES(${id},${target},'email',${codeHash},NOW()+INTERVAL '5 minutes')`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.env.RESEND_FROM, to: [target], subject: 'کد ورود آوگون', text: `کد تأیید ورود شما: ${code}\nاین کد تا ۵ دقیقه معتبر است.` })
    });
    if (!response.ok) throw new Error('EMAIL_PROVIDER_ERROR');
    return c.json({ ok: true, message: 'کد تأیید به ایمیل شما ارسال شد.' });
  } catch {
    await sql`UPDATE "OtpCode" SET "consumedAt"=NOW() WHERE id=${id}`;
    return fail(c, 502, 'ارسال ایمیل ناموفق بود؛ کمی بعد دوباره تلاش کنید');
  }
});

app.post('/api/auth/verify-otp', async (c) => {
  const parsed = z.object({ target: z.string().trim().min(5).max(150), channel: z.enum(['email', 'phone']), code: z.string().length(6), name: z.string().trim().min(2).max(120).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'کد یا اطلاعات ورود نامعتبر است');
  const { target: rawTarget, channel, code, name } = parsed.data;
  const target = channel === 'email' ? rawTarget.toLowerCase() : rawTarget.replace(/[\s-]/g, '');
  if (channel === 'phone') return fail(c, 503, 'ورود با پیامک هنوز فعال نشده است');
  const sql = db(c.env);
  const records = await sql`SELECT id,"codeHash",attempts FROM "OtpCode" WHERE target=${target} AND channel=${channel} AND "consumedAt" IS NULL AND "expiresAt">NOW() AND attempts<5 ORDER BY "createdAt" DESC LIMIT 1`;
  const record = records[0];
  if (!record) return fail(c, 400, 'کد منقضی شده یا وجود ندارد');
  if (!await verifyOtp(code, record.codeHash)) {
    await sql`UPDATE "OtpCode" SET attempts=attempts+1 WHERE id=${record.id}`;
    return fail(c, 400, 'کد تأیید اشتباه است');
  }
  await sql`UPDATE "OtpCode" SET "consumedAt"=NOW() WHERE id=${record.id}`;
  const rows = await sql`INSERT INTO "User"(id,email,name) VALUES(${crypto.randomUUID()},${target},${name || null}) ON CONFLICT(email) DO UPDATE SET name=COALESCE(EXCLUDED.name,"User".name) RETURNING id,name,email,phone,role`;
  const user = rows[0] as { id: string; role: string; name: string | null; email: string | null; phone: string | null };
  const token = await issueToken(c.env, user);
  return c.json({ token, user });
});

async function requireAdmin(c: any, next: any) {
  try {
    const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(c, 401, 'ابتدا وارد حساب کاربری شوید');
    const { payload } = await jwtVerify(token, encoder.encode(c.env.JWT_SECRET));
    if (!payload.sub) return fail(c, 401, 'نشست معتبر نیست');
    const sql = db(c.env);
    const rows = await sql`SELECT id,role FROM "User" WHERE id=${payload.sub} LIMIT 1`;
    if (!rows.length) return fail(c, 401, 'حساب کاربری پیدا نشد');
    if (rows[0].role !== 'ADMIN') return fail(c, 403, 'دسترسی غیرمجاز');
    c.set('user', rows[0]);
    await next();
  } catch {
    return fail(c, 401, 'ابتدا وارد حساب کاربری شوید');
  }
}

app.post('/api/admin/bootstrap', async (c) => {
  const parsed = z.object({ token: z.string().min(32).max(512), channel: z.enum(['email', 'phone']), target: z.string().trim().min(5).max(150) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'اطلاعات واردشده معتبر نیست');
  if (!await sameSecret(parsed.data.token, c.env.ADMIN_BOOTSTRAP_TOKEN || '')) return fail(c, 403, 'کلید راه‌اندازی معتبر نیست');
  const target = parsed.data.channel === 'email' ? parsed.data.target.toLowerCase() : parsed.data.target.replace(/[\s-]/g, '');
  const sql = db(c.env);
  const result = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(72190422)`,
    sql`SELECT COUNT(*)::int AS n FROM "User" WHERE role='ADMIN'`,
    sql`UPDATE "User" SET role='ADMIN' WHERE id=(SELECT id FROM "User" WHERE ${parsed.data.channel === 'email' ? sql`email=${target}` : sql`phone=${target}`} LIMIT 1) AND role='CUSTOMER' AND NOT EXISTS(SELECT 1 FROM "User" WHERE role='ADMIN') RETURNING id,name,email,phone,role`
  ]);
  const adminRows = result[2] as any[];
  if (adminRows?.length) return c.json({ ok: true, user: adminRows[0], message: 'مدیر اصلی با موفقیت فعال شد.' });
  const admins = result[1] as any[];
  if ((admins?.[0]?.n || 0) > 0) return fail(c, 409, 'مدیر قبلاً ایجاد شده است؛ راه‌اندازی اولیه بسته شده است');
  return fail(c, 404, 'ابتدا با همین ایمیل یا شماره موبایل ثبت‌نام و آن را تأیید کنید');
});

app.use('/api/admin/*', requireAdmin);

app.get('/api/admin/summary', async (c) => {
  const sql = db(c.env);
  const rows = await sql`SELECT (SELECT COUNT(*)::int FROM "User") AS users,(SELECT COUNT(*)::int FROM "Order") AS orders,(SELECT COUNT(*)::int FROM "Order" WHERE status='PENDING') AS "pendingOrders",(SELECT COALESCE(SUM("totalToman"),0)::text FROM "Order" WHERE status IN ('PAID','PROCESSING','SHIPPED','COMPLETED')) AS "paidTotalToman"`;
  return c.json(rows[0]);
});

app.get('/api/admin/users', async (c) => {
  const sql = db(c.env);
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 25));
  const q = (c.req.query('q') || '').trim();
  const pattern = '%' + q + '%';
  const [items, totals] = await Promise.all([
    sql`SELECT u.id,u.name,u.phone,u.email,u.role,u."createdAt",(SELECT COUNT(*)::int FROM "Order" o WHERE o."userId"=u.id) AS "_count" FROM "User" u WHERE (${q}='' OR COALESCE(u.name,'') ILIKE ${pattern} OR COALESCE(u.phone,'') ILIKE ${pattern} OR COALESCE(u.email,'') ILIKE ${pattern}) ORDER BY u."createdAt" DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    sql`SELECT COUNT(*)::int AS total FROM "User" u WHERE (${q}='' OR COALESCE(u.name,'') ILIKE ${pattern} OR COALESCE(u.phone,'') ILIKE ${pattern} OR COALESCE(u.email,'') ILIKE ${pattern})`
  ]);
  return c.json({ items, total: totals[0]?.total || 0, page, limit });
});

app.get('/api/admin/orders', async (c) => {
  const sql = db(c.env);
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 25));
  const status = c.req.query('status') || '';
  const [items, totals] = await Promise.all([
    sql`SELECT o.id,o.status,o."totalToman"::text AS "totalToman",o.address,o.note,o."createdAt",json_build_object('id',u.id,'name',u.name,'phone',u.phone,'email',u.email) AS "user",COALESCE((SELECT json_agg(json_build_object('id',oi.id,'quantity',oi.quantity,'unitPriceToman',oi."unitPriceToman"::text,'product',json_build_object('id',p.id,'name',p.name,'sku',p.sku))) FROM "OrderItem" oi JOIN "Product" p ON p.id=oi."productId" WHERE oi."orderId"=o.id),'[]'::json) AS items FROM "Order" o JOIN "User" u ON u.id=o."userId" WHERE (${status}='' OR o.status::text=${status}) ORDER BY o."createdAt" DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    sql`SELECT COUNT(*)::int AS total FROM "Order" o WHERE (${status}='' OR o.status::text=${status})`
  ]);
  return c.json({ items, total: totals[0]?.total || 0, page, limit });
});

app.patch('/api/admin/orders/:id/status', async (c) => {
  const parsed = z.object({ status: z.enum(['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED']) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'وضعیت سفارش معتبر نیست');
  const sql = db(c.env);
  const rows = await sql`UPDATE "Order" SET status=${parsed.data.status} WHERE id=${c.req.param('id')} RETURNING id,status,"totalToman"::text AS "totalToman","createdAt"`;
  if (!rows.length) return fail(c, 404, 'سفارش پیدا نشد');
  return c.json(rows[0]);
});

app.post('/api/admin/products', async (c) => {
  const parsed = z.object({ sku: z.string().min(1), name: z.string().min(2), slug: z.string().min(2), description: z.string().optional(), priceToman: z.union([z.number().int().nonnegative(), z.string()]).optional(), stock: z.number().int().nonnegative().default(0), unit: z.string().default('عدد'), brand: z.string().optional(), categorySlug: z.string().optional(), imageUrl: z.string().url().optional(), isPublished: z.boolean().default(false) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, errors: parsed.error.flatten() }, 400);
  const p = parsed.data;
  const sql = db(c.env);
  const rows = await sql`INSERT INTO "Product"(id,sku,name,slug,description,"priceToman",stock,unit,brand,"imageUrl","isPublished","categoryId","updatedAt") VALUES(${crypto.randomUUID()},${p.sku},${p.name},${p.slug},${p.description || null},${p.priceToman === undefined ? null : String(p.priceToman)},${p.stock},${p.unit},${p.brand || null},${p.imageUrl || null},${p.isPublished},(SELECT id FROM "Category" WHERE slug=${p.categorySlug || ''} LIMIT 1),NOW()) RETURNING id,sku,name,slug,"priceToman"::text AS "priceToman",stock,"isPublished"`;
  return c.json(rows[0], 201);
});

export default app;
