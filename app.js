// ── Constants ─────────────────────────────────────────────────────────────────
const CHAIR_GAP = 5;
const GROUP_COLORS = {
  family: { bg: '#EAF3DE', text: '#27500A', label: 'Rodzina' },
  friend: { bg: '#EEEDFE', text: '#26215C', label: 'Przyjaciel' },
  work:   { bg: '#FAEEDA', text: '#412402', label: 'Praca' },
  other:  { bg: '#F1EFE8', text: '#2C2C2A', label: 'Inne' },
};
const TABLE_COLORS = ['#5DCAA5','#7F77DD','#F0997B','#EF9F27','#85B7EB','#ED93B1','#D3D1C7'];

// ── State ──────────────────────────────────────────────────────────────────────
let zoom = 0.6;
let tables = [];
let guests = [];
let selected = null;
let nextTId = 1;
let nextGId = 1;
let newColor = '#5DCAA5';
let dragging = false, dragOffX = 0, dragOffY = 0;
let rotating = false, rotStartAngle = 0, rotStartRot = 0;
let dragSeatFrom = null;
let roomW = 1200, roomH = 800;
let pendingImport = null;
let selectedType = 'circle_180';
let pickerTableIdx = null, pickerSeatIdx = null;
let editingGuestId = null;

// ── Canvas setup ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('floorCanvas');
const ctx = canvas.getContext('2d');

// ── Tab switching ──────────────────────────────────────────────────────────────
function switchTab(name) {
  ['sala', 'stolY', 'goscie', 'import'].forEach((t, i) => {
    document.querySelectorAll('.tab')[i].classList.toggle('active', t === name);
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
  });
}

// ── Table type selection ───────────────────────────────────────────────────────
function pickType(el) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  selectedType = el.dataset.type;
  document.getElementById('customDims').style.display = selectedType === 'custom' ? 'flex' : 'none';
  if (selectedType === 'circle_180')  document.getElementById('newSeats').value = 10;
  if (selectedType === 'rect_180x90') document.getElementById('newSeats').value = 8;
  if (selectedType === 'rect_160x90') document.getElementById('newSeats').value = 2;
}

function toggleCustomShape() {
  const isCircle = document.getElementById('customShape').value === 'circle';
  document.getElementById('rowDiam').style.display = isCircle ? 'flex' : 'none';
  document.getElementById('rowW').style.display    = isCircle ? 'none' : 'flex';
  document.getElementById('rowDep').style.display  = isCircle ? 'none' : 'flex';
}

function getTypeParams() {
  if (selectedType === 'circle_180')  return { shape: 'circle', wCm: 180, hCm: 180 };
  if (selectedType === 'rect_180x90') return { shape: 'rect',   wCm: 180, hCm: 90  };
  if (selectedType === 'rect_160x90') return { shape: 'rect',   wCm: 160, hCm: 90  };
  const sh = document.getElementById('customShape').value;
  if (sh === 'circle') { const d = +document.getElementById('customD').value; return { shape: 'circle', wCm: d, hCm: d }; }
  return { shape: 'rect', wCm: +document.getElementById('customW').value, hCm: +document.getElementById('customDepth').value };
}

// ── Room ───────────────────────────────────────────────────────────────────────
function getRoomPx() { return { w: roomW * zoom, h: roomH * zoom }; }

function resizeCanvas() {
  const { w, h } = getRoomPx();
  canvas.width  = Math.max(w + 40, 200);
  canvas.height = Math.max(h + 40, 200);
  draw();
}

function setZoom(v) {
  zoom = v / 100;
  document.getElementById('zoomVal').textContent = v + '%';
  resizeCanvas();
}

function applyPreset() {
  const v = document.getElementById('roomPreset').value;
  if (!v) return;
  const [w, h] = v.split('x').map(Number);
  document.getElementById('roomW').value = w;
  document.getElementById('roomH').value = h;
  roomW = w; roomH = h;
  updateRoomLabel(); resizeCanvas();
}

function updateRoomLabel() {
  document.getElementById('roomDimLabel').textContent = roomW + '×' + roomH + ' cm';
}

document.getElementById('roomW').addEventListener('change', e => { roomW = +e.target.value; updateRoomLabel(); resizeCanvas(); });
document.getElementById('roomH').addEventListener('change', e => { roomH = +e.target.value; updateRoomLabel(); resizeCanvas(); });

