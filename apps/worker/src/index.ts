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
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL?: string;
};
type Vars = { user: { id: string; role: string } };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const fail = (c: any, status: number, message: string) => c.json({ ok: false, message }, status);
const enc = new TextEncoder();
const b64 = (v: Uint8Array) => btoa(Array.from(v, x => String.fromCharCode(x)).join(''));
const unb64 = (v: string) => Uint8Array.from(atob(v), x => x.charCodeAt(0));
const now = () => new Date().toISOString();
const stmt = (c: { env: Env }, query: string, ...args: any[]): D1Statement => c.env.DB.prepare(query).bind(...args);
// Public product responses expose parsed technicalSpecs alongside the ordered gallery.
async function attachProductImages(c:any, rows:any[]) {
  if(!rows.length)return rows;
  const ids=rows.map(r=>r.id), marks=ids.map(()=>'?').join(',');
  const {results=[]}=await stmt(c,`SELECT productId,url,alt,sortOrder,isPrimary FROM ProductImage WHERE productId IN (${marks}) ORDER BY productId,sortOrder`,...ids).all<any>();
  const grouped=new Map<string,any[]>();
  for(const image of results){const list=grouped.get(image.productId)||[];list.push({url:image.url,alt:image.alt||'',sortOrder:image.sortOrder,isPrimary:!!image.isPrimary});grouped.set(image.productId,list);}
  return rows.map(row=>{const images=grouped.get(row.id)||[];let technicalSpecs=row.technicalSpecs??null;if(typeof technicalSpecs==='string'){try{technicalSpecs=JSON.parse(technicalSpecs)}catch{technicalSpecs=null}}return {...row,technicalSpecs,images,imageUrl:images.find(x=>x.isPrimary)?.url||images[0]?.url||row.imageUrl};});
}
async function replaceProductImages(c:any, productId:string, images:{url:string;alt?:string}[]) {
  const statements=[stmt(c,'DELETE FROM ProductImage WHERE productId=?',productId),...images.map((image,index)=>stmt(c,'INSERT INTO ProductImage(id,productId,url,alt,sortOrder,isPrimary,createdAt) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),productId,image.url,image.alt||null,index,index===0?1:0,now()))];
  await c.env.DB.batch(statements);
  await stmt(c,'UPDATE Product SET imageUrl=?,updatedAt=? WHERE id=?',images[0]?.url||null,now(),productId).run();
}

async function hashKey(value:string) {
  const digest=await crypto.subtle.digest('SHA-256',enc.encode(value));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

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
  origin: (origin,c) => {
    const previewOrigin = /^https:\/\/[a-z0-9-]+\.avgoon-store\.pages\.dev$/.test(origin || '');
    return origin === c.env.WEB_ORIGIN || previewOrigin ? origin : '';
  },
  allowMethods: ['GET','POST','PATCH','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization','Idempotency-Key'], maxAge: 86400
}));
app.get('/api/health', c => c.json({ok:true,service:'AVGOON API',runtime:'cloudflare-workers-d1',time:now()}));

app.post('/api/inquiries',async c=>{
  const p=z.object({
    name:z.string().trim().min(2).max(120),
    phone:z.string().trim().min(8).max(24),
    email:z.union([z.string().trim().email().max(150),z.literal('')]).optional(),
    projectType:z.string().trim().max(120).optional(),
    message:z.string().trim().min(5).max(2000),
    website:z.string().max(200).optional()
  }).safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return fail(c,400,'اطلاعات درخواست مشاوره معتبر نیست');
  if(p.data.website)return c.json({ok:true,message:'درخواست شما ثبت شد.'},201);
  const phone=p.data.phone.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s()-]/g,'');
  if(!/^\+?[0-9]{8,15}$/.test(phone))return fail(c,400,'شماره تماس معتبر نیست');
  const ip=c.req.header('CF-Connecting-IP')||'unknown';
  const ipHash=await hashKey(ip+':'+c.env.JWT_SECRET);
  const since=new Date(Date.now()-3600000).toISOString();
  const retention=new Date(Date.now()-86400000).toISOString();
  await stmt(c,"DELETE FROM OtpCode WHERE channel='inquiry' AND createdAt<?",retention).run();
  const recent=await stmt(c,"SELECT COUNT(*) AS n FROM OtpCode WHERE target=? AND channel='inquiry' AND createdAt>?",ipHash,since).first<any>();
  if((recent?.n||0)>=5)return fail(c,429,'تعداد درخواست‌ها بیش از حد مجاز است؛ یک ساعت دیگر تلاش کنید');
  const timestamp=now();
  await stmt(c,"INSERT INTO OtpCode(id,target,channel,codeHash,expiresAt,consumedAt,createdAt) VALUES(?,?,'inquiry','rate-limit',?,?,?)",crypto.randomUUID(),ipHash,new Date(Date.now()+86400000).toISOString(),timestamp,timestamp).run();
  const id=crypto.randomUUID();
  await stmt(c,'INSERT INTO ProjectInquiry(id,name,phone,email,projectType,message,status,createdAt,updatedAt) VALUES(?,?,?,?,?,? ,\'NEW\',?,?)',
    id,p.data.name,phone,p.data.email||null,p.data.projectType||null,p.data.message,timestamp,timestamp).run();
  return c.json({ok:true,id,message:'درخواست مشاوره شما با موفقیت ثبت شد.'},201);
});

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
    stmt(c,`SELECT p.id,p.sku,p.name,p.slug,p.description,p.technicalSpecs,p.priceToman,p.stock,p.unit,p.imageUrl,p.brand,p.isPublished,p.categoryId,p.createdAt,p.updatedAt,c.name AS categoryName,c.slug AS categorySlug FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE ${where} ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`,...args,limit,(page-1)*limit).all(),
    stmt(c,`SELECT COUNT(*) AS total FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE ${where}`,...args).all()
  ]);
  return c.json({items:await attachProductImages(c,results),total:count[0]?.total||0,page,limit});
});
app.get('/api/products/:slug', async c => {
  const row=await stmt(c,`SELECT p.id,p.sku,p.name,p.slug,p.description,p.technicalSpecs,p.priceToman,p.stock,p.unit,p.imageUrl,p.brand,p.isPublished,c.name AS categoryName,c.slug AS categorySlug FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE p.slug=? AND p.isPublished=1 LIMIT 1`,c.req.param('slug')).first();
  if(!row)return fail(c,404,'محصول پیدا نشد');
  const [withImages]=await attachProductImages(c,[row]);
  return c.json(withImages);
});

