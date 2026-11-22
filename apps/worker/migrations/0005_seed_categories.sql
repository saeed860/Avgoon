-- Seed the core Avgoon dry-construction categories. Safe to re-run.
INSERT INTO Category(id,name,slug,description,createdAt) VALUES
('avgoon-cat-gypsum','صفحات گچی','gypsum-boards','انواع صفحات گچی ساده، مقاوم در برابر رطوبت و حریق',CURRENT_TIMESTAMP),
('avgoon-cat-metal','سازه‌های فلزی','metal-framing','پروفیل استاد، رانر و اتصالات سازه‌های کناف',CURRENT_TIMESTAMP),
('avgoon-cat-insulation','عایق‌ها','insulation','عایق‌های حرارتی و صوتی از جمله پشم سنگ',CURRENT_TIMESTAMP),
('avgoon-cat-accessories','ملزومات اجرا','accessories','پیچ، بتونه، نوار درزگیر و ابزار اجرا',CURRENT_TIMESTAMP)
ON CONFLICT(slug) DO NOTHING;
