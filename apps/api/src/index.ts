import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

const app=express(); const prisma=new PrismaClient(); const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}});
app.use(helmet()); app.use(cors({origin:process.env.WEB_ORIGIN||'http://localhost:3000'})); app.use(express.json({limit:'1mb'}));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:true,legacyHeaders:false}));
app.use('/api/admin/bootstrap',rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false}));
app.post('/api/admin/bootstrap',async(req,res)=>{
 const configured=Buffer.from(process.env.ADMIN_BOOTSTRAP_TOKEN||'');
 const supplied=Buffer.from(String(req.body?.token||''));
 if(configured.length<32||supplied.length!==configured.length||!timingSafeEqual(configured,supplied))return fail(res,403,'کلید راه‌اندازی معتبر نیست یا در سرور تنظیم نشده است');
 const parsed=z.object({token:z.string().min(32).max(512),channel:z.enum(['phone','email']),target:z.string().min(5).max(150)}).safeParse(req.body);
 if(!parsed.success)return fail(res,400,'اطلاعات واردشده معتبر نیست');
 const {channel}=parsed.data;
 const target=channel==='email'?parsed.data.target.trim().toLowerCase():parsed.data.target.replace(/[\\s-]/g,'');
 if(channel==='email'&&!/^\\S+@\\S+\\.\\S+$/.test(target))return fail(res,400,'ایمیل معتبر نیست');
 if(channel==='phone'&&!/^\\+?[0-9]{10,15}$/.test(target))return fail(res,400,'شماره موبایل معتبر نیست');
 try{
  const admin=await prisma.$transaction(async tx=>{
   if(await tx.user.count({where:{role:'ADMIN'}})>0)throw new Error('ADMIN_EXISTS');
   const user=await tx.user.findUnique({where:channel==='email'?{email:target}:{phone:target}});
   if(!user)throw new Error('ACCOUNT_NOT_FOUND');
   if(user.role!=='CUSTOMER')throw new Error('ACCOUNT_NOT_ELIGIBLE');
   return tx.user.update({where:{id:user.id},data:{role:'ADMIN'},select:{id:true,name:true,email:true,phone:true,role:true}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,user:admin,message:'مدیر اصلی با موفقیت فعال شد. اکنون از حساب خارج شوید و دوباره وارد شوید.'});
 }catch(e){
  const code=e instanceof Error?e.message:'';
  if(code==='ADMIN_EXISTS')return fail(res,409,'مدیر قبلاً ایجاد شده است؛ راه‌اندازی اولیه بسته شده است');
  if(code==='ACCOUNT_NOT_FOUND')return fail(res,404,'ابتدا با همین ایمیل یا شماره موبایل در فروشگاه ثبت‌نام و آن را تأیید کنید');
  if(code==='ACCOUNT_NOT_ELIGIBLE')return fail(res,409,'این حساب شرایط تبدیل به مدیر اولیه را ندارد');
  return fail(res,409,'عملیات هم‌زمان یا خطای پایگاه داده رخ داد؛ وضعیت مدیر را دوباره بررسی کنید');
 }
});
const secret=process.env.JWT_SECRET||'development-only-change-me';
if(process.env.NODE_ENV==='production'&&(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32))throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
const fail=(res:express.Response,status:number,message:string)=>res.status(status).json({ok:false,message});
function auth(requiredRole?:'ADMIN'){return async(req:express.Request,res:express.Response,next:express.NextFunction)=>{try{const token=(req.headers.authorization||'').replace(/^Bearer /,'');const data=jwt.verify(token,secret) as {sub:string};if(!data.sub)return fail(res,401,'نشست معتبر نیست');const user=await prisma.user.findUnique({where:{id:data.sub},select:{id:true,role:true}});if(!user)return fail(res,401,'حساب کاربری پیدا نشد');(req as any).user={sub:user.id,role:user.role};if(requiredRole&&user.role!==requiredRole)return fail(res,403,'دسترسی غیرمجاز');next()}catch{return fail(res,401,'ابتدا وارد حساب کاربری شوید')}}}
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'AVGOON API',time:new Date().toISOString()}));
app.get('/api/categories',async(_req,res)=>res.json(await prisma.category.findMany({orderBy:{name:'asc'}})));
app.get('/api/products',async(req,res)=>{const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(60,Math.max(1,Number(req.query.limit)||24));const q=String(req.query.q||'');const where:any={isPublished:true};if(q)where.OR=[{name:{contains:q,mode:'insensitive'}},{sku:{contains:q,mode:'insensitive'}}];if(req.query.category)where.category={slug:String(req.query.category)};const [items,total]=await Promise.all([prisma.product.findMany({where,include:{category:true},skip:(page-1)*limit,take:limit,orderBy:{createdAt:'desc'}}),prisma.product.count({where})]);res.json({items,total,page,limit})});
app.get('/api/products/:slug',async(req,res)=>{const p=await prisma.product.findUnique({where:{slug:req.params.slug},include:{category:true}});if(!p||!p.isPublished)return fail(res,404,'محصول پیدا نشد');res.json(p)});
const otpSchema=z.object({target:z.string().min(5).max(150),channel:z.enum(['phone','email'])});
app.post('/api/auth/request-otp',async(req,res)=>{const parsed=otpSchema.safeParse(req.body);if(!parsed.success)return fail(res,400,'اطلاعات ورود معتبر نیست');const {target,channel}=parsed.data;if(channel==='email'&&!/^\S+@\S+\.\S+$/.test(target))return fail(res,400,'ایمیل معتبر نیست');if(channel==='phone'&&!/^\+?[0-9]{10,15}$/.test(target.replace(/[\s-]/g,'')))return fail(res,400,'شماره موبایل معتبر نیست');const code=String(Math.floor(100000+Math.random()*900000));const codeHash=await bcrypt.hash(code,10);await prisma.otpCode.create({data:{target,channel,codeHash,expiresAt:new Date(Date.now()+5*60*1000)}});
// Delivery is intentionally fail-closed: configure an SMS/SMTP adapter before production. Never expose OTP in production responses.
const configured=channel==='phone'?Boolean(process.env.SMS_PROVIDER_URL&&process.env.SMS_PROVIDER_TOKEN):Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS);
if(!configured){if(process.env.NODE_ENV==='production')return fail(res,503,'سرویس ارسال کد هنوز پیکربندی نشده است');return res.json({ok:true,development:true,message:'سرویس ارسال در محیط توسعه تنظیم نشده است؛ کد فقط در لاگ امن سرور قابل مشاهده است.'})}
console.info(`[AVGOON OTP DEV/PROVIDER ADAPTER REQUIRED] ${channel}:${target} code=${code}`);res.json({ok:true,message:'در صورت اتصال سرویس‌دهنده، کد ارسال می‌شود.'})});
app.post('/api/auth/verify-otp',async(req,res)=>{const parsed=z.object({target:z.string().min(5).max(150),channel:z.enum(['phone','email']),code:z.string().length(6),name:z.string().trim().min(2).max(120).optional()}).safeParse(req.body);if(!parsed.success)return fail(res,400,'کد یا اطلاعات ورود نامعتبر است');const {target,channel,code,name}=parsed.data;const record=await prisma.otpCode.findFirst({where:{target,channel,consumedAt:null,expiresAt:{gt:new Date()},attempts:{lt:5}},orderBy:{createdAt:'desc'}});if(!record)return fail(res,400,'کد منقضی شده یا وجود ندارد');if(!await bcrypt.compare(code,record.codeHash)){await prisma.otpCode.update({where:{id:record.id},data:{attempts:{increment:1}}});return fail(res,400,'کد تأیید اشتباه است')};await prisma.otpCode.update({where:{id:record.id},data:{consumedAt:new Date()}});const where=channel==='phone'?{phone:target}:{email:target};const create=channel==='phone'?{phone:target,name:name||null}:{email:target,name:name||null};const user=await prisma.user.upsert({where,create,update:name?{name}:{}});const token=jwt.sign({sub:user.id,role:user.role},secret,{expiresIn:'7d'});res.json({token,user:{id:user.id,name:user.name,phone:user.phone,email:user.email,role:user.role}})});
const productSchema=z.object({sku:z.string().min(1),name:z.string().min(2),slug:z.string().min(2),description:z.string().optional(),priceToman:z.union([z.number().int().nonnegative(),z.string()]).optional(),stock:z.number().int().nonnegative().default(0),unit:z.string().default('عدد'),brand:z.string().optional(),categorySlug:z.string().optional(),imageUrl:z.string().url().optional(),isPublished:z.boolean().default(false)});
app.post('/api/admin/products',auth('ADMIN'),async(req,res)=>{const parsed=productSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,errors:parsed.error.flatten()});const {categorySlug,priceToman,...data}=parsed.data;const p=await prisma.product.create({data:{...data,priceToman:priceToman===undefined?null:BigInt(priceToman),category:categorySlug?{connect:{slug:categorySlug}}:undefined}});res.status(201).json(p)});
app.patch('/api/admin/products/:id',auth('ADMIN'),async(req,res)=>{const data:any={...req.body};if(data.priceToman!==undefined)data.priceToman=BigInt(data.priceToman);if(data.categorySlug){data.category={connect:{slug:data.categorySlug}};delete data.categorySlug}const p=await prisma.product.update({where:{id:req.params.id},data});res.json(p)});
app.post('/api/admin/products/import',auth('ADMIN'),upload.single('file'),async(req,res)=>{if(!req.file)return fail(res,400,'فایل ارسال نشده است');const wb=XLSX.read(req.file.buffer,{type:'buffer'});const sheet=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});const errors:any[]=[];let created=0,updated=0;for(let i=0;i<rows.length;i++){const r=rows[i];const get=(...keys:string[])=>{for(const k of keys)if(r[k]!==undefined&&r[k]!=='')return r[k];return undefined};const raw={sku:String(get('sku','SKU','کد کالا')||''),name:String(get('name','نام محصول')||''),slug:String(get('slug','نامک')||String(get('sku','SKU','کد کالا')||'').toLowerCase().replace(/[^a-z0-9-]+/g,'-')),description:String(get('description','توضیحات')||''),priceToman:get('priceToman','قیمت تومان','قیمت'),stock:Number(get('stock','موجودی')||0),unit:String(get('unit','واحد')||'عدد'),brand:String(get('brand','برند')||''),isPublished:String(get('isPublished','انتشار')||'0').toLowerCase()==='1'||String(get('isPublished','انتشار')||'').toLowerCase()==='true'};const parsed=productSchema.safeParse(raw);if(!parsed.success){errors.push({row:i+2,sku:raw.sku,message:'کد کالا، نام یا مقادیر نامعتبر'});continue}const {priceToman,...d}=parsed.data;try{const existing=await prisma.product.findUnique({where:{sku:d.sku}});await prisma.product.upsert({where:{sku:d.sku},create:{...d,priceToman:priceToman?BigInt(priceToman):null},update:{...d,priceToman:priceToman?BigInt(priceToman):null}});existing?updated++:created++}catch(e){errors.push({row:i+2,sku:d.sku,message:'خطا در ثبت؛ احتمالاً نامک تکراری است'})}}res.json({ok:errors.length===0,created,updated,failed:errors.length,errors})});
// Admin order listing is implemented below with pagination and BigInt-safe serialization.

