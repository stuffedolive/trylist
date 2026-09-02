import { db } from './firebase.js';
import { getCurrentUser } from './user.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const CATEGORY_LABELS = {
  restaurant: 'Restaurant',
  takeaway: 'Takeaway',
  cafe_normal: 'Cafe',
  cafe_coffee: 'Cafe (coffee/pastry)'
};
const USERS = ['Jade', 'John'];
const SCORE_FIELDS = ['taste', 'value', 'atmosphere', 'service', 'wouldreturn'];

const STATUS_FILTER_STATES = [
  { value: 'all', label: 'All' },
  { value: 'to_try', label: 'To Try' },
  { value: 'visited', label: 'Visited' }
];
const CATEGORY_FILTER_STATES = [
  { value: 'all', label: 'All categories' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'cafe_normal', label: 'Cafe' },
  { value: 'cafe_coffee', label: 'Cafe (coffee/pastry)' }
];
const COST_FILTER_STATES = [
  { value: 'all', label: 'Any cost' },
  { value: '$', label: '$' },
  { value: '$$$', label: '$$$' }
];

const colRef = collection(db, 'foodItems');
let allItems = [];
let selectedCost = null;
let selectedVisibility = 'shared';
let selectedLocations = [''];
let currentEditId = null;
let editingVisitIndex = null;

function formatHistoryDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

let statusFilterIndex = 0;
let categoryFilterIndex = 0;
let costFilterIndex = 0;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- Locations repeatable field ----------------
function renderLocationFields() {
  const wrap = document.getElementById('food-field-locations');
  wrap.innerHTML = '';
  selectedLocations.forEach((loc, idx) => {
    const row = document.createElement('div');
    row.className = 'location-row';
    row.innerHTML = `
      <input type="text" class="field-input location-input" placeholder="Address or place name" value="${escapeHtml(loc)}" />
      ${selectedLocations.length > 1 ? '<button type="button" class="location-remove-btn">✕</button>' : ''}
    `;
    const input = row.querySelector('.location-input');
    input.addEventListener('input', () => { selectedLocations[idx] = input.value; });
    const removeBtn = row.querySelector('.location-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        selectedLocations.splice(idx, 1);
        renderLocationFields();
      });
    }
    wrap.appendChild(row);
  });
}
document.getElementById('food-add-location-btn').addEventListener('click', () => {
  selectedLocations.push('');
  renderLocationFields();
});

// ---------------- Cost / status segmented ----------------
document.querySelectorAll('#food-field-cost .segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (selectedCost === btn.dataset.value) {
      selectedCost = null;
    } else {
      selectedCost = btn.dataset.value;
    }
    setCostUI(selectedCost);
  });
});

document.getElementById('food-field-visibility').addEventListener('change', e => {
  selectedVisibility = e.target.value;
});

document.querySelectorAll('#food-field-status .segmented-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('#food-field-status .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
    if (currentEditId) {
      await updateDoc(doc(db, 'foodItems', currentEditId), { status: btn.dataset.value });
    }
  });
});

// ---------------- Filter bar (tap-to-cycle) ----------------
const statusCycleBtn = document.getElementById('food-status-cycle');
statusCycleBtn.addEventListener('click', () => {
  statusFilterIndex = (statusFilterIndex + 1) % STATUS_FILTER_STATES.length;
  statusCycleBtn.textContent = STATUS_FILTER_STATES[statusFilterIndex].label;
  renderList();
});
const categoryCycleBtn = document.getElementById('food-category-cycle');
categoryCycleBtn.addEventListener('click', () => {
  categoryFilterIndex = (categoryFilterIndex + 1) % CATEGORY_FILTER_STATES.length;
  categoryCycleBtn.textContent = CATEGORY_FILTER_STATES[categoryFilterIndex].label;
  renderList();
});
const costCycleBtn = document.getElementById('food-cost-cycle');
costCycleBtn.addEventListener('click', () => {
  costFilterIndex = (costFilterIndex + 1) % COST_FILTER_STATES.length;
  costCycleBtn.textContent = COST_FILTER_STATES[costFilterIndex].label;
  renderList();
});

