/* Adeguamenti richiesti: sequenza automatica, FINE GIORNATA e link Maps sull'indirizzo */
const originalNormalizeSequence = normalizeSequence;
const originalOcrClick = ocrBtn.onclick;
const originalDemoClick = demoBtn.onclick;

parseAddress = function(raw = "") {
  let s = cleanLine(raw).replace(/\.\.\.$/, "").replace(/\s*,\s*/g, ", ");
  s = s.replace(/,?\s*Italia\b.*$/i, "").trim();
  let city = "";
  const zipCity = s.match(/\b\d{5}\s+([^,]+?)(?:\s+[A-Z]{2})?(?:,|$)/i);
  if (zipCity) {
    city = cleanLine(zipCity[1]).replace(/\s+[A-Z]{2}$/i, "");
    s = s.replace(/,?\s*\d{5}\s+[^,]+(?:\s+[A-Z]{2})?(?:,|$)/i, "").trim();
  }
  const parts = s.split(",").map(cleanLine).filter(Boolean);
  if (!city && parts.length >= 3) city = parts[2].replace(/\b\d{5}\b/g, "").replace(/\b[A-Z]{2}\b/g, "").trim();
  return { address: parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : s, city };
};

normalizeSequence = function() {
  originalNormalizeSequence();
  events = events.map(e => e.type === "ARRIVO" ? { ...e, type: "FINE GIORNATA" } : e);
  renderEvents();
};

function updatedEventRow(e, index) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><select data-k="type">${["PARTENZA", "PARCHEGGIO", "FINE GIORNATA"].map(t => `<option ${e.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></td>
    <td><input data-k="date" type="date" value="${e.date || $("reportDate").value}"></td>
    <td><input data-k="start" value="${e.start || ""}" placeholder="hh:mm"></td>
    <td><input data-k="end" value="${e.end || ""}" placeholder="hh:mm"></td>
    <td><input data-k="address" class="addr" value="${(e.address || "").replace(/"/g, "&quot;")}"></td>
    <td><input data-k="city" value="${(e.city || "").replace(/"/g, "&quot;")}"></td>
    <td><input data-k="duration" value="${e.duration || ""}" placeholder="hh:mm"></td>
    <td><a class="map-link" target="_blank" rel="noopener">Apri mappa</a></td>
    <td><button class="danger">×</button></td>`;
  const a = tr.querySelector("a");
  const updateMapLink = () => { a.href = mapsUrl(e.address, e.city); a.title = [e.address, e.city].filter(Boolean).join(", "); };
  tr.querySelectorAll("input,select").forEach(el => el.addEventListener("input", () => { e[el.dataset.k] = el.value; updateMapLink(); }));
  updateMapLink();
  tr.querySelector("button").onclick = () => { events.splice(index, 1); renderEvents(); };
  return tr;
}
eventRow = updatedEventRow;

computeSummary = function() {
  const start = events.find(e => e.type === "PARTENZA");
  const end = [...events].reverse().find(e => e.type === "FINE GIORNATA");
  const stops = events.filter(e => e.type === "PARCHEGGIO");
  return { start, end, stops, outside: (start && end) ? fmtDuration(diffMinutes(start.start, end.start)) : "" };
};

ocrBtn.onclick = async () => {
  await originalOcrClick();
  if (events.some(e => e.type === "MOVIMENTO")) normalizeSequence();
  if (events.length) ocrStatus.textContent = `Lettura completata. Ho predisposto automaticamente partenza, ${events.filter(e => e.type === "PARCHEGGIO").length} soste e fine giornata. Verifica indirizzi e comuni prima di generare il PDF.`;
};

demoBtn.onclick = () => {
  originalDemoClick();
  events = events.map(e => e.type === "ARRIVO" ? { ...e, type: "FINE GIORNATA" } : e);
  renderEvents();
};

$("pdfBtn").onclick = () => {
  if (!events.length) { alert("Inserisci almeno un evento."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const title = $("reportTitle").value || "Resoconto GPS";
  const date = $("reportDate").value;
  const s = computeSummary();
  let y = 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(title, 14, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(`Data analizzata: ${pdfDate(date)}`, 14, y); y += 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("RIEPILOGO DELLA GIORNATA", 14, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const startText = s.start ? `${pdfDate(s.start.date)} ore ${s.start.start}` : "-";
  const endText = s.end ? `${pdfDate(s.end.date)} ore ${s.end.start}` : "-";
  [["Partenza", startText], ["Fine giornata", endText], ["Tempo trascorso fuori", s.outside || "-"], ["Soste intermedie", String(s.stops.length)], ["Distanza visualizzata dall'app", $("appDistance").value || "-"], ["Tempo di guida visualizzato dall'app", $("appDriveTime").value || "-"]].forEach(([a, b]) => { doc.text(`${a}: ${b}`, 14, y); y += 5; });
  y += 4; doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("DETTAGLIO CRONOLOGICO", 14, y); y += 3;
  const rows = events.map(e => [e.type, pdfDate(e.date), e.start || "-", e.end || "-", e.address || "-", e.city || "-", e.duration || "-"]);
  doc.autoTable({
    startY: y,
    head: [["TIPO EVENTO", "Data", "Ora inizio", "Ora fine", "Indirizzo", "Comune", "Durata"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [220, 230, 243], textColor: [20, 45, 80] },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 18 }, 2: { cellWidth: 15 }, 3: { cellWidth: 15 }, 4: { cellWidth: 65, textColor: [20, 90, 180] }, 5: { cellWidth: 28 }, 6: { cellWidth: 16 } },
    didDrawCell: data => {
      if (data.section === "body" && data.column.index === 4) {
        const e = events[data.row.index];
        if (e && e.address) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: mapsUrl(e.address, e.city) });
      }
    }
  });
  doc.save(title.replace(/[^\w\-]+/g, "_") + "_" + (date || todayISO()) + ".pdf");
};