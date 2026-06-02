// ── Constants ─────────────────────────────────────────────────────────────────
const CHAIR_GAP = 5;
let groupColors = {
  family: { bg: '#EAF3DE', text: '#27500A', label: t('group_family') },
  friend: { bg: '#EEEDFE', text: '#26215C', label: t('group_friend') },
  work:   { bg: '#FAEEDA', text: '#412402', label: t('group_work') },
  other:  { bg: '#F1EFE8', text: '#2C2C2A', label: t('group_other') },
};
const TABLE_PALETTE = [
  // Pastels
  '#fadadd','#fdecc8','#fffde7','#eaf3de','#d4f5f5','#d4f0ff','#eeedfe','#f5d4f0',
  // Lights
  '#f4a0a8','#f9d49a','#f7f59c','#a9dfbf','#76d7c4','#85b7eb','#c39bd3','#f0b8e4',
  // Vivid
  '#e24b4a','#ef9f27','#f5c518','#5dcaa5','#1abc9c','#3b82f6','#7f77dd','#ed93b1',
  // Deep
  '#c0392b','#e8784a','#8db600','#27ae60','#148f77','#2563eb','#6d28d9','#a01060',
  // Neutrals
  '#ffffff','#f5f4f0','#d3d1c7','#a09f99','#6b6962','#3c3c3a','#1a1a18','#000000',
];

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
let chairEditMode = false, draggingChair = null;
let roomW = 1200, roomH = 800;
let pendingHeaders = [];
let pendingRawRows = [];
let selectedType = 'circle_180';
let pickerTableIdx = null, pickerSeatIdx = null;
let editingGuestId = null;
let nextCatId = 1;

// ── Canvas setup ───────────────────────────────────────────────────────────────
let canvas = document.getElementById('floorCanvas');
let ctx = canvas.getContext('2d');

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
function buildSwatches(containerId, activeColor, pickFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const active = (activeColor || '').toLowerCase();
  el.innerHTML = TABLE_PALETTE.map(c =>
    `<div class="swatch${c === active ? ' active' : ''}" style="background:${c}" data-color="${c}"
          onclick="${pickFn}('${c}')"></div>`
  ).join('') +
  `<input type="color" class="swatch-custom" value="${active || '#5dcaa5'}"
          onchange="${pickFn}(this.value)" title="Custom color">`;
}

function pickNewColor(color) {
  newColor = color.toLowerCase();
  buildSwatches('newColorSwatches', newColor, 'pickNewColor');
}

function pickPropColor(color) {
  const c = color.toLowerCase();
  if (selected !== null) { tables[selected].color = c; renderSidebar(); draw(); }
  buildSwatches('propColorSwatches', c, 'pickPropColor');
}

