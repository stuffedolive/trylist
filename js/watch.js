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
let selectedVisibility = 'shared';
let selectedStatus = 'to_watch';   // for the add/edit form's status toggle
let selectedRateLocation = 'home';
let selectedStars = 0;
let editingRatingIndex = null;

function formatHistoryDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
let currentEditId = null;
let statusFilterIndex = 0;  // filter bar: To Watch / Watched
let formatFilterIndex = 0;  // filter bar: Movie+Series / Movies / Series
const STATUS_FILTER_STATES = [
  { value: 'to_watch', label: 'To Watch' },
  { value: 'watched', label: 'Watched' }
];
const FORMAT_FILTER_STATES = [
  { value: 'all', label: 'Movie + Series' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' }
];

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

document.getElementById('watch-field-visibility').addEventListener('change', e => {
  selectedVisibility = e.target.value;
});

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

document.querySelectorAll('#watch-field-vote .segmented-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const value = parseInt(btn.dataset.value, 10);
    document.querySelectorAll('#watch-field-vote .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
    if (currentEditId) {
      await updateDoc(doc(db, 'watchItems', currentEditId), { [`votes.${getCurrentUser()}`]: value });
    }
  });
});

document.getElementById('watch-vote-clear-btn').addEventListener('click', async () => {
  document.querySelectorAll('#watch-field-vote .segmented-btn').forEach(b => b.classList.remove('active'));
  if (currentEditId) {
    await updateDoc(doc(db, 'watchItems', currentEditId), { [`votes.${getCurrentUser()}`]: 0 });
  }
});
document.querySelectorAll('#rate-field-location .segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRateLocation = btn.dataset.value;
    document.querySelectorAll('#rate-field-location .segmented-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
  });
});

// Filter bar: tap-to-cycle buttons (To Watch/Watched, and Movie+Series/Movies/Series)
const statusCycleBtn = document.getElementById('watch-status-cycle');
statusCycleBtn.addEventListener('click', () => {
  statusFilterIndex = (statusFilterIndex + 1) % STATUS_FILTER_STATES.length;
  statusCycleBtn.textContent = STATUS_FILTER_STATES[statusFilterIndex].label;
  renderList();
});

const formatCycleBtn = document.getElementById('watch-format-cycle');
formatCycleBtn.addEventListener('click', () => {
  formatFilterIndex = (formatFilterIndex + 1) % FORMAT_FILTER_STATES.length;
  formatCycleBtn.textContent = FORMAT_FILTER_STATES[formatFilterIndex].label;
  renderList();
});

// ---------------- Live data ----------------
onSnapshot(query(colRef, orderBy('createdAt', 'desc')), snap => {
  allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList();
  // Keep an open detail modal in sync with live updates
  if (currentEditId) {
    const fresh = allItems.find(i => i.id === currentEditId);
    if (fresh) {
      renderVoteSection(fresh);
      renderRatingsSection(fresh);
    }
  }
});

document.getElementById('watch-filter-tag').addEventListener('change', renderList);

function getFilters() {
  return {
    status: STATUS_FILTER_STATES[statusFilterIndex].value,
    format: FORMAT_FILTER_STATES[formatFilterIndex].value,
    tag: document.getElementById('watch-filter-tag').value
  };
}