// ── Color pickers ──────────────────────────────────────────────────────────────
function pickNewColor(el) {
  document.querySelectorAll('#newColorSwatches .swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  newColor = el.dataset.color;
}

function pickPropColor(el) {
  document.querySelectorAll('#propColorSwatches .swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  if (selected !== null) { tables[selected].color = el.dataset.color; renderSidebar(); draw(); }
}

// ── Table CRUD ─────────────────────────────────────────────────────────────────
function addTable() {
  const p = getTypeParams();
  const name  = document.getElementById('newName').value.trim() || 'Stół ' + nextTId;
  const seats = Math.max(2, +document.getElementById('newSeats').value);
  tables.push({
    id: nextTId++, name, shape: p.shape, wCm: p.wCm, hCm: p.hCm,
    seats, color: newColor, angle: 0,
    x: roomW / 2 + (Math.random() - 0.5) * 300,
    y: roomH / 2 + (Math.random() - 0.5) * 200,
    seatGuests: Array(seats).fill(null),
  });
  renderSidebar(); draw(); updateStats();
}

function ensureSeatArray(t) {
  if (!t.seatGuests || t.seatGuests.length !== t.seats) {
    const old = t.seatGuests || [];
    t.seatGuests = Array(t.seats).fill(null).map((_, i) => old[i] || null);
  }
}

function getSeatedAtTable(tid) {
  const t = tables.find(x => x.id === tid);
  if (!t) return 0;
  ensureSeatArray(t);
  return t.seatGuests.filter(Boolean).length;
}

function deleteSelected() {
  if (selected === null) return;
  const t = tables[selected];
  ensureSeatArray(t);
  t.seatGuests.forEach(gid => { if (gid) { const g = guests.find(x => x.id === gid); if (g) g.tableId = null; } });
  guests.forEach(g => { if (g.tableId === t.id) g.tableId = null; });
  tables.splice(selected, 1);
  selected = null;
  document.getElementById('propsPanel').style.display = 'none';
  renderSidebar(); renderGuestList(); draw(); updateStats();
}

function clearTables() {
  tables = []; selected = null;
  guests.forEach(g => g.tableId = null);
  document.getElementById('propsPanel').style.display = 'none';
  renderSidebar(); renderGuestList(); draw(); updateStats();
}

function autoArrange() {
  const cols = Math.ceil(Math.sqrt(tables.length * 1.4));
  const sX = roomW / (cols + 1), sY = roomH / (Math.ceil(tables.length / cols) + 1);
  tables.forEach((t, i) => { t.x = sX * (i % cols + 1); t.y = sY * (Math.floor(i / cols) + 1); });
  draw();
}

function rotateSelected(deg, reset = false) {
  if (selected === null) return;
  const t = tables[selected];
  t.angle = reset ? 0 : ((t.angle || 0) + deg + 360) % 360;
  document.getElementById('rotLabel').textContent = Math.round(t.angle) + '°';
  renderSidebar(); draw();
}

// ── Guest CRUD ─────────────────────────────────────────────────────────────────
function addGuestManual() {
  const name = document.getElementById('manualName').value.trim();
  if (!name) return;
  guests.push({ id: nextGId++, name, group: document.getElementById('manualGroup').value, tableId: null, chairColor: null });
  document.getElementById('manualName').value = '';
  renderGuestList(); updateStats();
}

function clearGuests() {
  guests = [];
  tables.forEach(t => { t.seatGuests = Array(t.seats).fill(null); });
  renderGuestList(); draw(); updateStats();
}

function cycleGroup(gid) {
  const g = guests.find(x => x.id === gid);
  if (!g) return;
  const order = ['family', 'friend', 'work', 'other'];
  g.group = order[(order.indexOf(g.group) + 1) % order.length];
  renderGuestList(); draw();
}

function startEditGuest(gid) {
  editingGuestId = gid;
  renderGuestList();
  setTimeout(() => { const el = document.getElementById('gedit-' + gid); if (el) { el.focus(); el.select(); } }, 50);
}

function cancelEdit() { editingGuestId = null; renderGuestList(); }

function saveGuestEdit(gid) {
  const g = guests.find(x => x.id === gid);
  if (!g) return;
  const el = document.getElementById('gedit-' + gid);
  if (el && el.value.trim()) g.name = el.value.trim();
  editingGuestId = null;
  renderGuestList(); renderSidebar(); draw(); updateStats();
}

function removeGuest(gid) {
  const g = guests.find(x => x.id === gid);
  if (g && g.tableId != null) {
    const t = tables.find(x => x.id === g.tableId);
    if (t) { ensureSeatArray(t); const si = t.seatGuests.indexOf(gid); if (si >= 0) t.seatGuests[si] = null; }
  }
  guests = guests.filter(x => x.id !== gid);
  renderGuestList(); renderSidebar(); draw(); updateStats();
}

// ── Seat assignment ────────────────────────────────────────────────────────────
function unassignSeat(seatIdx) {
  if (selected === null) return;
  const t = tables[selected]; ensureSeatArray(t);
  const gid = t.seatGuests[seatIdx];
  if (gid) { const g = guests.find(x => x.id === gid); if (g) g.tableId = null; }
  t.seatGuests[seatIdx] = null;
  renderSeatPanel(); renderSidebar(); renderGuestList(); draw(); updateStats();
}

function openGuestPicker(seatIdx) {
  pickerTableIdx = selected; pickerSeatIdx = seatIdx;
  document.getElementById('pickerSearch').value = '';
  document.getElementById('pickerSeatLabel').textContent = '#' + (seatIdx + 1);
  renderPicker();
  const overlay = document.getElementById('guestPickerOverlay');
  overlay.style.display = 'block';
  const pp = document.getElementById('propsPanel').getBoundingClientRect();
  overlay.style.bottom = (window.innerHeight - pp.top + 4) + 'px';
  overlay.style.left = '290px';
  setTimeout(() => document.getElementById('pickerSearch').focus(), 50);
}

function renderPicker() {
  const q = (document.getElementById('pickerSearch').value || '').toLowerCase();
  const avail = guests.filter(g => !g.tableId && (!q || g.name.toLowerCase().includes(q)));
  const list = document.getElementById('pickerList');
  if (!avail.length) { list.innerHTML = '<div style="font-size:12px;color:#888;padding:4px">Brak dostępnych gości</div>'; return; }
  list.innerHTML = avail.map(g => {
    const gc = GROUP_COLORS[g.group] || GROUP_COLORS.other;
    return `<div class="picker-item" onclick="assignGuestToSeat(${g.id})">
      <span class="gtag" style="background:${gc.bg};color:${gc.text}">${gc.label}</span>
      <span>${g.name}</span>
    </div>`;
  }).join('');
}

function assignGuestToSeat(gid) {
  if (pickerTableIdx === null || pickerSeatIdx === null) return;
  const t = tables[pickerTableIdx]; ensureSeatArray(t);
  const oldGid = t.seatGuests[pickerSeatIdx];
  if (oldGid) { const og = guests.find(x => x.id === oldGid); if (og) og.tableId = null; }
  const g = guests.find(x => x.id === gid);
  if (g) {
    if (g.tableId != null) {
      const ot = tables.find(x => x.id === g.tableId);
      if (ot) { ensureSeatArray(ot); const si = ot.seatGuests.indexOf(gid); if (si >= 0) ot.seatGuests[si] = null; }
    }
    g.tableId = t.id;
    t.seatGuests[pickerSeatIdx] = gid;
  }
  closeGuestPicker();
  renderSeatPanel(); renderSidebar(); renderGuestList(); draw(); updateStats();
}

function closeGuestPicker() {
  document.getElementById('guestPickerOverlay').style.display = 'none';
  pickerTableIdx = null; pickerSeatIdx = null;
}

// ── Stats & sidebar rendering ──────────────────────────────────────────────────
function updateStats() {
  document.getElementById('st1').textContent = tables.length;
  document.getElementById('st2').textContent = tables.reduce((a, t) => a + t.seats, 0);
  document.getElementById('st3').textContent = guests.length;
  const u = guests.filter(g => !g.tableId).length;
  document.getElementById('st4').textContent = u;
  const el = document.getElementById('st4b'); if (el) el.textContent = u;
  document.getElementById('guestCount').textContent = guests.length;
}

function renderSidebar() {
  document.getElementById('tableCount').textContent = tables.length;
  document.getElementById('tblList').innerHTML = tables.map((t, i) => `
    <div class="tbl-item${selected === i ? ' selected' : ''}" onclick="selectTable(${i})">
      <div class="tbl-dot" style="background:${t.color}"></div>
      <div class="tbl-info">
        <div class="tbl-name">${t.name}</div>
        <div class="tbl-sub">${t.shape === 'circle' ? 'ø' + t.wCm : t.wCm + '×' + t.hCm + 'cm'} · ${getSeatedAtTable(t.id)}/${t.seats} · ${Math.round(t.angle || 0)}°</div>
      </div>
    </div>`).join('');
}

function renderGuestList() {
  const panel = document.getElementById('guestListPanel');
  const q = (document.getElementById('guestSearch').value || '').toLowerCase();
  const list = q ? guests.filter(g => g.name.toLowerCase().includes(q)) : guests;
  if (!list.length) {
    panel.innerHTML = `<div style="font-size:12px;color:#888;padding:6px">${guests.length ? 'Brak wyników' : 'Brak gości.'}</div>`;
    return;
  }
  panel.innerHTML = list.map(g => {
    const gc = GROUP_COLORS[g.group] || GROUP_COLORS.other;
    const tbl = g.tableId != null ? tables.find(t => t.id === g.tableId) : null;
    const seatNum = tbl ? tbl.seatGuests.indexOf(g.id) + 1 : null;
    const isEditing = editingGuestId === g.id;
    if (isEditing) return `
      <div class="guest-row editing">
        <span class="gtag" style="background:${gc.bg};color:${gc.text}" onclick="cycleGroup(${g.id})">${gc.label}</span>
        <div class="inline-edit">
          <input type="text" value="${g.name}" id="gedit-${g.id}" onkeydown="if(event.key==='Enter')saveGuestEdit(${g.id})"/>
        </div>
        <button class="btn-sm btn" style="padding:3px 7px;font-size:11px" onclick="saveGuestEdit(${g.id})">✓</button>
        <button class="x-btn" onclick="cancelEdit()">×</button>
      </div>`;
    return `
      <div class="guest-row clickable${g.tableId ? ' assigned' : ''}">
        <span class="gtag" style="background:${gc.bg};color:${gc.text}" onclick="cycleGroup(${g.id})" title="Zmień grupę">${gc.label}</span>
        <span style="flex:1;font-size:12px">${g.name}</span>
        <span style="font-size:11px;color:#888">${tbl ? (tbl.name + (seatNum ? ' #' + seatNum : '')) : '—'}</span>
        <button class="x-btn" onclick="startEditGuest(${g.id})" title="Edytuj">✎</button>
        <button class="x-btn" onclick="removeGuest(${g.id})" title="Usuń">×</button>
      </div>`;
  }).join('');
}

function selectTable(i) {
  selected = i; renderSidebar();
  const t = tables[i]; ensureSeatArray(t);
  document.getElementById('propsPanel').style.display = 'flex';
  document.getElementById('propTitle').textContent = t.name;
  document.getElementById('propName').value  = t.name;
  document.getElementById('propSeats').value = t.seats;
  document.getElementById('rotLabel').textContent = Math.round(t.angle || 0) + '°';
  document.querySelectorAll('#propColorSwatches .swatch').forEach(s => s.classList.toggle('active', s.dataset.color === t.color));
  renderSeatPanel(); draw();
}

function renderSeatPanel() {
  if (selected === null) return;
  const t = tables[selected]; ensureSeatArray(t);
  document.getElementById('seatPanel').innerHTML = Array.from({ length: t.seats }, (_, i) => {
    const gid = t.seatGuests[i];
    const g   = gid ? guests.find(x => x.id === gid) : null;
    const gc  = g ? (GROUP_COLORS[g.group] || GROUP_COLORS.other) : null;
    if (g) {
      const colorVal = g.chairColor || gc.bg;
      return `
        <div class="seat-row occupied" draggable="true"
             ondragstart="seatDragStart(${i})"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="seatDrop(${i});this.classList.remove('drag-over')"
             ondragend="seatDragEnd()">
          <span class="drag-handle" title="Przeciągnij aby zmienić kolejność">⠿</span>
          <span class="seat-num">${i + 1}</span>
          <span class="gtag" style="background:${gc.bg};color:${gc.text}">${gc.label}</span>
          <span class="seat-name">${g.name}</span>
          <input type="color" class="chair-color-input" value="${colorVal}"
                 onchange="setChairColor(${g.id}, this.value)" title="Kolor krzesła">
          <button class="x-btn" onclick="unassignSeat(${i})">×</button>
        </div>`;
    }
    return `
      <div class="seat-row empty"
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="seatDrop(${i});this.classList.remove('drag-over')"
           onclick="openGuestPicker(${i})">
        <span class="seat-num">${i + 1}</span>
        <span class="seat-empty">wolne — kliknij aby przypisać</span>
        <span style="font-size:13px;color:#aaa">+</span>
      </div>`;
  }).join('');
}

function setChairColor(gid, color) {
  const g = guests.find(x => x.id === gid);
  if (!g) return;
  g.chairColor = color;
  draw();
}

function seatDragStart(idx) {
  dragSeatFrom = idx;
}

function seatDragOver(e) {
  e.preventDefault();
}

function seatDrop(idx) {
  if (dragSeatFrom === null || dragSeatFrom === idx || selected === null) return;
  const t = tables[selected]; ensureSeatArray(t);
  [t.seatGuests[dragSeatFrom], t.seatGuests[idx]] = [t.seatGuests[idx], t.seatGuests[dragSeatFrom]];
  dragSeatFrom = null;
  renderSeatPanel(); draw();
}

function seatDragEnd() {
  dragSeatFrom = null;
  document.querySelectorAll('.seat-row.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function updateProp() {
  if (selected === null) return;
  const t = tables[selected];
  const newName  = document.getElementById('propName').value;
  const newSeats = Math.max(2, +document.getElementById('propSeats').value);
  t.name = newName;
  if (newSeats !== t.seats) {
    ensureSeatArray(t);
    if (newSeats < t.seats) {
      for (let i = newSeats; i < t.seats; i++) { const gid = t.seatGuests[i]; if (gid) { const g = guests.find(x => x.id === gid); if (g) g.tableId = null; } }
      t.seatGuests = t.seatGuests.slice(0, newSeats);
    } else {
      while (t.seatGuests.length < newSeats) t.seatGuests.push(null);
    }
    t.seats = newSeats;
  }
  document.getElementById('propTitle').textContent = newName;
  renderSidebar(); renderGuestList(); renderSeatPanel(); draw(); updateStats();
}

// ── Canvas drawing ─────────────────────────────────────────────────────────────
function darken(hex) {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.round(r * 0.4); g = Math.round(g * 0.4); b = Math.round(b * 0.4);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x+r, y); c.lineTo(x+w-r, y); c.quadraticCurveTo(x+w, y, x+w, y+r);
  c.lineTo(x+w, y+h-r); c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  c.lineTo(x+r, y+h); c.quadraticCurveTo(x, y+h, x, y+h-r);
  c.lineTo(x, y+r); c.quadraticCurveTo(x, y, x+r, y);
  c.closePath();
}

function drawChair(cx, cy, r, g) {
  const gc = g ? (GROUP_COLORS[g.group] || GROUP_COLORS.other) : null;
  const bg = g ? (g.chairColor || gc.bg) : '#e8e6de';
  const bd = g ? darken(g.chairColor || gc.bg) : '#c0beb5';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = bd; ctx.lineWidth = 0.5; ctx.stroke();
  if (g && zoom > 0.45) {
    ctx.fillStyle = g.chairColor ? darken(g.chairColor) : gc.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const parts = g.name.trim().split(/\s+/);
    const line1 = parts[0];
    const line2 = parts.length > 1 ? parts.slice(1).join(' ') : null;
    const maxW = r * 1.7;
    let fs = Math.max(5, 7 * zoom);
    ctx.font = `${fs}px sans-serif`;
    const measure = () => line2
      ? Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width)
      : ctx.measureText(line1).width;
    while (fs > 4 && measure() > maxW) { fs -= 0.5; ctx.font = `${fs}px sans-serif`; }
    if (line2) {
      const lh = fs * 1.2;
      ctx.fillText(line1, cx, cy - lh * 0.5);
      ctx.fillText(line2, cx, cy + lh * 0.5);
    } else {
      ctx.fillText(line1, cx, cy);
    }
  } else {
    ctx.fillStyle = '#999'; ctx.font = `${Math.max(6, 7*zoom)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  }
}

function draw() {
  const { w, h } = getRoomPx();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ox = 20, oy = 20;

  // Room background & grid
  ctx.fillStyle = '#fafaf8'; ctx.strokeStyle = '#c0beb5'; ctx.lineWidth = 1.5;
  ctx.fillRect(ox, oy, w, h); ctx.strokeRect(ox, oy, w, h);
  ctx.setLineDash([4, 6]); ctx.strokeStyle = '#d8d6cc'; ctx.lineWidth = 0.5;
  for (let x = 100; x < roomW; x += 100) { ctx.beginPath(); ctx.moveTo(ox + x*zoom, oy); ctx.lineTo(ox + x*zoom, oy+h); ctx.stroke(); }
  for (let y = 100; y < roomH; y += 100) { ctx.beginPath(); ctx.moveTo(ox, oy + y*zoom); ctx.lineTo(ox+w, oy + y*zoom); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = '#aaa'; ctx.font = `${Math.max(8, 9*zoom)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(roomW + 'cm', ox + w/2, oy - 5);
  ctx.save(); ctx.translate(ox - 8, oy + h/2); ctx.rotate(-Math.PI/2); ctx.fillText(roomH + 'cm', 0, 0); ctx.restore();

  // Tables
  tables.forEach((t, i) => {
    ensureSeatArray(t);
    const px = ox + t.x * zoom, py = oy + t.y * zoom;
    const twPx = t.wCm * zoom, thPx = t.hCm * zoom;
    const ang = (t.angle || 0) * Math.PI / 180;
    const isSel = selected === i;
    const dk = darken(t.color);
    const chairR = Math.max(3, 22 * zoom);

    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);

    // Selection ring
    if (isSel) {
      ctx.strokeStyle = '#378ADD'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      if (t.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, twPx/2 + 9, 0, Math.PI*2); ctx.stroke(); }
      else { ctx.strokeRect(-twPx/2 - 9, -thPx/2 - 9, twPx + 18, thPx + 18); }
      ctx.setLineDash([]);
    }

    if (t.shape === 'circle') {
      const r = twPx / 2;
      for (let s = 0; s < t.seats; s++) {
        const a = (s / t.seats) * Math.PI * 2 - Math.PI / 2;
        const cx2 = (r + chairR + CHAIR_GAP * zoom) * Math.cos(a);
        const cy2 = (r + chairR + CHAIR_GAP * zoom) * Math.sin(a);
        const gid = t.seatGuests[s];
        const g   = gid ? guests.find(x => x.id === gid) : null;
        drawChair(cx2, cy2, chairR, g);
        if (!g || zoom <= 0.45) {
          ctx.fillStyle = '#999'; ctx.font = `${Math.max(6, 7*zoom)}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(s + 1, cx2, cy2);
        }
      }
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fillStyle = t.color; ctx.fill();
      ctx.strokeStyle = dk; ctx.lineWidth = 1; ctx.stroke();
    } else {
      const hw = twPx/2, hh = thPx/2;
      const st = Math.ceil(t.seats / 2), sb = Math.floor(t.seats / 2);
      const slotW = (twPx - CHAIR_GAP * zoom * 2) / (Math.max(st, sb) || 1);
      for (let s = 0; s < st; s++) {
        const fx = -hw + CHAIR_GAP * zoom + slotW * (s + 0.5);
        const fy = -hh - chairR - CHAIR_GAP * zoom;
        const gid = t.seatGuests[s];
        const g   = gid ? guests.find(x => x.id === gid) : null;
        drawChair(fx, fy, chairR, g);
        if (!g || zoom <= 0.45) { ctx.fillStyle = '#999'; ctx.font = `${Math.max(6,7*zoom)}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(s+1, fx, fy); }
      }
      for (let s = 0; s < sb; s++) {
        const fx = -hw + CHAIR_GAP * zoom + slotW * (s + 0.5);
        const fy = hh + chairR + CHAIR_GAP * zoom;
        const gid = t.seatGuests[st + s];
        const g   = gid ? guests.find(x => x.id === gid) : null;
        drawChair(fx, fy, chairR, g);
        if (!g || zoom <= 0.45) { ctx.fillStyle = '#999'; ctx.font = `${Math.max(6,7*zoom)}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(st+s+1, fx, fy); }
      }
      ctx.fillStyle = t.color; roundRect(ctx, -hw, -hh, twPx, thPx, 4 * zoom);
      ctx.fill(); ctx.strokeStyle = dk; ctx.lineWidth = 1; ctx.stroke();
    }

    // Label
    const fs = Math.max(9, Math.min(12, 10 * zoom));
    ctx.font = `500 ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = dk;
    ctx.fillText(t.name, 0, -fs * 0.3);
    ctx.font = `${Math.max(8, fs-1)}px sans-serif`;
    ctx.fillText(getSeatedAtTable(t.id) + '/' + t.seats, 0, fs * 0.8);

    // Rotation handle (selected only)
    if (isSel) {
      const r2 = t.shape === 'circle' ? twPx/2 : Math.sqrt((twPx/2)**2 + (thPx/2)**2);
      const hy2 = -(r2 + 18);
      ctx.strokeStyle = '#378ADD'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, t.shape === 'circle' ? -twPx/2 - 4 : -thPx/2 - 4); ctx.lineTo(0, hy2 + 8); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, hy2, 8, 0, Math.PI*2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#378ADD'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#378ADD'; ctx.font = `bold ${Math.max(9, 10*zoom)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↻', 0, hy2 + 1);
    }
    ctx.restore();
  });
}

// ── Hit testing ────────────────────────────────────────────────────────────────
function localPoint(t, mx, my) {
  const ox = 20, oy = 20, px = ox + t.x * zoom, py = oy + t.y * zoom;
  const ang = -(t.angle || 0) * Math.PI / 180;
  const dx = mx - px, dy = my - py;
  return { lx: dx * Math.cos(ang) - dy * Math.sin(ang), ly: dx * Math.sin(ang) + dy * Math.cos(ang) };
}

function getTableAt(mx, my) {
  for (let i = tables.length - 1; i >= 0; i--) {
    const t = tables[i], { lx, ly } = localPoint(t, mx, my);
    const tw = t.wCm * zoom, th = t.hCm * zoom;
    if (t.shape === 'circle') { if (lx*lx + ly*ly <= (tw/2)*(tw/2)) return i; }
    else if (lx >= -tw/2 && lx <= tw/2 && ly >= -th/2 && ly <= th/2) return i;
  }
  return -1;
}

function getRotHandleAt(mx, my) {
  if (selected === null) return false;
  const t = tables[selected];
  const ox = 20, oy = 20, px = ox + t.x * zoom, py = oy + t.y * zoom;
  const ang = (t.angle || 0) * Math.PI / 180;
  const hw = t.wCm * zoom / 2, hh = t.hCm * zoom / 2;
  const r  = t.shape === 'circle' ? hw : Math.sqrt(hw*hw + hh*hh);
  const hx = px + (r + 18) * Math.cos(ang - Math.PI / 2);
  const hy = py + (r + 18) * Math.sin(ang - Math.PI / 2);
  return Math.hypot(mx - hx, my - hy) < 10;
}

function getAngleFromCenter(t, mx, my) {
  const ox = 20, oy = 20, px = ox + t.x * zoom, py = oy + t.y * zoom;
  return Math.atan2(my - py, mx - px) * 180 / Math.PI;
}

// ── Mouse / touch events ───────────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (getRotHandleAt(mx, my)) {
    rotating = true;
    const t = tables[selected]; rotStartAngle = getAngleFromCenter(t, mx, my); rotStartRot = t.angle || 0;
    canvas.style.cursor = 'crosshair'; return;
  }
  const idx = getTableAt(mx, my);
  if (idx >= 0) {
    selected = idx; dragging = true;
    dragOffX = mx - (20 + tables[idx].x * zoom); dragOffY = my - (20 + tables[idx].y * zoom);
    selectTable(idx); canvas.style.cursor = 'grabbing';
  } else {
    if (selected !== null) { selected = null; document.getElementById('propsPanel').style.display = 'none'; renderSidebar(); renderGuestList(); draw(); }
    closeGuestPicker();
  }
});

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (rotating && selected !== null) {
    const t = tables[selected];
    let delta = getAngleFromCenter(t, mx, my) - rotStartAngle;
    if (e.shiftKey) delta = Math.round(delta / 15) * 15;
    t.angle = ((rotStartRot + delta) % 360 + 360) % 360;
    document.getElementById('rotLabel').textContent = Math.round(t.angle) + '°';
    renderSidebar(); draw(); return;
  }
  if (dragging && selected !== null) {
    tables[selected].x = Math.max(0, Math.min(roomW, (mx - dragOffX - 20) / zoom));
    tables[selected].y = Math.max(0, Math.min(roomH, (my - dragOffY - 20) / zoom));
    draw(); return;
  }
  if (getRotHandleAt(mx, my)) canvas.style.cursor = 'crosshair';
  else if (getTableAt(mx, my) >= 0) canvas.style.cursor = 'grab';
  else canvas.style.cursor = 'default';
});

