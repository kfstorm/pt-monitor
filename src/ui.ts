const dashboardScript = `
const fmtBytes = n => n == null ? '–' : (()=>{const u=['B','KiB','MiB','GiB','TiB','PiB'];let i=0,v=Number(n);while(v>=1024&&i<u.length-1){v/=1024;i++}return (v>=100?Math.round(v):v.toFixed(v>=10?1:2))+' '+u[i]})()
const fmtNum = n => n == null ? '–' : new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n)
const fmtRatio = (n,uploaded,downloaded) => n == null ? (uploaded!=null&&downloaded!=null&&Number(uploaded)>0&&Number(downloaded)===0?'∞':'–') : n === Infinity || n === 'Infinity' ? '∞' : n === '-Infinity' ? '-∞' : fmtNum(n)
const fmtTime = ms => ms ? new Date(ms).toLocaleString() : 'never'
const fmtDay = t => {const d=new Date(t);return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function state(s){if(s.statusName==='success')return ['Healthy','ok'];if(s.statusName==='passParse')return ['Skipped','warn'];if(s.statusName==='needLogin')return ['Login failed','bad'];if(s.statusName==='CFBlocked')return ['Cloudflare','bad'];return [s.statusName||'Unknown','bad']}
const METRICS={
  bonusPerHour:{label:'Bonus / hour',fmt:fmtNum},
  bonus:{label:'Bonus',fmt:fmtNum},
  ratio:{label:'Ratio',fmt:fmtNum},
  uploaded:{label:'Uploaded',fmt:fmtBytes},
  downloaded:{label:'Downloaded',fmt:fmtBytes},
  seedingCount:{label:'Seeding',fmt:fmtNum},
  seedingSize:{label:'Seeding size',fmt:fmtBytes},
  seedingBonus:{label:'Seeding bonus',fmt:fmtNum},
  hnrUnsatisfied:{label:'H&R',fmt:fmtNum},
  hnrPreWarning:{label:'H&R warning',fmt:fmtNum}
}
let histories={}

function metric(){const v=document.getElementById('metric').value;return METRICS[v]?v:'bonusPerHour'}

function niceTicks(min,max,count){
  if(min===max){const pad=Math.abs(min)||1;min-=pad;max+=pad}
  const step0=(max-min)/(count-1)
  const pow=Math.pow(10,Math.floor(Math.log10(step0)))
  const err=step0/pow
  const mult=err<1.5?1:err<3?2:err<7?5:10
  const step=mult*pow
  const out=[]
  for(let v=Math.ceil(min/step)*step;v<=max+1e-9;v+=step)out.push(v)
  return out.length?out:[min,max]
}

function drawChart(container,hist,key){
  const meta=METRICS[key]
  const pts=[]
  for(const x of hist){if(x.collectedAt!=null&&x[key]!=null&&Number.isFinite(Number(x[key])))pts.push({t:x.collectedAt,v:Number(x[key])})}
  if(pts.length<2){container.innerHTML='<div class="chartEmpty">Not enough history to draw</div>';return}
  const w=container.clientWidth||640
  const h=110, ml=52, mr=12, mt=12, mb=22
  const iw=w-ml-mr, ih=h-mt-mb
  let tMin=Infinity,tMax=-Infinity,vMin=Infinity,vMax=-Infinity
  for(const p of pts){if(p.t<tMin)tMin=p.t;if(p.t>tMax)tMax=p.t;if(p.v<vMin)vMin=p.v;if(p.v>vMax)vMax=p.v}
  if(tMin===tMax)tMax=tMin+1000
  const span=vMax-vMin||Math.abs(vMax)||1
  const lo=vMin-span*0.06, hi=vMax+span*0.06
  const ticks=niceTicks(lo,hi,4)
  const X=t=>ml+((t-tMin)/(tMax-tMin))*iw
  const Y=v=>mt+ih-((v-lo)/(hi-lo))*ih
  let svg=''
  for(const v of ticks){
    const y=Y(v).toFixed(1)
    svg+='<line x1="'+ml+'" y1="'+y+'" x2="'+iw+'" y2="'+y+'" stroke="#222832" stroke-width="1"/>'
    svg+='<text x="'+(ml-6)+'" y="'+(Number(y)+3)+'" text-anchor="end" class="tick">'+esc(meta.fmt(v))+'</text>'
  }
  let d='', prev=false
  for(const x of hist){
    const t=x.collectedAt, v=x[key]
    if(t==null||v==null||!Number.isFinite(Number(v))){prev=false;continue}
    const px=X(t).toFixed(1), py=Y(Number(v)).toFixed(1)
    d+=(prev?'L':'M')+px+','+py+' '
    prev=true
  }
  const mid=(tMin+tMax)/2
  svg+='<text x="'+X(tMin).toFixed(1)+'" y="'+(mt+ih+16)+'" text-anchor="start" class="tick">'+fmtDay(tMin)+'</text>'
  svg+='<text x="'+X(mid).toFixed(1)+'" y="'+(mt+ih+16)+'" text-anchor="middle" class="tick">'+fmtDay(mid)+'</text>'
  svg+='<text x="'+X(tMax).toFixed(1)+'" y="'+(mt+ih+16)+'" text-anchor="end" class="tick">'+fmtDay(tMax)+'</text>'
  container.innerHTML='<div class="chartTitle">'+esc(meta.label)+'</div><svg class="chartSvg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+svg+'<path class="chartLine" d="'+d+'" /></svg>'
}

function renderCharts(){const key=metric();document.querySelectorAll('.chart[data-def]').forEach(el=>drawChart(el,histories[el.dataset.def]||[],key))}

async function history(def){const r=await fetch('/api/sites/'+encodeURIComponent(def)+'/history?hours=168');if(!r.ok)return[];return r.json()}

async function load(){
  const r=await fetch('/api/sites')
  const sites=await r.json()
  document.getElementById('siteCount').textContent=sites.length
  document.getElementById('healthy').textContent=sites.filter(x=>x.statusName==='success').length
  document.getElementById('warnings').textContent=sites.filter(x=>x.statusName==='passParse').length
  document.getElementById('failures').textContent=sites.filter(x=>!['success','passParse'].includes(x.statusName)).length
  document.getElementById('updated').textContent=sites.length?'Last snapshot: '+fmtTime(Math.max(...sites.map(x=>x.collectedAt))):'No snapshots yet'
  const grid=document.getElementById('grid')
  if(!sites.length){grid.innerHTML='<div class="empty">No snapshots yet. Collection will run automatically, or press "Collect now".</div>';return}
  histories=Object.fromEntries(await Promise.all(sites.map(async s=>[s.definition,await history(s.definition)])))
  grid.innerHTML=sites.map(s=>{
    const [label,cls]=state(s)
    const seedingBonus=s.seedingBonus==null?'':'<br><span class="muted">Seeding: '+fmtNum(s.seedingBonus)+'</span>'
    return '<article class="card"><div class="cardHead"><div><div class="name">'+esc(s.definition)+'</div><div class="indexer">'+esc(s.prowlarrIndexerName)+(s.level?' · '+esc(s.level):'')+'</div></div><span class="status '+cls+'">'+esc(label)+'</span></div><div class="metrics">'
      +'<div class="metric"><label>Ratio</label><strong>'+fmtRatio(s.ratio,s.uploaded,s.downloaded)+'</strong></div>'
      +'<div class="metric"><label>Uploaded</label><strong>'+fmtBytes(s.uploaded)+'</strong></div>'
      +'<div class="metric"><label>Downloaded</label><strong>'+fmtBytes(s.downloaded)+'</strong></div>'
      +'<div class="metric"><label>Bonus</label><strong>'+fmtNum(s.bonus)+'</strong>'+seedingBonus+'</div>'
      +'<div class="metric"><label>Bonus / hour</label><strong>'+fmtNum(s.bonusPerHour)+'</strong></div>'
      +'<div class="metric"><label>Seeding</label><strong>'+fmtNum(s.seedingCount)+' <span class="muted">· '+fmtBytes(s.seedingSize)+'</span></strong></div>'
      +'<div class="metric"><label>H&R</label><strong>'+fmtNum(s.hnrUnsatisfied)+'</strong></div>'
      +'<div class="metric"><label>H&R warning</label><strong>'+fmtNum(s.hnrPreWarning)+'</strong></div>'
      +'<div class="metric"><label>Collected</label><strong>'+esc(new Date(s.collectedAt).toLocaleTimeString())+'</strong></div>'
      +'</div><div class="chart" data-def="'+esc(s.definition)+'"></div></article>'
  }).join('')
  renderCharts()
}

const sel=document.getElementById('metric')
sel.value=localStorage.getItem('pt-monitor.metric')||'bonusPerHour'
sel.onchange=()=>{localStorage.setItem('pt-monitor.metric',sel.value);renderCharts()}
window.addEventListener('resize',()=>renderCharts())
const btn=document.getElementById('refresh')
btn.onclick=async()=>{btn.disabled=true;btn.textContent='Collecting…';try{await fetch('/api/collect',{method:'POST'});await load()}finally{btn.disabled=false;btn.textContent='Collect now'}}
load()
setInterval(load,60000)
`;