function getFilters() {
  return {
    status: STATUS_FILTER_STATES[statusFilterIndex].value,
    category: CATEGORY_FILTER_STATES[categoryFilterIndex].value,
    cost: COST_FILTER_STATES[costFilterIndex].value
  };
}

// ---------------- Live data ----------------
onSnapshot(query(colRef, orderBy('createdAt', 'desc')), snap => {
  allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
  if (currentEditId) {
    const fresh = allItems.find(i => i.id === currentEditId);
    if (fresh) renderRatingsSection(fresh);
  }
});

// ---------------- Visit helpers ----------------
function userVisits(item, user) {
  return (item.visits || []).filter(v => v.user === user && !v.skipped);
}
function userOverallAverage(item, user) {
  const visits = userVisits(item, user);
  if (visits.length === 0) return null;
  return visits.reduce((s, v) => s + v.overall, 0) / visits.length;
}
function userSkippedFood(item, user) {
  return (item.visits || []).some(v => v.user === user && v.skipped);
}

// ---------------- List rendering ----------------
function renderList() {
  const f = getFilters();
  const list = allItems.filter(item => {
    if (f.status !== 'all' && item.status !== f.status) return false;
    if (item.visibility === 'private' && item.addedBy !== getCurrentUser()) return false;
    if (f.category !== 'all' && item.category !== f.category) return false;
    if (f.cost !== 'all' && item.cost !== f.cost) return false;
    return true;
  });

  const container = document.getElementById('food-list');
  const empty = document.getElementById('food-empty');
  container.innerHTML = '';
  empty.classList.toggle('hidden', list.length > 0);

  list
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .forEach(item => container.appendChild(renderRow(item)));
}

function renderRow(item) {
  const row = document.createElement('div');
  row.className = 'food-row' + (item.status === 'visited' ? ' is-visited' : '');

  const subLine = CATEGORY_LABELS[item.category] || item.category;
  const subLineFull = item.cost ? `${subLine} · ${item.cost}` : subLine;

  let scoresHtml = '';
  if (item.status === 'visited') {
    scoresHtml = '<div class="food-row-scores">' + USERS.map(u => {
      const avg = userOverallAverage(item, u);
      if (avg !== null) return `<span class="food-score-badge">${u} <strong>${avg.toFixed(1)}</strong></span>`;
      if (userSkippedFood(item, u)) return `<span class="food-score-badge user-rating-skipped">${u}: wasn't there</span>`;
      return `<span class="food-score-badge"><span class="user-rating-empty">${u}: not yet</span></span>`;
    }).join('') + '</div>';
  }

  row.innerHTML = `
    <div class="food-row-main">
      <p class="food-row-title">${escapeHtml(item.name)}</p>
      <p class="food-row-sub">${escapeHtml(subLineFull)}</p>
    </div>
    ${scoresHtml}
    <span class="food-row-chevron">›</span>
  `;

  row.addEventListener('click', () => openDetailModal(item));
  return row;
}

// ---------------- Add / Detail modal ----------------
const foodModal = document.getElementById('food-modal');
const foodForm = document.getElementById('food-form');

document.getElementById('food-add-btn').addEventListener('click', () => openAddModal());

function setCostUI(value) {
  selectedCost = value;
  document.querySelectorAll('#food-field-cost .segmented-btn').forEach(b =>
    b.classList.toggle('active', value !== null && b.dataset.value === value)
  );
}
function setFoodStatusUI(value) {
  document.querySelectorAll('#food-field-status .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === value)
  );
}

function openAddModal() {
  currentEditId = null;
  document.getElementById('food-modal-title').textContent = 'Add somewhere to try';
  document.getElementById('food-field-name').value = '';
  document.getElementById('food-field-id').value = '';
  document.getElementById('food-field-category').value = 'restaurant';
  document.getElementById('food-delete-btn').classList.add('hidden');
  document.getElementById('food-edit-only').classList.add('hidden');
  selectedLocations = [''];
  selectedVisibility = 'shared';
  document.getElementById('food-field-visibility').value = 'shared';
  setCostUI(null);
  renderLocationFields();
  foodModal.classList.remove('hidden');
}

