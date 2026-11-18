import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'آوگون | فروشگاه تخصصی ساخت‌وساز خشک', description: 'مرجع تخصصی صفحات گچی، سازه فلزی، عایق و تجهیزات ساخت‌وساز خشک' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="fa" dir="rtl"><body>{children}</body></html>; }
