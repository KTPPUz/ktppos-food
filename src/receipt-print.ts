import sarabunRegular from './fonts/THSarabunNew.ttf?url';
import sarabunBold from './fonts/THSarabunNew-Bold.ttf?url';

// TH Sarabun New has a small x-height, so receipt sizes are larger than the app's Tahoma equivalents.
const receiptCss=`
@font-face { font-family:"TH Sarabun New"; src:url("${sarabunRegular}") format("truetype"); font-weight:400; font-style:normal; }
@font-face { font-family:"TH Sarabun New"; src:url("${sarabunBold}") format("truetype"); font-weight:700; font-style:normal; }
@page { margin: 0; }
* { box-sizing: border-box; }
html,body { margin:0; padding:0; width:80mm; background:#fff; color:#000; color-scheme:light; }
body { font-family:"TH Sarabun New",Tahoma,"Noto Sans Thai",Arial,sans-serif; font-size:16px; line-height:1.25; }
#print-receipt { width:80mm; margin:0; padding:4mm; text-align:center; background:#fff; color:#000; }
#print-receipt * { color:#000 !important; background:transparent !important; box-shadow:none !important; }
h2 { font-size:24px; line-height:1.4; margin:2mm 0 1mm; overflow-wrap:anywhere; }
p { margin:1mm 0; font-size:15px; overflow-wrap:anywhere; }
.receipt-demo { display:block; font-size:15px; margin:2mm 0; }
.receipt-meta { display:flex; justify-content:space-between; gap:2mm; border-block:1px dashed #000; padding:2mm 0; margin:2mm 0; font-size:14px; }
.receipt-row { display:flex; justify-content:space-between; gap:2mm; text-align:left; margin:2mm 0; break-inside:avoid; }
.receipt-row>span { flex:1; min-width:0; overflow-wrap:anywhere; }
.receipt-row b { flex-shrink:0; white-space:nowrap; }
.receipt-row small { display:block; font-size:14px; margin-top:.5mm; }
.receipt-totals { border-block:1px dashed #000; margin:3mm 0 2mm; padding:2mm 0; font-size:15px; }
.receipt-totals>div { display:flex; justify-content:space-between; gap:2mm; padding:1mm 0; break-inside:avoid; }
.receipt-totals>div>span:last-child { white-space:nowrap; }
.receipt-grand { font-size:21px; font-weight:bold; border-top:1px dashed #000; margin-top:1mm; padding-top:2mm !important; }
.badge { display:inline-block; font-size:15px; padding:1mm 0; }
.receipt-thanks { margin:2mm 0 1mm; }
#print-receipt>small { display:block; font-size:14px; }
#print-receipt>svg { width:22px; height:22px; }
`;

export async function printReceipt():Promise<void>{
 const receipt=document.getElementById('print-receipt');
 if(!receipt)throw new Error('ไม่พบใบเสร็จสำหรับพิมพ์');
 document.getElementById('receipt-print-frame')?.remove();
 const frame=document.createElement('iframe');
 frame.id='receipt-print-frame';frame.title='พิมพ์ใบเสร็จ 80 มม.';
 frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
 Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'80mm',height:'1px',border:'0',pointerEvents:'none'});
 document.body.append(frame);
 const doc=frame.contentDocument,printWindow=frame.contentWindow;
 if(!doc||!printWindow){frame.remove();throw new Error('ไม่สามารถเปิดหน้าพิมพ์ใบเสร็จได้');}
 try{
  // Isolate printing from app layout, dark theme and QR table print styles.
  doc.open();doc.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสร็จรับเงิน</title></head><body></body></html>');doc.close();
  const style=doc.createElement('style');style.textContent=receiptCss;doc.head.append(style);
  const copy=doc.importNode(receipt,true) as HTMLElement;doc.body.append(copy);
  await Promise.all([doc.fonts.load('400 16px "TH Sarabun New"'),doc.fonts.load('700 16px "TH Sarabun New"')]).catch(()=>undefined);
  await doc.fonts.ready;
  await new Promise<void>(resolve=>printWindow.requestAnimationFrame(()=>resolve()));
  // CSS page size needs two lengths. Measure the laid-out 80 mm receipt for roll paper/PDF.
  const heightMm=Math.max(40,Math.ceil(copy.getBoundingClientRect().height*25.4/96)+1);
  // Separate sheet: rewriting the first one would re-create its @font-face rules and blank the text while they reload.
  const pageStyle=doc.createElement('style');pageStyle.textContent=`@page { size:80mm ${heightMm}mm; margin:0; }`;doc.head.append(pageStyle);
  printWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
  printWindow.focus();printWindow.print();
 }catch(error){frame.remove();throw error;}
}