canvas.addEventListener('mouseup',    () => { if (rotating) renderSidebar(); rotating = false; dragging = false; canvas.style.cursor = 'default'; });
canvas.addEventListener('mouseleave', () => { rotating = false; dragging = false; canvas.style.cursor = 'default'; });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t2 = e.touches[0], r = canvas.getBoundingClientRect(), mx = t2.clientX - r.left, my = t2.clientY - r.top;
  if (getRotHandleAt(mx, my) && selected !== null) {
    rotating = true; const t = tables[selected]; rotStartAngle = getAngleFromCenter(t, mx, my); rotStartRot = t.angle || 0; return;
  }
  const idx = getTableAt(mx, my);
  if (idx >= 0) { selected = idx; dragging = true; dragOffX = mx - (20 + tables[idx].x * zoom); dragOffY = my - (20 + tables[idx].y * zoom); selectTable(idx); }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t2 = e.touches[0], r = canvas.getBoundingClientRect(), mx = t2.clientX - r.left, my = t2.clientY - r.top;
  if (rotating && selected !== null) { const t = tables[selected]; t.angle = ((rotStartRot + (getAngleFromCenter(t, mx, my) - rotStartAngle)) % 360 + 360) % 360; draw(); return; }
  if (dragging && selected !== null) { tables[selected].x = Math.max(0, Math.min(roomW, (mx - dragOffX - 20) / zoom)); tables[selected].y = Math.max(0, Math.min(roomH, (my - dragOffY - 20) / zoom)); draw(); }
}, { passive: false });