// ── Table CRUD ─────────────────────────────────────────────────────────────────
function addTable() {
  const p = getTypeParams();
  const name  = document.getElementById('newName').value.trim() || t('default_table_name') + ' ' + nextTId;
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

function pickChairLayout(layout, el) {
  if (selected === null) return;
  tables[selected].chairSides = layout;
  document.querySelectorAll('#chairLayoutBtns .rot-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
  renderSidebar(); draw();
}

function toggleChairEditMode() {
  chairEditMode = !chairEditMode;
  draggingChair = null;
  const btn = document.getElementById('chairEditBtn');
  if (btn) btn.classList.toggle('active', chairEditMode);
  draw();
}

function resetChairPositions() {
  if (selected === null) return;
  tables[selected].seatCustomPos = null;
  draw();
}

function setChairOffset(val) {
  if (selected === null) return;
  tables[selected].chairOffset = +val;
  document.getElementById('chairOffsetVal').textContent = Math.round(val) + '°';
  draw();
}

// ── Guest CRUD ─────────────────────────────────────────────────────────────────
function addGuestManual() {
  const name = document.getElementById('manualName').value.trim();
  if (!name) return;
  guests.push({ id: nextGId++, name, group: document.getElementById('manualGroup').value, tableId: null, chairColor: null });
  document.getElementById('manualName').value = '';
  renderGuestList(); updateStats(); triggerAutoSave();
}

function clearGuests() {
  guests = [];
  tables.forEach(t => { t.seatGuests = Array(t.seats).fill(null); });
  renderGuestList(); draw(); updateStats();
}

function cycleGroup(gid) {
  const g = guests.find(x => x.id === gid);
  if (!g) return;
  const order = Object.keys(groupColors);
  const cur = order.indexOf(g.group);
  g.group = order[(cur < 0 ? 0 : cur + 1) % order.length];
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
  overlay.style.bottom = 'auto';
  overlay.style.top  = '80px';
  overlay.style.left = 'auto';
  overlay.style.right = (window.innerWidth - pp.left + 6) + 'px';
  setTimeout(() => document.getElementById('pickerSearch').focus(), 50);
}

function renderPicker() {
  const q = (document.getElementById('pickerSearch').value || '').toLowerCase();
  const avail = guests.filter(g => !g.tableId && (!q || g.name.toLowerCase().includes(q)));
  const list = document.getElementById('pickerList');
  if (!avail.length) { list.innerHTML = `<div style="font-size:12px;color:#888;padding:4px">${t('no_available_guests')}</div>`; return; }
  list.innerHTML = avail.map(g => {
    const gc = groupColors[g.group] || groupColors.other || Object.values(groupColors)[0];
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
    panel.innerHTML = `<div style="font-size:12px;color:#888;padding:6px">${guests.length ? t('no_results') : t('no_guests')}</div>`;
    return;
  }
  panel.innerHTML = list.map(g => {
    const gc = groupColors[g.group] || groupColors.other || Object.values(groupColors)[0];
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
        <span class="gtag" style="background:${gc.bg};color:${gc.text}" onclick="cycleGroup(${g.id})" title="${t('change_group_title')}">${gc.label}</span>
        <span style="flex:1;font-size:12px">${g.name}</span>
        <span style="font-size:11px;color:#888">${tbl ? (tbl.name + (seatNum ? ' #' + seatNum : '')) : '—'}</span>
        <button class="x-btn" onclick="startEditGuest(${g.id})" title="${t('edit_title')}">✎</button>
        <button class="x-btn" onclick="removeGuest(${g.id})" title="${t('remove_title')}">×</button>
      </div>`;
  }).join('');
}

function selectTable(i) {
  if (i !== selected) { chairEditMode = false; draggingChair = null; }
  selected = i; renderSidebar();
  const t = tables[i]; ensureSeatArray(t);
  const propsPanel = document.getElementById('propsPanel');
  propsPanel.style.display = 'flex';
  propsPanel.style.width = propsPanelWidth + 'px';
  document.getElementById('propTitle').textContent = t.name;
  document.getElementById('propName').value  = t.name;
  document.getElementById('propSeats').value = t.seats;
  document.getElementById('rotLabel').textContent = Math.round(t.angle || 0) + '°';
  buildSwatches('propColorSwatches', t.color, 'pickPropColor');

  const layoutBtns   = document.getElementById('chairLayoutBtns');
  const offsetCtrls  = document.getElementById('chairOffsetControls');
  if (t.shape === 'rect') {
    layoutBtns.style.display  = 'flex';
    offsetCtrls.style.display = 'none';
    const layout = t.chairSides || 'tb';
    document.querySelectorAll('#chairLayoutBtns .rot-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
  } else {
    layoutBtns.style.display  = 'none';
    offsetCtrls.style.display = 'flex';
    const off = t.chairOffset || 0;
    document.getElementById('chairOffsetSlider').value = off;
    document.getElementById('chairOffsetVal').textContent = Math.round(off) + '°';
  }
  const editBtn = document.getElementById('chairEditBtn');
  if (editBtn) editBtn.classList.toggle('active', chairEditMode);

  renderSeatPanel(); draw();
}

function renderSeatPanel() {
  if (selected === null) return;
  const tbl = tables[selected]; ensureSeatArray(tbl);
  document.getElementById('seatPanel').innerHTML = Array.from({ length: tbl.seats }, (_, i) => {
    const gid = tbl.seatGuests[i];
    const g   = gid ? guests.find(x => x.id === gid) : null;
    const gc  = g ? (groupColors[g.group] || groupColors.other || Object.values(groupColors)[0]) : null;
    if (g) {
      const colorVal = g.chairColor || gc.bg;
      return `
        <div class="seat-row occupied" draggable="true"
             ondragstart="seatDragStart(${i})"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="seatDrop(${i});this.classList.remove('drag-over')"
             ondragend="seatDragEnd()">
          <span class="drag-handle" title="${t('drag_to_reorder')}">⠿</span>
          <span class="seat-num">${i + 1}</span>
          <span class="gtag" style="background:${gc.bg};color:${gc.text}">${gc.label}</span>
          <span class="seat-name">${g.name}</span>
          <input type="color" class="chair-color-input" value="${colorVal}"
                 onchange="setChairColor(${g.id}, this.value)" title="${t('chair_color_title')}">
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
        <span class="seat-empty">${t('empty_seat')}</span>
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
      if (t.seatCustomPos) t.seatCustomPos = t.seatCustomPos.slice(0, newSeats);
    } else {
      while (t.seatGuests.length < newSeats) t.seatGuests.push(null);
      if (t.seatCustomPos) while (t.seatCustomPos.length < newSeats) t.seatCustomPos.push(null);
    }
    t.seats = newSeats;
  }
  document.getElementById('propTitle').textContent = newName;
  renderSidebar(); renderGuestList(); renderSeatPanel(); draw(); updateStats();
}

// ── Chair layout helpers ───────────────────────────────────────────────────────
function distributeAllSides(n) {
  const base = Math.floor(n / 4), extra = n - base * 4;
  return { nT: base + (extra > 0 ? 1 : 0), nR: base + (extra > 1 ? 1 : 0), nB: base + (extra > 2 ? 1 : 0), nL: base };
}

function getChairPositions(t) {
  const twPx = t.wCm * zoom, thPx = t.hCm * zoom;
  const chairR = Math.max(3, 22 * zoom);
  const pos = [];
  if (t.shape === 'circle') {
    const r = twPx / 2;
    const offsetRad = ((t.chairOffset || 0) - 90) * Math.PI / 180;
    for (let s = 0; s < t.seats; s++) {
      const a = (s / t.seats) * Math.PI * 2 + offsetRad;
      pos.push({ x: (r + chairR + CHAIR_GAP*zoom)*Math.cos(a), y: (r + chairR + CHAIR_GAP*zoom)*Math.sin(a) });
    }
  } else {
    const hw = twPx/2, hh = thPx/2, sides = t.chairSides || 'tb';
    if (sides === 'tb') {
      const nT = Math.ceil(t.seats/2), nB = Math.floor(t.seats/2);
      const slotW = (twPx - CHAIR_GAP*zoom*2) / (Math.max(nT,nB)||1);
      for (let s = 0; s < nT; s++) pos.push({ x: -hw+CHAIR_GAP*zoom+slotW*(s+0.5), y: -hh-chairR-CHAIR_GAP*zoom });
      for (let s = 0; s < nB; s++) pos.push({ x: -hw+CHAIR_GAP*zoom+slotW*(s+0.5), y:  hh+chairR+CHAIR_GAP*zoom });
    } else if (sides === 't') {
      const slotW = (twPx - CHAIR_GAP*zoom*2) / (t.seats||1);
      for (let s = 0; s < t.seats; s++) pos.push({ x: -hw+CHAIR_GAP*zoom+slotW*(s+0.5), y: -hh-chairR-CHAIR_GAP*zoom });
    } else if (sides === 'b') {
      const slotW = (twPx - CHAIR_GAP*zoom*2) / (t.seats||1);
      for (let s = 0; s < t.seats; s++) pos.push({ x: -hw+CHAIR_GAP*zoom+slotW*(s+0.5), y: hh+chairR+CHAIR_GAP*zoom });
    } else if (sides === 'all') {
      const { nT, nR, nB: nBo, nL } = distributeAllSides(t.seats);
      const slotW = (twPx - CHAIR_GAP*zoom*2) / (Math.max(nT,nBo)||1);
      const slotH = (thPx - CHAIR_GAP*zoom*2) / (Math.max(nR,nL)||1);
      for (let s = 0; s < nT;  s++) pos.push({ x: -hw+CHAIR_GAP*zoom+slotW*(s+0.5),  y: -hh-chairR-CHAIR_GAP*zoom });
      for (let s = 0; s < nR;  s++) pos.push({ x:  hw+chairR+CHAIR_GAP*zoom, y: -hh+CHAIR_GAP*zoom+slotH*(s+0.5) });
      for (let s = 0; s < nBo; s++) pos.push({ x:  hw-CHAIR_GAP*zoom-slotW*(s+0.5),  y:  hh+chairR+CHAIR_GAP*zoom });
      for (let s = 0; s < nL;  s++) pos.push({ x: -hw-chairR-CHAIR_GAP*zoom, y:  hh-CHAIR_GAP*zoom-slotH*(s+0.5) });
    }
  }
  // Apply custom overrides (stored in cm, relative to table centre)
  if (t.seatCustomPos) {
    for (let i = 0; i < pos.length; i++) {
      if (t.seatCustomPos[i]) pos[i] = { x: t.seatCustomPos[i].x * zoom, y: t.seatCustomPos[i].y * zoom };
    }
  }
  return pos;
}

function getChairAt(mx, my, tableIdx) {
  const t = tables[tableIdx];
  const { lx, ly } = localPoint(t, mx, my);
  const chairR = Math.max(3, 22 * zoom) + 4; // +4 tolerance
  const pos = getChairPositions(t);
  for (let i = pos.length - 1; i >= 0; i--) {
    const dx = lx - pos[i].x, dy = ly - pos[i].y;
    if (dx*dx + dy*dy <= chairR*chairR) return i;
  }
  return -1;
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
  const gc = g ? (groupColors[g.group] || groupColors.other || Object.values(groupColors)[0]) : null;
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

    getChairPositions(t).forEach((p, s) => {
      const gid = t.seatGuests[s];
      const g   = gid ? guests.find(x => x.id === gid) : null;
      drawChair(p.x, p.y, chairR, g);
      if (!g || zoom <= 0.45) {
        ctx.fillStyle = '#999'; ctx.font = `${Math.max(6, 7*zoom)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s + 1, p.x, p.y);
      }
      if (chairEditMode && isSel) {
        ctx.beginPath(); ctx.arc(p.x, p.y, chairR + 2, 0, Math.PI * 2);
        ctx.strokeStyle = draggingChair === s ? '#E24B4A' : '#378ADD';
        ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
      }
    });

    if (t.shape === 'circle') {
      ctx.beginPath(); ctx.arc(0, 0, twPx/2, 0, Math.PI*2);
      ctx.fillStyle = t.color; ctx.fill(); ctx.strokeStyle = dk; ctx.lineWidth = 1; ctx.stroke();
    } else {
      const hw = twPx/2, hh = thPx/2;
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
  triggerAutoSave();
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
  if (chairEditMode && selected !== null) {
    const ci = getChairAt(mx, my, selected);
    if (ci >= 0) { draggingChair = ci; canvas.style.cursor = 'grabbing'; return; }
  }
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
    if (selected !== null) { selected = null; chairEditMode = false; document.getElementById('propsPanel').style.display = 'none'; renderSidebar(); renderGuestList(); draw(); }
    closeGuestPicker();
  }
});

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (draggingChair !== null && selected !== null) {
    const t = tables[selected];
    const { lx, ly } = localPoint(t, mx, my);
    if (!t.seatCustomPos) t.seatCustomPos = new Array(t.seats).fill(null);
    t.seatCustomPos[draggingChair] = { x: lx / zoom, y: ly / zoom };
    draw(); return;
  }
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
  if (chairEditMode && selected !== null && getChairAt(mx, my, selected) >= 0) canvas.style.cursor = 'grab';
  else if (getRotHandleAt(mx, my)) canvas.style.cursor = 'crosshair';
  else if (getTableAt(mx, my) >= 0) canvas.style.cursor = 'grab';
  else canvas.style.cursor = 'default';
});

canvas.addEventListener('mouseup', () => {
  if (rotating) renderSidebar();
  rotating = false; dragging = false;
  if (draggingChair !== null) { draggingChair = null; triggerAutoSave(); }
  canvas.style.cursor = 'default';
});
canvas.addEventListener('mouseleave', () => {
  rotating = false; dragging = false;
  if (draggingChair !== null) { draggingChair = null; triggerAutoSave(); }
  canvas.style.cursor = 'default';
});

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t2 = e.touches[0], r = canvas.getBoundingClientRect(), mx = t2.clientX - r.left, my = t2.clientY - r.top;
  if (chairEditMode && selected !== null) {
    const ci = getChairAt(mx, my, selected);
    if (ci >= 0) { draggingChair = ci; return; }
  }
  if (getRotHandleAt(mx, my) && selected !== null) {
    rotating = true; const t = tables[selected]; rotStartAngle = getAngleFromCenter(t, mx, my); rotStartRot = t.angle || 0; return;
  }
  const idx = getTableAt(mx, my);
  if (idx >= 0) { selected = idx; dragging = true; dragOffX = mx - (20 + tables[idx].x * zoom); dragOffY = my - (20 + tables[idx].y * zoom); selectTable(idx); }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t2 = e.touches[0], r = canvas.getBoundingClientRect(), mx = t2.clientX - r.left, my = t2.clientY - r.top;
  if (draggingChair !== null && selected !== null) {
    const t = tables[selected];
    const { lx, ly } = localPoint(t, mx, my);
    if (!t.seatCustomPos) t.seatCustomPos = new Array(t.seats).fill(null);
    t.seatCustomPos[draggingChair] = { x: lx / zoom, y: ly / zoom };
    draw(); return;
  }
  if (rotating && selected !== null) { const t = tables[selected]; t.angle = ((rotStartRot + (getAngleFromCenter(t, mx, my) - rotStartAngle)) % 360 + 360) % 360; draw(); return; }
  if (dragging && selected !== null) { tables[selected].x = Math.max(0, Math.min(roomW, (mx - dragOffX - 20) / zoom)); tables[selected].y = Math.max(0, Math.min(roomH, (my - dragOffY - 20) / zoom)); draw(); }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  if (rotating) renderSidebar();
  rotating = false; dragging = false;
  if (draggingChair !== null) { draggingChair = null; triggerAutoSave(); }
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeGuestPicker(); cancelEdit(); dismissCoffeePopup(false); }
  if (selected !== null && !e.target.matches('input,select,textarea')) {
    if (e.key === 'ArrowLeft')  rotateSelected(-5);
    if (e.key === 'ArrowRight') rotateSelected(5);
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  }
});

// ── CSV import ─────────────────────────────────────────────────────────────────
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
  const se = document.getElementById('csvStatus');
  const mb = document.getElementById('csvMappingBox');
  const pb = document.getElementById('csvPreviewBox');
  const ib = document.getElementById('importBtn');
  const lines = text.trim().split(/\r?\n/);
  const err = s => { se.style.display = 'block'; se.innerHTML = `<div style="font-size:12px;color:#A32D2D;padding:6px 8px;background:#FCEBEB;border-radius:6px">${s}</div>`; mb.style.display = 'none'; pb.style.display = 'none'; ib.style.display = 'none'; pendingHeaders = []; pendingRawRows = []; };
  if (lines.length < 2) { err(t('file_too_short')); return; }
  const sep = lines[0].includes(';') ? ';' : ',';
  pendingHeaders = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
  if (!pendingHeaders.length) { err(t('no_headers_found')); return; }
  pendingRawRows = [];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i].trim(); if (!ln) continue;
    pendingRawRows.push(ln.split(sep).map(x => x.trim().replace(/^["']|["']$/g, '')));
  }
  se.style.display = 'block';
  se.innerHTML = `<div style="font-size:12px;padding:6px 8px;background:#EAF3DE;border-radius:6px;color:#27500A">${t('file_loaded', {name: fname, rows: pendingRawRows.length, cols: pendingHeaders.length})}</div>`;
  mb.style.display = 'block';
  renderColumnPicker();
  applyMapping();
  ib.style.display = 'flex';
}

function renderColumnPicker() {
  const hdr = pendingHeaders.map(h => h.toLowerCase());
  const find = keys => { for (const k of keys) { const i = hdr.indexOf(k); if (i >= 0) return i; } return -1; };
  const dFirst = Math.max(0, find(['imie','imię','firstname','name','imie_nazwisko','full_name','fullname']));
  const dLast  = find(['nazwisko','last_name','lastname','surname']);
  const dGroup = find(['grupa','group','kategoria']);
  const dTable = find(['stol','stół','table']);
  const colOpts = (def, withNone) =>
    (withNone ? `<option value="-1"${def === -1 ? ' selected' : ''}>${t('none_option')}</option>` : '') +
    pendingHeaders.map((h, i) => `<option value="${i}"${i === def ? ' selected' : ''}>${h}</option>`).join('');
  document.getElementById('csvMappingBox').innerHTML = `
    <div class="sec-title" style="margin-top:2px">${t('column_mapping')}</div>
    <div class="row"><label>${t('col_first_name')}</label><select id="mapFirst" onchange="applyMapping()">${colOpts(dFirst, false)}</select></div>
    <div class="row"><label>${t('col_last_name')}</label><select id="mapLast" onchange="applyMapping()">${colOpts(dLast, true)}</select></div>
    <div class="row"><label>${t('col_category')}</label><select id="mapGroup" onchange="applyMapping()">${colOpts(dGroup, true)}</select></div>
    <div class="row"><label>${t('col_table')}</label><select id="mapTable" onchange="applyMapping()">${colOpts(dTable, true)}</select></div>`;
}

function applyMapping() {
  if (!pendingRawRows.length) return;
  const fi = +document.getElementById('mapFirst').value;
  const li = +document.getElementById('mapLast').value;
  const gi = +document.getElementById('mapGroup').value;
  const ti = +document.getElementById('mapTable').value;
  const rows = pendingRawRows.slice(0, 6).map(c => {
    let name = c[fi] || '';
    if (li >= 0 && c[li]) name = (name + ' ' + c[li]).trim();
    const group = gi >= 0 ? (c[gi] || '—') : '—';
    const table = ti >= 0 ? (c[ti] || '—') : '—';
    return `${name || t('missing_value')} | ${group} | ${table}`;
  });
  const pb = document.getElementById('csvPreviewBox');
  pb.style.display = 'block';
  document.getElementById('csvPreview').textContent = rows.join('\n') + (pendingRawRows.length > 6 ? '\n' + t('more_rows', {n: pendingRawRows.length - 6}) : '');
}

function confirmImport() {
  if (!pendingRawRows.length) return;
  const fi = +document.getElementById('mapFirst').value;
  const li = +document.getElementById('mapLast').value;
  const gi = +document.getElementById('mapGroup').value;
  const ti = +document.getElementById('mapTable').value;
  const autoT = {};
  let imported = 0;
  pendingRawRows.forEach(c => {
    let name = c[fi] || '';
    if (li >= 0 && c[li]) name = (name + ' ' + c[li]).trim();
    if (!name || guests.find(g => g.name === name)) return;
    const group = resolveGroup(gi >= 0 ? (c[gi] || '') : '');
    const g = { id: nextGId++, name, group, tableId: null, chairColor: null };
    guests.push(g); imported++;
    const tableName = ti >= 0 ? (c[ti] || '') : '';
    if (tableName) {
      let t = tables.find(x => x.name.toLowerCase() === tableName.toLowerCase());
      if (!t) {
        if (!autoT[tableName]) {
          t = { id: nextTId++, name: tableName, shape: 'circle', wCm: 180, hCm: 180, seats: 10, color: newColor, angle: 0, x: roomW/2 + (Math.random()-0.5)*400, y: roomH/2 + (Math.random()-0.5)*250, seatGuests: Array(10).fill(null) };
          tables.push(t); autoT[tableName] = t;
        } else t = autoT[tableName];
      }
      ensureSeatArray(t);
      const si = t.seatGuests.indexOf(null);
      if (si >= 0) { t.seatGuests[si] = g.id; g.tableId = t.id; }
    }
  });
  pendingRawRows = []; pendingHeaders = [];
  document.getElementById('importBtn').style.display = 'none';
  document.getElementById('csvMappingBox').style.display = 'none';
  document.getElementById('csvPreviewBox').style.display = 'none';
  document.getElementById('csvStatus').innerHTML = `<div style="font-size:12px;padding:6px 8px;background:#EAF3DE;border-radius:6px;color:#27500A">${t('import_done', {n: imported})}</div>`;
  renderSidebar(); renderGuestList(); draw(); updateStats(); switchTab('goscie');
}

function loadExample() {
  processCSVText(`imie,nazwisko,grupa,stol\nAnna,Kowalska,family,Rodzina\nPiotr,Nowak,family,Rodzina\nMarta,Wiśniewska,friend,Przyjaciele\nTomasz,Zając,friend,`, 'przykład.csv');
}

// ── Category management ────────────────────────────────────────────────────────
function textForBg(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (0.299*r + 0.587*g + 0.114*b) > 140 ? '#2C2C2A' : '#f5f4f0';
}

function resolveGroup(raw) {
  const rv = (raw || '').toLowerCase().trim();
  if (!rv) return groupColors.other ? 'other' : Object.keys(groupColors)[0];
  for (const [key, gc] of Object.entries(groupColors)) {
    if (gc.label.toLowerCase() === rv) return key;
  }
  if (groupColors.family && ['family','rodzina','familia','famille','famiglia','familie',"сім'я","сімья"].some(x => rv.includes(x))) return 'family';
  if (groupColors.friend && ['friend','przyjaciel','znajom','amigo','ami','amico','freund','друг'].some(x => rv.includes(x))) return 'friend';
  if (groupColors.work   && ['work','praca','trabajo','travail','lavoro','arbeit','робота'].some(x => rv.includes(x))) return 'work';
  return groupColors.other ? 'other' : Object.keys(groupColors)[0];
}

function renderCategoryList() {
  const panel = document.getElementById('categoryListPanel');
  if (!panel) return;
  const keys = Object.keys(groupColors);
  panel.innerHTML = Object.entries(groupColors).map(([key, gc]) => `
    <div class="cat-row">
      <input type="color" class="cat-color-input" value="${gc.bg}"
             oninput="setCategoryColor('${key}', this.value)">
      <input type="text" class="cat-name-input" value="${gc.label}"
             onchange="renameCategory('${key}', this.value)"
             onblur="renameCategory('${key}', this.value)">
      <button class="x-btn" onclick="deleteCategory('${key}')"
              ${keys.length <= 1 ? 'disabled style="opacity:.35;cursor:default"' : ''}>×</button>
    </div>`).join('');
}

function refreshGroupSelects() {
  const opts = Object.entries(groupColors).map(([k, gc]) => `<option value="${k}">${gc.label}</option>`).join('');
  document.querySelectorAll('.group-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = opts;
    if (groupColors[cur]) sel.value = cur;
  });
}

function addCategory() {
  const palette = ['#FADADD','#D4F0FF','#D4F5D4','#FFF0D4','#E8D4FF','#FFD4F0','#D4EFEF'];
  const bg = palette[Object.keys(groupColors).length % palette.length];
  const key = 'cat_' + (nextCatId++);
  groupColors[key] = { bg, text: textForBg(bg), label: t('group_new') + ' ' + Object.keys(groupColors).length };
  renderCategoryList(); refreshGroupSelects(); triggerAutoSave();
}

function deleteCategory(key) {
  if (Object.keys(groupColors).length <= 1) return;
  const fallback = Object.keys(groupColors).find(k => k !== key);
  guests.forEach(g => { if (g.group === key) g.group = fallback; });
  delete groupColors[key];
  renderCategoryList(); refreshGroupSelects(); renderGuestList(); draw();
}

function setCategoryColor(key, hex) {
  if (!groupColors[key]) return;
  groupColors[key].bg = hex;
  groupColors[key].text = textForBg(hex);
  renderGuestList(); draw();
}

function renameCategory(key, label) {
  if (!groupColors[key] || !label.trim()) return;
  groupColors[key].label = label.trim();
  refreshGroupSelects(); renderGuestList();
}

// ── Props panel resize ─────────────────────────────────────────────────────────
const PROPS_W_KEY = 'tp_props_w';
let propsPanelWidth = (() => {
  try { return Math.min(500, Math.max(220, parseInt(localStorage.getItem(PROPS_W_KEY)) || 280)); } catch (_) { return 280; }
})();

(function initPropsResize() {
  const panel  = document.getElementById('propsPanel');
  const handle = document.getElementById('propsResizeHandle');
  if (!panel || !handle) return;
  panel.style.width = propsPanelWidth + 'px';

  let resizing = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    resizing = true; startX = e.clientX; startW = panel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const newW = Math.min(500, Math.max(220, startW + (startX - e.clientX)));
    panel.style.width = newW + 'px';
    propsPanelWidth = newW;
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try { localStorage.setItem(PROPS_W_KEY, propsPanelWidth); } catch (_) {}
  });
}());

// ── Sidebar resize ─────────────────────────────────────────────────────────────
const SIDEBAR_W_KEY = 'tp_sidebar_w';
let sidebarWidth = (() => {
  try { return Math.min(480, Math.max(200, parseInt(localStorage.getItem(SIDEBAR_W_KEY)) || 280)); } catch (_) { return 280; }
})();

(function initSidebarResize() {
  const panel  = document.querySelector('.sidebar');
  const handle = document.getElementById('sidebarResizeHandle');
  if (!panel || !handle) return;
  panel.style.width = sidebarWidth + 'px';

  let resizing = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    resizing = true; startX = e.clientX; startW = panel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const newW = Math.min(480, Math.max(200, startW + (e.clientX - startX)));
    panel.style.width = newW + 'px';
    sidebarWidth = newW;
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try { localStorage.setItem(SIDEBAR_W_KEY, sidebarWidth); } catch (_) {}
  });
}());

// ── Export popup ──────────────────────────────────────────────────────────────
let _pendingExport = null;

function openExportPopup(type) {
  _pendingExport = type;
  document.getElementById('coffeePopup').style.display = 'flex';
}

function dismissCoffeePopup(doCoffee) {
  document.getElementById('coffeePopup').style.display = 'none';
  const type = _pendingExport; _pendingExport = null;
  if (type === 'jpg') exportJPG();
  else if (type === 'png') exportPNG();
  else if (type === 'pdf') exportPDF();
}

// ── Export ─────────────────────────────────────────────────────────────────────
function renderHighResCanvas() {
  const TARGET_PX = 3600;
  const exportZoom = TARGET_PX / Math.max(roomW, roomH);
  const ew = Math.round(roomW * exportZoom) + 40;
  const eh = Math.round(roomH * exportZoom) + 40;

  const tmp = document.createElement('canvas');
  tmp.width = ew; tmp.height = eh;

  const savedCanvas = canvas, savedCtx = ctx, savedZoom = zoom;
  const savedSelected = selected, savedChairEdit = chairEditMode;
  canvas = tmp; ctx = tmp.getContext('2d');
  zoom = exportZoom; selected = null; chairEditMode = false;

  draw();

  // Fill any transparent margin area with background colour
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#f7f7f5';
  ctx.fillRect(0, 0, ew, eh);
  ctx.globalCompositeOperation = 'source-over';

  canvas = savedCanvas; ctx = savedCtx; zoom = savedZoom;
  selected = savedSelected; chairEditMode = savedChairEdit;

  return tmp;
}

function exportJPG() {
  const tmp = renderHighResCanvas();
  const a = document.createElement('a');
  a.download = 'tableplaner.jpg';
  a.href = tmp.toDataURL('image/jpeg', 0.95);
  a.click();
}

function exportPNG() {
  const tmp = renderHighResCanvas();
  const a = document.createElement('a');
  a.download = 'tableplaner.png';
  a.href = tmp.toDataURL('image/png');
  a.click();
}

function exportPDF() {
  if (!window.jspdf) { alert(t('jspdf_missing')); return; }
  const { jsPDF } = window.jspdf;
  const tmp = renderHighResCanvas();
  const cw = tmp.width, ch = tmp.height;
  const isLandscape = cw >= ch;
  const pageW = isLandscape ? 297 : 210, pageH = isLandscape ? 210 : 297;
  const margin = 10;
  const availW = pageW - margin * 2, availH = pageH - margin * 2;
  const scale = Math.min(availW / cw, availH / ch);
  const imgW = cw * scale, imgH = ch * scale;
  const x = margin + (availW - imgW) / 2, y = margin + (availH - imgH) / 2;
  const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, imgW, imgH);
  pdf.save('tableplaner.pdf');
}

// ── Sessions ───────────────────────────────────────────────────────────────────
const TP_IDX  = 'tp_idx';
const TP_CUR  = 'tp_cur';
const TP_SESS = id => 'tp_s_' + id;

let currentSessionId = null;
let autoSaveTimer = null;

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function getIndex() { try { return JSON.parse(localStorage.getItem(TP_IDX) || '[]'); } catch (_) { return []; } }
function saveIndex(idx) { try { localStorage.setItem(TP_IDX, JSON.stringify(idx)); } catch (_) {} }

function buildSaveState() {
  return { version: 1, savedAt: new Date().toISOString(), zoom, roomW, roomH, groupColors, tables, guests, nextTId, nextGId, nextCatId };
}

function applyState(s) {
  if (!s || s.version !== 1) return false;
  tables = s.tables || []; guests = s.guests || [];
  groupColors = s.groupColors || groupColors;
  roomW = s.roomW || 1200; roomH = s.roomH || 800;
  nextTId = s.nextTId || (tables.reduce((m, t) => Math.max(m, t.id), 0) + 1);
  nextGId = s.nextGId || (guests.reduce((m, g) => Math.max(m, g.id), 0) + 1);
  nextCatId = s.nextCatId || 1;
  if (s.zoom) { zoom = s.zoom; document.getElementById('zoomSlider').value = Math.round(zoom * 100); document.getElementById('zoomVal').textContent = Math.round(zoom * 100) + '%'; }
  document.getElementById('roomW').value = roomW; document.getElementById('roomH').value = roomH;
  selected = null; document.getElementById('propsPanel').style.display = 'none';
  updateRoomLabel(); resizeCanvas(); renderSidebar(); renderGuestList(); updateStats(); renderCategoryList(); refreshGroupSelects();
  return true;
}

function fmtMeta(e) {
  const d = new Date(e.savedAt);
  const time = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  return t('meta_tables', {n: e.tableCount}) + ' · ' + t('meta_guests', {n: e.guestCount}) + ' · ' + time;
}

function saveCurrentSession() {
  if (!currentSessionId) return;
  const state = buildSaveState();
  try { localStorage.setItem(TP_SESS(currentSessionId), JSON.stringify(state)); } catch (_) { return; }
  const idx = getIndex();
  const entry = idx.find(e => e.id === currentSessionId);
  if (entry) { entry.savedAt = state.savedAt; entry.tableCount = tables.length; entry.guestCount = guests.length; }
  else idx.push({ id: currentSessionId, name: t('new_plan'), savedAt: state.savedAt, tableCount: tables.length, guestCount: guests.length });
  saveIndex(idx);
  try { localStorage.setItem(TP_CUR, currentSessionId); } catch (_) {}
}

function triggerAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveCurrentSession();
    const entry = getIndex().find(e => e.id === currentSessionId);
    if (entry) {
      const row = document.querySelector(`.session-row[data-id="${currentSessionId}"]`);
      if (row) { const m = row.querySelector('.session-meta'); if (m) m.textContent = fmtMeta(entry); }
    }
    const el = document.getElementById('autoSaveStatus');
    if (el) { const n = new Date(); el.textContent = t('saved_at', {time: n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0')}); }
  }, 0);
}

function renderSessionList() {
  const panel = document.getElementById('sessionListPanel');
  if (!panel) return;
  const idx = getIndex();
  panel.innerHTML = idx.map(e => {
    const isCur = e.id === currentSessionId;
    return `
      <div class="session-row${isCur ? ' active' : ''}" data-id="${e.id}">
        <div class="session-body"${isCur ? '' : ` onclick="loadSession('${e.id}')"`}>
          <input class="session-name-input" value="${e.name.replace(/"/g,'&quot;')}"
                 onchange="renameSession('${e.id}',this.value)"
                 onblur="renameSession('${e.id}',this.value)"
                 onclick="event.stopPropagation()">
          <span class="session-meta">${fmtMeta(e)}</span>
        </div>
        <button class="x-btn" onclick="deleteSession('${e.id}')"
                title="${t('delete_session_title')}"${idx.length <= 1 ? ' disabled style="opacity:.35;cursor:default"' : ''}>×</button>
      </div>`;
  }).join('');
}

function loadSession(id) {
  if (id === currentSessionId) return;
  saveCurrentSession();
  try {
    const raw = localStorage.getItem(TP_SESS(id));
    if (raw && applyState(JSON.parse(raw))) {
      currentSessionId = id;
      try { localStorage.setItem(TP_CUR, id); } catch (_) {}
      renderSessionList();
    }
  } catch (_) {}
}

function deleteSession(id) {
  const idx = getIndex().filter(e => e.id !== id);
  saveIndex(idx); try { localStorage.removeItem(TP_SESS(id)); } catch (_) {}
  if (id === currentSessionId) {
    if (idx.length) loadSession(idx[idx.length - 1].id);
    else startNewSession(t('new_plan'), true);
  } else renderSessionList();
}

function renameSession(id, name) {
  if (!name.trim()) return;
  const idx = getIndex(); const e = idx.find(x => x.id === id);
  if (e) { e.name = name.trim(); saveIndex(idx); triggerAutoSave(); }
}

function startNewSession(name, withExamples) {
  saveCurrentSession();
  const id = genId(); currentSessionId = id;
  tables = []; guests = [];
  groupColors = { family:{bg:'#EAF3DE',text:'#27500A',label:t('group_family')}, friend:{bg:'#EEEDFE',text:'#26215C',label:t('group_friend')}, work:{bg:'#FAEEDA',text:'#412402',label:t('group_work')}, other:{bg:'#F1EFE8',text:'#2C2C2A',label:t('group_other')} };
  nextTId = 1; nextGId = 1; nextCatId = 1;
  zoom = 0.6; roomW = 1200; roomH = 800;
  document.getElementById('zoomSlider').value = 60; document.getElementById('zoomVal').textContent = '60%';
  if (withExamples) {
    tables.push({ id: nextTId++, name: t('example_couple'),        shape: 'rect',   wCm: 160, hCm: 90,  seats: 2,  color: '#85B7EB', angle: 0,  x: 820, y: 180, seatGuests: [null, null] });
    tables.push({ id: nextTId++, name: t('example_family') + ' A', shape: 'circle', wCm: 180, hCm: 180, seats: 10, color: '#5DCAA5', angle: 0,  x: 350, y: 540, seatGuests: Array(10).fill(null) });
    tables.push({ id: nextTId++, name: t('default_table_name') + ' 1', shape: 'rect', wCm: 180, hCm: 90, seats: 8, color: '#EF9F27', angle: 45, x: 800, y: 500, seatGuests: Array(8).fill(null) });
  }
  const idx = getIndex();
  idx.push({ id, name: name || t('new_plan'), savedAt: new Date().toISOString(), tableCount: tables.length, guestCount: guests.length });
  saveIndex(idx); try { localStorage.setItem(TP_CUR, id); } catch (_) {}
  selected = null; document.getElementById('propsPanel').style.display = 'none';
  updateRoomLabel(); resizeCanvas(); renderSidebar(); renderGuestList(); updateStats(); renderCategoryList(); refreshGroupSelects();
  renderSessionList();
}

// ── Init ───────────────────────────────────────────────────────────────────────
(function () {
  // Migrate from old single-save format
  try {
    const old = localStorage.getItem('tableplaner_v1');
    if (old && !getIndex().length) {
      const s = JSON.parse(old);
      if (s.version === 1) {
        const id = genId(); currentSessionId = id;
        saveIndex([{ id, name: 'Mój plan', savedAt: s.savedAt || new Date().toISOString(), tableCount: (s.tables||[]).length, guestCount: (s.guests||[]).length }]);
        localStorage.setItem(TP_SESS(id), old); localStorage.setItem(TP_CUR, id);
        localStorage.removeItem('tableplaner_v1');
        applyState(s); renderSessionList(); applyLocale(); buildSwatches('newColorSwatches', newColor, 'pickNewColor'); return;
      }
    }
  } catch (_) {}

  // Resume last active session
  const idx = getIndex();
  let curId = null; try { curId = localStorage.getItem(TP_CUR); } catch (_) {}
  const toLoad = idx.find(e => e.id === curId) ? curId : (idx.length ? idx[idx.length - 1].id : null);
  if (toLoad) {
    try {
      const raw = localStorage.getItem(TP_SESS(toLoad));
      if (raw && applyState(JSON.parse(raw))) { currentSessionId = toLoad; renderSessionList(); applyLocale(); buildSwatches('newColorSwatches', newColor, 'pickNewColor'); return; }
    } catch (_) {}
  }

  // First run — create default session with example data
  startNewSession(t('my_plan'), true);
  applyLocale();
  buildSwatches('newColorSwatches', newColor, 'pickNewColor');
}());