function openDetailModal(item) {
  currentEditId = item.id;
  document.getElementById('food-modal-title').textContent = item.name;
  document.getElementById('food-field-name').value = item.name;
  document.getElementById('food-field-id').value = item.id;
  document.getElementById('food-field-category').value = item.category;
  document.getElementById('food-delete-btn').classList.remove('hidden');
  document.getElementById('food-edit-only').classList.remove('hidden');
  selectedLocations = item.locations && item.locations.length > 0 ? [...item.locations] : [''];
  selectedVisibility = item.visibility || 'shared';
  document.getElementById('food-field-visibility').value = selectedVisibility;
  setCostUI(item.cost || null);
  setFoodStatusUI(item.status);
  renderLocationFields();

  document.getElementById('food-meta-addedby').textContent = `Added by ${item.addedBy}`;

  renderRatingsSection(item);
  foodModal.classList.remove('hidden');
}

function renderRatingsSection(item) {
  const isVisited = item.status === 'visited';
  document.getElementById('food-rating-hint').classList.toggle('hidden', isVisited);
  document.getElementById('food-ratings-block').classList.toggle('hidden', !isVisited);
  if (!isVisited) return;

  const me = getCurrentUser();
  const other = USERS.find(u => u !== me) || USERS[0];

  const otherAvg = userOverallAverage(item, other);
  const otherWrap = document.getElementById('food-ratings-others');
  let otherHtml;
  if (otherAvg !== null) {
    otherHtml = `<strong>${otherAvg.toFixed(1)}</strong> / 10`;
  } else if (userSkippedFood(item, other)) {
    otherHtml = `<span class="user-rating-skipped">wasn't there</span>`;
  } else {
    otherHtml = `<span class="user-rating-empty">no rating yet</span>`;
  }
  otherWrap.innerHTML = `<p class="other-score-line"><strong>${other}</strong>: ${otherHtml}</p>`;

  editingVisitIndex = null;
  document.getElementById('food-rate-own-label').textContent = `${me}'s visit`;
  document.getElementById('food-add-visit-btn').textContent = 'Save visit';
  SCORE_FIELDS.forEach(f => { document.getElementById(`food-score-${f}`).value = ''; });
  document.getElementById('food-field-review').value = '';

  const all = (item.visits || []).map((v, i) => ({ ...v, _idx: i })).reverse();
  const historyWrap = document.getElementById('food-rate-history');
  if (all.length === 0) {
    historyWrap.innerHTML = '';
  } else {
    historyWrap.innerHTML = '<div class="section-divider">History</div>' + all.map(v => {
      const isMine = v.user === me;
      const dateLabel = formatHistoryDate(v.visitedAt);
      const actions = isMine ? `<span class="rate-history-actions">
          ${v.skipped ? '' : `<button type="button" class="history-edit-btn" data-idx="${v._idx}">Edit</button>`}
          <button type="button" class="history-delete-btn" data-idx="${v._idx}">Delete</button>
        </span>` : '';
      const body = v.skipped
        ? `${v.user} · wasn't there`
        : `${v.user} · ${v.overall.toFixed(1)} / 10${v.review ? `<br/><span style="opacity:.8;">${escapeHtml(v.review)}</span>` : ''}`;
      return `
        <div class="rate-history-entry">
          <div class="rate-history-top">
            <strong class="rate-history-date">${dateLabel}</strong>
            ${actions}
          </div>
          <div class="rate-history-body">${body}</div>
        </div>
      `;
    }).join('');

    historyWrap.querySelectorAll('.history-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => startEditVisit(item, parseInt(btn.dataset.idx, 10)));
    });
    historyWrap.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteVisitEntry(item, parseInt(btn.dataset.idx, 10)));
    });
  }
}