function userRatings(item, user) {
  return (item.ratings || []).filter(r => r.user === user && !r.skipped);
}
function userAverage(item, user) {
  const ratings = userRatings(item, user);
  if (ratings.length === 0) return null;
  return ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
}
function userSkipped(item, user) {
  return (item.ratings || []).some(r => r.user === user && r.skipped);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function voteScore(item) {
  const votes = item.votes || {};
  return (votes.Jade || 0) + (votes.John || 0);
}

function sortGroup(items, status) {
  return items.slice().sort((a, b) => {
    if (status === 'to_watch') {
      const scoreDiff = voteScore(b) - voteScore(a);
      if (scoreDiff !== 0) return scoreDiff;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

// ---------------- List rendering (list-row style) ----------------
function renderList() {
  const f = getFilters();
  const list = allItems.filter(item => {
    if (item.status !== f.status) return false;
    if (item.visibility === 'private' && item.addedBy !== getCurrentUser()) return false;
    if (f.format !== 'all' && item.format !== f.format) return false;
    if (f.tag !== 'all' && !(item.tags || []).includes(f.tag)) return false;
    return true;
  });

  const container = document.getElementById('watch-list');
  const empty = document.getElementById('watch-empty');
  container.innerHTML = '';
  empty.classList.toggle('hidden', list.length > 0);

  if (f.format === 'all') {
    // Series first, then Movies — each internally sorted
    const series = sortGroup(list.filter(i => i.format === 'series'), f.status);
    const movies = sortGroup(list.filter(i => i.format === 'movie'), f.status);
    if (series.length > 0) {
      container.appendChild(groupHeader('Series'));
      series.forEach(item => container.appendChild(renderRow(item)));
    }
    if (movies.length > 0) {
      container.appendChild(groupHeader('Movies'));
      movies.forEach(item => container.appendChild(renderRow(item)));
    }
  } else {
    sortGroup(list, f.status).forEach(item => container.appendChild(renderRow(item)));
  }
}

function groupHeader(label) {
  const h = document.createElement('p');
  h.className = 'list-group-header';
  h.textContent = label;
  return h;
}

function renderRow(item) {
  const row = document.createElement('div');
  row.className = 'watch-row' + (item.status === 'watched' ? ' is-watched' : '');

  const genreLine = (item.tags || []).join(' · ') || item.format;

  let ratingsHtml = '';
  if (item.status === 'watched') {
    ratingsHtml = '<div class="watch-row-ratings">' + USERS.map(u => {
      const avg = userAverage(item, u);
      if (avg !== null) return `<span class="watch-row-rating-user">${u} ${starsHtml(avg, 'small')}</span>`;
      if (userSkipped(item, u)) return `<span class="watch-row-rating-user user-rating-skipped">${u}: didn't watch</span>`;
      return `<span class="watch-row-rating-user"><span class="user-rating-empty">${u}: not yet</span></span>`;
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
  selectedVisibility = 'shared';
  document.getElementById('watch-field-visibility').value = 'shared';
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
  selectedVisibility = item.visibility || 'shared';
  document.getElementById('watch-field-visibility').value = selectedVisibility;
  setFormatUI(item.format);
  setStatusUI(item.status);
  renderTagPicker();

  document.getElementById('watch-meta-addedby').textContent = `Added by ${item.addedBy}`;

  renderVoteSection(item);
  renderRatingsSection(item);
  watchModal.classList.remove('hidden');
}

function renderVoteSection(item) {
  const isWatched = item.status === 'watched';
  document.getElementById('watch-vote-section').classList.toggle('hidden', isWatched);
  if (isWatched) return;

  const myVote = (item.votes || {})[getCurrentUser()] || 0;
  document.querySelectorAll('#watch-field-vote .segmented-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.value, 10) === myVote)
  );
}

function renderRatingsSection(item) {
  const isWatched = item.status === 'watched';
  document.getElementById('watch-rating-hint').classList.toggle('hidden', isWatched);
  document.getElementById('watch-ratings-block').classList.toggle('hidden', !isWatched);
  if (!isWatched) return;

  const me = getCurrentUser();
  const other = USERS.find(u => u !== me) || USERS[0];

  // Other person's rating(s) — read only
  const otherAvg = userAverage(item, other);
  const otherWrap = document.getElementById('watch-ratings-others');
  let otherHtml;
  if (otherAvg !== null) {
    otherHtml = starsHtml(otherAvg, 'small') + ` <span>${otherAvg.toFixed(1)}</span>`;
  } else if (userSkipped(item, other)) {
    otherHtml = `<span class="user-rating-skipped">didn't watch this</span>`;
  } else {
    otherHtml = `<span class="user-rating-empty">no rating yet</span>`;
  }
  otherWrap.innerHTML = `
    <div class="user-rating-line">
      <strong>${other}</strong>
      ${otherHtml}
    </div>
  `;

  editingRatingIndex = null;
  document.getElementById('watch-rate-own-label').textContent = `${me}'s rating`;
  document.getElementById('watch-add-rating-btn').textContent = 'Save rating';
  selectedStars = 0;
  selectedRateLocation = 'home';
  document.querySelectorAll('#rate-field-location .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === 'home')
  );
  document.getElementById('rate-field-review').value = '';
  renderStarPicker();

  // Full chronological history, both users — each entry knows its real array index
  const all = (item.ratings || []).map((r, i) => ({ ...r, _idx: i })).reverse();
  const historyWrap = document.getElementById('watch-rate-history');
  if (all.length === 0) {
    historyWrap.innerHTML = '';
  } else {
    historyWrap.innerHTML = '<div class="section-divider">History</div>' + all.map(r => {
      const isMine = r.user === me;
      const dateLabel = formatHistoryDate(r.watchedAt);
      const body = r.skipped
        ? `${r.user} · didn't watch`
        : `${r.user} · ${starsHtml(r.stars, 'small')} (${r.stars}) · ${r.location}${r.review ? `<br/><span style="opacity:.8;">${escapeHtml(r.review)}</span>` : ''}`;
      return `
        <div class="rate-history-entry">
          <div class="rate-history-top">
            <strong class="rate-history-date">${dateLabel}</strong>
            ${isMine ? `<span class="rate-history-actions">
              <button type="button" class="history-edit-btn" data-idx="${r._idx}">Edit</button>
              <button type="button" class="history-delete-btn" data-idx="${r._idx}">Delete</button>
            </span>` : ''}
          </div>
          <div class="rate-history-body">${body}</div>
        </div>
      `;
    }).join('');

    historyWrap.querySelectorAll('.history-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => startEditRating(item, parseInt(btn.dataset.idx, 10)));
    });
    historyWrap.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteRatingEntry(item, parseInt(btn.dataset.idx, 10)));
    });
  }
}

function startEditRating(item, idx) {
  const entry = item.ratings[idx];
  if (!entry || entry.skipped) return;
  editingRatingIndex = idx;
  selectedStars = entry.stars || 0;
  selectedRateLocation = entry.location || 'home';
  document.querySelectorAll('#rate-field-location .segmented-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === selectedRateLocation)
  );
  document.getElementById('rate-field-review').value = entry.review || '';
  renderStarPicker();
  document.getElementById('watch-rate-own-label').textContent = `Editing ${entry.user}'s entry from ${formatHistoryDate(entry.watchedAt)}`;
  document.getElementById('watch-add-rating-btn').textContent = 'Update rating';
  document.getElementById('star-picker').scrollIntoView?.({ block: 'center' });
}

async function deleteRatingEntry(item, idx) {
  if (!confirm('Delete this rating?')) return;
  const id = document.getElementById('watch-field-id').value;
  const updatedRatings = item.ratings.filter((_, i) => i !== idx);
  await updateDoc(doc(db, 'watchItems', id), { ratings: updatedRatings });
  if (editingRatingIndex === idx) {
    editingRatingIndex = null;
    selectedStars = 0;
    renderStarPicker();
    document.getElementById('watch-add-rating-btn').textContent = 'Save rating';
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
      title, format: selectedFormat, tags: selectedTags, visibility: selectedVisibility
    });
  } else {
    await addDoc(colRef, {
      title,
      format: selectedFormat,
      tags: selectedTags,
      visibility: selectedVisibility,
      status: 'to_watch',
      addedBy: getCurrentUser(),
      createdAt: serverTimestamp(),
      ratings: [],
      votes: {}
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

  let updatedRatings;
  if (editingRatingIndex !== null) {
    updatedRatings = [...item.ratings];
    updatedRatings[editingRatingIndex] = {
      ...updatedRatings[editingRatingIndex],
      stars: selectedStars,
      location: selectedRateLocation,
      review
    };
    editingRatingIndex = null;
  } else {
    const newRating = {
      user: getCurrentUser(),
      stars: selectedStars,
      location: selectedRateLocation,
      review,
      watchedAt: new Date().toISOString()
    };
    const withoutMineSkipped = (item.ratings || []).filter(r => !(r.user === getCurrentUser() && r.skipped));
    updatedRatings = [...withoutMineSkipped, newRating];
  }

  await updateDoc(doc(db, 'watchItems', id), {
    ratings: updatedRatings,
    status: 'watched'
  });
  setStatusUI('watched');
  document.getElementById('watch-add-rating-btn').textContent = 'Save rating';
  document.getElementById('watch-rate-own-label').textContent = `${getCurrentUser()}'s rating`;
});

document.getElementById('watch-skip-btn').addEventListener('click', async () => {
  const id = document.getElementById('watch-field-id').value;
  const item = allItems.find(i => i.id === id);
  const me = getCurrentUser();

  // Remove any prior skip/rating entries from this user first, then mark skipped
  const withoutMine = (item.ratings || []).filter(r => r.user !== me);
  const updatedRatings = [...withoutMine, { user: me, skipped: true, watchedAt: new Date().toISOString() }];

  await updateDoc(doc(db, 'watchItems', id), { ratings: updatedRatings });
});
