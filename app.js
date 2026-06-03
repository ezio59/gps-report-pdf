const $ = (id) => document.getElementById(id);
const fileInput = $("fileInput");
const imageList = $("imageList");
const ocrBtn = $("ocrBtn");
const demoBtn = $("demoBtn");
const clearBtn = $("clearBtn");
const ocrStatus = $("ocrStatus");
const body = $("eventsBody");
let images = [];
let events = [];

const todayISO = () => new Date().toISOString().slice(0,10);
$("reportDate").value = todayISO();

function uid(){ return Math.random().toString(36).slice(2,10); }
function pad(n){ return String(n).padStart(2,"0"); }
function parseDurationToMinutes(s=""){
  const t=s.toLowerCase().trim();
  let mins=0;
  const h=t.match(/(\d+)\s*(?:ora|ore|h)/);
  const m=t.match(/(\d+)\s*(?:min|m)\b/);
  const clock=t.match(/^(\d{1,2}):(\d{2})$/);
  if(clock) return Number(clock[1])*60+Number(clock[2]);
  if(h) mins += Number(h[1])*60;
  if(m) mins += Number(m[1]);
  return mins;
}
function fmtDuration(mins){
  mins=Math.max(0, Number(mins)||0);
  return `${pad(Math.floor(mins/60))}:${pad(mins%60)}`;
}
function addMinutes(time, mins){
  if(!time || !/^\d{1,2}:\d{2}$/.test(time)) return "";
  const [h,m]=time.split(":").map(Number);
  const total=h*60+m+Number(mins||0);
  return `${pad(Math.floor((total%(24*60))/60))}:${pad(total%60)}`;
}
function diffMinutes(start,end){
  if(!start || !end) return 0;
  const [h1,m1]=start.split(":").map(Number), [h2,m2]=end.split(":").map(Number);
  let d=h2*60+m2-(h1*60+m1);
  return d<0 ? d+24*60 : d;
}
function mapsUrl(address, city){
  return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([address,city].filter(Boolean).join(", "));
}

fileInput.addEventListener("change", () => {
  for(const f of fileInput.files){
    images.push({id:uid(), file:f, url:URL.createObjectURL(f)});
  }
  fileInput.value="";
  renderImages();
});
function renderImages(){
  imageList.innerHTML="";
  images.forEach((im,idx)=>{
    const card=document.createElement("div");
    card.className="image-card";
    card.innerHTML=`<img src="${im.url}" alt=""><small>${idx+1}. ${im.file.name}</small>
      <div class="mini-actions">
        <button class="secondary" data-a="up">↑</button>
        <button class="secondary" data-a="down">↓</button>
        <button class="danger" data-a="del">Elimina</button>
      </div>`;
    card.querySelector('[data-a="up"]').onclick=()=>{ if(idx){ [images[idx-1],images[idx]]=[images[idx],images[idx-1]]; renderImages(); }};
    card.querySelector('[data-a="down"]').onclick=()=>{ if(idx<images.length-1){ [images[idx+1],images[idx]]=[images[idx],images[idx+1]]; renderImages(); }};
    card.querySelector('[data-a="del"]').onclick=()=>{ URL.revokeObjectURL(im.url); images.splice(idx,1); renderImages(); };
    imageList.appendChild(card);
  });
  ocrBtn.disabled=!images.length;
}

