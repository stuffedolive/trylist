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

const colRef = collection(db, 'watchItems');
let allItems = [];
let selectedTags = [];       // for the add/edit form
let selectedFormat = 'movie';
let selectedRateLocation = 'home';
let selectedStars = 0;

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

document.querySelectorAll('#rate-field-location .segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRateLocation = btn.dataset.value;
    document.querySelectorAll('#rate-field-location .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
  });
});

// ---------------- Live data ----------------
onSnapshot(query(colRef, orderBy('createdAt', 'desc')), snap => {
  allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
});

// ---------------- Filtering ----------------
['watch-filter-status', 'watch-filter-format', 'watch-filter-tag', 'watch-filter-addedby']
  .forEach(id => document.getElementById(id).addEventListener('change', renderList));

function getFilters() {
  return {
    status: document.getElementById('watch-filter-status').value,
    format: document.getElementById('watch-filter-format').value,
    tag: document.getElementById('watch-filter-tag').value,
    addedBy: document.getElementById('watch-filter-addedby').value
  };
}

function averageStars(item) {
  const ratings = item.ratings || [];
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((s, r) => s + r.stars, 0);
  return sum / ratings.length;
}

function starString(value) {
  if (value === null) return '';
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '');
}

function renderList() {
  const f = getFilters();
  const list = allItems.filter(item => {
    if (f.status !== 'all' && item.status !== f.status) return false;
    if (f.format !== 'all' && item.format !== f.format) return false;
    if (f.tag !== 'all' && !(item.tags || []).includes(f.tag)) return false;
    if (f.addedBy !== 'all' && item.addedBy !== f.addedBy) return false;
    return true;
  });

  const container = document.getElementById('watch-list');
  const empty = document.getElementById('watch-empty');
  container.innerHTML = '';
  empty.classList.toggle('hidden', list.length > 0);

  list.forEach(item => container.appendChild(renderCard(item)));
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'watch-card' + (item.status === 'watched' ? ' is-watched' : '');

  const avg = averageStars(item);

  card.innerHTML = `
    <div class="watch-card-top">
      <div>
        <p class="watch-card-title">${escapeHtml(item.title)}</p>
        <span class="watch-card-format">${item.format}</span>
      </div>
    </div>
    <div class="watch-card-tags">
      ${(item.tags || []).map(t => `<span class="watch-card-tag">${t}</span>`).join('')}
    </div>
    <div class="watch-card-footer">
      <span class="watch-card-addedby">added by ${item.addedBy}</span>
      <span class="watch-card-rating">${avg !== null ? starString(avg) + ' ' + avg.toFixed(1) : ''}</span>
    </div>
    <div class="watch-card-actions">
      <button data-action="edit">Edit</button>
      <button data-action="toggle">${item.status === 'watched' ? 'Mark to-watch' : 'Mark watched'}</button>
      <button data-action="rate" class="primary">Rate / review</button>
    </div>
  `;

  card.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(item));
  card.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleStatus(item));
  card.querySelector('[data-action="rate"]').addEventListener('click', () => openRateModal(item));

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function toggleStatus(item) {
  const newStatus = item.status === 'watched' ? 'to_watch' : 'watched';
  await updateDoc(doc(db, 'watchItems', item.id), { status: newStatus });
}

// ---------------- Add / Edit modal ----------------
const watchModal = document.getElementById('watch-modal');
const watchForm = document.getElementById('watch-form');

document.getElementById('watch-add-btn').addEventListener('click', () => openAddModal());

function openAddModal() {
  document.getElementById('watch-modal-title').textContent = 'Add something to watch';
  document.getElementById('watch-field-title').value = '';
  document.getElementById('watch-field-id').value = '';
  document.getElementById('watch-delete-btn').classList.add('hidden');
  selectedTags = [];
  selectedFormat = 'movie';
  document.querySelectorAll('#watch-field-format .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === 'movie')
  );
  renderTagPicker();
  watchModal.classList.remove('hidden');
}

function openEditModal(item) {
  document.getElementById('watch-modal-title').textContent = 'Edit';
  document.getElementById('watch-field-title').value = item.title;
  document.getElementById('watch-field-id').value = item.id;
  document.getElementById('watch-delete-btn').classList.remove('hidden');
  selectedTags = [...(item.tags || [])];
  selectedFormat = item.format;
  document.querySelectorAll('#watch-field-format .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === item.format)
  );
  renderTagPicker();
  watchModal.classList.remove('hidden');
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

// ---------------- Rate / review modal ----------------
const rateModal = document.getElementById('rate-modal');
const rateForm = document.getElementById('rate-form');

function renderStarPicker() {
  const wrap = document.getElementById('star-picker');
  wrap.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.dataset.value = i;
    star.textContent = selectedStars >= i ? '★' : (selectedStars >= i - 0.5 ? '⯨' : '☆');
    star.addEventListener('click', e => {
      const rect = star.getBoundingClientRect();
      const clickedHalf = (e.clientX - rect.left) < rect.width / 2;
      selectedStars = clickedHalf ? i - 0.5 : i;
      renderStarPicker();
    });
    wrap.appendChild(star);
  }
}

function openRateModal(item) {
  document.getElementById('rate-modal-title').textContent = `Rate & review — ${item.title}`;
  document.getElementById('rate-field-itemid').value = item.id;
  document.getElementById('rate-field-review').value = '';
  selectedStars = 0;
  selectedRateLocation = 'home';
  document.querySelectorAll('#rate-field-location .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === 'home')
  );
  renderStarPicker();

  const historyWrap = document.getElementById('rate-history');
  const ratings = item.ratings || [];
  if (ratings.length === 0) {
    historyWrap.innerHTML = '<p style="opacity:.6;font-size:.85rem;">No ratings yet.</p>';
  } else {
    historyWrap.innerHTML = ratings
      .slice()
      .reverse()
      .map(r => `
        <div class="rate-history-entry">
          <strong>${r.user}</strong> · ${starString(r.stars)} (${r.stars}) · ${r.location}
          ${r.review ? `<br/><span style="opacity:.8;">${escapeHtml(r.review)}</span>` : ''}
        </div>
      `).join('');
  }

  rateModal.classList.remove('hidden');
}

rateForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (selectedStars === 0) { alert('Pick a star rating first.'); return; }
  const id = document.getElementById('rate-field-itemid').value;
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

  rateModal.classList.add('hidden');
});
