import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

type D1Result<T = Record<string, unknown>> = { results: T[]; success: boolean; meta?: Record<string, unknown> };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
};
type D1Database = { prepare(query: string): D1Statement; batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]> };
type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ADMIN_BOOTSTRAP_TOKEN: string;
  WEB_ORIGIN: string;
  BREVO_API_KEY: string;
  BREVO_SENDER_EMAIL: string;
};
type Vars = { user: { id: string; role: string } };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const fail = (c: any, status: number, message: string) => c.json({ ok: false, message }, status);
const enc = new TextEncoder();
const b64 = (v: Uint8Array) => btoa(Array.from(v, x => String.fromCharCode(x)).join(''));
const unb64 = (v: string) => Uint8Array.from(atob(v), x => x.charCodeAt(0));
const now = () => new Date().toISOString();
const stmt = (c: { env: Env }, query: string, ...args: any[]): D1Statement => c.env.DB.prepare(query).bind(...args);

function randomOtp() {
  const max = 0x100000000, ceiling = Math.floor(max / 900000) * 900000;
  let n = 0; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= ceiling);
  return String(100000 + n % 900000);
}
async function hashOtp(code: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64(salt) + ':' + b64(new Uint8Array(bits));
}
async function verifyOtp(code: string, stored: string) {
  const [s, h] = stored.split(':'); if (!s || !h) return false;
  const candidate = (await hashOtp(code, unb64(s))).split(':')[1];
  const a = enc.encode(candidate), b = enc.encode(h); if (a.length !== b.length) return false;
  let diff = 0; for (let i=0;i<a.length;i++) diff |= a[i]^b[i]; return diff === 0;
}
async function sameSecret(a: string, b: string) {
  const [x,y] = await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const aa=new Uint8Array(x),bb=new Uint8Array(y); let d=0; for(let i=0;i<aa.length;i++) d|=aa[i]^bb[i]; return d===0;
}
async function issueToken(env: Env, user: {id:string;role:string}) {
  return new SignJWT({role:user.role}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuedAt().setExpirationTime('7d').sign(enc.encode(env.JWT_SECRET));
}

app.use('/api/*', cors({
  origin: (origin,c) => origin === c.env.WEB_ORIGIN ? origin : '',
  allowMethods: ['GET','POST','PATCH','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization'], maxAge: 86400
}));
app.get('/api/health', c => c.json({ok:true,service:'AVGOON API',runtime:'cloudflare-workers-d1',time:now()}));

app.get('/api/categories', async c => {
  const {results=[]}=await stmt(c,'SELECT id,name,slug,description FROM Category ORDER BY name').all();
  return c.json(results);
});
app.get('/api/products', async c => {
  const page=Math.max(1,Number(c.req.query('page'))||1), limit=Math.min(60,Math.max(1,Number(c.req.query('limit'))||24));
  const q=(c.req.query('q')||'').trim(), category=c.req.query('category')||'', pattern='%'+q+'%';
  const where='p.isPublished=1 AND (p.name LIKE ? OR p.sku LIKE ?) AND (? = \'\' OR c.slug = ?)';
  const args=[pattern,pattern,category,category];
  const [{results=[]},{results:count=[]}]=await Promise.all([
    stmt(c,`SELECT p.id,p.sku,p.name,p.slug,p.description,p.priceToman,p.stock,p.unit,p.imageUrl,p.brand,p.isPublished,p.categoryId,p.createdAt,p.updatedAt,CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id',c.id,'name',c.name,'slug',c.slug) END AS category FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE ${where} ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`,...args,limit,(page-1)*limit).all(),
    stmt(c,`SELECT COUNT(*) AS total FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE ${where}`,...args).all()
  ]);
  return c.json({items:results,total:count[0]?.total||0,page,limit});
});
app.get('/api/products/:slug', async c => {
  const row=await stmt(c,`SELECT p.id,p.sku,p.name,p.slug,p.description,p.priceToman,p.stock,p.unit,p.imageUrl,p.brand,p.isPublished,CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id',c.id,'name',c.name,'slug',c.slug) END AS category FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE p.slug=? AND p.isPublished=1 LIMIT 1`,c.req.param('slug')).first();
  return row ? c.json(row) : fail(c,404,'محصول پیدا نشد');
});

app.post('/api/auth/request-otp', async c => {
  const parsed=z.object({target:z.string().trim().min(5).max(150),channel:z.enum(['email','phone'])}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return fail(c,400,'اطلاعات ورود معتبر نیست');
  const {channel}=parsed.data, target=channel==='email'?parsed.data.target.toLowerCase():parsed.data.target.replace(/[\s-]/g,'');
  if(channel==='email'&&!/^\S+@\S+\.\S+$/.test(target)) return fail(c,400,'ایمیل معتبر نیست');
  if(channel==='phone'&&!/^\+?[0-9]{10,15}$/.test(target)) return fail(c,400,'شماره موبایل معتبر نیست');
  if(channel==='phone') return fail(c,503,'ورود با پیامک هنوز به ارائه‌دهنده پیامک متصل نشده است');
  if(!c.env.BREVO_API_KEY||!c.env.BREVO_SENDER_EMAIL) return fail(c,503,'سرویس ایمیل هنوز پیکربندی نشده است');
  const recent=await stmt(c,"SELECT COUNT(*) AS n FROM OtpCode WHERE target=? AND channel='email' AND createdAt>=?",target,new Date(Date.now()-900000).toISOString()).first<{n:number}>();
  if((recent?.n||0)>=5) return fail(c,429,'تعداد درخواست‌ها بیش از حد مجاز است؛ بعداً دوباره تلاش کنید');
  const code=randomOtp(), id=crypto.randomUUID();
  await stmt(c,'INSERT INTO OtpCode(id,target,channel,codeHash,expiresAt,createdAt) VALUES(?,?,?,?,?,?)',id,target,'email',await hashOtp(code),new Date(Date.now()+300000).toISOString(),now()).run();
  try {
    const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':c.env.BREVO_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({sender:{name:'آوگون',email:c.env.BREVO_SENDER_EMAIL},to:[{email:target}],subject:'کد ورود آوگون',textContent:`کد تأیید ورود شما: ${code}\nاین کد تا ۵ دقیقه معتبر است.`})});
    if(!response.ok) throw new Error('EMAIL_PROVIDER_ERROR');
    return c.json({ok:true,message:'کد تأیید به ایمیل شما ارسال شد.'});
  } catch { await stmt(c,'UPDATE OtpCode SET consumedAt=? WHERE id=?',now(),id).run(); return fail(c,502,'ارسال ایمیل ناموفق بود؛ کمی بعد دوباره تلاش کنید'); }
});
app.post('/api/auth/verify-otp', async c => {
  const parsed=z.object({target:z.string().trim().min(5).max(150),channel:z.enum(['email','phone']),code:z.string().length(6),name:z.string().trim().min(2).max(120).optional()}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return fail(c,400,'کد یا اطلاعات ورود نامعتبر است');
  const {target:raw,channel,code,name}=parsed.data, target=channel==='email'?raw.toLowerCase():raw.replace(/[\s-]/g,'');
  if(channel==='phone') return fail(c,503,'ورود با پیامک هنوز فعال نشده است');
  const record=await stmt(c,"SELECT id,codeHash,attempts FROM OtpCode WHERE target=? AND channel=? AND consumedAt IS NULL AND expiresAt>? AND attempts<5 ORDER BY createdAt DESC LIMIT 1",target,channel,now()).first<any>();
  if(!record) return fail(c,400,'کد منقضی شده یا وجود ندارد');
  if(!await verifyOtp(code,record.codeHash)){await stmt(c,'UPDATE OtpCode SET attempts=attempts+1 WHERE id=?',record.id).run();return fail(c,400,'کد تأیید اشتباه است');}
  await stmt(c,'UPDATE OtpCode SET consumedAt=? WHERE id=?',now(),record.id).run();
  const userId=crypto.randomUUID();
  await stmt(c,'INSERT INTO User(id,email,name,role,createdAt) VALUES(?,?,?,\'CUSTOMER\',?) ON CONFLICT(email) DO UPDATE SET name=COALESCE(excluded.name,User.name)',userId,target,name||null,now()).run();
  const user=await stmt(c,'SELECT id,name,email,phone,role FROM User WHERE email=?',target).first<any>();
  return c.json({token:await issueToken(c.env,user),user});
});

async function requireAdmin(c:any,next:any){
  try{
    const token=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,''); if(!token)return fail(c,401,'ابتدا وارد حساب کاربری شوید');
    const {payload}=await jwtVerify(token,enc.encode(c.env.JWT_SECRET)); if(!payload.sub)return fail(c,401,'نشست معتبر نیست');
    const user=await stmt(c,'SELECT id,role FROM User WHERE id=?',payload.sub).first<any>();
    if(!user)return fail(c,401,'حساب کاربری پیدا نشد'); if(user.role!=='ADMIN')return fail(c,403,'دسترسی غیرمجاز');
    c.set('user',user); await next();
  }catch{return fail(c,401,'ابتدا وارد حساب کاربری شوید');}
}
app.post('/api/admin/bootstrap',async c=>{
  const p=z.object({token:z.string().min(32).max(512),channel:z.enum(['email','phone']),target:z.string().trim().min(5).max(150)}).safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return fail(c,400,'اطلاعات واردشده معتبر نیست');
  const target=p.data.channel==='email'?p.data.target.toLowerCase():p.data.target.replace(/[\s-]/g,'');
  const key='bootstrap:'+(c.req.header('CF-Connecting-IP')||'unknown'), cutoff=new Date(Date.now()-3600000).toISOString();
  const attempts=await stmt(c,"SELECT COUNT(*) AS n FROM OtpCode WHERE target=? AND channel='bootstrap' AND createdAt>?",key,cutoff).first<any>();
  if((attempts?.n||0)>=5)return fail(c,429,'تعداد تلاش‌های راه‌اندازی بیش از حد مجاز است');
  await stmt(c,"INSERT INTO OtpCode(id,target,channel,codeHash,expiresAt,consumedAt,createdAt) VALUES(?,?,'bootstrap','attempt',?,?,?)",crypto.randomUUID(),key,new Date(Date.now()+3600000).toISOString(),now(),now()).run();
  if(!await sameSecret(p.data.token,c.env.ADMIN_BOOTSTRAP_TOKEN||''))return fail(c,403,'کلید راه‌اندازی معتبر نیست');
  const existing=await stmt(c,"SELECT COUNT(*) AS n FROM User WHERE role='ADMIN'").first<any>();
  if((existing?.n||0)>0)return fail(c,409,'مدیر قبلاً ایجاد شده است؛ راه‌اندازی اولیه بسته شده است');
  const field=p.data.channel==='email'?'email':'phone';
  const result=await stmt(c,`UPDATE User SET role='ADMIN' WHERE id=(SELECT id FROM User WHERE ${field}=? LIMIT 1) AND role='CUSTOMER' AND NOT EXISTS(SELECT 1 FROM User WHERE role='ADMIN') RETURNING id,name,email,phone,role`,target).all<any>();
  if(result.results?.length)return c.json({ok:true,user:result.results[0],message:'مدیر اصلی با موفقیت فعال شد.'});
  return fail(c,404,'ابتدا با همین ایمیل یا شماره موبایل ثبت‌نام و آن را تأیید کنید');
});

async function requireUser(c:any,next:any){
  try {
    const token=(c.req.header('Authorization')||'').replace(/^Bearer\\s+/i,'');
    if(!token)return fail(c,401,'ابتدا وارد حساب کاربری شوید');
    const {payload}=await jwtVerify(token,enc.encode(c.env.JWT_SECRET));
    if(!payload.sub)return fail(c,401,'نشست معتبر نیست');
    const user=await stmt(c,'SELECT id,role FROM User WHERE id=?',payload.sub).first<any>();
    if(!user)return fail(c,401,'حساب کاربری پیدا نشد');
    c.set('user',user); await next();
  } catch { return fail(c,401,'ابتدا وارد حساب کاربری شوید'); }
}
app.post('/api/orders',requireUser,async c=>{
  const parsed=z.object({
    items:z.array(z.object({productId:z.string().min(1),quantity:z.number().int().min(1).max(1000)})).min(1).max(50),
    address:z.object({name:z.string().trim().min(2).max(120),phone:z.string().trim().min(8).max(20),province:z.string().trim().min(2).max(80),city:z.string().trim().min(2).max(80),details:z.string().trim().min(5).max(500),postalCode:z.string().trim().max(20).optional()}),
    note:z.string().max(1000).optional()
  }).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({ok:false,message:'اطلاعات سفارش معتبر نیست',errors:parsed.error.flatten()},400);
  const key=(c.req.header('Idempotency-Key')||'').trim();
  if(!/^[A-Za-z0-9._:-]{12,128}$/.test(key))return fail(c,400,'شناسه یکتای سفارش معتبر نیست');
  const user=c.get('user') as {id:string};
  const idempotencyKey=user.id+':'+key;
  const existing=await stmt(c,'SELECT id,status,totalToman,createdAt FROM "Order" WHERE idempotencyKey=?',idempotencyKey).first<any>();
  if(existing)return c.json({ok:true,replayed:true,order:existing});
  const ids=[...new Set(parsed.data.items.map(x=>x.productId))];
  if(ids.length!==parsed.data.items.length)return fail(c,400,'هر کالا فقط باید یک‌بار در فهرست سفارش باشد');
  const placeholders=ids.map(()=>'?').join(',');
  const products=await stmt(c,`SELECT id,name,sku,priceToman,stock,isPublished FROM Product WHERE id IN (${placeholders})`,...ids).all<any>();
  if(products.results.length!==ids.length)return fail(c,400,'یک یا چند کالا پیدا نشد');
  const byId=new Map(products.results.map((p:any)=>[p.id,p]));
  let total=0n;
  const orderId=crypto.randomUUID(), created=now();
  const orderItems=parsed.data.items.map(item=>{
    const p:any=byId.get(item.productId);
    if(!p.isPublished)throw new Error('PRODUCT_UNAVAILABLE');
    if(p.priceToman===null||p.priceToman===undefined)throw new Error('PRICE_UNAVAILABLE');
    if(Number(p.stock)<item.quantity)throw new Error('INSUFFICIENT_STOCK');
    const price=BigInt(String(p.priceToman)); total+=price*BigInt(item.quantity);
    return {id:crypto.randomUUID(),productId:p.id,quantity:item.quantity,unitPriceToman:String(price)};
  });
  const statements=[
    stmt(c,'INSERT INTO "Order"(id,userId,status,totalToman,address,note,createdAt,idempotencyKey) VALUES(?,?,\'PENDING\',?,?,?,?,?)',orderId,user.id,String(total),JSON.stringify(parsed.data.address),parsed.data.note||null,created,idempotencyKey),
    ...orderItems.map(item=>stmt(c,'INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)',item.id,orderId,item.productId,item.quantity,item.unitPriceToman))
  ];
  try {
    await c.env.DB.batch(statements);
    return c.json({ok:true,replayed:false,order:{id:orderId,status:'PENDING',totalToman:String(total),createdAt:created}},201);
  } catch(e) {
    const replay=await stmt(c,'SELECT id,status,totalToman,createdAt FROM "Order" WHERE idempotencyKey=?',idempotencyKey).first<any>();
    if(replay)return c.json({ok:true,replayed:true,order:replay});
    const message=String(e);
    if(message.includes('INSUFFICIENT_STOCK'))return fail(c,409,'موجودی یکی از کالاها کافی نیست');
    return fail(c,409,'ثبت سفارش انجام نشد؛ موجودی یا قیمت کالاها را دوباره بررسی کنید');
  }
});

app.use('/api/admin/*',requireAdmin);
app.get('/api/admin/summary',async c=>{
  const row=await stmt(c,`SELECT (SELECT COUNT(*) FROM User) AS users,(SELECT COUNT(*) FROM "Order") AS orders,(SELECT COUNT(*) FROM "Order" WHERE status='PENDING') AS pendingOrders,(SELECT COALESCE(SUM(totalToman),0) FROM "Order" WHERE status IN ('PAID','PROCESSING','SHIPPED','COMPLETED')) AS paidTotalToman`).first<any>();
  return c.json(row);
});
app.get('/api/admin/users',async c=>{
  const page=Math.max(1,Number(c.req.query('page'))||1),limit=Math.min(100,Math.max(1,Number(c.req.query('limit'))||25)),q=(c.req.query('q')||'').trim(),like='%'+q+'%';
  const where="(?='' OR COALESCE(u.name,'') LIKE ? OR COALESCE(u.phone,'') LIKE ? OR COALESCE(u.email,'') LIKE ?)";
  const [{results=[]},{results:counts=[]}]=await Promise.all([
    stmt(c,`SELECT u.id,u.name,u.phone,u.email,u.role,u.createdAt,(SELECT COUNT(*) FROM "Order" o WHERE o.userId=u.id) AS _count FROM User u WHERE ${where} ORDER BY u.createdAt DESC LIMIT ? OFFSET ?`,q,like,like,like,limit,(page-1)*limit).all(),
    stmt(c,`SELECT COUNT(*) AS total FROM User u WHERE ${where}`,q,like,like,like).all()
  ]);
  return c.json({items:results,total:counts[0]?.total||0,page,limit});
});
app.get('/api/admin/orders',async c=>{
  const page=Math.max(1,Number(c.req.query('page'))||1),limit=Math.min(100,Math.max(1,Number(c.req.query('limit'))||25)),status=c.req.query('status')||'';
  const [{results=[]},{results:counts=[]}]=await Promise.all([
    stmt(c,`SELECT o.id,o.status,o.totalToman,o.address,o.note,o.createdAt,json_object('id',u.id,'name',u.name,'phone',u.phone,'email',u.email) AS user,COALESCE((SELECT json_group_array(json_object('id',oi.id,'quantity',oi.quantity,'unitPriceToman',oi.unitPriceToman,'product',json_object('id',p.id,'name',p.name,'sku',p.sku))) FROM OrderItem oi JOIN Product p ON p.id=oi.productId WHERE oi.orderId=o.id),'[]') AS items FROM "Order" o JOIN User u ON u.id=o.userId WHERE (?='' OR o.status=?) ORDER BY o.createdAt DESC LIMIT ? OFFSET ?`,status,status,limit,(page-1)*limit).all(),
    stmt(c,'SELECT COUNT(*) AS total FROM "Order" o WHERE (?=\'\' OR o.status=?)',status,status).all()
  ]);
  return c.json({items:results.map((x:any)=>({...x,user:JSON.parse(x.user),items:JSON.parse(x.items)})),total:counts[0]?.total||0,page,limit});
});
app.patch('/api/admin/orders/:id/status',async c=>{
  const p=z.object({status:z.enum(['PENDING','PAID','PROCESSING','SHIPPED','COMPLETED','CANCELLED'])}).safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return fail(c,400,'وضعیت سفارش معتبر نیست');
  const row=await stmt(c,'UPDATE "Order" SET status=? WHERE id=? RETURNING id,status,totalToman,createdAt',p.data.status,c.req.param('id')).first();
  return row?c.json(row):fail(c,404,'سفارش پیدا نشد');
});
app.post('/api/admin/products',async c=>{
  const p=z.object({sku:z.string().min(1),name:z.string().min(2),slug:z.string().min(2),description:z.string().optional(),priceToman:z.union([z.number().int().nonnegative(),z.string()]).optional(),stock:z.number().int().nonnegative().default(0),unit:z.string().default('عدد'),brand:z.string().optional(),categorySlug:z.string().optional(),imageUrl:z.string().url().optional(),isPublished:z.boolean().default(false)}).safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return c.json({ok:false,errors:p.error.flatten()},400);
  const x=p.data,id=crypto.randomUUID(),time=now();
  try{
    await stmt(c,`INSERT INTO Product(id,sku,name,slug,description,priceToman,stock,unit,brand,imageUrl,isPublished,categoryId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,x.sku,x.name,x.slug,x.description||null,x.priceToman===undefined?null:String(x.priceToman),x.stock,x.unit,x.brand||null,x.imageUrl||null,x.isPublished?1:0,x.categorySlug? (await stmt(c,'SELECT id FROM Category WHERE slug=?',x.categorySlug).first<any>())?.id||null:null,time,time).run();
    return c.json({id,sku:x.sku,name:x.name,slug:x.slug,priceToman:x.priceToman??null,stock:x.stock,isPublished:x.isPublished},201);
  }catch{return fail(c,409,'کد کالا یا نشانی محصول تکراری است');}
});
export default app;
