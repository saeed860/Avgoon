# آوگون | AVGOON
فروشگاه مستقل محصولات ساخت‌وساز خشک؛ بدون WordPress.

## ساختار
- `apps/web`: رابط کاربری Next.js فارسی و RTL
- `apps/api`: API اختصاصی Express، Prisma و PostgreSQL
- `apps/api/prisma/schema.prisma`: مدل داده کاربران، OTP، محصولات، دسته‌بندی‌ها و سفارش‌ها
- `docs/product-import-template.csv`: قالب نمونه ورود گروهی کالا

## پیش‌نیاز
Node.js 20+ و PostgreSQL 15+.

## راه‌اندازی
1. فایل `.env.example` را به `.env` در ریشه پروژه کپی و مقادیر را تنظیم کنید.
2. `npm install`
3. `npm --workspace apps/api exec prisma generate`
4. `npm --workspace apps/api exec prisma migrate dev -- --name init`
5. `npm run dev`

وب‌سایت: http://localhost:3000
API: http://localhost:4000/api/health
پنل مدیریت نمایشی: http://localhost:3000/admin

## نکات امنیتی و تکمیل پیش از انتشار
- OTP به‌صورت fail-closed طراحی شده است. برای ارسال واقعی باید adapter پیامک و SMTP متناسب با سرویس‌دهنده منتخب تکمیل شود. کد OTP در پاسخ API افشا نمی‌شود.
- ایجاد مدیر اولیه باید از طریق seed امن و خارج از ثبت‌نام عمومی انجام شود؛ ثبت‌نام عمومی هرگز نباید نقش ADMIN بدهد.
- مسیرهای مدیریت API با JWT و نقش ADMIN محافظت می‌شوند.
- درگاه پرداخت، مالیات، حمل‌ونقل، موجودی رزروشده و گردش سفارش باید پیش از فروش واقعی تکمیل و تست شوند.
- تصاویر فعلی تصاویر نمایشی remote هستند و باید با تصاویر مجاز و واقعی کاتالوگ آوگون جایگزین شوند.
- قیمت‌ها در دیتابیس به تومان و از نوع BigInt ذخیره می‌شوند.