canvas.addEventListener('touchend', () => { if (rotating) renderSidebar(); rotating = false; dragging = false; });

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeGuestPicker(); cancelEdit(); }
  if (selected !== null && !e.target.matches('input,select,textarea')) {
    if (e.key === 'ArrowLeft')  rotateSelected(-5);
    if (e.key === 'ArrowRight') rotateSelected(5);
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  }
});

// ── CSV import ─────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: 'Za krótki plik.' };
  const sep = lines[0].includes(';') ? ';' : ',';
  const hdr = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
  const cm = {};
  ['imie','imię','firstname','name'].forEach(k => { const i = hdr.indexOf(k); if (i >= 0 && cm.first === undefined) cm.first = i; });
  ['nazwisko','last_name','lastname','surname'].forEach(k => { const i = hdr.indexOf(k); if (i >= 0 && cm.last === undefined) cm.last = i; });
  ['imie_nazwisko','full_name','fullname'].forEach(k => { const i = hdr.indexOf(k); if (i >= 0 && cm.full === undefined) cm.full = i; });
  ['grupa','group','kategoria'].forEach(k => { const i = hdr.indexOf(k); if (i >= 0 && cm.group === undefined) cm.group = i; });
  ['stol','stół','table'].forEach(k => { const i = hdr.indexOf(k); if (i >= 0 && cm.table === undefined) cm.table = i; });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i].trim(); if (!ln) continue;
    const c = ln.split(sep).map(x => x.trim().replace(/^["']|["']$/g, ''));
    let name = '';
    if (cm.full !== undefined) name = c[cm.full] || '';
    else { const f = cm.first !== undefined ? c[cm.first] || '' : ''; const l = cm.last !== undefined ? c[cm.last] || '' : ''; name = (f + ' ' + l).trim(); }
    if (!name) continue;
    const rg = (cm.group !== undefined ? c[cm.group] || '' : '').toLowerCase();
    let group = 'other';
    if (['family','rodzina'].some(x => rg.includes(x)))   group = 'family';
    else if (['friend','przyjaciel','znajom'].some(x => rg.includes(x))) group = 'friend';
    else if (['work','praca'].some(x => rg.includes(x)))  group = 'work';
    rows.push({ name, group, tableName: cm.table !== undefined ? c[cm.table] || '' : '' });
  }
  return { rows, count: rows.length };
}

function handleFileSelect(e) {
  const f = e.target.files[0]; if (!f) return;
  const fr = new FileReader(); fr.onload = ev => processCSVText(ev.target.result, f.name); fr.readAsText(f, 'UTF-8');
}

const dz = document.getElementById('dropZone');
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', ()  => dz.classList.remove('dragover'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('dragover');
  const f = e.dataTransfer.files[0]; if (!f) return;
  const fr = new FileReader(); fr.onload = ev => processCSVText(ev.target.result, f.name); fr.readAsText(f, 'UTF-8');
});

