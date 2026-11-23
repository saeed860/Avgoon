const base='';let products=[],cart=JSON.parse(localStorage.getItem('avgoon_cart')||'{}'),mode='phone',filter='همه';localStorage.removeItem('avgoon_products');const fa=n=>Number(n||0).toLocaleString('fa-IR'),save=()=>{localStorage.setItem('avgoon_cart',JSON.stringify(cart))},esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function toast(s){let t=document.getElementById('toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}let compareIds=[],compareProducts=new Map();
let catalogPage=1,catalogTotal=0,catalogTimer;
function debouncedCatalogSearch(){clearTimeout(catalogTimer);catalogTimer=setTimeout(()=>{catalogPage=1;loadStoreProducts()},350)}
function clearCatalogFilters(){['catalogSearch','brandFilter','minPriceFilter','maxPriceFilter','specFilter','stockFilter'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=''});filter='همه';catalogPage=1;loadStoreProducts()}
function changeCatalogPage(delta){catalogPage=Math.max(1,catalogPage+delta);loadStoreProducts();document.getElementById('products').scrollIntoView({behavior:'smooth'})}
function compareProduct(id){if(compareIds.includes(id)){compareIds=compareIds.filter(x=>x!==id);compareProducts.delete(id)}else if(compareIds.length<3){const product=products.find(p=>p.id===id);if(product)compareProducts.set(id,product);compareIds.push(id)}else{return toast('حداکثر سه محصول را می‌توانید مقایسه کنید')}renderProducts();renderCompare()}
function clearCompare(){compareIds=[];renderProducts();renderCompare()}
function renderCompare(){const panel=document.getElementById('comparePanel'),chosen=compareIds.map(id=>compareProducts.get(id)).filter(Boolean);panel.hidden=!chosen.length;if(!chosen.length)return;const rows=[['محصول',p=>p.name],['برند',p=>p.brand||'ثبت نشده'],['دسته‌بندی',p=>p.category],['قیمت',p=>p.price?fa(p.price)+' تومان':'استعلام'],['موجودی',p=>fa(p.stock)+' '+(p.unit||'')],['مشخصات فنی',p=>p.technicalSpecs?JSON.stringify(p.technicalSpecs):'ثبت نشده']];document.getElementById('compareTable').innerHTML='<table><thead><tr><th>ویژگی</th>'+chosen.map(p=>'<th>'+esc(p.name)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([label,get])=>'<tr><th>'+label+'</th>'+chosen.map(p=>'<td>'+esc(get(p))+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
function renderProducts(){let a=products.filter(p=>(filter==='همه'||p.category===filter)&&(!document.getElementById('brandFilter')?.value.trim()||String(p.brand||'').toLowerCase()===document.getElementById('brandFilter').value.trim().toLowerCase())&&(!document.getElementById('minPriceFilter')?.value||Number(p.price)>=Number(document.getElementById('minPriceFilter').value))&&(!document.getElementById('maxPriceFilter')?.value||Number(p.price)<=Number(document.getElementById('maxPriceFilter').value))&&(!document.getElementById('stockFilter')?.value||(document.getElementById('stockFilter').value==='available'?p.stock>5:document.getElementById('stockFilter').value==='low'?p.stock>0&&p.stock<=5:p.stock<=0))&&(!document.getElementById('specFilter')?.value.trim()||JSON.stringify(p.technicalSpecs||{}).toLowerCase().includes(document.getElementById('specFilter').value.trim().toLowerCase())));document.getElementById('catalogCount').textContent=fa(catalogTotal)+' محصول';document.getElementById('catalogPage').textContent='صفحه '+fa(catalogPage);document.getElementById('catalogPrev').disabled=catalogPage<=1;document.getElementById('catalogNext').disabled=catalogPage*60>=catalogTotal;document.getElementById('productGrid').innerHTML=a.map(p=>`<article class="product ${p.isDemo?'demo-product':''}" data-product-id="${esc(p.id)}"><div class="photo"><img class="main-product-image" src="${esc(p.image||'')}" alt="${esc(p.name)}" style="${p.image?'':'display:none'}" data-hide-on-error="true"><div class="photo-placeholder" style="${p.image?'display:none':''}">تصویر محصول ثبت نشده</div><div class="photo-thumbs" style="display:flex;gap:6px;position:absolute;bottom:8px;right:8px;z-index:2;max-width:calc(100% - 16px);overflow-x:auto">${(p.images||[]).slice(1).map((im,i)=>'<img src="'+esc(im.url)+'" data-product-id="'+esc(p.id)+'" data-product-image="'+esc(im.url)+'" alt="'+esc(im.alt||p.name)+'" loading="lazy" title="نمایش تصویر '+(i+2)+'">').join('')}</div><span class="tag">${esc(p.tag||p.category)}</span></div><div class="pbody"><small>${esc(p.category)} / ${esc(p.sku||'AVGOON')}</small><h3>${esc(p.name)}</h3><div class="pfoot"><div class="price">${p.price?fa(p.price)+' <em>تومان</em>':'استعلام قیمت'}</div><div style="display:flex;gap:6px">${p.slug?'<a class="add" style="display:grid;place-items:center;text-decoration:none;font-size:11px;width:auto;padding:0 8px" href="product.html?slug='+encodeURIComponent(p.slug)+'">جزئیات</a>':''}<button class="add" title="افزودن به مقایسه" data-action-click="compareProduct" data-product-id="${esc(p.id)}" style="${compareIds.includes(p.id)?'background:var(--orange);color:white':''}">⇄</button><button class="add" data-action-click="addCart" data-product-id="${esc(p.id)}">+</button></div></div></div></article>`).join('')||'<p>محصولی ثبت نشده است.</p>';document.querySelectorAll('#productGrid [data-product-image]').forEach(img=>img.addEventListener('click',()=>setProductCardImage(img.dataset.productId,img.dataset.productImage)));document.querySelectorAll('#productGrid [data-hide-on-error]').forEach(img=>img.addEventListener('error',()=>{img.style.display='none';const placeholder=img.parentElement?.querySelector('.photo-placeholder');if(placeholder)placeholder.style.display='grid'},{once:true}))}
function filterProducts(c){filter=c;catalogPage=1;loadStoreProducts()}function safeProductImageUrl(value){const raw=String(value||'').trim();if(!raw)return '';try{const parsed=new URL(raw,location.href);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return '';return parsed.href}catch{return ''}}function setProductCardImage(id,url){const safeUrl=safeProductImageUrl(url);if(!safeUrl)return;const card=document.querySelector('[data-product-id="'+CSS.escape(String(id))+'"]'),img=card?.querySelector('.main-product-image');if(img){img.src=safeUrl;img.style.display='block'}}function updateCart(){let n=Object.values(cart).reduce((a,b)=>a+b,0);document.getElementById('cartCount').textContent=fa(n)}function addCart(id){const product=products.find(p=>String(p.id)===String(id));if(!product||product.isDemo)return toast('محصول نمایشی قابل سفارش نیست');cart[id]=(cart[id]||0)+1;save();updateCart();toast('به سبد خرید اضافه شد')}function openCart(){document.getElementById('cartOverlay').classList.add('show');renderCart()}function closeCart(){document.getElementById('cartOverlay').classList.remove('show')}function renderCart(){let a=products.filter(p=>cart[p.id]&&!p.isDemo);document.getElementById('cartItems').innerHTML=a.length?a.map(p=>`<div class="cartline"><img src="${esc(p.image||'')}" alt="${esc(p.name)}" style="${p.image?'':'display:none'}" data-hide-on-error="true"><div class="cart-placeholder" style="${p.image?'display:none':''}">—</div><div style="flex:1"><h4>${esc(p.name)}</h4><small>${p.price?fa(p.price)+' تومان':'استعلام قیمت'}</small><div class="qty"><button data-action-click="qty" data-product-id="${esc(p.id)}" data-delta="-1">−</button><b>${fa(cart[p.id])}</b><button data-action-click="qty" data-product-id="${esc(p.id)}" data-delta="1">+</button><button data-action-click="removeItem" data-product-id="${esc(p.id)}" style="border:0;color:#b33;margin-right:auto">حذف</button></div></div></div>`).join(''):'<p class="muted">سبد خرید خالی است.</p>';document.querySelectorAll('#cartItems [data-hide-on-error]').forEach(img=>img.addEventListener('error',()=>{img.style.display='none'},{once:true}));let sum=a.reduce((s,p)=>s+(p.price||0)*cart[p.id],0);document.getElementById('cartTotal').textContent=sum?fa(sum)+' تومان':'نیازمند استعلام'}function qty(id,n){cart[id]=(cart[id]||0)+n;if(cart[id]<=0)delete cart[id];save();updateCart();renderCart()}function removeItem(id){delete cart[id];save();updateCart();renderCart()}function openModal(id){document.getElementById(id).classList.add('show')}function closeModal(id){document.getElementById(id).classList.remove('show')}function readAccountSession(){try{return JSON.parse(localStorage.getItem('avgoon_session')||'null')}catch{localStorage.removeItem('avgoon_session');return null}}let authMode='login',authStep='request',authChannel='email',accountSession=readAccountSession();const API_BASE=(window.AVGOON_API_URL||'').replace(/\/$/,'');function clearExpiredAccountSession(message='نشست شما منقضی شده است؛ دوباره وارد شوید.'){accountSession=null;localStorage.removeItem('avgoon_session');const b=document.getElementById('accountButton');if(b)b.textContent='ورود / ثبت‌نام';const box=document.getElementById('myOrders');if(box)box.textContent=message;const hint=document.getElementById('checkoutHint');if(hint)hint.textContent=message;}
let serverCatalogReady=false;
const DEMO_PRODUCTS=[
{id:'demo-board-125',sku:'DEMO-GB-001',name:'صفحه گچی روکش‌دار ۱۲٫۵ میلی‌متر',category:'صفحات گچی',tag:'نمونه نمایشی',image:'https://assemblies-tools.usg.com/content/dam/USG_Marketing_Communications/canada/imagery/USG_owned/campaign-pages/cgc-sheetrock-ultralight-pro/ultralight-pro-alternate.jpg/_jcr_content/renditions/fr-sm.730.450.jpg',price:0,stock:0,unit:'برگ',isDemo:true},
{id:'demo-board-moisture',sku:'DEMO-GB-002',name:'صفحه گچی مقاوم در برابر رطوبت',category:'صفحات گچی',tag:'نمونه نمایشی',image:'https://assemblies-tools.usg.com/content/dam/USG_Marketing_Communications/canada/imagery/USG_owned/campaign-pages/cgc-sheetrock-ultralight-pro/ultralight-pro-alternate.jpg/_jcr_content/renditions/fr-sm.730.450.jpg',price:0,stock:0,unit:'برگ',isDemo:true},
{id:'demo-stud-70',sku:'DEMO-MF-001',name:'پروفیل استاد ۷۰ میلی‌متر',category:'سازه‌های فلزی',tag:'نمونه نمایشی',image:'https://www.berkahn.com.br/images/blog/drywall-ou-alvenaria/cover.webp',price:0,stock:0,unit:'شاخه',isDemo:true},
{id:'demo-track-70',sku:'DEMO-MF-002',name:'پروفیل رانر ۷۰ میلی‌متر',category:'سازه‌های فلزی',tag:'نمونه نمایشی',image:'https://www.berkahn.com.br/images/blog/drywall-ou-alvenaria/cover.webp',price:0,stock:0,unit:'شاخه',isDemo:true},
{id:'demo-rockwool',sku:'DEMO-IN-001',name:'عایق تخته‌ای پشم سنگ',category:'عایق‌ها',tag:'نمونه نمایشی',image:'https://www.insulation24.com/media/catalog/product/cache/e4d64343b1bc593f1c5348fe05efa4a6/P/L/PL_RKM39_8815.png',price:0,stock:0,unit:'بسته',isDemo:true},
{id:'demo-insulation-roll',sku:'DEMO-IN-002',name:'عایق صوتی و حرارتی',category:'عایق‌ها',tag:'نمونه نمایشی',image:'https://www.insulation24.com/media/catalog/product/cache/e4d64343b1bc593f1c5348fe05efa4a6/P/L/PL_RKM39_8815.png',price:0,stock:0,unit:'بسته',isDemo:true},
{id:'demo-joint-tape',sku:'DEMO-AC-001',name:'نوار درزگیر صفحات گچی',category:'ملزومات اجرا',tag:'نمونه نمایشی',image:'https://media.adeo.com/mkp/f2455d5a4019bb6f04d0c1bb6e0b2f07/media.jpeg',price:0,stock:0,unit:'رول',isDemo:true},
{id:'demo-joint-compound',sku:'DEMO-AC-002',name:'بتونه درزگیری و پرداخت',category:'ملزومات اجرا',tag:'نمونه نمایشی',image:'https://media.adeo.com/mkp/f2455d5a4019bb6f04d0c1bb6e0b2f07/media.jpeg',price:0,stock:0,unit:'سطل',isDemo:true}
];
function showDemoCatalog(){products=DEMO_PRODUCTS.map(p=>({...p}));serverCatalogReady=false;cart={};save();document.getElementById('demoNotice').hidden=false;renderProducts();updateCart();renderCartIfOpen()}
async function loadStoreProducts(){
  if(!API_BASE)return;
  try{
    const params=new URLSearchParams({limit:'60',page:String(catalogPage)});
    const q=document.getElementById('catalogSearch')?.value.trim();if(q)params.set('q',q);
    if(filter!=='همه'){const cat=[...document.querySelectorAll('.cat')].find(a=>a.textContent.includes(filter));if(cat){const map={'صفحات گچی':'gypsum-boards','سازه‌های فلزی':'metal-framing','عایق‌ها':'insulation','ملزومات اجرا':'accessories'};if(map[filter])params.set('category',map[filter])}}
    const brand=document.getElementById('brandFilter')?.value.trim();if(brand)params.set('brand',brand);
    const min=document.getElementById('minPriceFilter')?.value;if(min)params.set('minPrice',min);
    const max=document.getElementById('maxPriceFilter')?.value;if(max)params.set('maxPrice',max);
    const stock=document.getElementById('stockFilter')?.value;if(stock)params.set('stock',stock);
    const spec=document.getElementById('specFilter')?.value.trim();if(spec)params.set('spec',spec);
    const r=await fetch(API_BASE+'/api/products?'+params.toString());
    if(!r.ok)throw new Error('CATALOG_UNAVAILABLE');
    const d=await r.json();
    if(Array.isArray(d.items)){
      catalogTotal=Number(d.total||0);
      products=d.items.map(p=>({id:p.id,slug:p.slug,technicalSpecs:p.technicalSpecs||null,name:p.name,brand:p.brand||'',category:p.categoryName||'ملزومات اجرا',sku:p.sku,tag:p.brand||p.categoryName||'محصول',price:p.priceToman?Number(p.priceToman):0,image:p.imageUrl||'',images:Array.isArray(p.images)?p.images:[],stock:Number(p.stock||0),unit:p.unit||'عدد',description:p.description||'',isDemo:false}));
      const activeFilters=!!(q||brand||min||max||stock||spec||filter!=='همه');if(products.length||catalogTotal>0||activeFilters){serverCatalogReady=true;document.getElementById('demoNotice').hidden=true;const validIds=new Set(products.map(p=>String(p.id)));cart=Object.fromEntries(Object.entries(cart).filter(([id])=>validIds.has(String(id))));save();renderProducts();updateCart();renderCartIfOpen()}else{showDemoCatalog()}renderCompare();
    }
  }catch(e){console.warn('Avgoon catalog API unavailable; showing clearly labelled demo products.',e);showDemoCatalog()}
}
function renderCartIfOpen(){if(document.getElementById('cartOverlay')?.classList.contains('show'))renderCart()}

function openLogin(){openModal('loginModal');if(accountSession)showAccount();else{setAuthMode('login');authStep='request';renderAuth()}}
function checkout(){if(!Object.keys(cart).length)return toast('سبد خرید خالی است');closeCart();if(!API_BASE)return toast('اتصال فروشگاه به سرویس سفارش هنوز تکمیل نشده است.');if(!serverCatalogReady)return toast('برای ثبت سفارش، ابتدا محصولات واقعی از پایگاه داده بارگذاری شوند.');if(!accountSession?.token){openLogin();return}document.getElementById('oName').value=accountSession.user?.name||'';openModal('checkoutModal')}
async function loadMyOrders(){const box=document.getElementById('myOrders');box.textContent='در حال دریافت سفارش‌ها…';if(!accountSession?.token){box.textContent='برای مشاهده سفارش‌ها ابتدا وارد شوید.';return}try{const r=await fetch(API_BASE+'/api/me/orders?limit=20',{headers:{Authorization:'Bearer '+accountSession.token}}),d=await r.json();if(r.status===401){clearExpiredAccountSession();return}if(!r.ok)throw Error(d.message||'دریافت سفارش‌ها ناموفق بود');box.innerHTML=d.items.length?d.items.map(o=>'<div class="notice"><b>سفارش '+esc(o.id.slice(0,8))+'</b> — '+esc(o.status)+'<br>مبلغ: '+fa(o.totalToman)+' تومان · '+esc(new Date(o.createdAt).toLocaleDateString('fa-IR'))+'</div>').join(''):'هنوز سفارشی ثبت نکرده‌اید.'}catch(e){box.textContent=e.message}}
document.getElementById('checkoutForm').addEventListener('submit',async e=>{e.preventDefault();const btn=document.getElementById('placeOrderBtn');btn.disabled=true;try{const payload={items:Object.entries(cart).map(([productId,quantity])=>({productId,quantity})),address:{name:document.getElementById('oName').value.trim(),phone:normalizeDigits(document.getElementById('oPhone').value.trim()),province:document.getElementById('oProvince').value.trim(),city:document.getElementById('oCity').value.trim(),details:document.getElementById('oDetails').value.trim(),postalCode:document.getElementById('oPostal').value.trim()||undefined},note:document.getElementById('oNote').value.trim()||undefined};const r=await fetch(API_BASE+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accountSession.token,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)});const d=await r.json();if(r.status===401){clearExpiredAccountSession();throw Error('نشست شما منقضی شده است؛ دوباره وارد شوید.')}if(!r.ok)throw Error(d.message||'ثبت سفارش انجام نشد');cart={};save();updateCart();closeModal('checkoutModal');renderCart();toast('سفارش با موفقیت ثبت شد. کد: '+d.order.id.slice(0,8));}catch(err){document.getElementById('checkoutHint').textContent=err.message}finally{btn.disabled=false}});
function setAuthMode(m){authMode=m;authStep='request';renderAuth()}
function setAuthChannel(c){authChannel=c;authStep='request';renderAuth()}
function renderAuth(){document.getElementById('authForm').style.display='block';document.getElementById('accountPanel').style.display='none';document.getElementById('authTabs').style.display='flex';document.getElementById('registerFields').style.display=authMode==='register'?'block':'none';document.getElementById('authTitle').textContent=authMode==='register'?'ایجاد حساب کاربری':'ورود به حساب کاربری';document.getElementById('authDescription').textContent=authMode==='register'?'برای ساخت حساب، نام و راه ارتباطی خود را وارد کنید.':'برای ورود، کد یک‌بارمصرف دریافت کنید.';document.getElementById('loginTab').classList.toggle('active',authMode==='login');document.getElementById('registerTab').classList.toggle('active',authMode==='register');document.getElementById('authChannel').value=authChannel;document.getElementById('authTargetLabel').textContent=authChannel==='phone'?'شماره موبایل *':'آدرس ایمیل *';document.getElementById('authTarget').placeholder=authChannel==='phone'?'۰۹۱۲۱۲۳۴۵۶۷':'name@example.com';document.getElementById('authTarget').type=authChannel==='phone'?'tel':'email';document.getElementById('authTarget').inputMode=authChannel==='phone'?'tel':'email';document.getElementById('authOtpWrap').style.display=authStep==='verify'?'grid':'none';document.getElementById('authAction').textContent=authStep==='verify'?'تأیید کد و ادامه':'دریافت کد تأیید';document.getElementById('authHint').textContent=authStep==='verify'?'کد ۶ رقمی ارسال‌شده را وارد کنید. اعتبار کد ۵ دقیقه است.':'ورود و ثبت‌نام با کد یک‌بارمصرف انجام می‌شود.'}
function normalizeDigits(s){return String(s||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))}
async function runAuth(){if(!API_BASE)return toast('سرویس ورود هنوز به فروشگاه متصل نشده است.');const targetRaw=document.getElementById('authTarget').value.trim(),target=authChannel==='phone'?normalizeDigits(targetRaw).replace(/[\s-]/g,''):targetRaw.toLowerCase();if(authMode==='register'&&!document.getElementById('authName').value.trim())return toast('نام و نام خانوادگی را وارد کنید');if(!target)return toast('شماره موبایل یا ایمیل را وارد کنید');if(authChannel==='phone'&&!/^\+?[0-9]{10,15}$/.test(target))return toast('شماره موبایل معتبر نیست');if(authChannel==='email'&&!/^\S+@\S+\.\S+$/.test(target))return toast('ایمیل معتبر نیست');try{if(authStep==='request'){const r=await fetch(API_BASE+'/api/auth/request-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,channel:authChannel})});const data=await r.json();if(!r.ok)throw new Error(data.message||'ارسال کد ناموفق بود');authStep='verify';renderAuth();toast('درخواست کد ثبت شد');return}const code=normalizeDigits(document.getElementById('authOtp').value.trim());if(!/^\d{6}$/.test(code))return toast('کد ۶ رقمی را وارد کنید');const payload={target,channel:authChannel,code};if(authMode==='register')payload.name=document.getElementById('authName').value.trim();const r=await fetch(API_BASE+'/api/auth/verify-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.message||'تأیید کد ناموفق بود');accountSession={token:data.token,user:data.user,channel:authChannel,target};localStorage.setItem('avgoon_session',JSON.stringify(accountSession));showAccount();toast('با موفقیت وارد حساب شدید')}catch(e){toast(e.message||'ارتباط با سرور برقرار نشد');document.getElementById('authHint').textContent='اتصال سرویس فروشگاه را بررسی کنید؛ نشانی API هنوز پیکربندی نشده است.'}}
function showAccount(){document.getElementById('authForm').style.display='none';document.getElementById('authTabs').style.display='none';document.getElementById('accountPanel').style.display='block';document.getElementById('authTitle').textContent='حساب کاربری من';document.getElementById('authDescription').textContent='اطلاعات ورود شما';document.getElementById('accountName').value=accountSession?.user?.name||'کاربر آوگون';document.getElementById('accountContact').value=accountSession?.target||'';const b=document.getElementById('accountButton');if(b)b.textContent='حساب من';loadMyAddresses();initializeAddressMap();requestAnimationFrame(()=>addressMap?.invalidateSize())}
function logoutAccount(){accountSession=null;localStorage.removeItem('avgoon_session');document.getElementById('accountButton').textContent='ورود / ثبت‌نام';closeModal('loginModal');toast('از حساب خارج شدید')}
async function submitConsult(){const name=document.getElementById('cName').value.trim(),phone=document.getElementById('cPhone').value.trim(),message=document.getElementById('cDesc').value.trim(),email=document.getElementById('cEmail').value.trim(),projectType=document.getElementById('cType').value,website=document.getElementById('cWebsite').value,btn=document.getElementById('consultSubmit'),out=document.getElementById('consultResult');if(name.length<2||phone.length<8||message.length<5){out.textContent='نام، شماره تماس و شرح پروژه را کامل کنید.';return}btn.disabled=true;out.textContent='در حال ثبت درخواست…';try{const r=await fetch(API_BASE+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,email,projectType,message,website})});const d=await r.json();if(!r.ok)throw Error(d.message||'ثبت درخواست انجام نشد');document.getElementById('cName').value='';document.getElementById('cPhone').value='';document.getElementById('cEmail').value='';document.getElementById('cType').value='';document.getElementById('cDesc').value='';document.getElementById('cWebsite').value='';closeModal('consultModal');toast('درخواست شما ثبت شد؛ کارشناسان آوگون با شما تماس می‌گیرند.')}catch(e){out.textContent=e.message||'ارتباط با سرور برقرار نشد'}finally{btn.disabled=false}}document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.modal').forEach(x=>x.classList.remove('show'));closeCart()}});renderProducts();updateCart();loadStoreProducts();if(accountSession){document.getElementById('accountButton').textContent='حساب من';(async()=>{try{const r=await fetch(API_BASE+'/api/me',{headers:{Authorization:'Bearer '+accountSession.token}});if(!r.ok)throw Error('SESSION_REFRESH_FAILED');const d=await r.json();if(d.user){accountSession.user=d.user;localStorage.setItem('avgoon_session',JSON.stringify(accountSession));if(d.user.role==='ADMIN'&&!document.getElementById('adminEntry')){const a=document.createElement('a');a.id='adminEntry';a.href='admin.html';a.className='outline';a.textContent='پنل مدیریت';document.querySelector('.actions')?.appendChild(a)}}}catch(e){console.warn('Account role refresh failed',e)}})()}

