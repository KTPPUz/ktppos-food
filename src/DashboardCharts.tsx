import {useState} from 'react';
import {Clock,Flame,ImageOff,TrendingUp} from 'lucide-react';
import type {dashboardData,DashboardPeriod} from './dashboard-data';
import './dashboard.css';
const money=(value:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:2}).format(value);
function FoodImage({src,name}:{src:string;name:string}){const [failed,setFailed]=useState(false);return src&&!failed?<img src={src} alt={name} onError={()=>setFailed(true)}/>:<span className="dashboard-food-placeholder" aria-label="ไม่มีรูปอาหาร"><ImageOff size={20}/></span>;}
export default function DashboardCharts({data,period}:{data:ReturnType<typeof dashboardData>;period:DashboardPeriod}){
 const max=Math.max(1,...data.points.map(point=>point.amount));
 const periodLabel=period==='today'?'วันนี้':period==='7days'?'7 วันล่าสุด':'30 วันล่าสุด';
 return <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h3>จังหวะยอดขายของร้าน</h3><p>{periodLabel} · {period==='today'?'แบ่งช่วงละ 4 ชั่วโมง · ':''}ยอดรับชำระรวมภาษี ไม่รวมบิลคืนเงิน · เวลาไทย</p></div><span className="badge ready"><TrendingUp size={12}/> ยอดขายจริง</span></div>{!data.paid.length&&<p className="dashboard-empty-note">ยังไม่มียอดรับชำระในช่วงนี้</p>}<div className="dashboard-chart-scroll"><div className="chart dashboard-chart" style={{minWidth:period==='30days'?1500:period==='7days'?560:480}} role="img" aria-label={`กราฟยอดขาย${periodLabel}`}>
 {data.points.map((point,index)=><div className={'chart-column '+(index===data.points.length-1?'today':'')} key={point.key} title={`${point.label} · ${money(point.amount)}`}><span>{money(point.amount)}</span><div style={{height:point.amount?Math.max(2,point.amount/max*150):0}}/><small>{point.label}</small></div>)}
 </div></div></section><section className="panel bestsellers"><div className="panel-heading"><div><h3>จานโปรดประจำร้าน</h3><p>{periodLabel} · เรียงตามจำนวนที่ขายในบิลชำระแล้ว</p></div><Flame size={19}/></div>{data.bestsellers.length?data.bestsellers.map((item,index)=><div className="bestseller" key={item.id}><span>{String(index+1).padStart(2,'0')}</span><FoodImage key={item.image} src={item.image} name={item.name}/><div><strong>{item.name}</strong><small>{item.quantity.toLocaleString('th-TH')} จาน</small></div><b>{money(item.amount)}</b></div>):<p className="dashboard-empty-note">ยังไม่มีเมนูที่ขายในช่วงนี้</p>}<p className="dashboard-sales-note">ยอดสินค้าใช้ราคาที่ขายจริง รวมตัวเลือกเสริม ก่อนส่วนลดท้ายบิล ค่าบริการ และภาษี</p></section><PeakHours data={data} periodLabel={periodLabel}/></div>;
}

const hourLabel=(hour:number)=>`${String(hour).padStart(2,'0')}:00`;
function PeakHours({data,periodLabel}:{data:ReturnType<typeof dashboardData>;periodLabel:string}){
 const max=Math.max(1,...data.hours.map(slot=>slot.amount)),peak=data.peakHour;
 return <section className="panel peak-hours"><div className="panel-heading"><div><h3>ช่วงเวลาขายดี</h3><p>{periodLabel} · ยอดรับชำระรวมรายชั่วโมง · เวลาไทย</p></div>{peak?<span className="badge pending"><Clock size={12}/> พีค {hourLabel(peak.hour)}–{hourLabel((peak.hour+1)%24)}</span>:<Clock size={19}/>}</div>
 {peak?<p className="peak-hours-summary">ขายดีที่สุดช่วง <strong>{hourLabel(peak.hour)}–{hourLabel((peak.hour+1)%24)}</strong> · {money(peak.amount)} จาก {peak.count.toLocaleString('th-TH')} บิล</p>:<p className="dashboard-empty-note">ยังไม่มียอดรับชำระในช่วงนี้</p>}
 <div className="peak-hours-chart" role="img" aria-label={`ยอดขายรายชั่วโมง${periodLabel}`}>{data.hours.map(slot=><div key={slot.hour} className={'peak-hour'+(peak&&slot.hour===peak.hour?' peak':'')} title={`${hourLabel(slot.hour)} · ${money(slot.amount)} · ${slot.count} บิล`}><div style={{height:`${slot.amount/max*100}%`}}/><small>{slot.hour%3===0?String(slot.hour).padStart(2,'0'):''}</small></div>)}</div></section>;
}
