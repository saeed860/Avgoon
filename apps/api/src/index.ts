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
import { PrismaClient } from '@prisma/client';

const app=express(); const prisma=new PrismaClient(); const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}});
app.use(helmet()); app.use(cors({origin:process.env.WEB_ORIGIN||'http://localhost:3000'})); app.use(express.json({limit:'1mb'}));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:true,legacyHeaders:false}));
const secret=process.env.JWT_SECRET||'development-only-change-me';
const fail=(res:express.Response,status:number,message:string)=>res.status(status).json({ok:false,message});
function auth(requiredRole?:'ADMIN'){return (req:express.Request,res:express.Response,next:express.NextFunction)=>{try{const token=(req.headers.authorization||'').replace(/^Bearer /,'');const data=jwt.verify(token,secret) as {sub:string;role:string};(req as any).user=data;if(requiredRole&&data.role!==requiredRole)return fail(res,403,'دسترسی غیرمجاز');next()}catch{return fail(res,401,'ابتدا وارد حساب کاربری شوید')}}}
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

const profileSchema=z.object({name:z.string().trim().min(2).max(120)});
const addressSchema=z.object({
  recipientName:z.string().trim().min(2).max(120),
  phone:z.string().trim().regex(/^\+?[0-9]{10,15}$/,'شماره تماس معتبر نیست'),
  province:z.string().trim().min(2).max(80),
  city:z.string().trim().min(2).max(80),
  postalCode:z.string().trim().regex(/^[0-9]{10}$/,'کدپستی باید ۱۰ رقم باشد'),
  address:z.string().trim().min(8).max(500),
  isDefault:z.boolean().optional()
});
app.get('/api/me',auth(),async(req,res)=>{
  const user=await prisma.user.findUnique({where:{id:(req as any).user.sub},select:{id:true,name:true,phone:true,email:true,role:true,createdAt:true,addresses:{orderBy:[{isDefault:'desc'},{createdAt:'desc'}]}}});
  if(!user)return fail(res,404,'حساب کاربری پیدا نشد');
  res.json({ok:true,user});
});
app.patch('/api/me',auth(),async(req,res)=>{
  const parsed=profileSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,message:'نام معتبر نیست',errors:parsed.error.flatten()});
  const user=await prisma.user.update({where:{id:(req as any).user.sub},data:{name:parsed.data.name},select:{id:true,name:true,phone:true,email:true,role:true}});
  res.json({ok:true,user});
});
app.post('/api/me/addresses',auth(),async(req,res)=>{
  const parsed=addressSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,message:'اطلاعات نشانی معتبر نیست',errors:parsed.error.flatten()});
  const userId=(req as any).user.sub;
  const count=await prisma.address.count({where:{userId}});
  const makeDefault=parsed.data.isDefault===true||count===0;
  const address=await prisma.$transaction(async(tx)=>{
    if(makeDefault)await tx.address.updateMany({where:{userId,isDefault:true},data:{isDefault:false}});
    return tx.address.create({data:{...parsed.data,isDefault:makeDefault,userId}});
  });
  res.status(201).json({ok:true,address});
});
app.patch('/api/me/addresses/:id',auth(),async(req,res)=>{
  const parsed=addressSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,message:'اطلاعات نشانی معتبر نیست',errors:parsed.error.flatten()});
  const userId=(req as any).user.sub;
  const current=await prisma.address.findFirst({where:{id:String(req.params.id),userId}});
  if(!current)return fail(res,404,'نشانی پیدا نشد');
  const makeDefault=parsed.data.isDefault===true;
  const address=await prisma.$transaction(async(tx)=>{
    if(makeDefault)await tx.address.updateMany({where:{userId,isDefault:true},data:{isDefault:false}});
    return tx.address.update({where:{id:current.id},data:{...parsed.data,isDefault:makeDefault||current.isDefault}});
  });
  res.json({ok:true,address});
});
app.post('/api/me/addresses/:id/default',auth(),async(req,res)=>{
  const userId=(req as any).user.sub;
  const current=await prisma.address.findFirst({where:{id:String(req.params.id),userId}});
  if(!current)return fail(res,404,'نشانی پیدا نشد');
  await prisma.$transaction([
    prisma.address.updateMany({where:{userId,isDefault:true},data:{isDefault:false}}),
    prisma.address.update({where:{id:current.id},data:{isDefault:true}})
  ]);
  res.json({ok:true});
});
app.delete('/api/me/addresses/:id',auth(),async(req,res)=>{
  const userId=(req as any).user.sub;
  const current=await prisma.address.findFirst({where:{id:String(req.params.id),userId}});
  if(!current)return fail(res,404,'نشانی پیدا نشد');
  await prisma.address.delete({where:{id:current.id}});
  if(current.isDefault){
    const next=await prisma.address.findFirst({where:{userId},orderBy:{createdAt:'desc'}});
    if(next)await prisma.address.update({where:{id:next.id},data:{isDefault:true}});
  }
  res.json({ok:true});
});