/* Delegated UI actions: no executable code in HTML attributes. */
document.addEventListener('click',event=>{const el=event.target.closest('[data-action-click]');if(!el)return;switch(el.dataset.actionClick){case'openLogin':openLogin();break;case'openCart':openCart();break;case'filterCategory':filterProducts(el.dataset.filter);break;case'clearCatalogFilters':clearCatalogFilters();break;case'changeCatalogPage':changeCatalogPage(Number(el.dataset.delta));break;case'clearCompare':clearCompare();break;case'openModal':openModal(el.dataset.target);break;case'closeModal':closeModal(el.dataset.target);break;case'closeCart':closeCart();break;case'checkout':checkout();break;case'setAuthMode':setAuthMode(el.dataset.mode);break;case'runAuth':runAuth();break;case'loadMyOrders':loadMyOrders();break;case'logoutAccount':logoutAccount();break;case'submitConsult':submitConsult();break;case'compareProduct':compareProduct(el.dataset.productId);break;case'addCart':addCart(el.dataset.productId);break;case'qty':qty(el.dataset.productId,Number(el.dataset.delta));break;case'removeItem':removeItem(el.dataset.productId);break;}});
document.addEventListener('input',event=>{const el=event.target.closest('[data-action-input]');if(!el)return;const action=el.dataset.actionInput;if(action==='debouncedCatalogSearch')debouncedCatalogSearch();else if(action==='renderProducts')renderProducts();});
document.addEventListener('change',event=>{const el=event.target.closest('[data-action-change]');if(!el)return;if(el.dataset.actionChange==='renderProducts')renderProducts();else if(el.dataset.actionChange==='setAuthChannel')setAuthChannel(el.value);});
document.addEventListener('click',event=>{const overlay=event.target.closest('[data-action-overlay]');if(overlay&&event.target===overlay&&overlay.dataset.actionOverlay==='closeCart')closeCart();});