function processCSVText(text, fname) {
  const res = parseCSV(text);
  const se = document.getElementById('csvStatus'), pb = document.getElementById('csvPreviewBox'), ib = document.getElementById('importBtn');
  if (res.error) {
    se.style.display = 'block';
    se.innerHTML = `<div style="font-size:12px;color:#A32D2D;padding:6px 8px;background:#FCEBEB;border-radius:6px">${res.error}</div>`;
    pb.style.display = 'none'; ib.style.display = 'none'; pendingImport = null; return;
  }
  pendingImport = res.rows; se.style.display = 'block';
  se.innerHTML = `<div style="font-size:12px;padding:6px 8px;background:#EAF3DE;border-radius:6px;color:#27500A">Znaleziono <strong>${res.count}</strong> gości — "${fname}"</div>`;
  pb.style.display = 'block';
  document.getElementById('csvPreview').textContent = res.rows.slice(0, 6).map(r => `${r.name} | ${r.group} | ${r.tableName || '—'}`).join('\n') + (res.rows.length > 6 ? '\n…+' + (res.rows.length - 6) : '');
  ib.style.display = 'flex';
}

function confirmImport() {
  if (!pendingImport) return;
  const autoT = {};
  pendingImport.forEach(row => {
    if (guests.find(g => g.name === row.name)) return;
    const g = { id: nextGId++, name: row.name, group: row.group, tableId: null, chairColor: null };
    guests.push(g);
    if (row.tableName) {
      let t = tables.find(x => x.name.toLowerCase() === row.tableName.toLowerCase());
      if (!t) {
        if (!autoT[row.tableName]) {
          t = { id: nextTId++, name: row.tableName, shape: 'circle', wCm: 180, hCm: 180, seats: 10, color: newColor, angle: 0, x: roomW/2 + (Math.random()-0.5)*400, y: roomH/2 + (Math.random()-0.5)*250, seatGuests: Array(10).fill(null) };
          tables.push(t); autoT[row.tableName] = t;
        } else t = autoT[row.tableName];
      }
      ensureSeatArray(t);
      const si = t.seatGuests.indexOf(null);
      if (si >= 0) { t.seatGuests[si] = g.id; g.tableId = t.id; }
    }
  });
  pendingImport = null;
  document.getElementById('importBtn').style.display = 'none';
  document.getElementById('csvStatus').innerHTML = `<div style="font-size:12px;padding:6px 8px;background:#EAF3DE;border-radius:6px;color:#27500A">Import zakończony!</div>`;
  renderSidebar(); renderGuestList(); draw(); updateStats(); switchTab('goscie');
}

function loadExample() {
  processCSVText(`imie,nazwisko,grupa,stol\nAnna,Kowalska,family,Rodzina\nPiotr,Nowak,family,Rodzina\nMarta,Wiśniewska,friend,Przyjaciele\nTomasz,Zając,friend,`, 'przykład.csv');
}

// ── Init ───────────────────────────────────────────────────────────────────────
tables.push({ id: nextTId++, name: 'Młodzi',    shape: 'rect',   wCm: 160, hCm: 90,  seats: 2,  color: '#85B7EB', angle: 0,  x: 820, y: 180, seatGuests: [null, null] });
tables.push({ id: nextTId++, name: 'Rodzina A', shape: 'circle', wCm: 180, hCm: 180, seats: 10, color: '#5DCAA5', angle: 0,  x: 350, y: 540, seatGuests: Array(10).fill(null) });
tables.push({ id: nextTId++, name: 'Stół 1',    shape: 'rect',   wCm: 180, hCm: 90,  seats: 8,  color: '#EF9F27', angle: 45, x: 800, y: 500, seatGuests: Array(8).fill(null) });

updateRoomLabel();
resizeCanvas();
renderSidebar();
renderGuestList();
updateStats();