app.post('/api/auth/request-otp', async c => {
  const parsed=z.object({target:z.string().trim().min(5).max(150),channel:z.enum(['email','phone'])}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return fail(c,400,'اطلاعات ورود معتبر نیست');
  const {channel}=parsed.data, target=channel==='email'?parsed.data.target.toLowerCase():parsed.data.target.replace(/[\s-]/g,'');
  if(channel==='email'&&!/^\S+@\S+\.\S+$/.test(target)) return fail(c,400,'ایمیل معتبر نیست');
  if(channel==='phone'&&!/^\+?[0-9]{10,15}$/.test(target)) return fail(c,400,'شماره موبایل معتبر نیست');
  if(channel==='phone') return fail(c,503,'ورود با پیامک هنوز به ارائه‌دهنده پیامک متصل نشده است');
  if(!c.env.RESEND_API_KEY) return fail(c,503,'سرویس ایمیل هنوز پیکربندی نشده است');
  const recent=await stmt(c,"SELECT COUNT(*) AS n FROM OtpCode WHERE target=? AND channel='email' AND createdAt>=?",target,new Date(Date.now()-900000).toISOString()).first<{n:number}>();
  if((recent?.n||0)>=5) return fail(c,429,'تعداد درخواست‌ها بیش از حد مجاز است؛ بعداً دوباره تلاش کنید');
  const code=randomOtp(), id=crypto.randomUUID();
  await stmt(c,'INSERT INTO OtpCode(id,target,channel,codeHash,expiresAt,createdAt) VALUES(?,?,?,?,?,?)',id,target,'email',await hashOtp(code),new Date(Date.now()+300000).toISOString(),now()).run();
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${c.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:c.env.RESEND_FROM_EMAIL||'آوگون <onboarding@resend.dev>',to:[target],subject:'کد ورود آوگون',text:`کد تأیید ورود شما: ${code}\\nاین کد تا ۵ دقیقه معتبر است.`})});
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
  const consumed=await stmt(c,'UPDATE OtpCode SET consumedAt=? WHERE id=? AND consumedAt IS NULL AND attempts<5 RETURNING id',now(),record.id).first<any>();
  if(!consumed)return fail(c,409,'این کد قبلاً استفاده شده است؛ کد تازه دریافت کنید');
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
    const token=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,'');
    if(!token)return fail(c,401,'ابتدا وارد حساب کاربری شوید');
    const {payload}=await jwtVerify(token,enc.encode(c.env.JWT_SECRET));
    if(!payload.sub)return fail(c,401,'نشست معتبر نیست');
    const user=await stmt(c,'SELECT id,role FROM User WHERE id=?',payload.sub).first<any>();
    if(!user)return fail(c,401,'حساب کاربری پیدا نشد');
    c.set('user',user); await next();
  } catch { return fail(c,401,'ابتدا وارد حساب کاربری شوید'); }
}
app.get('/api/me',requireUser,async c=>{
  const user=c.get('user') as {id:string};
  const row=await stmt(c,'SELECT id,name,email,phone,role,createdAt FROM User WHERE id=?',user.id).first<any>();
  return row?c.json({user:row}):fail(c,404,'حساب کاربری پیدا نشد');
});
app.get('/api/me/orders',requireUser,async c=>{
  const user=c.get('user') as {id:string};
  const page=Math.max(1,Number(c.req.query('page'))||1),limit=Math.min(50,Math.max(1,Number(c.req.query('limit'))||20));
  const [{results=[]},{results:counts=[]}]=await Promise.all([
    stmt(c,'SELECT o.id,o.status,o.totalToman,o.address,o.note,o.createdAt,COALESCE((SELECT json_group_array(json_object(\'id\',oi.id,\'quantity\',oi.quantity,\'unitPriceToman\',oi.unitPriceToman,\'product\',json_object(\'id\',p.id,\'name\',p.name,\'sku\',p.sku))) FROM OrderItem oi JOIN Product p ON p.id=oi.productId WHERE oi.orderId=o.id),\'[]\') AS items FROM "Order" o WHERE o.userId=? ORDER BY o.createdAt DESC LIMIT ? OFFSET ?',user.id,limit,(page-1)*limit).all<any>(),
    stmt(c,'SELECT COUNT(*) AS total FROM "Order" WHERE userId=?',user.id).all<any>()
  ]);
  return c.json({items:results.map((x:any)=>({...x,address:x.address?JSON.parse(x.address):null,items:JSON.parse(x.items)})),total:counts[0]?.total||0,page,limit});
});
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
  const canonical={items:[...parsed.data.items].sort((a,b)=>a.productId.localeCompare(b.productId)),address:parsed.data.address,note:parsed.data.note||''};
  const digest=await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(canonical)));
  const requestHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const existing=await stmt(c,'SELECT id,status,totalToman,createdAt,requestHash FROM "Order" WHERE idempotencyKey=?',idempotencyKey).first<any>();
  if(existing){
    if(existing.requestHash!==requestHash)return fail(c,409,'این شناسه سفارش قبلاً برای اطلاعات دیگری استفاده شده است');
    const {requestHash:_hash,...order}=existing;
    return c.json({ok:true,replayed:true,order});
  }
  const ids=[...new Set(parsed.data.items.map(x=>x.productId))];
  if(ids.length!==parsed.data.items.length)return fail(c,400,'هر کالا فقط باید یک‌بار در فهرست سفارش باشد');
  const placeholders=ids.map(()=>'?').join(',');
  const products=await stmt(c,`SELECT id,name,sku,priceToman,stock,isPublished FROM Product WHERE id IN (${placeholders})`,...ids).all<any>();
  if(products.results.length!==ids.length)return fail(c,400,'یک یا چند کالا پیدا نشد');
  const byId=new Map(products.results.map((p:any)=>[p.id,p]));
  for(const item of parsed.data.items){const p:any=byId.get(item.productId);if(!p.isPublished)return fail(c,409,'یکی از کالاها در حال حاضر قابل سفارش نیست');if(p.priceToman===null||p.priceToman===undefined)return fail(c,409,'قیمت یکی از کالاها هنوز ثبت نشده است');if(Number(p.stock)<item.quantity)return fail(c,409,'موجودی یکی از کالاها کافی نیست');}
  let total=0n;
  const orderId=crypto.randomUUID(), created=now();
  const orderItems=parsed.data.items.map(item=>{
    const p:any=byId.get(item.productId);
    const price=BigInt(String(p.priceToman)); total+=price*BigInt(item.quantity);
    return {id:crypto.randomUUID(),productId:p.id,quantity:item.quantity,unitPriceToman:String(price)};
  });
  const statements=[
    stmt(c,'INSERT INTO "Order"(id,userId,status,totalToman,address,note,createdAt,idempotencyKey,requestHash) VALUES(?,?,\'PENDING\',?,?,?,?,?,?)',orderId,user.id,String(total),JSON.stringify(parsed.data.address),parsed.data.note||null,created,idempotencyKey,requestHash),
    ...orderItems.map(item=>stmt(c,'INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)',item.id,orderId,item.productId,item.quantity,item.unitPriceToman))
  ];
  try {
    await c.env.DB.batch(statements);
    return c.json({ok:true,replayed:false,order:{id:orderId,status:'PENDING',totalToman:String(total),createdAt:created}},201);
  } catch(e) {
    const replay=await stmt(c,'SELECT id,status,totalToman,createdAt,requestHash FROM "Order" WHERE idempotencyKey=?',idempotencyKey).first<any>();
    if(replay){
      if(replay.requestHash!==requestHash)return fail(c,409,'این شناسه سفارش قبلاً برای اطلاعات دیگری استفاده شده است');
      const {requestHash:_hash,...order}=replay;
      return c.json({ok:true,replayed:true,order});
    }
    const message=String(e);
    if(message.includes('INSUFFICIENT_STOCK'))return fail(c,409,'موجودی یکی از کالاها کافی نیست');
    return fail(c,409,'ثبت سفارش انجام نشد؛ موجودی یا قیمت کالاها را دوباره بررسی کنید');
  }
});

