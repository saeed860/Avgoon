# آوگون | AVGOON

فروشگاه مستقل و فارسی محصولات ساخت‌وساز خشک؛ رابط کاربری RTL و بدون WordPress.

## ساختار پروژه
- `docs/`: فروشگاه استاتیک و پنل مدیریت؛ مقصد Cloudflare Pages
- `apps/worker/`: API مبتنی بر Hono و Cloudflare Workers
- `apps/worker/migrations/`: مهاجرت‌های Cloudflare D1
- `apps/api/`: پیاده‌سازی اولیه Express/Prisma برای توسعه محلی و مرجع مدل داده
- `docs/product-import-template.csv`: قالب ورود گروهی کالا

## معماری میزبانی رایگان
- Frontend: Cloudflare Pages
- API: Cloudflare Workers
- Database: Cloudflare D1
- Email OTP: Resend (نیازمند Secret با نام `RESEND_API_KEY`)
- دامنه اختصاصی هنوز متصل نشده است. شاخه پیش‌نمایش فعلی `feature/admin-users-orders` است.

## پیش‌نمایش
- فروشگاه: https://feature-admin-users-orders.avgoon-store.pages.dev
- پنل مدیریت: https://feature-admin-users-orders.avgoon-store.pages.dev/admin.html
- راه‌اندازی اولین مدیر: https://feature-admin-users-orders.avgoon-store.pages.dev/first-admin.html

## توسعه محلی
نسخه API مستقر روی Cloudflare Workers از `apps/worker` اجرا می‌شود. برای بررسی نوع‌ها:
```bash
cd apps/worker
npm install
npm run typecheck
```

## قابلیت‌های فعلی
- دریافت دسته‌بندی‌ها و محصولات منتشرشده از D1
- ورود ایمیلی OTP، پس از تنظیم Resend
- حساب مشتری و تاریخچه سفارش‌ها
- فرم درخواست مشاوره پروژه با ثبت در D1، محدودیت ارسال و فیلد ضدربات
- صندوق درخواست‌های مشاوره در پنل مدیریت با تغییر وضعیت جدید/تماس‌گرفته‌شده/بسته‌شده
- ثبت سفارش با کنترل موجودی و شناسه Idempotency
- بازگردانی موجودی با لغو سفارش
- پنل مدیریت کاربران، سفارش‌ها و محصولات
- ثبت محصول و انتشار/عدم انتشار
- ورود گروهی کالا از CSV و Excel (Excel در مرورگر به CSV تبدیل می‌شود)
- شش migration پایگاه داده: ساختار اولیه، کنترل موجودی، idempotency، بازگردانی موجودی، دسته‌بندی‌های پایه و درخواست‌های مشاوره
- چهار دسته اولیه: صفحات گچی، سازه‌های فلزی، عایق‌ها و ملزومات اجرا

## تنظیمات لازم پیش از فعال‌سازی کاربران
1. در Cloudflare Worker با نام `avgoon-api`، از مسیر Settings → Variables and Secrets یک Secret با نام `RESEND_API_KEY` اضافه کنید. مقدار کلید فقط باید در Cloudflare ذخیره شود، نه در GitHub یا فایل‌های فرانت‌اند.
2. تا زمانی که دامنه فرستنده در Resend تأیید نشده، ارسال با `onboarding@resend.dev` فقط برای آدرس مجاز حساب Resend قابل استفاده است.
3. پس از فعال شدن ایمیل، حساب مدیر باید در فروشگاه ثبت‌نام و ایمیل خود را تأیید کند؛ سپس صفحه راه‌اندازی مدیر اولیه با کلید bootstrap محرمانه استفاده شود.
4. قبل از فروش واقعی، درگاه پرداخت، ارسال/حمل، قوانین مرجوعی و فرآیند مالی/مالیاتی باید تکمیل شوند.

## امنیت وابستگی‌ها
- Zod به نسخه وصله‌شده 4.6.7 ارتقا یافته است؛ اسکن npm audit در آخرین اجرای Worker CI تعداد صفر آسیب‌پذیری گزارش کرده است.

## آزمون‌ها
- GitHub Actions: typecheck، build و آزمون smoke زنده API و Pages
- آزمون smoke سلامت API، دسته‌بندی‌ها، کاتالوگ، CORS، محافظت مدیریت، اعتبارسنجی و ضدربات فرم مشاوره، صفحات پیش‌نمایش و ساختار JavaScript را بررسی می‌کند.
- تست‌های D1 کنترل موجودی، جلوگیری از سفارش بیش از موجودی و بازگردانی موجودی در لغو سفارش را پوشش می‌دهند.

## نکات امنیتی
- Secretها در Cloudflare Worker نگهداری می‌شوند و نباید در مخزن ثبت شوند.
- endpointهای مدیریت با نقش ADMIN محافظت شده‌اند.
- اولین مدیر فقط یک‌بار قابل ایجاد است.
- شاخه کاری و Pull Request تا زمان تأیید کاربر ادغام نمی‌شوند.