const productSchema=z.object({sku:z.string().min(1),name:z.string().min(2),slug:z.string().min(2),description:z.string().optional(),priceToman:z.union([z.number().int().nonnegative(),z.string()]).optional(),stock:z.number().int().nonnegative().default(0),unit:z.string().default('عدد'),brand:z.string().optional(),categorySlug:z.string().optional(),imageUrl:z.string().url().optional(),isPublished:z.boolean().default(false)});
app.post('/api/admin/products',auth('ADMIN'),async(req,res)=>{const parsed=productSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,errors:parsed.error.flatten()});const {categorySlug,priceToman,...data}=parsed.data;const p=await prisma.product.create({data:{...data,priceToman:priceToman===undefined?null:BigInt(priceToman),category:categorySlug?{connect:{slug:categorySlug}}:undefined}});res.status(201).json(p)});
app.patch('/api/admin/products/:id',auth('ADMIN'),async(req,res)=>{const data:any={...req.body};if(data.priceToman!==undefined)data.priceToman=BigInt(data.priceToman);if(data.categorySlug){data.category={connect:{slug:data.categorySlug}};delete data.categorySlug}const p=await prisma.product.update({where:{id:String(req.params.id)},data});res.json(p)});
app.post('/api/admin/products/import',auth('ADMIN'),upload.single('file'),async(req,res)=>{if(!req.file)return fail(res,400,'فایل ارسال نشده است');const wb=XLSX.read(req.file.buffer,{type:'buffer'});const sheet=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});const errors:any[]=[];let created=0,updated=0;for(let i=0;i<rows.length;i++){const r=rows[i];const get=(...keys:string[])=>{for(const k of keys)if(r[k]!==undefined&&r[k]!=='')return r[k];return undefined};const raw={sku:String(get('sku','SKU','کد کالا')||''),name:String(get('name','نام محصول')||''),slug:String(get('slug','نامک')||String(get('sku','SKU','کد کالا')||'').toLowerCase().replace(/[^a-z0-9-]+/g,'-')),description:String(get('description','توضیحات')||''),priceToman:get('priceToman','قیمت تومان','قیمت'),stock:Number(get('stock','موجودی')||0),unit:String(get('unit','واحد')||'عدد'),brand:String(get('brand','برند')||''),isPublished:String(get('isPublished','انتشار')||'0').toLowerCase()==='1'||String(get('isPublished','انتشار')||'').toLowerCase()==='true'};const parsed=productSchema.safeParse(raw);if(!parsed.success){errors.push({row:i+2,sku:raw.sku,message:'کد کالا، نام یا مقادیر نامعتبر'});continue}const {priceToman,...d}=parsed.data;try{const existing=await prisma.product.findUnique({where:{sku:d.sku}});await prisma.product.upsert({where:{sku:d.sku},create:{...d,priceToman:priceToman?BigInt(priceToman):null},update:{...d,priceToman:priceToman?BigInt(priceToman):null}});existing?updated++:created++}catch(e){errors.push({row:i+2,sku:d.sku,message:'خطا در ثبت؛ احتمالاً نامک تکراری است'})}}res.json({ok:errors.length===0,created,updated,failed:errors.length,errors})});
app.get('/api/admin/orders',auth('ADMIN'),async(_req,res)=>res.json(await prisma.order.findMany({include:{user:true,items:{include:{product:true}}},orderBy:{createdAt:'desc'},take:100})));
app.listen(Number(process.env.API_PORT)||4000,()=>console.info(`AVGOON API listening on ${process.env.API_PORT||4000}`));