export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>PT Monitor</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark;background:#0b0d10;color:#eef2f7}
*{box-sizing:border-box} body{margin:0;background:#0b0d10} button{font:inherit}
.shell{max-width:1180px;margin:auto;padding:28px 20px 64px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:22px}.topRight{display:flex;gap:8px;align-items:center}
h1{font-size:28px;margin:0}.sub{color:#9199a5;font-size:13px;margin-top:5px}.btn{border:1px solid #303641;background:#171b21;color:#eef2f7;border-radius:9px;padding:9px 13px;cursor:pointer}.btn:hover{background:#20252d}.btn:disabled{opacity:.5;cursor:wait}select.btn{appearance:none;-webkit-appearance:none;padding-right:30px;background-image:linear-gradient(45deg,transparent 50%,#7f8996 50%),linear-gradient(135deg,#7f8996 50%,transparent 50%);background-position:calc(100% - 17px) 50%,calc(100% - 12px) 50%;background-size:5px 5px;background-repeat:no-repeat}
.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.summary>div,.card{background:#111419;border:1px solid #222832;border-radius:13px}.summary>div{padding:15px}.summary b{display:block;font-size:22px}.summary span{color:#8f98a5;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{padding:18px}.cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px}.name{font-weight:700;font-size:18px}.indexer{color:#7f8996;font-size:12px;margin-top:3px}.status{font-size:12px;border-radius:999px;padding:5px 9px;background:#222831}.ok{color:#7ee787}.warn{color:#f2cc60}.bad{color:#ff7b72}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metric{background:#0d1014;border-radius:9px;padding:10px}.metric label{display:block;color:#7f8996;font-size:11px;margin-bottom:4px}.metric strong{font-size:15px;white-space:nowrap}.muted{color:#727b87}.chart{position:relative;margin-top:14px;width:100%}.chartSvg{display:block;width:100%;height:auto}.chart .tick{fill:#7f8996;font-size:10px;font-family:inherit}.chartTitle{color:#7f8996;font-size:11px;margin-bottom:4px}.chartLine{fill:none;stroke:#7ee787;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}.chartEmpty{color:#727b87;font-size:12px;padding:38px 0;text-align:center}.empty{padding:70px 20px;text-align:center;color:#7f8996;border:1px dashed #303641;border-radius:13px}
@media(max-width:780px){.summary{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body><main class="shell">
  <div class="top"><div><h1>PT Monitor</h1><div class="sub" id="updated">Loading…</div></div><div class="topRight"><select id="metric" class="btn"><option value="bonusPerHour">Bonus / hour</option><option value="bonus">Bonus</option><option value="ratio">Ratio</option><option value="uploaded">Uploaded</option><option value="downloaded">Downloaded</option><option value="seedingCount">Seeding</option><option value="seedingSize">Seeding size</option><option value="seedingBonus">Seeding bonus</option><option value="hnrUnsatisfied">H&R</option><option value="hnrPreWarning">H&R warning</option></select><button class="btn" id="refresh">Collect now</button></div></div>
  <section class="summary"><div><b id="siteCount">–</b><span>Sites</span></div><div><b id="healthy">–</b><span>Healthy</span></div><div><b id="warnings">–</b><span>Warnings</span></div><div><b id="failures">–</b><span>Failures</span></div></section>
  <section class="grid" id="grid"><div class="empty">No snapshots yet.</div></section>
</main>
<script>${dashboardScript}</script></body></html>`;
