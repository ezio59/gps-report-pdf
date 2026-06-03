/* Lettura più robusta degli screenshot GPS reali: usa la posizione verticale delle parole */
(function(){
  const oldRender = renderEvents;

  function normalizeTime(s="") {
    const m = s.match(/\b(\d{1,2})[:.](\d{2})\b/);
    return m ? `${m[1].padStart(2,"0")}:${m[2]}` : "";
  }

  function getMunicipalityFallback() {
    const title = $("reportTitle").value || "";
    const m = title.match(/-\s*(.+)$/);
    return m ? m[1].trim() : "";
  }

  function parseFullAddress(text="") {
    let s = cleanLine(text)
      .replace(/\.\.\.$/, "")
      .replace(/,?\s*Lombardia\b.*$/i, "")
      .replace(/,?\s*Italy\b.*$/i, "")
      .replace(/,?\s*Italia\b.*$/i, "")
      .trim();

    const via = s.match(/\b(?:Via|Viale|Piazza|Corso|Strada|Localit[aà]|Largo|Vicolo|Contrada)\b.*$/i);
    if (via) s = via[0];

    let city = "";
    const zipCity = s.match(/\b\d{5}\s+([^,]+?)(?:\s+[A-Z]{2})?(?:,|$)/i);
    if (zipCity) city = cleanLine(zipCity[1]).replace(/\s+[A-Z]{2}$/i, "");

    const fallback = getMunicipalityFallback();
    if (!city || /\.{2,}$/.test(city) || city.length < 3) city = fallback;

    const parts = s.split(",").map(cleanLine).filter(Boolean);
    const address = parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : s;
    return { address, city };
  }

  function groupWords(words=[]) {
    const rows=[];
    words
      .filter(w => w && w.text && w.bbox)
      .sort((a,b) => ((a.bbox.y0+a.bbox.y1)/2)-((b.bbox.y0+b.bbox.y1)/2) || a.bbox.x0-b.bbox.x0)
      .forEach(w => {
        const cy=(w.bbox.y0+w.bbox.y1)/2;
        let row=rows.find(r => Math.abs(r.cy-cy) < 22);
        if(!row){ row={cy,words:[]}; rows.push(row); }
        row.words.push(w);
        row.cy=(row.cy*(row.words.length-1)+cy)/row.words.length;
      });
    return rows
      .sort((a,b)=>a.cy-b.cy)
      .map(r=>({y:r.cy,text:cleanLine(r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>w.text).join(" "))}));
  }

  function rowDuration(text="") {
    const h=text.match(/(\d+)\s*(?:ora|ore|h)\b/i);
    const m=text.match(/(\d+)\s*(?:min|m)\b/i);
    return (h?Number(h[1])*60:0)+(m?Number(m[1]):0);
  }

  function isMovement(text="") {
    return /\b\d+(?:[.,]\d+)?\s*km\b/i.test(text) || /\bkm\/h\b/i.test(text) || /\bmax\b/i.test(text);
  }

  function hasAddress(text="") {
    return /\b(?:Via|Viale|Piazza|Corso|Strada|Localit[aà]|Largo|Vicolo|Contrada)\b/i.test(text);
  }

  function findNearbyMeta(rows,index) {
    const candidates=[rows[index],rows[index-1],rows[index-2]].filter(Boolean);
    const joined=candidates.map(r=>r.text).join(" ");
    return {time:normalizeTime(joined),minutes:rowDuration(joined)};
  }

  function extractStructuredRows(words=[]) {
    const rows=groupWords(words);
    const result=[];
    rows.forEach((row,index)=>{
      const text=row.text;
      if(isMovement(text)) {
        const time=normalizeTime(text);
        if(time) result.push({kind:"move",y:row.y,time,minutes:rowDuration(text)});
      }
      if(hasAddress(text)) {
        const meta=findNearbyMeta(rows,index);
        const p=parseFullAddress(text);
        result.push({kind:"stop",y:row.y,time:meta.time,minutes:meta.minutes,address:p.address,city:p.city});
      }
    });
    return result.sort((a,b)=>a.y-b.y);
  }

  function buildDisplay(rows=[]) {
    const moves=rows.filter(r=>r.kind==="move");
    const stops=rows.filter(r=>r.kind==="stop");
    if(!moves.length || !stops.length) return [];

    const firstMove=moves[0], lastMove=moves[moves.length-1];
    const origin=[...stops].filter(s=>s.y<firstMove.y).pop() || stops[0];
    const destination=stops.find(s=>s.y>lastMove.y) || stops[stops.length-1];
    const middle=stops.filter(s=>s!==origin && s!==destination && s.y>firstMove.y && s.y<destination.y);

    return [
      {type:"PARTENZA",date:$("reportDate").value,start:firstMove.time,end:"",address:origin.address,city:origin.city,duration:""},
      ...middle.map(s=>({type:"PARCHEGGIO",date:$("reportDate").value,start:s.time,end:s.time?addMinutes(s.time,s.minutes):"",address:s.address,city:s.city,duration:s.minutes?fmtDuration(s.minutes):""})),
      {type:"FINE GIORNATA",date:$("reportDate").value,start:destination.time || addMinutes(lastMove.time,lastMove.minutes),end:"",address:destination.address,city:destination.city,duration:""}
    ];
  }

  ocrBtn.onclick = async () => {
    if(!images.length) return;
    ocrStatus.classList.remove("hidden");
    let allWords=[];
    try {
      for(let i=0;i<images.length;i++) {
        ocrStatus.textContent=`Lettura screenshot ${i+1} di ${images.length}...`;
        const result=await Tesseract.recognize(images[i].file,"ita",{
          logger:m=>{ if(m.status==="recognizing text") ocrStatus.textContent=`Lettura screenshot ${i+1} di ${images.length}: ${Math.round((m.progress||0)*100)}%`; }
        });
        if(result.data.words) allWords.push(...result.data.words);
      }
      const structured=extractStructuredRows(allWords);
      const built=buildDisplay(structured);
      if(built.length) {
        events=built;
        renderEvents();
        ocrStatus.textContent=`Lettura completata: partenza, ${events.filter(e=>e.type==="PARCHEGGIO").length} soste e fine giornata compilate automaticamente. Verifica indirizzi e comuni prima di generare il PDF.`;
      } else {
        ocrStatus.textContent="Non ho ricostruito correttamente tutte le righe. Puoi correggerle manualmente oppure inviarmi uno screenshot per affinare ulteriormente il lettore.";
      }
    } catch(err) {
      console.error(err);
      ocrStatus.textContent="Errore durante la lettura automatica. Puoi comunque inserire i dati manualmente.";
    }
  };

  renderEvents = function(){ oldRender(); };
})();
