import { db } from './firebase.js';
import { getCurrentUser } from './user.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const TAG_OPTIONS = [
  'Documentary', 'Drama', 'Comedy', 'Thriller', 'Sci-Fi',
  'Fantasy', 'Horror', 'Romance', 'Crime', 'Action', 'Animation', 'Reality'
];
const USERS = ['Jade', 'John'];

const colRef = collection(db, 'watchItems');
let allItems = [];
let selectedTags = [];
let selectedFormat = 'movie';
let selectedStatus = 'to_watch';   // for the add/edit form's status toggle
let selectedRateLocation = 'home';
let selectedStars = 0;
let currentEditId = null;
let statusFilter = 'to_watch';     // for the filter bar toggle

// ---------------- Star rendering (real half-star support, no special glyph) ----------------
function starsHtml(value, sizeClass = '') {
  let html = `<span class="star-row ${sizeClass}">`;
  for (let i = 1; i <= 5; i++) {
    let fill = 0;
    if (value >= i) fill = 100;
    else if (value >= i - 0.5) fill = 50;
    html += `<span class="star-slot" data-index="${i}">
        <span class="star-empty">★</span>
        <span class="star-fill" style="width:${fill}%">★</span>
      </span>`;
  }
  html += '</span>';
  return html;
}

// ---------------- Populate static UI ----------------
function populateTagFilterOptions() {
  const sel = document.getElementById('watch-filter-tag');
  TAG_OPTIONS.forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    sel.appendChild(opt);
  });
}
populateTagFilterOptions();

function renderTagPicker() {
  const wrap = document.getElementById('watch-field-tags');
  wrap.innerHTML = '';
  TAG_OPTIONS.forEach(tag => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip' + (selectedTags.includes(tag) ? ' selected' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
      } else {
        selectedTags.push(tag);
      }
      renderTagPicker();
    });
    wrap.appendChild(chip);
  });
}

document.querySelectorAll('#watch-field-format .segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedFormat = btn.dataset.value;
    document.querySelectorAll('#watch-field-format .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
  });
});

document.querySelectorAll('#watch-field-status .segmented-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    selectedStatus = btn.dataset.value;
    document.querySelectorAll('#watch-field-status .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
    if (currentEditId) {
      await updateDoc(doc(db, 'watchItems', currentEditId), { status: selectedStatus });
    }
  });
});

document.querySelectorAll('#rate-field-location .segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRateLocation = btn.dataset.value;
    document.querySelectorAll('#rate-field-location .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
  });
});

// Filter bar status toggle (To Watch / Watched — no "all")
document.querySelectorAll('#watch-status-toggle .segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    statusFilter = btn.dataset.value;
    document.querySelectorAll('#watch-status-toggle .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
    renderList();
  });
});

// ---------------- Live data ----------------
onSnapshot(query(colRef, orderBy('createdAt', 'desc')), snap => {
  allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
  // Keep an open detail modal in sync with live updates
  if (currentEditId) {
    const fresh = allItems.find(i => i.id === currentEditId);
    if (fresh) renderRatingsSection(fresh);
  }
});

['watch-filter-format', 'watch-filter-tag', 'watch-filter-addedby']
  .forEach(id => document.getElementById(id).addEventListener('change', renderList));

function getFilters() {
  return {
    status: statusFilter,
    format: document.getElementById('watch-filter-format').value,
    tag: document.getElementById('watch-filter-tag').value,
    addedBy: document.getElementById('watch-filter-addedby').value
  };
}