async function accountApi(path,options={}){
 const response=await fetch(API_BASE+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(accountSession?.token||''),...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){clearExpiredAccountSession();throw Error('نشست شما منقضی شده است؛ دوباره وارد شوید.')}
 if(!response.ok)throw Error(data.message||'عملیات انجام نشد');
 return data;
}
const LOCAL_ADDRESS_BOOK_KEY='avgoon_local_address_book_v1';
function localAddressOwner(){return String(accountSession?.user?.id||accountSession?.target||'account')}
function localAddressModeKey(){return 'avgoon_address_storage_mode_'+encodeURIComponent(localAddressOwner())}
function isLocalAddressMode(){return localStorage.getItem(localAddressModeKey())==='local'}
function readLocalAddressBook(){
 try{const all=JSON.parse(localStorage.getItem(LOCAL_ADDRESS_BOOK_KEY)||'{}');return Array.isArray(all[localAddressOwner()])?all[localAddressOwner()]:[]}
 catch{return []}
}
function writeLocalAddressBook(addresses){
 const all=(()=>{try{return JSON.parse(localStorage.getItem(LOCAL_ADDRESS_BOOK_KEY)||'{}')}catch{return {}}})();
 all[localAddressOwner()]=addresses;
 localStorage.setItem(LOCAL_ADDRESS_BOOK_KEY,JSON.stringify(all));localStorage.setItem(localAddressModeKey(),'local');
}
function renderAddressList(box,addresses,localOnly=false){
 box.replaceChildren();
 if(localOnly){const note=document.createElement('p');note.className='notice';note.textContent='حالت جایگزین فعال است: نشانی‌ها و نقطه نقشه فقط روی همین مرورگر و دستگاه ذخیره می‌شوند و با حساب شما در دستگاه‌های دیگر همگام نیستند.';box.append(note)}
 if(!addresses.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='هنوز نشانی‌ای ثبت نکرده‌اید.';box.append(empty);return}
 for(const address of addresses){
  const card=document.createElement('article');card.className='notice';card.style.margin='8px 0';
  const heading=document.createElement('strong');heading.textContent=address.recipientName+(address.isDefault?' · نشانی پیش‌فرض':'');card.append(heading);
  const detail=document.createElement('p');detail.textContent=[address.phone,address.province,address.city,address.postalCode,address.address].join(' · ');card.append(detail);
  if(localOnly&&Number.isFinite(Number(address.latitude))&&Number.isFinite(Number(address.longitude))){const coords=document.createElement('small');coords.textContent='موقعیت نقشه: '+Number(address.latitude).toFixed(5)+', '+Number(address.longitude).toFixed(5);card.append(coords)}
  const actions=document.createElement('div');actions.className='tools';
  const edit=document.createElement('button');edit.type='button';edit.className='btn light';edit.textContent='ویرایش';edit.addEventListener('click',()=>editAddress(address));actions.append(edit);
  if(!address.isDefault){const makeDefault=document.createElement('button');makeDefault.type='button';makeDefault.className='btn light';makeDefault.textContent='پیش‌فرض';makeDefault.addEventListener('click',()=>setDefaultAddress(address.id));actions.append(makeDefault)}
  const remove=document.createElement('button');remove.type='button';remove.className='btn light';remove.textContent='حذف';remove.addEventListener('click',()=>deleteAddress(address.id));actions.append(remove);
  card.append(actions);box.append(card);
 }
}
async function loadMyAddresses(){
 const box=document.getElementById('addressList');if(!box||!accountSession?.token)return;
 if(isLocalAddressMode()){renderAddressList(box,readLocalAddressBook(),true);return}
 box.textContent='در حال دریافت نشانی‌ها…';
 try{
  const data=await accountApi('/api/me');
  if(data.user){accountSession.user=data.user;localStorage.setItem('avgoon_session',JSON.stringify(accountSession));document.getElementById('accountName').value=data.user.name||'';}
  renderAddressList(box,data.user?.addresses||[],false);
 }catch(error){
  if(!accountSession?.token){box.textContent=error.message||'نشست معتبر نیست.';return}
  // Persist the fallback choice immediately so edit/default/delete use the same local store.
  localStorage.setItem(localAddressModeKey(),'local');
  renderAddressList(box,readLocalAddressBook(),true);
  document.getElementById('addressMessage').textContent='سرویس دفترچه نشانی هنوز در سرور فعال نیست؛ می‌توانید فعلاً نشانی را محلی ذخیره کنید.';
 }
}
let addressMap=null,addressMarker=null,selectedAddressPoint=null;
function initializeAddressMap(){
 const el=document.getElementById('addressMap');if(!el||addressMap||typeof L==='undefined')return;
 addressMap=L.map(el,{scrollWheelZoom:false}).setView([32.4279,53.6880],5);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(addressMap);
 addressMap.on('click',e=>setAddressPoint(e.latlng.lat,e.latlng.lng));
 document.getElementById('addressLocate')?.addEventListener('click',()=>{
  const status=document.getElementById('addressMapStatus');
  if(!navigator.geolocation){status.textContent='موقعیت‌یابی در این مرورگر پشتیبانی نمی‌شود.';return}
  status.textContent='در حال دریافت موقعیت دستگاه…';
  navigator.geolocation.getCurrentPosition(pos=>{setAddressPoint(pos.coords.latitude,pos.coords.longitude);addressMap.setView([pos.coords.latitude,pos.coords.longitude],16);},err=>{status.textContent=err.code===1?'دسترسی به موقعیت مکانی داده نشد.':'دریافت موقعیت مکانی ناموفق بود.'},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
 });
 document.getElementById('addressMapLookup')?.addEventListener('click',reverseAddressPoint);
 document.getElementById('addressMapClear')?.addEventListener('click',clearAddressPoint);
 requestAnimationFrame(()=>addressMap.invalidateSize());
}
function setAddressPoint(lat,lon){
 selectedAddressPoint={latitude:Number(lat),longitude:Number(lon)};
 if(addressMarker)addressMarker.setLatLng([lat,lon]);else addressMarker=L.marker([lat,lon]).addTo(addressMap);
 document.getElementById('addressMapStatus').textContent='نقطه انتخاب شد: '+lat.toFixed(6)+', '+lon.toFixed(6)+' — برای تکمیل خودکار نشانی، دکمه دریافت نشانی را بزنید.';
}
function clearAddressPoint(){selectedAddressPoint=null;if(addressMarker){addressMap.removeLayer(addressMarker);addressMarker=null}document.getElementById('addressMapStatus').textContent='نقطه نقشه پاک شد.'}
async function reverseAddressPoint(){
 if(!selectedAddressPoint)return document.getElementById('addressMapStatus').textContent='ابتدا یک نقطه روی نقشه انتخاب کنید.';
 const status=document.getElementById('addressMapStatus'),button=document.getElementById('addressMapLookup');button.disabled=true;status.textContent='در حال دریافت نشانی از نقشه…';
 try{
  const {latitude,longitude}=selectedAddressPoint;
  const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(latitude)+'&lon='+encodeURIComponent(longitude)+'&accept-language=fa';
  const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw Error('سرویس نشانی‌یابی پاسخ نداد.');
  const data=await response.json(),a=data.address||{};
  const province=a.state||a.province||a.region||'';
  const city=a.city||a.town||a.village||a.municipality||a.county||'';
  if(province)document.getElementById('addressProvince').value=province;
  if(city)document.getElementById('addressCity').value=city;
  if(data.display_name)document.getElementById('addressDetails').value=data.display_name.slice(0,500);
  status.textContent=data.display_name?'نشانی از روی نقشه دریافت شد؛ لطفاً استان، شهر و جزئیات را بررسی کنید.':'برای این نقطه نشانی متنی پیدا نشد؛ مختصات ذخیره خواهد شد.';
 }catch(error){status.textContent=error.message||'دریافت نشانی از نقشه ناموفق بود.'}
 finally{button.disabled=false}
}
function resetAddressForm(){
 const form=document.getElementById('addressForm');if(!form)return;form.reset();document.getElementById('addressEditId').value='';clearAddressPoint();document.getElementById('addressSave').textContent='ذخیره نشانی';document.getElementById('addressMessage').textContent='';
}
function editAddress(address){
 document.getElementById('addressEditId').value=address.id;
 document.getElementById('addressRecipient').value=address.recipientName;
 document.getElementById('addressPhone').value=address.phone;
 document.getElementById('addressProvince').value=address.province;
 document.getElementById('addressCity').value=address.city;
 document.getElementById('addressPostal').value=address.postalCode;
 document.getElementById('addressDetails').value=address.address;
 document.getElementById('addressDefault').checked=Boolean(address.isDefault);
 if(Number.isFinite(Number(address.latitude))&&Number.isFinite(Number(address.longitude))&&address.latitude!==null&&address.longitude!==null){selectedAddressPoint={latitude:Number(address.latitude),longitude:Number(address.longitude)};initializeAddressMap();setAddressPoint(selectedAddressPoint.latitude,selectedAddressPoint.longitude);addressMap.setView([selectedAddressPoint.latitude,selectedAddressPoint.longitude],16)}else clearAddressPoint();
 document.getElementById('addressSave').textContent='ذخیره تغییرات';
 document.getElementById('addressMessage').textContent='نشانی برای ویرایش در فرم قرار گرفت.';
 document.getElementById('addressForm').scrollIntoView({behavior:'smooth',block:'center'});
}
async function saveAddress(event){
 event.preventDefault();
 const id=document.getElementById('addressEditId').value;
 const payload={
  recipientName:document.getElementById('addressRecipient').value.trim(),
  phone:normalizeDigits(document.getElementById('addressPhone').value).replace(/[\s()-]/g,''),
  province:document.getElementById('addressProvince').value.trim(),
  city:document.getElementById('addressCity').value.trim(),
  postalCode:normalizeDigits(document.getElementById('addressPostal').value).trim(),
  address:document.getElementById('addressDetails').value.trim(),
  latitude:selectedAddressPoint?.latitude??null,
  longitude:selectedAddressPoint?.longitude??null,
  isDefault:document.getElementById('addressDefault').checked
 };
 if(!/^\+?[0-9]{10,15}$/.test(payload.phone)||!/^\d{10}$/.test(payload.postalCode)){document.getElementById('addressMessage').textContent='شماره تماس یا کد پستی معتبر نیست.';return}
 const button=document.getElementById('addressSave');button.disabled=true;
 try{
  if(isLocalAddressMode()){
   const addresses=readLocalAddressBook(),record={...payload,id:id||crypto.randomUUID(),latitude:selectedAddressPoint?.latitude??null,longitude:selectedAddressPoint?.longitude??null,createdAt:new Date().toISOString()};
   const index=addresses.findIndex(item=>item.id===id);
   if(index>=0)addresses[index]={...addresses[index],...record};else{if(!addresses.length)record.isDefault=true;addresses.push(record)}
   if(record.isDefault)addresses.forEach(item=>{if(item.id!==record.id)item.isDefault=false});
   writeLocalAddressBook(addresses);
  }else{
   await accountApi(id?'/api/me/addresses/'+encodeURIComponent(id):'/api/me/addresses',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
  }
  resetAddressForm();await loadMyAddresses();toast(isLocalAddressMode()?'نشانی روی همین دستگاه ذخیره شد.':'نشانی با موفقیت ذخیره شد.');
 }catch(error){
  if(!accountSession?.token){document.getElementById('addressMessage').textContent=error.message||'نشست معتبر نیست.';return}
  const addresses=readLocalAddressBook(),record={...payload,id:id||crypto.randomUUID(),latitude:selectedAddressPoint?.latitude??null,longitude:selectedAddressPoint?.longitude??null,createdAt:new Date().toISOString()};
  const index=addresses.findIndex(item=>item.id===id);
  if(index>=0)addresses[index]={...addresses[index],...record};else{if(!addresses.length)record.isDefault=true;addresses.push(record)}
  if(record.isDefault)addresses.forEach(item=>{if(item.id!==record.id)item.isDefault=false});
  writeLocalAddressBook(addresses);resetAddressForm();await loadMyAddresses();toast('نشانی روی همین دستگاه ذخیره شد؛ همگام‌سازی ابری فعلاً در دسترس نیست.');
 }finally{button.disabled=false}
}
async function setDefaultAddress(id){
 try{
  if(isLocalAddressMode()){
   const addresses=readLocalAddressBook().map(item=>({...item,isDefault:item.id===id}));writeLocalAddressBook(addresses);
  }else await accountApi('/api/me/addresses/'+encodeURIComponent(id)+'/default',{method:'POST'});
  await loadMyAddresses();toast('نشانی پیش‌فرض تغییر کرد.');
 }catch(error){toast(error.message||'تغییر نشانی پیش‌فرض ناموفق بود.')}
}
async function deleteAddress(id){
 if(!confirm('این نشانی حذف شود؟'))return;
 try{
  if(isLocalAddressMode())writeLocalAddressBook(readLocalAddressBook().filter(item=>item.id!==id));
  else await accountApi('/api/me/addresses/'+encodeURIComponent(id),{method:'DELETE'});
  resetAddressForm();await loadMyAddresses();toast('نشانی حذف شد.');
 }catch(error){toast(error.message||'حذف نشانی ناموفق بود.')}
}
async function saveAccountName(){
 const name=document.getElementById('accountName').value.trim();
 if(name.length<2||name.length>120){toast('نام باید بین ۲ تا ۱۲۰ نویسه باشد.');return}
 const button=document.getElementById('accountNameSave');button.disabled=true;
 try{const data=await accountApi('/api/me',{method:'PATCH',body:JSON.stringify({name})});accountSession.user={...(accountSession.user||{}),...data.user};localStorage.setItem('avgoon_session',JSON.stringify(accountSession));toast('نام حساب ذخیره شد.')}
 catch(error){toast(error.message||'ذخیره نام ناموفق بود.')}
 finally{button.disabled=false}
}
document.getElementById('addressForm')?.addEventListener('submit',saveAddress);
document.getElementById('addressCancel')?.addEventListener('click',resetAddressForm);
document.getElementById('accountNameSave')?.addEventListener('click',saveAccountName);
