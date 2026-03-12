// board.js
// Responsible for rendering user's board and UI interactions

let state = {
  board: [],    // array of 25 {phrase, url}
  name: ''
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  fetchBoard();
  setupModals();
  document.getElementById('signoutBtn').addEventListener('click', signout);
}

async function fetchBoard() {
  try {
    const data = await api('/api/board');
    state.board = data.board;
    state.name = data.name;
    document.getElementById('welcome').textContent = `Signed in as ${state.name}`;
    renderBoard();
  } catch (err) {
    // redirect to sign in if not authenticated
    window.location = '/signin.html';
  }
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  state.board.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = 'cell' + (cell.url ? ' linked' : '');
    div.tabIndex = 0;
    if (cell.url) {
      const a = document.createElement('a');
      a.href = cell.url;
      a.target = '_blank';
      a.textContent = cell.phrase;
      div.appendChild(a);
    } else {
      div.textContent = cell.phrase;
    }
    div.addEventListener('click', () => openUrlModal(idx));
    div.addEventListener('keydown', (e) => { if (e.key === 'Enter') openUrlModal(idx); });
    boardEl.appendChild(div);
  });

  checkBingoAndShow();
}

function setupModals() {
  // url modal
  window.currentEditIndex = null;
  const urlModal = document.getElementById('urlModal');
  const urlInput = document.getElementById('urlInput');
  document.getElementById('urlSave').addEventListener('click', async () => {
    const val = urlInput.value.trim();
    if (val.length === 0) {
      showUrlError('Please enter a URL or click Clear to remove.');
      return;
    }
    if (!validateUrl(val)) {
      showUrlError('Invalid URL (must start with http:// or https://)');
      return;
    }
    await saveCellUrl(window.currentEditIndex, val);
    closeUrlModal();
  });
  document.getElementById('urlClear').addEventListener('click', async () => {
    await saveCellUrl(window.currentEditIndex, null);
    closeUrlModal();
  });
  document.getElementById('urlCancel').addEventListener('click', closeUrlModal);

  // bingo modal
  const bingoModal = document.getElementById('bingoModal');
  document.getElementById('bingoSubmit').addEventListener('click', async () => {
    try {
      await api('/api/bingo', { method: 'POST', body: JSON.stringify({ snapshot: state.board }) });
      alert('Win submitted! See winners page.');
      closeBingoModal();
      window.location = '/winners.html';
    } catch (err) {
      alert('Failed to submit bingo: ' + (err.message || ''));
    }
  });
  document.getElementById('bingoCancel').addEventListener('click', closeBingoModal);
}

function openUrlModal(index) {
  window.currentEditIndex = index;
  const modal = document.getElementById('urlModal');
  const input = document.getElementById('urlInput');
  const err = document.getElementById('urlError');
  err.classList.add('hidden');
  const current = state.board[index];
  input.value = current.url || '';
  modal.classList.remove('hidden');
  input.focus();
}

function closeUrlModal() {
  const modal = document.getElementById('urlModal');
  modal.classList.add('hidden');
  window.currentEditIndex = null;
}

function showUrlError(msg) {
  const el = document.getElementById('urlError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function saveCellUrl(index, urlOrNull) {
  try {
    await api('/api/board/update', { method: 'POST', body: JSON.stringify({ index, url: urlOrNull }) });
    // update local state then re-render
    state.board[index].url = urlOrNull;
    renderBoard();
  } catch (err) {
    alert('Failed to save: ' + (err.message || ''));
  }
}

function checkBingoAndShow() {
  if (hasBingo(state.board.map(c => !!c.url))) {
    // show Bingo modal
    document.getElementById('bingoModal').classList.remove('hidden');
  } else {
    document.getElementById('bingoModal').classList.add('hidden');
  }
}

function closeBingoModal() {
  document.getElementById('bingoModal').classList.add('hidden');
}

// bingo checking: board is 25 booleans: true if filled
function hasBingo(bools) {
  if (!Array.isArray(bools) || bools.length !== 25) return false;
  // rows
  for (let r = 0; r < 5; r++) {
    let ok = true;
    for (let c = 0; c < 5; c++) if (!bools[r * 5 + c]) { ok = false; break; }
    if (ok) return true;
  }
  // cols
  for (let c = 0; c < 5; c++) {
    let ok = true;
    for (let r = 0; r < 5; r++) if (!bools[r * 5 + c]) { ok = false; break; }
    if (ok) return true;
  }
  // diag TL-BR
  let ok = true;
  for (let i = 0; i < 5; i++) if (!bools[i * 6]) { ok = false; break; } // indices 0,6,12,18,24
  if (ok) return true;
  // diag TR-BL
  ok = true;
  for (let i = 1; i <= 5; i++) if (!bools[i * 4]) { ok = false; break; } // indices 4,8,12,16,20
  if (ok) return true;
  return false;
}

async function signout() {
  await api('/api/signout', { method: 'POST' });
  window.location = '/';
}