function cleanLine(s){ return s.replace(/\s+/g," ").trim(); }
function extractTopMetrics(text){
  const line=cleanLine(text.replace(/\n/g," "));
  const dist=line.match(/(\d+(?:[.,]\d+)?)\s*km\b/i);
  if(dist && !$("appDistance").value) $("appDistance").value=dist[1].replace(",", ".")+" km";
  const drive=line.match(/(\d+)\s*ora(?:\s*(\d+)\s*min)?/i);
  if(drive && !$("appDriveTime").value) $("appDriveTime").value=drive[1]+" ora"+(drive[2]?" "+drive[2]+" min":"");
}
function parseAddress(s){
  s=cleanLine(s).replace(/\.\.\.$/,"");
  const parts=s.split(",").map(x=>x.trim()).filter(Boolean);
  let city="";
  let address=s;
  if(parts.length>=3){
    address=parts.slice(0,2).join(", ");
    const c=parts[2].replace(/\b\d{5}\b/g,"").replace(/\b[A-Z]{2}\b/g,"").trim();
    city=c.split(/\s+/).slice(0,3).join(" ");
  }
  return {address,city};
}
function detectEventsFromText(text){
  const lines=text.split(/\n/).map(cleanLine).filter(Boolean);
  const out=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const timeMatch=line.match(/^(\d{1,2}:\d{2})\b/);
    if(!timeMatch) continue;
    const start=timeMatch[1];
    const joined=[line,lines[i+1]||"",lines[i+2]||""].join(" ");
    const isDrive=/km\/h|max|km\b/i.test(joined);
    const durMatch=joined.match(/(\d+)\s*(ora|ore|h|min|m)\b(?:\s*(\d+)\s*min)?/i);
    let durationMin=0;
    if(durMatch){
      if(/ora|ore|h/i.test(durMatch[2])) durationMin=Number(durMatch[1])*60+Number(durMatch[3]||0);
      else durationMin=Number(durMatch[1]);
    }
    if(isDrive){
      const km=joined.match(/(\d+(?:[.,]\d+)?)\s*km\b/i);
      out.push({type:"MOVIMENTO", date:$("reportDate").value, start, end:addMinutes(start,durationMin), address:"", city:"", duration:fmtDuration(durationMin), km:km?km[1].replace(",", "."):""});
    } else {
      let addrLine="";
      for(let j=i+1;j<=i+3 && j<lines.length;j++){
        if(/^via\b|^viale\b|^piazza\b|^corso\b|^strada\b|^localit[aà]\b/i.test(lines[j])) { addrLine=lines[j]; break; }
      }
      const p=parseAddress(addrLine);
      out.push({type:"PARCHEGGIO", date:$("reportDate").value, start, end:addMinutes(start,durationMin), address:p.address, city:p.city, duration:fmtDuration(durationMin)});
    }
  }
  return dedupeEvents(out);
}
function dedupeEvents(arr){
  const seen=new Set(), out=[];
  for(const e of arr){
    const k=[e.type,e.start,e.end,e.address].join("|");
    if(!seen.has(k)){ seen.add(k); out.push(e); }
  }
  return out.sort((a,b)=>(a.start||"").localeCompare(b.start||""));
}
function normalizeSequence(){
  const rows=events.filter(e=>e.type!=="PARTENZA" && e.type!=="ARRIVO");
  const drives=rows.filter(e=>e.type==="MOVIMENTO");
  const stops=rows.filter(e=>e.type==="PARCHEGGIO");
  if(!drives.length) { renderEvents(); return; }
  const firstDrive=drives[0], lastDrive=drives[drives.length-1];
  const preceding=stops.filter(s=>(s.start||"") < (firstDrive.start||"")).slice(-1)[0];
  const following=stops.find(s=>(s.start||"") >= (lastDrive.end||lastDrive.start||"")) || stops.slice(-1)[0];
  const result=[];
  result.push({type:"PARTENZA",date:firstDrive.date || $("reportDate").value,start:firstDrive.start,end:"",address:preceding?.address || "",city:preceding?.city || "",duration:""});
  for(const s of stops){ if(s!==preceding && s!==following) result.push({...s,type:"PARCHEGGIO"}); }
  result.push({type:"ARRIVO",date:lastDrive.date || $("reportDate").value,start:lastDrive.end || addMinutes(lastDrive.start,parseDurationToMinutes(lastDrive.duration)),end:"",address:following?.address || "",city:following?.city || "",duration:""});
  events=result;
  renderEvents();
}
function eventRow(e,index){
  const tr=document.createElement("tr");
  tr.innerHTML=`
    <td><select data-k="type">${["PARTENZA","PARCHEGGIO","ARRIVO","MOVIMENTO"].map(t=>`<option ${e.type===t?"selected":""}>${t}</option>`).join("")}</select></td>
    <td><input data-k="date" type="date" value="${e.date||$("reportDate").value}"></td>
    <td><input data-k="start" value="${e.start||""}" placeholder="hh:mm"></td>
    <td><input data-k="end" value="${e.end||""}" placeholder="hh:mm"></td>
    <td><input data-k="address" class="addr" value="${(e.address||"").replace(/"/g,"&quot;")}"></td>
    <td><input data-k="city" value="${(e.city||"").replace(/"/g,"&quot;")}"></td>
    <td><input data-k="duration" value="${e.duration||""}" placeholder="hh:mm"></td>
    <td><a class="map-link" target="_blank" rel="noopener">Apri</a></td>
    <td><button class="danger">×</button></td>`;
  tr.querySelectorAll("input,select").forEach(el=>el.addEventListener("input",()=>{e[el.dataset.k]=el.value;updateMapLink();}));
  const a=tr.querySelector("a");
  const updateMapLink=()=>a.href=mapsUrl(e.address,e.city);
  updateMapLink();
  tr.querySelector("button").onclick=()=>{events.splice(index,1);renderEvents();};
  return tr;
}
function renderEvents(){ body.innerHTML=""; events.forEach((e,i)=>body.appendChild(eventRow(e,i))); }
$("addRowBtn").onclick=()=>{events.push({type:"PARCHEGGIO",date:$("reportDate").value,start:"",end:"",address:"",city:"",duration:""});renderEvents();};
$("normalizeBtn").onclick=normalizeSequence;
clearBtn.onclick=()=>{images.forEach(i=>URL.revokeObjectURL(i.url));images=[];events=[];renderImages();renderEvents();$("appDistance").value="";$("appDriveTime").value="";ocrStatus.classList.add("hidden");};
demoBtn.onclick=()=>{
  $("reportTitle").value="Resoconto GPS - Montichiari";
  $("reportDate").value="2026-06-03";
  $("appDistance").value="35 km";
  $("appDriveTime").value="1 ora";
  events=[
    {type:"PARTENZA",date:"2026-06-03",start:"09:13",end:"",address:"Via Dugali Sera, 12 - Sant'Antonio",city:"Montichiari",duration:""},
    {type:"PARCHEGGIO",date:"2026-06-03",start:"09:39",end:"09:45",address:"Via Brescia, 40",city:"Leno",duration:"00:06"},
    {type:"PARCHEGGIO",date:"2026-06-03",start:"09:47",end:"10:48",address:"Via Martin Luther King, 13",city:"Leno",duration:"01:01"},
    {type:"PARCHEGGIO",date:"2026-06-03",start:"11:11",end:"11:42",address:"Via Trieste, 169a",city:"Montichiari",duration:"00:31"},
    {type:"ARRIVO",date:"2026-06-03",start:"11:52",end:"",address:"Via Dugali Sera, 22b - Sant'Antonio",city:"Montichiari",duration:""}
  ];
  renderEvents();
};
ocrBtn.onclick=async()=>{
  if(!images.length) return;
  ocrStatus.classList.remove("hidden");
  ocrStatus.textContent="Avvio del riconoscimento...";
  let allText="";
  try{
    for(let i=0;i<images.length;i++){
      ocrStatus.textContent=`Lettura screenshot ${i+1} di ${images.length}...`;
      const result=await Tesseract.recognize(images[i].file,"ita",{logger:m=>{if(m.status==="recognizing text") ocrStatus.textContent=`Lettura screenshot ${i+1} di ${images.length}: ${Math.round((m.progress||0)*100)}%`;}});
      allText+="\n"+result.data.text;
    }
    extractTopMetrics(allText);
    const parsed=detectEventsFromText(allText);
    if(parsed.length){events=parsed;renderEvents();ocrStatus.textContent=`Lettura completata. Ho trovato ${parsed.length} righe. Controlla i dati e premi “Ricalcola partenza e arrivo”.`;}
    else ocrStatus.textContent="Non ho riconosciuto eventi con sufficiente precisione. Inserisci o correggi manualmente le righe.";
  }catch(err){console.error(err);ocrStatus.textContent="Errore durante la lettura automatica. Puoi comunque inserire i dati manualmente.";}
};
function eventLabel(t){ return t; }
function pdfDate(s){ if(!s) return ""; const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; }
function computeSummary(){
  const start=events.find(e=>e.type==="PARTENZA");
  const end=[...events].reverse().find(e=>e.type==="ARRIVO");
  const stops=events.filter(e=>e.type==="PARCHEGGIO");
  return {start,end,stops,outside:(start&&end)?fmtDuration(diffMinutes(start.start,end.start)):""};
}
$("pdfBtn").onclick=()=>{
  if(!events.length){alert("Inserisci almeno un evento.");return;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const title=$("reportTitle").value || "Resoconto GPS";
  const date=$("reportDate").value;
  const s=computeSummary();
  let y=16;
  doc.setFont("helvetica","bold");doc.setFontSize(16);doc.text(title,14,y);y+=8;
  doc.setFont("helvetica","normal");doc.setFontSize(10);doc.text(`Data analizzata: ${pdfDate(date)}`,14,y);y+=9;
  doc.setFont("helvetica","bold");doc.setFontSize(11);doc.text("RIEPILOGO DELLA SERATA",14,y);y+=6;
  doc.setFont("helvetica","normal");doc.setFontSize(10);
  const startText=s.start?`${pdfDate(s.start.date)} ore ${s.start.start}`:"-";
  const endText=s.end?`${pdfDate(s.end.date)} ore ${s.end.start}`:"-";
  [["Partenza",startText],["Arrivo",endText],["Tempo trascorso fuori",s.outside||"-"],["Soste intermedie",String(s.stops.length)],["Distanza visualizzata dall'app",$("appDistance").value||"-"],["Tempo di guida visualizzato dall'app",$("appDriveTime").value||"-"]].forEach(([a,b])=>{doc.text(`${a}: ${b}`,14,y);y+=5;});
  y+=4;doc.setFont("helvetica","bold");doc.setFontSize(11);doc.text("DETTAGLIO CRONOLOGICO",14,y);y+=3;
  const printable=events.filter(e=>e.type!=="MOVIMENTO");
  const tableRows=printable.map(e=>[eventLabel(e.type),pdfDate(e.date),e.start||"-",e.end||"-",e.address||"-",e.city||"-",e.duration||"-","Google Maps"]);
  doc.autoTable({startY:y,head:[["TIPO EVENTO","Data","Ora inizio","Ora fine","Indirizzo","Comune","Durata","Mappa"]],body:tableRows,theme:"grid",styles:{fontSize:7.5,cellPadding:1.5,overflow:"linebreak"},headStyles:{fillColor:[220,230,243],textColor:[20,45,80]},columnStyles:{0:{cellWidth:24},1:{cellWidth:18},2:{cellWidth:15},3:{cellWidth:15},4:{cellWidth:49},5:{cellWidth:24},6:{cellWidth:15},7:{cellWidth:18}},didDrawCell:(data)=>{if(data.section==="body"&&data.column.index===7){const e=printable[data.row.index];if(e&&e.address) doc.link(data.cell.x,data.cell.y,data.cell.width,data.cell.height,{url:mapsUrl(e.address,e.city)});}}});
  doc.save(title.replace(/[^\w\-]+/g,"_")+"_"+(date||todayISO())+".pdf");
};
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js").catch(()=>{}));}
renderEvents();