function startEditVisit(item, idx) {
  const entry = item.visits[idx];
  if (!entry || entry.skipped) return;
  editingVisitIndex = idx;
  SCORE_FIELDS.forEach(f => {
    document.getElementById(`food-score-${f}`).value = entry.scores && entry.scores[f] !== undefined ? entry.scores[f] : '';
  });
  document.getElementById('food-field-review').value = entry.review || '';
  document.getElementById('food-rate-own-label').textContent = `Editing ${entry.user}'s visit from ${formatHistoryDate(entry.visitedAt)}`;
  document.getElementById('food-add-visit-btn').textContent = 'Update visit';
  document.getElementById('food-rate-own').scrollIntoView?.({ block: 'center' });
}

async function deleteVisitEntry(item, idx) {
  if (!confirm('Delete this visit?')) return;
  const id = document.getElementById('food-field-id').value;
  const updatedVisits = item.visits.filter((_, i) => i !== idx);
  await updateDoc(doc(db, 'foodItems', id), { visits: updatedVisits });
  if (editingVisitIndex === idx) {
    editingVisitIndex = null;
    SCORE_FIELDS.forEach(f => { document.getElementById(`food-score-${f}`).value = ''; });
    document.getElementById('food-add-visit-btn').textContent = 'Save visit';
  }
}

foodForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('food-field-id').value;
  const name = document.getElementById('food-field-name').value.trim();
  if (!name) return;
  const category = document.getElementById('food-field-category').value;
  const locations = selectedLocations.map(l => l.trim()).filter(l => l.length > 0);

  if (id) {
    await updateDoc(doc(db, 'foodItems', id), {
      name, category, cost: selectedCost, locations, visibility: selectedVisibility
    });
  } else {
    await addDoc(colRef, {
      name,
      category,
      cost: selectedCost,
      locations,
      visibility: selectedVisibility,
      status: 'to_try',
      addedBy: getCurrentUser(),
      createdAt: serverTimestamp(),
      visits: []
    });
  }
  foodModal.classList.add('hidden');
});

document.getElementById('food-delete-btn').addEventListener('click', async () => {
  const id = document.getElementById('food-field-id').value;
  if (id && confirm('Delete this place?')) {
    await deleteDoc(doc(db, 'foodItems', id));
    foodModal.classList.add('hidden');
  }
});

document.getElementById('food-add-visit-btn').addEventListener('click', async () => {
  const id = document.getElementById('food-field-id').value;
  const item = allItems.find(i => i.id === id);
  const scores = {};
  let filledCount = 0;
  SCORE_FIELDS.forEach(f => {
    const raw = document.getElementById(`food-score-${f}`).value;
    const num = raw === '' ? 0 : Math.max(0, Math.min(10, parseFloat(raw)));
    scores[f] = num;
    if (raw !== '') filledCount++;
  });
  if (filledCount === 0) { alert('Add at least one score first.'); return; }

  const overall = SCORE_FIELDS.reduce((s, f) => s + scores[f], 0) / SCORE_FIELDS.length;
  const review = document.getElementById('food-field-review').value.trim();
  const me = getCurrentUser();

  let updatedVisits;
  if (editingVisitIndex !== null) {
    updatedVisits = [...item.visits];
    updatedVisits[editingVisitIndex] = {
      ...updatedVisits[editingVisitIndex],
      scores, overall, review
    };
    editingVisitIndex = null;
  } else {
    const withoutMineSkipped = (item.visits || []).filter(v => !(v.user === me && v.skipped));
    const newVisit = { user: me, scores, overall, review, visitedAt: new Date().toISOString() };
    updatedVisits = [...withoutMineSkipped, newVisit];
  }

  await updateDoc(doc(db, 'foodItems', id), { visits: updatedVisits, status: 'visited' });
  setFoodStatusUI('visited');
  document.getElementById('food-add-visit-btn').textContent = 'Save visit';
  document.getElementById('food-rate-own-label').textContent = `${getCurrentUser()}'s visit`;
});

document.getElementById('food-skip-btn').addEventListener('click', async () => {
  const id = document.getElementById('food-field-id').value;
  const item = allItems.find(i => i.id === id);
  const me = getCurrentUser();
  const withoutMine = (item.visits || []).filter(v => v.user !== me);
  const updatedVisits = [...withoutMine, { user: me, skipped: true, visitedAt: new Date().toISOString() }];
  await updateDoc(doc(db, 'foodItems', id), { visits: updatedVisits });
});