function userRatings(item, user) {
  return (item.ratings || []).filter(r => r.user === user);
}
function userAverage(item, user) {
  const ratings = userRatings(item, user);
  if (ratings.length === 0) return null;
  return ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- List rendering (list-row style) ----------------
function renderList() {
  const f = getFilters();
  const list = allItems.filter(item => {
    if (item.status !== f.status) return false;
    if (f.format !== 'all' && item.format !== f.format) return false;
    if (f.tag !== 'all' && !(item.tags || []).includes(f.tag)) return false;
    if (f.addedBy !== 'all' && item.addedBy !== f.addedBy) return false;
    return true;
  });

  const container = document.getElementById('watch-list');
  const empty = document.getElementById('watch-empty');
  container.innerHTML = '';
  empty.classList.toggle('hidden', list.length > 0);

  list.forEach(item => container.appendChild(renderRow(item)));
}

function renderRow(item) {
  const row = document.createElement('div');
  row.className = 'watch-row' + (item.status === 'watched' ? ' is-watched' : '');

  const genreLine = (item.tags || []).join(' · ') || item.format;

  let ratingsHtml = '';
  if (item.status === 'watched') {
    ratingsHtml = '<div class="watch-row-ratings">' + USERS.map(u => {
      const avg = userAverage(item, u);
      return `<span class="watch-row-rating-user">${u} ${avg !== null ? starsHtml(avg, 'small') : '<span class="user-rating-empty">not yet</span>'}</span>`;
    }).join('') + '</div>';
  }

  row.innerHTML = `
    <div class="watch-row-main">
      <p class="watch-row-title">${escapeHtml(item.title)}</p>
      <p class="watch-row-sub">${escapeHtml(genreLine)}</p>
    </div>
    ${ratingsHtml}
    <span class="watch-row-chevron">›</span>
  `;

  row.addEventListener('click', () => openDetailModal(item));
  return row;
}

// ---------------- Add / Detail modal ----------------
const watchModal = document.getElementById('watch-modal');
const watchForm = document.getElementById('watch-form');

document.getElementById('watch-add-btn').addEventListener('click', () => openAddModal());

function setFormatUI(value) {
  selectedFormat = value;
  document.querySelectorAll('#watch-field-format .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === value)
  );
}
function setStatusUI(value) {
  selectedStatus = value;
  document.querySelectorAll('#watch-field-status .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === value)
  );
}

function openAddModal() {
  currentEditId = null;
  document.getElementById('watch-modal-title').textContent = 'Add something to watch';
  document.getElementById('watch-field-title').value = '';
  document.getElementById('watch-field-id').value = '';
  document.getElementById('watch-delete-btn').classList.add('hidden');
  document.getElementById('watch-edit-only').classList.add('hidden');
  selectedTags = [];
  setFormatUI('movie');
  renderTagPicker();
  watchModal.classList.remove('hidden');
}

function openDetailModal(item) {
  currentEditId = item.id;
  document.getElementById('watch-modal-title').textContent = item.title;
  document.getElementById('watch-field-title').value = item.title;
  document.getElementById('watch-field-id').value = item.id;
  document.getElementById('watch-delete-btn').classList.remove('hidden');
  document.getElementById('watch-edit-only').classList.remove('hidden');
  selectedTags = [...(item.tags || [])];
  setFormatUI(item.format);
  setStatusUI(item.status);
  renderTagPicker();

  document.getElementById('watch-meta-addedby').textContent = `Added by ${item.addedBy}`;

  renderRatingsSection(item);
  watchModal.classList.remove('hidden');
}

function renderRatingsSection(item) {
  const me = getCurrentUser();
  const other = USERS.find(u => u !== me) || USERS[0];

  // Other person's rating(s) — read only
  const otherRatings = userRatings(item, other);
  const otherWrap = document.getElementById('watch-ratings-others');
  const otherAvg = userAverage(item, other);
  otherWrap.innerHTML = `
    <div class="user-rating-line">
      <strong>${other}</strong>
      ${otherAvg !== null ? starsHtml(otherAvg, 'small') + ` <span>${otherAvg.toFixed(1)}</span>` : '<span class="user-rating-empty">no rating yet</span>'}
    </div>
  `;

  document.getElementById('watch-rate-own-label').textContent = `${me}'s rating`;
  selectedStars = 0;
  selectedRateLocation = 'home';
  document.querySelectorAll('#rate-field-location .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === 'home')
  );
  document.getElementById('rate-field-review').value = '';
  renderStarPicker();

  // Full chronological history, both users
  const all = (item.ratings || []).slice().reverse();
  const historyWrap = document.getElementById('watch-rate-history');
  if (all.length === 0) {
    historyWrap.innerHTML = '';
  } else {
    historyWrap.innerHTML = '<div class="section-divider">History</div>' + all.map(r => `
      <div class="rate-history-entry">
        <strong>${r.user}</strong> · ${starsHtml(r.stars, 'small')} (${r.stars}) · ${r.location}
        ${r.review ? `<br/><span style="opacity:.8;">${escapeHtml(r.review)}</span>` : ''}
      </div>
    `).join('');
  }
}

function renderStarPicker() {
  const wrap = document.getElementById('star-picker');
  wrap.innerHTML = starsHtml(selectedStars, 'picker');
  wrap.querySelectorAll('.star-slot').forEach(slot => {
    slot.addEventListener('click', e => {
      const i = parseInt(slot.dataset.index, 10);
      const rect = slot.getBoundingClientRect();
      const clickedHalf = (e.clientX - rect.left) < rect.width / 2;
      selectedStars = clickedHalf ? i - 0.5 : i;
      renderStarPicker();
    });
  });
}

watchForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('watch-field-id').value;
  const title = document.getElementById('watch-field-title').value.trim();
  if (!title) return;

  if (id) {
    await updateDoc(doc(db, 'watchItems', id), {
      title, format: selectedFormat, tags: selectedTags
    });
  } else {
    await addDoc(colRef, {
      title,
      format: selectedFormat,
      tags: selectedTags,
      status: 'to_watch',
      addedBy: getCurrentUser(),
      createdAt: serverTimestamp(),
      ratings: []
    });
  }
  watchModal.classList.add('hidden');
});

document.getElementById('watch-delete-btn').addEventListener('click', async () => {
  const id = document.getElementById('watch-field-id').value;
  if (id && confirm('Delete this item?')) {
    await deleteDoc(doc(db, 'watchItems', id));
    watchModal.classList.add('hidden');
  }
});

document.getElementById('watch-add-rating-btn').addEventListener('click', async () => {
  if (selectedStars === 0) { alert('Pick a star rating first.'); return; }
  const id = document.getElementById('watch-field-id').value;
  const item = allItems.find(i => i.id === id);
  const review = document.getElementById('rate-field-review').value.trim();

  const newRating = {
    user: getCurrentUser(),
    stars: selectedStars,
    location: selectedRateLocation,
    review,
    watchedAt: new Date().toISOString()
  };

  const updatedRatings = [...(item.ratings || []), newRating];
  await updateDoc(doc(db, 'watchItems', id), {
    ratings: updatedRatings,
    status: 'watched'
  });
  setStatusUI('watched');
});