app.use('/api/admin/*',requireAdmin);
app.get('/api/admin/inquiries',async c=>{
  const page=Math.max(1,Number(c.req.query('page'))||1),limit=Math.min(100,Math.max(1,Number(c.req.query('limit'))||50));
  const status=c.req.query('status')||'',where="(?='' OR status=?)";
  const [{results=[]},{results:counts=[]}]=await Promise.all([
    stmt(c,`SELECT id,name,phone,email,projectType,message,status,createdAt,updatedAt FROM ProjectInquiry WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,status,status,limit,(page-1)*limit).all(),
    stmt(c,`SELECT COUNT(*) AS total FROM ProjectInquiry WHERE ${where}`,status,status).all()
  ]);
  return c.json({items:await attachProductImages(c,results),total:counts[0]?.total||0,page,limit});
});
app.patch('/api/admin/inquiries/:id/status',async c=>{
  const p=z.object({status:z.enum(['NEW','CONTACTED','CLOSED'])}).safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return fail(c,400,'وضعیت درخواست معتبر نیست');
  const row=await stmt(c,'UPDATE ProjectInquiry SET status=?,updatedAt=? WHERE id=? RETURNING id,status,updatedAt',p.data.status,now(),c.req.param('id')).first();
  return row?c.json(row):fail(c,404,'درخواست مشاوره پیدا نشد');
});
app.get('/api/admin/summary',async c=>{
  const row=await stmt(c,`SELECT (SELECT COUNT(*) FROM User) AS users,(SELECT COUNT(*) FROM "Order") AS orders,(SELECT COUNT(*) FROM "Order" WHERE status='PENDING') AS pendingOrders,(SELECT COALESCE(SUM(totalToman),0) FROM "Order" WHERE status IN ('PAID','PROCESSING','SHIPPED','COMPLETED')) AS paidTotalToman`).first<any>();
  return c.json(row);
});
app.get('/api/admin/products',async c=>{
  const page=Math.max(1,Number(c.req.query('page'))||1),limit=Math.min(100,Math.max(1,Number(c.req.query('limit'))||50)),q=(c.req.query('q')||'').trim(),like='%'+q+'%',category=(c.req.query('category')||'').trim(),published=c.req.query('published')||'',stockStatus=c.req.query('stockStatus')||'';
  if(published!==''&&!['0','1'].includes(published))return fail(c,400,'فیلتر وضعیت انتشار نامعتبر است');
  if(stockStatus!==''&&!['out','low','available'].includes(stockStatus))return fail(c,400,'فیلتر موجودی نامعتبر است');
  const stockWhere=stockStatus==='out'?' AND p.stock=0':stockStatus==='low'?' AND p.stock BETWEEN 1 AND 5':stockStatus==='available'?' AND p.stock>5':'';
  const where="(?='' OR p.name LIKE ? OR p.sku LIKE ?) AND (?='' OR c.slug=?) AND (?='' OR p.isPublished=?)"+stockWhere;
  const args=[q,like,like,category,category,published,published===''?0:Number(published)];
  const [{results=[]},{results:counts=[]}]=await Promise.all([
    stmt(c,`SELECT p.id,p.sku,p.name,p.slug,p.description,p.technicalSpecs,p.priceToman,p.stock,p.unit,p.brand,p.imageUrl,p.isPublished,p.createdAt,p.updatedAt,COALESCE(c.name,'') AS categoryName,COALESCE(c.slug,'') AS categorySlug FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE ${where} ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`,...args,limit,(page-1)*limit).all(),
    stmt(c,`SELECT COUNT(*) AS total FROM Product p LEFT JOIN Category c ON c.id=p.categoryId WHERE ${where}`,...args).all()
  ]);
  return c.json({items:await attachProductImages(c,results),total:counts[0]?.total||0,page,limit});
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
  const id=c.req.param('id');
  const current=await stmt(c,'SELECT id,status FROM "Order" WHERE id=?',id).first<any>();
  if(!current)return fail(c,404,'سفارش پیدا نشد');
  const transitions:Record<string,string[]>={
    PENDING:['PAID','CANCELLED'],
    PAID:['PROCESSING','CANCELLED'],
    PROCESSING:['SHIPPED','CANCELLED'],
    SHIPPED:['COMPLETED'],
    COMPLETED:[],
    CANCELLED:[]
  };
  if(!transitions[current.status]?.includes(p.data.status)){
    return fail(c,409,'تغییر وضعیت سفارش مجاز نیست؛ وضعیت فعلی: '+current.status);
  }
  const row=await stmt(c,'UPDATE "Order" SET status=? WHERE id=? AND status=? RETURNING id,status,totalToman,createdAt',p.data.status,id,current.status).first();
  return row?c.json(row):fail(c,409,'وضعیت سفارش هم‌زمان تغییر کرده است؛ دوباره فهرست را تازه‌سازی کنید');
});
app.post('/api/admin/products',async c=>{
  const p=z.object({sku:z.string().trim().min(1).max(80),name:z.string().trim().min(2).max(200),slug:z.string().trim().min(2).max(220),description:z.string().max(5000).optional(),technicalSpecs:z.record(z.string(),z.unknown()).nullable().optional(),priceToman:z.union([z.number().int().nonnegative(),z.string().regex(/^\d+$/)]).optional(),stock:z.number().int().nonnegative().default(0),unit:z.string().trim().min(1).max(30).default('عدد'),brand:z.string().trim().max(100).optional(),categorySlug:z.string().max(120).optional(),imageUrl:z.string().url().refine(v=>v.startsWith('https://'),'نشانی تصویر باید HTTPS باشد').optional(),images:z.array(z.object({url:z.string().url().refine(v=>v.startsWith('https://'),'نشانی تصویر باید HTTPS باشد'),alt:z.string().max(300).optional()})).max(12).optional(),isPublished:z.boolean().default(false)}).safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return c.json({ok:false,errors:p.error.flatten()},400);
  const x=p.data,id=crypto.randomUUID(),time=now();
  const category=x.categorySlug?await stmt(c,'SELECT id FROM Category WHERE slug=?',x.categorySlug).first<any>():null;
  if(x.categorySlug&&!category)return fail(c,400,'دسته‌بندی پیدا نشد');
  try{
    await stmt(c,`INSERT INTO Product(id,sku,name,slug,description,technicalSpecs,priceToman,stock,unit,brand,imageUrl,isPublished,categoryId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,x.sku,x.name,x.slug,x.description||null,x.technicalSpecs?JSON.stringify(x.technicalSpecs):null,x.priceToman===undefined?null:String(x.priceToman),x.stock,x.unit,x.brand||null,x.images?.[0]?.url||x.imageUrl||null,x.isPublished?1:0,category?.id||null,time,time).run();
    if(x.images)await replaceProductImages(c,id,x.images);
    return c.json({id,sku:x.sku,name:x.name,slug:x.slug,priceToman:x.priceToman??null,stock:x.stock,isPublished:x.isPublished,images:x.images||[]},201);
  }catch{return fail(c,409,'کد کالا یا نشانی محصول تکراری است');}
});

function parseCsv(input:string):string[][] {
  const rows:string[][]=[]; let row:string[]=[], field='', quoted=false;
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){if(ch==='"'&&input[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(quoted)throw new Error('CSV_INVALID_QUOTES');
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  return rows;
}
const productUpdateSchema=z.object({
  sku:z.string().min(1).max(80).optional(),name:z.string().min(2).max(200).optional(),slug:z.string().min(2).max(220).optional(),
  description:z.string().max(5000).nullable().optional(),priceToman:z.union([z.number().int().nonnegative(),z.string().regex(/^\d+$/),z.null()]).optional(),
  stock:z.number().int().nonnegative().optional(),unit:z.string().min(1).max(30).optional(),brand:z.string().max(100).nullable().optional(),
  categorySlug:z.string().max(120).nullable().optional(),imageUrl:z.string().url().nullable().refine(v=>v===null||v.startsWith('https://'),'نشانی تصویر باید HTTPS باشد').optional(),isPublished:z.boolean().optional(),
  technicalSpecs:z.record(z.string(),z.unknown()).nullable().optional(),
  images:z.array(z.object({url:z.string().url().refine(v=>v.startsWith('https://'),'نشانی تصویر باید HTTPS باشد'),alt:z.string().max(300).optional()})).max(12).optional()
}).strict().refine(v=>Object.keys(v).length>0);
app.patch('/api/admin/products/:id',async c=>{
  const p=productUpdateSchema.safeParse(await c.req.json().catch(()=>null));
  if(!p.success)return c.json({ok:false,errors:p.error.flatten()},400);
  const data:any={...p.data}; delete data.categorySlug; delete data.images;
  const fields:string[]=[]; const values:any[]=[];
  for(const [key,value] of Object.entries(data)){
    const column=({priceToman:'priceToman',technicalSpecs:'technicalSpecs',isPublished:'isPublished'} as Record<string,string>)[key]||key;
    fields.push(column+'=?');
    values.push(key==='priceToman'?(value===null?null:String(value)):key==='technicalSpecs'?(value===null?null:JSON.stringify(value)):key==='isPublished'?(value?1:0):value);
  }
  if(p.data.categorySlug!==undefined){
    const cat=p.data.categorySlug?await stmt(c,'SELECT id FROM Category WHERE slug=?',p.data.categorySlug).first<any>():null;
    if(p.data.categorySlug&&!cat)return fail(c,400,'دسته‌بندی پیدا نشد');
    fields.push('categoryId=?');values.push(cat?.id||null);
  }
  fields.push('updatedAt=?');values.push(now());values.push(c.req.param('id'));
  try{
    const row=await stmt(c,'UPDATE Product SET '+fields.join(',')+' WHERE id=? RETURNING id,sku,name,slug,priceToman,stock,unit,isPublished,categoryId,updatedAt',...values).first();
    if(!row)return fail(c,404,'محصول پیدا نشد');
    if(p.data.images!==undefined)await replaceProductImages(c,c.req.param('id'),p.data.images);
    const [withImages]=await attachProductImages(c,[row]);
    return c.json(withImages);
  }catch{return fail(c,409,'کد کالا یا نامک تکراری است');}
});
app.post('/api/admin/products/import-csv',async c=>{
  const form=await c.req.formData().catch(()=>null),file=form?.get('file');
  if(!(file instanceof File))return fail(c,400,'فایل CSV ارسال نشده است');
  if(file.size>5*1024*1024)return fail(c,413,'حجم فایل نباید بیشتر از ۵ مگابایت باشد');
  if(!file.name.toLowerCase().endsWith('.csv'))return fail(c,415,'در این نسخه فقط فایل CSV پشتیبانی می‌شود');
  let rows:string[][];
  try{rows=parseCsv(await file.text());}catch{return fail(c,400,'ساختار فایل CSV معتبر نیست');}
  if(rows.length<2)return fail(c,400,'فایل ردیف محصول ندارد');
  if(rows.length>1001)return fail(c,413,'حداکثر ۱۰۰۰ ردیف محصول مجاز است');
  const headers=rows[0].map((x,i)=>x.trim().replace(i===0?/^\uFEFF/:'',''));
  const aliases:Record<string,string[]>={sku:['sku','SKU','کد کالا'],name:['name','نام محصول','نام'],slug:['slug','نامک'],description:['description','توضیحات'],priceToman:['priceToman','قیمت تومان','قیمت'],stock:['stock','موجودی'],unit:['unit','واحد'],brand:['brand','برند'],categorySlug:['categorySlug','نامک دسته‌بندی'],imageUrl:['imageUrl','تصویر','آدرس تصویر'],isPublished:['isPublished','انتشار']};
  let created=0,updated=0;const errors:any[]=[];
  for(let i=1;i<rows.length;i++){
    if(rows[i].every(v=>!v.trim()))continue;
    const get=(key:string)=>{const idx=headers.findIndex(h=>aliases[key].includes(h));return idx<0?'':(rows[i][idx]||'').trim();};
    const raw={sku:get('sku'),name:get('name'),slug:get('slug')||get('sku').toLowerCase().replace(/[^a-z0-9-]+/g,'-'),description:get('description')||undefined,priceToman:get('priceToman')||undefined,stock:Number(get('stock')||0),unit:get('unit')||'عدد',brand:get('brand')||undefined,categorySlug:get('categorySlug')||undefined,imageUrl:get('imageUrl')||undefined,isPublished:['1','true','yes','بله'].includes(get('isPublished').toLowerCase())};
    const p=z.object({sku:z.string().min(1).max(80),name:z.string().min(2).max(200),slug:z.string().min(2).max(220),description:z.string().optional(),priceToman:z.string().regex(/^\d+$/).optional(),stock:z.number().int().nonnegative(),unit:z.string().min(1).max(30),brand:z.string().optional(),categorySlug:z.string().optional(),imageUrl:z.string().url().refine(v=>v.startsWith('https://'),'نشانی تصویر باید HTTPS باشد').optional(),isPublished:z.boolean()}).safeParse(raw);
    if(!p.success){errors.push({row:i+1,sku:raw.sku,message:'اطلاعات ردیف معتبر نیست'});continue;}
    try{
      const cat=p.data.categorySlug?await stmt(c,'SELECT id FROM Category WHERE slug=?',p.data.categorySlug).first<any>():null;
      if(p.data.categorySlug&&!cat)throw new Error('CATEGORY_NOT_FOUND');
      const existing=await stmt(c,'SELECT id FROM Product WHERE sku=?',p.data.sku).first<any>();
      const id=existing?.id||crypto.randomUUID(),t=now();
      await stmt(c,`INSERT INTO Product(id,sku,name,slug,description,priceToman,stock,unit,brand,imageUrl,isPublished,categoryId,createdAt,updatedAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(sku) DO UPDATE SET name=excluded.name,slug=excluded.slug,description=excluded.description,priceToman=excluded.priceToman,stock=excluded.stock,unit=excluded.unit,brand=excluded.brand,imageUrl=excluded.imageUrl,isPublished=excluded.isPublished,categoryId=excluded.categoryId,updatedAt=excluded.updatedAt`,
        id,p.data.sku,p.data.name,p.data.slug,p.data.description||null,p.data.priceToman||null,p.data.stock,p.data.unit,p.data.brand||null,p.data.imageUrl||null,p.data.isPublished?1:0,cat?.id||null,t,t).run();
      await replaceProductImages(c,id,p.data.imageUrl?[{url:p.data.imageUrl,alt:p.data.name}]:[]);
      existing?updated++:created++;
    }catch(e){errors.push({row:i+1,sku:raw.sku,message:String(e).includes('CATEGORY_NOT_FOUND')?'دسته‌بندی پیدا نشد':'ثبت ردیف ناموفق بود؛ احتمالاً نامک تکراری است'});}
  }
  return c.json({ok:errors.length===0,created,updated,failed:errors.length,errors});
});

export default app;
