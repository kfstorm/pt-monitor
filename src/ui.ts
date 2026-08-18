export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>PT Monitor</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark;background:#0b0d10;color:#eef2f7}
*{box-sizing:border-box} body{margin:0;background:#0b0d10} button{font:inherit}
.shell{max-width:1180px;margin:auto;padding:28px 20px 64px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:22px}
h1{font-size:28px;margin:0}.sub{color:#9199a5;font-size:13px;margin-top:5px}.btn{border:1px solid #303641;background:#171b21;color:#eef2f7;border-radius:9px;padding:9px 13px;cursor:pointer}.btn:hover{background:#20252d}.btn:disabled{opacity:.5;cursor:wait}
.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.summary>div,.card{background:#111419;border:1px solid #222832;border-radius:13px}.summary>div{padding:15px}.summary b{display:block;font-size:22px}.summary span{color:#8f98a5;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{padding:18px}.cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px}.name{font-weight:700;font-size:18px}.indexer{color:#7f8996;font-size:12px;margin-top:3px}.status{font-size:12px;border-radius:999px;padding:5px 9px;background:#222831}.ok{color:#7ee787}.warn{color:#f2cc60}.bad{color:#ff7b72}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metric{background:#0d1014;border-radius:9px;padding:10px}.metric label{display:block;color:#7f8996;font-size:11px;margin-bottom:4px}.metric strong{font-size:15px;white-space:nowrap}.muted{color:#727b87}.chart{height:52px;margin-top:13px;width:100%}.empty{padding:70px 20px;text-align:center;color:#7f8996;border:1px dashed #303641;border-radius:13px}
@media(max-width:780px){.summary{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body><main class="shell">
  <div class="top"><div><h1>PT Monitor</h1><div class="sub" id="updated">Loading…</div></div><button class="btn" id="refresh">Collect now</button></div>
  <section class="summary"><div><b id="siteCount">–</b><span>Sites</span></div><div><b id="healthy">–</b><span>Healthy</span></div><div><b id="warnings">–</b><span>Warnings</span></div><div><b id="failures">–</b><span>Failures</span></div></section>
  <section class="grid" id="grid"><div class="empty">No snapshots yet.</div></section>
</main>
<script>
const fmtBytes = n => n == null ? '–' : (()=>{const u=['B','KiB','MiB','GiB','TiB','PiB'];let i=0,v=Number(n);while(v>=1024&&i<u.length-1){v/=1024;i++}return (v>=100?Math.round(v):v.toFixed(v>=10?1:2))+' '+u[i]})()
 const fmtNum = n => n == null ? '–' : new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n)
 const fmtRatio = (n,uploaded,downloaded) => n == null ? (uploaded!=null&&downloaded!=null&&Number(uploaded)>0&&Number(downloaded)===0?'∞':'–') : n === Infinity || n === 'Infinity' ? '∞' : n === '-Infinity' ? '-∞' : fmtNum(n)
const fmtTime = ms => ms ? new Date(ms).toLocaleString() : 'never'
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function state(s){if(s.statusName==='success')return ['Healthy','ok'];if(s.statusName==='passParse')return ['Skipped','warn'];if(s.statusName==='needLogin')return ['Login failed','bad'];if(s.statusName==='CFBlocked')return ['Cloudflare','bad'];return [s.statusName||'Unknown','bad']}
function spark(values){const xs=values.filter(v=>v!=null).map(Number);if(xs.length<2)return '';const min=Math.min(...xs),max=Math.max(...xs),span=max-min||1;const points=xs.map((v,i)=>\`\${(i/(xs.length-1))*100},\${46-((v-min)/span)*40}\`).join(' ');return \`<svg viewBox="0 0 100 52" preserveAspectRatio="none" class="chart"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="\${points}" /></svg>\`}
async function history(def){const r=await fetch('/api/sites/'+encodeURIComponent(def)+'/history?hours=168');if(!r.ok)return[];return r.json()}
async function load(){const r=await fetch('/api/sites');const sites=await r.json();document.getElementById('siteCount').textContent=sites.length;document.getElementById('healthy').textContent=sites.filter(x=>x.statusName==='success').length;document.getElementById('warnings').textContent=sites.filter(x=>x.statusName==='passParse').length;document.getElementById('failures').textContent=sites.filter(x=>!['success','passParse'].includes(x.statusName)).length;document.getElementById('updated').textContent=sites.length?'Last snapshot: '+fmtTime(Math.max(...sites.map(x=>x.collectedAt))):'No snapshots yet';
const grid=document.getElementById('grid');if(!sites.length){grid.innerHTML='<div class="empty">No snapshots yet. Collection will run automatically, or press “Collect now”.</div>';return}
const histories=Object.fromEntries(await Promise.all(sites.map(async s=>[s.definition,await history(s.definition)])));
  grid.innerHTML=sites.map(s=>{const [label,cls]=state(s);const hist=histories[s.definition]||[];const seedingBonus=s.seedingBonus==null?'':\`<br><span class="muted">Seeding: \${fmtNum(s.seedingBonus)}</span>\`;return \`<article class="card"><div class="cardHead"><div><div class="name">\${esc(s.definition)}</div><div class="indexer">\${esc(s.prowlarrIndexerName)}\${s.level?' · '+esc(s.level):''}</div></div><span class="status \${cls}">\${esc(label)}</span></div><div class="metrics"><div class="metric"><label>Ratio</label><strong>\${fmtRatio(s.ratio,s.uploaded,s.downloaded)}</strong></div><div class="metric"><label>Uploaded</label><strong>\${fmtBytes(s.uploaded)}</strong></div><div class="metric"><label>Downloaded</label><strong>\${fmtBytes(s.downloaded)}</strong></div><div class="metric"><label>Bonus</label><strong>\${fmtNum(s.bonus)}\${seedingBonus}</strong></div><div class="metric"><label>Bonus / hour</label><strong>\${fmtNum(s.bonusPerHour)}</strong></div><div class="metric"><label>Seeding</label><strong>\${fmtNum(s.seedingCount)} <span class="muted">· \${fmtBytes(s.seedingSize)}</span></strong></div><div class="metric"><label>H&R</label><strong>\${fmtNum(s.hnrUnsatisfied)}</strong></div><div class="metric"><label>H&R warning</label><strong>\${fmtNum(s.hnrPreWarning)}</strong></div><div class="metric"><label>Collected</label><strong>\${esc(new Date(s.collectedAt).toLocaleTimeString())}</strong></div></div>\${spark(hist.map(x=>x.bonusPerHour??x.bonus??x.ratio))}</article>\`}).join('')}
const btn=document.getElementById('refresh');btn.onclick=async()=>{btn.disabled=true;btn.textContent='Collecting…';try{await fetch('/api/collect',{method:'POST'});await load()}finally{btn.disabled=false;btn.textContent='Collect now'}};load();setInterval(load,60000)
</script></body></html>`;
