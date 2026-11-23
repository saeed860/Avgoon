(()=> {
'use strict';
const API=(window.AVGOON_API_URL||'').replace(/\/$/,'');
const session=(()=>{try{return JSON.parse(localStorage.getItem('avgoon_session')||'null')}catch{localStorage.removeItem('avgoon_session');return null}})();
const $=id=>document.getElementById(id), fa=n=>Number(n||0).toLocaleString('fa-IR');
const statusNames={PENDING:'در انتظار',PAID:'پرداخت‌شده',PROCESSING:'در حال پردازش',SHIPPED:'ارسال‌شده',COMPLETED:'تکمیل‌شده',CANCELLED:'لغوشده'};
let lastReport=null;
function localDate(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function message(text,error=false){$('message').textContent=text;$('message').className='message'+(error?' error':'')}
function escapeCsv(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
async function load(){
 const from=$('from').value,to=$('to').value;
 if(!from||!to||from>to){message('بازه تاریخ معتبر نیست.',true);return}
 $('apply').disabled=true;$('csv').disabled=true;message('در حال دریافت گزارش…');
 try{
  if(!API)throw Error('آدرس API تنظیم نشده است.');
  const response=await fetch(API+'/api/admin/reports/sales?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to),{headers:{Authorization:'Bearer '+(session?.token||'')}});
  const data=await response.json().catch(()=>({}));
  if(response.status===401){localStorage.removeItem('avgoon_session');location.replace('index.html');return}
  if(!response.ok)throw Error(data.message||'دریافت گزارش ناموفق بود.');
  lastReport=data;
  $('paidTotal').textContent=fa(data.summary?.paidTotalToman);
  $('paidCount').textContent=fa(data.summary?.paidOrderCount);
  $('orderCount').textContent=fa(data.summary?.orderCount);
  $('pendingCancelled').textContent=fa(data.summary?.pendingCount)+' / '+fa(data.summary?.cancelledCount);
  const body=$('daily');body.replaceChildren();
  if(!data.daily?.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.className='message';td.textContent='در این بازه سفارشی ثبت نشده است.';tr.append(td);body.append(tr)}
  else for(const row of data.daily){const tr=document.createElement('tr');[new Date(row.day+'T00:00:00').toLocaleDateString('fa-IR'),fa(row.orderCount),fa(row.paidOrderCount),fa(row.paidTotalToman)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td)});body.append(tr)}
  $('range').textContent='از '+new Date(from+'T00:00:00').toLocaleDateString('fa-IR')+' تا '+new Date(to+'T00:00:00').toLocaleDateString('fa-IR');
  $('statusBreakdown').textContent=(data.statuses||[]).map(x=>(statusNames[x.status]||x.status)+': '+fa(x.count)).join(' | ');
  $('csv').disabled=false;message('گزارش با موفقیت دریافت شد.');
 }catch(e){message(e.message||'خطا در دریافت گزارش',true)}finally{$('apply').disabled=false}
}
function downloadCsv(){
 if(!lastReport)return;
 const rows=[['تاریخ','کل سفارش‌ها','سفارش‌های پرداخت‌شده','فروش پرداخت‌شده (تومان)'],...(lastReport.daily||[]).map(x=>[x.day,x.orderCount,x.paidOrderCount,x.paidTotalToman])];
 const csv='\uFEFF'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
 a.href=url;a.download='avgoon-sales-'+lastReport.from+'-'+lastReport.to+'.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
if(!session?.token){location.replace('admin.html');return}
$('logout').addEventListener('click',()=>{localStorage.removeItem('avgoon_session');location.replace('index.html')});
$('apply').addEventListener('click',load);$('csv').addEventListener('click',downloadCsv);
const today=new Date();$('to').value=localDate(today);$('from').value=localDate(new Date(today.getFullYear(),today.getMonth(),1));
load();
})();