const orderStatuses=['PENDING','PAID','PROCESSING','SHIPPED','COMPLETED','CANCELLED'] as const;
const jsonSafe=(value:any)=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v));
app.get('/api/admin/summary',auth('ADMIN'),async(_req,res)=>{
 const [users,orders,pending,paid]=await Promise.all([
  prisma.user.count(),prisma.order.count(),prisma.order.count({where:{status:'PENDING'}}),
  prisma.order.aggregate({where:{status:{in:['PAID','PROCESSING','SHIPPED','COMPLETED']}},_sum:{totalToman:true}})
 ]);
 res.json({users,orders,pendingOrders:pending,paidTotalToman:String(paid._sum.totalToman||0n)});
});
app.get('/api/admin/users',auth('ADMIN'),async(req,res)=>{
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25)),q=String(req.query.q||'').trim();
 const where:any=q?{OR:[{name:{contains:q,mode:'insensitive'}},{phone:{contains:q}},{email:{contains:q,mode:'insensitive'}}]}:{};
 const [items,total]=await Promise.all([
  prisma.user.findMany({where,select:{id:true,name:true,phone:true,email:true,role:true,createdAt:true,_count:{select:{orders:true}}},orderBy:{createdAt:'desc'},skip:(page-1)*limit,take:limit}),
  prisma.user.count({where})
 ]);
 res.json({items,total,page,limit});
});
app.get('/api/admin/orders',auth('ADMIN'),async(req,res)=>{
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));
 const status=String(req.query.status||''),where:any={};
 if(status&&orderStatuses.includes(status as any))where.status=status;
 const [items,total]=await Promise.all([
  prisma.order.findMany({where,include:{user:{select:{id:true,name:true,phone:true,email:true}},items:{include:{product:{select:{id:true,name:true,sku:true}}}}},orderBy:{createdAt:'desc'},skip:(page-1)*limit,take:limit}),
  prisma.order.count({where})
 ]);
 res.json({items:jsonSafe(items),total,page,limit});
});
app.patch('/api/admin/orders/:id/status',auth('ADMIN'),async(req,res)=>{
 const parsed=z.object({status:z.enum(orderStatuses)}).safeParse(req.body);
 if(!parsed.success)return fail(res,400,'وضعیت سفارش معتبر نیست');
 try{
  const order=await prisma.order.update({where:{id:req.params.id},data:{status:parsed.data.status},include:{user:{select:{id:true,name:true,phone:true,email:true}},items:{include:{product:{select:{id:true,name:true,sku:true}}}}}});
  res.json(jsonSafe(order));
 }catch{return fail(res,404,'سفارش پیدا نشد')}
});

app.listen(Number(process.env.API_PORT)||4000,()=>console.info(`AVGOON API listening on ${process.env.API_PORT||4000}`));
