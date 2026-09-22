/**
 * CALIBHUB - CLIENT APPLICATION SCRIPT
 * Sistema de Consulta de Procedimentos e Bancada de Calibração
 */

let currentUser = null;
let currentToken = localStorage.getItem('calibhub_token') || null;
let instrumentsList = [];
let activeMeasurandFilter = '';
let activeInstrument = null;

// ============================================================
// INICIALIZAÇÃO & VERIFICAÇÃO DE SESSÃO (MODO DARK PERMANENTE)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  document.body.className = 'lab-body theme-dark';
  setupEventListeners();
  await checkAuthSession();
});

function lockBodyScroll() {
  document.body.classList.add('modal-open');
}

function unlockBodyScroll() {
  setTimeout(() => {
    const anyModalOpen = [
      document.getElementById('detailModal'),
      document.getElementById('formModal'),
      document.getElementById('usersModal'),
      document.getElementById('cameraModal'),
      document.getElementById('photoLightbox')
    ].some(m => m && m.style.display === 'flex');

    if (!anyModalOpen) {
      document.body.classList.remove('modal-open');
    }
  }, 40);
}

async function checkAuthSession() {
  if (!currentToken) {
    showLoginView();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${currentToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      showAppView();
      await loadInstruments();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Erro ao verificar sessão:', err);
    showLoginView();
  }
}

function showLoginView() {
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('appSection').style.display = 'none';
  document.getElementById('loginUsername').focus();
}

function showAppView() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('appSection').style.display = 'flex';

  // Atualiza perfil no Header
  const firstLetter = (currentUser.name || currentUser.username).charAt(0).toUpperCase();
  document.getElementById('headerAvatar').textContent = firstLetter;
  document.getElementById('headerUserName').textContent = currentUser.name;

  const roleBadge = document.getElementById('headerUserRole');
  roleBadge.textContent = currentUser.role.toUpperCase();
  roleBadge.className = `role-badge ${currentUser.role}`;

  // Controle de visibilidade baseado em perfil (RBAC)
  const isAdmin = currentUser.role === 'admin';
  document.getElementById('btnAdminPanel').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('btnNewInstrument').style.display = isAdmin ? 'inline-flex' : 'none';
  const mobileFab = document.getElementById('btnMobileFab');
  if (mobileFab) mobileFab.style.display = isAdmin ? 'inline-flex' : 'none';
  const tecBadge = document.getElementById('tecnicoNoticeBadge');
  if (tecBadge) tecBadge.style.display = isAdmin ? 'none' : 'inline-flex';
}

function prefillLogin(u, p) {
  document.getElementById('loginUsername').value = u;
  document.getElementById('loginPassword').value = p;
  clearFieldErrors();
  document.getElementById('loginUsername').focus();
}

// ============================================================
// AUTENTICAÇÃO: LOGIN & LOGOUT
// ============================================================

async function handleLogin(e) {
  e.preventDefault();
  clearFieldErrors();

  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const alertBox = document.getElementById('loginAlert');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  let hasError = false;

  if (!username) {
    showFieldError(usernameInput, 'loginUsernameError', 'O usuário não pode ficar em branco.');
    hasError = true;
  }

  if (!password) {
    showFieldError(passwordInput, 'loginPasswordError', 'A senha não pode ficar em branco.');
    hasError = true;
  }

  if (hasError) return;

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Validando credenciais...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alertBox.textContent = data.error || 'Falha ao autenticar.';
      alertBox.style.display = 'block';
      return;
    }

    currentToken = data.token;
    currentUser = data.user;
    localStorage.setItem('calibhub_token', currentToken);

    showAppView();
    await loadInstruments();
  } catch (err) {
    alertBox.textContent = 'Erro ao conectar ao servidor.';
    alertBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Entrar no Sistema';
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // Silencioso
  }
  currentToken = null;
  currentUser = null;
  localStorage.removeItem('calibhub_token');
  const mobileFab = document.getElementById('btnMobileFab');
  if (mobileFab) mobileFab.style.display = 'none';
  document.body.classList.remove('modal-open');
  showLoginView();
}

// ============================================================
// CARREGAMENTO & FILTRAGEM DE INSTRUMENTOS
// ============================================================

async function loadInstruments() {
  const query = document.getElementById('searchInput').value.trim();
  let url = `/api/instruments?query=${encodeURIComponent(query)}`;
  if (activeMeasurandFilter) {
    url += `&measurand=${encodeURIComponent(activeMeasurandFilter)}`;
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });

    if (!res.ok) {
      if (res.status === 401) return logout();
      throw new Error('Falha ao carregar instrumentos.');
    }

    const data = await res.json();
    instrumentsList = data.instruments || [];
    renderInstrumentsGrid();
  } catch (err) {
    console.error(err);
  }
}

function renderInstrumentsGrid() {
  const grid = document.getElementById('instrumentsGrid');
  const emptyState = document.getElementById('emptyState');
  const countLabel = document.getElementById('catalogCount');
  const statTotal = document.getElementById('statTotalInstruments');

  grid.innerHTML = '';

  const total = instrumentsList.length;
  countLabel.textContent = `${total} instrumento${total === 1 ? '' : 's'} cadastrado${total === 1 ? '' : 's'}`;
  if (statTotal) statTotal.textContent = total;

  if (total === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  instrumentsList.forEach(item => {
    const card = document.createElement('div');
    card.className = 'instrument-card';
    card.onclick = () => openDetailModal(item.id);

    const hasCert = !!item.certificate_filename;
    const hasManual = !!item.manual_filename;
    const hasProc = !!item.procedure_filename;

    card.innerHTML = `
      <div class="card-photo-wrapper">
        <img src="/uploads/photos/${escapeHtml(item.photo_filename)}" alt="${escapeHtml(item.name)}" class="card-img" onerror="this.src='/uploads/photos/fluke_87v.jpg'">
        <span class="card-measurand-badge">${escapeHtml(item.measurand)}</span>
      </div>
      <div class="card-content">
        <span class="card-tag">${escapeHtml(item.tag)}</span>
        <h3 class="card-title">${escapeHtml(item.name)}</h3>
        <div class="card-meta">
          <strong>${escapeHtml(item.manufacturer)}</strong> • Modelo ${escapeHtml(item.model)}
        </div>
        
        <div class="card-lcd-display">
          <span class="lcd-label">Faixa de Medição / Range:</span>
          <span class="lcd-text">${escapeHtml(item.range)}</span>
        </div>

        <div class="card-footer">
          <div class="card-doc-badges">
            <span class="badge-pill ${hasProc ? 'has-doc' : ''}" title="Procedimento Operacional Padrão">📋 POP</span>
            <span class="badge-pill ${hasCert ? 'has-cert' : ''}" title="Último Certificado de Calibração">📑 Cert</span>
            <span class="badge-pill ${hasManual ? 'has-doc' : ''}" title="Manual do Fabricante">📖 Manual</span>
          </div>
          <span class="btn-card-action">
            <span>Abrir Ficha</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </span>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// ============================================================
// MODAL DE DETALHES (FICHA DE BANCADA)
// ============================================================

async function openDetailModal(id) {
  try {
    const res = await fetch(`/api/instruments/${id}`, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });

    if (!res.ok) throw new Error('Não foi possível carregar a ficha do instrumento.');

    const data = await res.json();
    const item = data.instrument;
    activeInstrument = item;

    document.getElementById('detailTag').textContent = item.tag;
    document.getElementById('detailName').textContent = item.name;
    document.getElementById('detailManufacturerModel').textContent = `${item.manufacturer} | Modelo ${item.model}`;
    document.getElementById('detailMeasurand').textContent = item.measurand;
    const measurandBadge = document.getElementById('detailMeasurandBadge');
    if (measurandBadge) measurandBadge.textContent = item.measurand;
    document.getElementById('detailRange').textContent = item.range;
    document.getElementById('detailCreatedBy').textContent = item.created_by || 'Sistema';
    document.getElementById('detailTypicalPoints').textContent = item.typical_points;
    document.getElementById('detailProcedureText').textContent = item.procedure_text;

    const photoImg = document.getElementById('detailPhoto');
    photoImg.src = `/uploads/photos/${item.photo_filename}`;
    photoImg.alt = `${item.manufacturer} ${item.model}`;

    // Ações de ADM na ficha
    const isAdmin = currentUser && currentUser.role === 'admin';
    document.getElementById('adminDetailActions').style.display = isAdmin ? 'flex' : 'none';

    // Configuração dos Documentos
    setupDocTabView(item);

    document.getElementById('detailModal').style.display = 'flex';
    lockBodyScroll();
  } catch (err) {
    alert(err.message);
  }
}

function closeDetailModal() {
  document.getElementById('detailModal').style.display = 'none';
  unlockBodyScroll();
  activeInstrument = null;
}

function setupDocTabView(item) {
  // 1. Procedimento (POP)
  const procDownloadBtn = document.getElementById('procDownloadBtn');
  const procPdfContainer = document.getElementById('procPdfViewerContainer');
  const procPdfFrame = document.getElementById('procPdfFrame');

  if (item.procedure_filename) {
    const pdfUrl = `/uploads/docs/${item.procedure_filename}`;
    procDownloadBtn.innerHTML = `
      <a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm">
        <span>Abrir POP em Nova Aba</span>
      </a>
    `;
    procPdfFrame.src = pdfUrl;
    procPdfContainer.style.display = 'block';
  } else {
    procDownloadBtn.innerHTML = '';
    procPdfContainer.style.display = 'none';
    procPdfFrame.src = '';
  }

  // 2. Último Certificado
  const certDownloadBtn = document.getElementById('certDownloadBtn');
  const certContainer = document.getElementById('certPdfViewerContainer');
  const certEmpty = document.getElementById('certEmptyMsg');
  const certFrame = document.getElementById('certPdfFrame');

  if (item.certificate_filename) {
    const certUrl = `/uploads/docs/${item.certificate_filename}`;
    certDownloadBtn.innerHTML = `
      <a href="${certUrl}" target="_blank" class="btn btn-outline btn-sm">
        <span>Abrir Certificado em Nova Aba</span>
      </a>
    `;
    certFrame.src = certUrl;
    certContainer.style.display = 'block';
    certEmpty.style.display = 'none';
  } else {
    certDownloadBtn.innerHTML = '';
    certContainer.style.display = 'none';
    certEmpty.style.display = 'block';
    certFrame.src = '';
  }

  // 3. Manual Técnico
  const manualDownloadBtn = document.getElementById('manualDownloadBtn');
  const manualContainer = document.getElementById('manualPdfViewerContainer');
  const manualEmpty = document.getElementById('manualEmptyMsg');
  const manualFrame = document.getElementById('manualPdfFrame');

  if (item.manual_filename) {
    const manualUrl = `/uploads/docs/${item.manual_filename}`;
    manualDownloadBtn.innerHTML = `
      <a href="${manualUrl}" target="_blank" class="btn btn-outline btn-sm">
        <span>Abrir Manual em Nova Aba</span>
      </a>
    `;
    manualFrame.src = manualUrl;
    manualContainer.style.display = 'block';
    manualEmpty.style.display = 'none';
  } else {
    manualDownloadBtn.innerHTML = '';
    manualContainer.style.display = 'none';
    manualEmpty.style.display = 'block';
    manualFrame.src = '';
  }

  // Volta para a primeira aba
  switchDocTab('procTab');
}

function switchDocTab(tabId) {
  document.querySelectorAll('.doc-tab').forEach((tab, i) => {
    tab.classList.remove('active');
    if ((tabId === 'procTab' && i === 0) ||
        (tabId === 'certTab' && i === 1) ||
        (tabId === 'manualTab' && i === 2)) {
      tab.classList.add('active');
    }
  });

  document.querySelectorAll('.doc-tab-pane').forEach(pane => {
    pane.style.display = 'none';
  });

  const activePane = document.getElementById(tabId);
  if (activePane) activePane.style.display = 'flex';
}

// ============================================================
// LIGHTBOX DE FOTO DO APARELHO (ZOOM)
// ============================================================

function zoomPhoto() {
  if (!activeInstrument) return;
  const lightbox = document.getElementById('photoLightbox');
  const img = document.getElementById('lightboxImg');
  const caption = document.getElementById('lightboxCaption');

  img.src = `/uploads/photos/${activeInstrument.photo_filename}`;
  caption.textContent = `${activeInstrument.manufacturer} ${activeInstrument.model} - TAG ${activeInstrument.tag}`;
  lightbox.style.display = 'flex';
  lockBodyScroll();
}

function closeZoomPhoto() {
  document.getElementById('photoLightbox').style.display = 'none';
  unlockBodyScroll();
}

// ============================================================
// MODAL DE CADASTRO / EDIÇÃO COM TRAVAS DE VALIDAÇÃO
// ============================================================

// ============================================================
// MODAL DE CADASTRO / EDIÇÃO & CAPTURA DE FOTO NA HORA (CÂMERA)
// ============================================================

let currentCapturedPhotoFile = null;
let cameraStream = null;
let currentFacingMode = 'environment';

function triggerNativeCamera() {
  const camInput = document.getElementById('inputPhotoCamera');
  if (camInput) {
    camInput.click();
  }
}

function triggerGalleryPicker() {
  const galInput = document.getElementById('inputPhotoGallery');
  if (galInput) {
    galInput.click();
  }
}

// Compressão inteligente no cliente para envio instantâneo sem travamento
function compressImage(fileOrBlob, maxDimension = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(fileOrBlob);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(fileOrBlob);
    };

    img.src = url;
  });
}

async function handlePhotoFileSelected(file) {
  if (!file) return;

  try {
    const compressedBlob = await compressImage(file, 1920, 0.85);
    const fileName = `instrument_${Date.now()}.jpg`;
    currentCapturedPhotoFile = new File([compressedBlob], fileName, { type: 'image/jpeg' });

    const previewContainer = document.getElementById('photoPreviewContainer');
    const previewImg = document.getElementById('photoPreviewImg');
    const statusText = document.getElementById('photoPreviewStatusText');
    const metaText = document.getElementById('photoPreviewMeta');

    const objectUrl = URL.createObjectURL(compressedBlob);
    previewImg.src = objectUrl;
    previewContainer.style.display = 'flex';

    if (statusText) statusText.textContent = 'Foto capturada com sucesso!';
    if (metaText) {
      const sizeKb = (compressedBlob.size / 1024).toFixed(0);
      metaText.textContent = `Tamanho otimizado: ${sizeKb} KB (Pronta para envio rápido)`;
    }

    const badge = document.getElementById('photoFileNameBadge');
    if (badge) {
      badge.textContent = file.name || 'Foto selecionada';
    }

    document.getElementById('usingDefaultPhoto').value = 'false';

    const errorSpan = document.getElementById('inputPhotoError');
    if (errorSpan) errorSpan.classList.remove('active');
  } catch (err) {
    console.error('Erro ao processar imagem:', err);
    currentCapturedPhotoFile = file;
    const previewContainer = document.getElementById('photoPreviewContainer');
    const previewImg = document.getElementById('photoPreviewImg');
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewContainer.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }
}

// In-App Live Camera Viewfinder (Visor ao vivo de bancada)
async function openCameraModal() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    triggerNativeCamera();
    return;
  }

  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraVideo');
  modal.style.display = 'flex';
  lockBodyScroll();

  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    video.srcObject = cameraStream;
    await video.play();
  } catch (err) {
    console.warn('[Camera Viewfinder Error]', err);
    closeCameraModal();
    triggerNativeCamera();
  }
}

function closeCameraModal() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
  const modal = document.getElementById('cameraModal');
  if (modal) modal.style.display = 'none';
  unlockBodyScroll();
}

async function switchCameraFacingMode() {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await openCameraModal();
}

async function captureFromVideo() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  if (!video || !canvas) return;

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  canvas.toBlob(async (blob) => {
    closeCameraModal();
    if (blob) {
      await handlePhotoFileSelected(blob);
    }
  }, 'image/jpeg', 0.88);
}

function useDefaultPhoto() {
  currentCapturedPhotoFile = null;
  const previewContainer = document.getElementById('photoPreviewContainer');
  const previewImg = document.getElementById('photoPreviewImg');
  const statusText = document.getElementById('photoPreviewStatusText');
  const metaText = document.getElementById('photoPreviewMeta');

  previewImg.src = '/uploads/photos/default_instrument.jpg';
  previewContainer.style.display = 'flex';
  if (statusText) statusText.textContent = 'Foto Padrão de Bancada Ativada';
  if (metaText) metaText.textContent = 'Imagem técnica padrão de laboratório';

  document.getElementById('usingDefaultPhoto').value = 'true';

  const errorSpan = document.getElementById('inputPhotoError');
  if (errorSpan) errorSpan.classList.remove('active');
}

function clearSelectedPhoto() {
  currentCapturedPhotoFile = null;
  const previewContainer = document.getElementById('photoPreviewContainer');
  const previewImg = document.getElementById('photoPreviewImg');
  if (previewImg) previewImg.src = '';
  if (previewContainer) previewContainer.style.display = 'none';

  const badge = document.getElementById('photoFileNameBadge');
  if (badge) badge.textContent = 'JPG, PNG ou WEBP';

  const defPhotoEl = document.getElementById('usingDefaultPhoto');
  if (defPhotoEl) defPhotoEl.value = 'false';

  const camInput = document.getElementById('inputPhotoCamera');
  const galInput = document.getElementById('inputPhotoGallery');
  const stdInput = document.getElementById('inputPhoto');
  if (camInput) camInput.value = '';
  if (galInput) galInput.value = '';
  if (stdInput) stdInput.value = '';
}

function zoomCurrentPreviewPhoto() {
  const previewImg = document.getElementById('photoPreviewImg');
  if (previewImg && previewImg.src) {
    zoomPhoto(previewImg.src, 'Identificação Visual do Instrumento');
  }
}

function openInstrumentModal(itemToEdit = null) {
  clearFormErrors();
  document.getElementById('instrumentForm').reset();
  clearSelectedPhoto();
  document.getElementById('formAlert').style.display = 'none';

  // Reseta estados do microfone, IA e Desfazer do Procedimento
  stopVoiceRecording();
  closeCameraModal();
  originalProcedureText = '';
  const undoBtn = document.getElementById('btnUndoProcedure');
  if (undoBtn) undoBtn.style.display = 'none';
  const aiRefineAlert = document.getElementById('aiRefineStatus');
  if (aiRefineAlert) aiRefineAlert.style.display = 'none';

  const title = document.getElementById('formModalTitle');
  const photoReqStar = document.getElementById('photoReqStar');

  if (itemToEdit) {
    title.textContent = 'Editar Ficha do Instrumento';
    document.getElementById('instrumentId').value = itemToEdit.id;
    document.getElementById('inputTag').value = itemToEdit.tag;
    document.getElementById('inputName').value = itemToEdit.name;
    document.getElementById('inputManufacturer').value = itemToEdit.manufacturer;
    document.getElementById('inputModel').value = itemToEdit.model;
    document.getElementById('inputRange').value = itemToEdit.range;
    document.getElementById('inputMeasurand').value = itemToEdit.measurand;
    document.getElementById('inputTypicalPoints').value = itemToEdit.typical_points;
    document.getElementById('inputProcedureText').value = itemToEdit.procedure_text;

    // Foto não é estritamente obrigatória na edição se já existe
    photoReqStar.style.display = 'none';
    if (itemToEdit.photo_filename) {
      const previewContainer = document.getElementById('photoPreviewContainer');
      const previewImg = document.getElementById('photoPreviewImg');
      previewImg.src = `/uploads/photos/${itemToEdit.photo_filename}`;
      previewContainer.style.display = 'flex';
      const statusText = document.getElementById('photoPreviewStatusText');
      if (statusText) statusText.textContent = 'Foto Cadastrada do Instrumento';
      const metaText = document.getElementById('photoPreviewMeta');
      if (metaText) metaText.textContent = `${itemToEdit.manufacturer} ${itemToEdit.model}`;
      const badge = document.getElementById('photoFileNameBadge');
      if (badge) badge.textContent = itemToEdit.photo_filename;
    }
  } else {
    title.textContent = 'Cadastrar Novo Instrumento de Bancada';
    document.getElementById('instrumentId').value = '';
    photoReqStar.style.display = 'inline';
  }

  document.getElementById('formModal').style.display = 'flex';
  lockBodyScroll();
  document.getElementById('inputTag').focus();
}

function closeFormModal() {
  stopVoiceRecording();
  closeCameraModal();
  document.getElementById('formModal').style.display = 'none';
  unlockBodyScroll();
}

function editCurrentInstrument() {
  if (!activeInstrument) return;
  closeDetailModal();
  openInstrumentModal(activeInstrument);
}

async function deleteCurrentInstrument() {
  if (!activeInstrument) return;
  const confirmMsg = `Tem certeza de que deseja excluir o instrumento "${activeInstrument.manufacturer} ${activeInstrument.model}" (TAG ${activeInstrument.tag})?\nEsta ação não poderá ser desfeita.`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/instruments/${activeInstrument.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${currentToken}` }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erro ao excluir instrumento.');
    }

    closeDetailModal();
    await loadInstruments();
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// DITADO POR VOZ (WEB SPEECH API) & IA NO ROTEIRO POP (ISO 17025)
// ============================================================

let speechRecognition = null;
let isRecordingAudio = false;
let audioRecordStartTime = null;
let audioRecordTimerInterval = null;
let audioRestartTimeout = null;
let originalProcedureText = '';
let audioBaseProcedureText = '';
let sessionFinalizedSegments = [];

/**
 * Higienização e remoção de repetições consecutivas (palavras e frases)
 * causadas por gaguejo, eco de microfone ou acúmulo de buffers na Web Speech API.
 */
function deduplicateSpeechText(text) {
  if (!text || typeof text !== 'string') return '';
  const tokens = text.trim().split(/\s+/);
  if (tokens.length <= 1) return text.trim();

  function norm(w) {
    return (w || '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  let result = [];
  let i = 0;

  while (i < tokens.length) {
    let matchedLength = 0;
    const maxBlock = Math.min(15, Math.floor((tokens.length - i) / 2));

    // Procura o menor período repetitivo (L = 1 até maxBlock)
    for (let L = 1; L <= maxBlock; L++) {
      let isRepeat = true;
      for (let k = 0; k < L; k++) {
        const a = norm(tokens[i + k]);
        const b = norm(tokens[i + L + k]);
        if (!a || !b || a !== b) {
          isRepeat = false;
          break;
        }
      }
      if (isRepeat) {
        matchedLength = L;
        break;
      }
    }

    if (matchedLength > 0) {
      for (let k = 0; k < matchedLength; k++) {
        result.push(tokens[i + k]);
      }
      i += matchedLength;
      while (i + matchedLength <= tokens.length) {
        let isSame = true;
        for (let k = 0; k < matchedLength; k++) {
          const a = norm(tokens[i - matchedLength + k]);
          const b = norm(tokens[i + k]);
          if (!a || !b || a !== b) {
            isSame = false;
            break;
          }
        }
        if (isSame) {
          i += matchedLength;
        } else {
          break;
        }
      }
    } else {
      result.push(tokens[i]);
      i++;
    }
  }

  return result.join(' ');
}

function isSpeechRecognitionSupported() {
  return ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'pt-BR';

  recognition.onresult = (event) => {
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) {
        const seg = (res[0] && res[0].transcript) ? res[0].transcript.trim() : '';
        if (seg) {
          sessionFinalizedSegments[i] = seg;
        }
      } else {
        if (res[0] && res[0].transcript) {
          interimTranscript += res[0].transcript;
        }
      }
    }

    const currentSessionText = sessionFinalizedSegments.filter(Boolean).join(' ');
    const cleanSessionText = deduplicateSpeechText(currentSessionText);

    const proc = document.getElementById('inputProcedureText');
    if (proc) {
      if (cleanSessionText) {
        const full = audioBaseProcedureText ? `${audioBaseProcedureText} ${cleanSessionText}` : cleanSessionText;
        proc.value = deduplicateSpeechText(full);
        proc.classList.remove('is-invalid');
        const err = document.getElementById('inputProcedureTextError');
        if (err) err.classList.remove('active');
      }
    }

    // Atualiza feedback visual interino ao vivo
    const liveBox = document.getElementById('audioLiveTranscriptBox');
    const liveText = document.getElementById('audioLiveInterimText');
    if (liveBox && liveText) {
      const trimmedInterim = interimTranscript.trim();
      if (trimmedInterim) {
        liveText.textContent = trimmedInterim;
        liveBox.style.display = 'flex';
      } else if (!cleanSessionText) {
        liveText.textContent = 'Ouvindo... pode falar...';
        liveBox.style.display = 'flex';
      } else {
        liveBox.style.display = 'none';
      }
    }
  };

  recognition.onerror = (event) => {
    console.warn('[SpeechRecognition Error]', event.error);
    if (event.error === 'not-allowed') {
      alert('Permissão de microfone negada. Por favor, permita o acesso ao microfone no navegador ou digite as instruções no campo de texto.');
      stopVoiceRecording();
    }
  };

  recognition.onend = () => {
    // Quando o navegador pausa o reconhecimento por silêncio
    const proc = document.getElementById('inputProcedureText');
    if (proc) {
      audioBaseProcedureText = deduplicateSpeechText(proc.value.trim());
      sessionFinalizedSegments = [];
    }

    if (isRecordingAudio) {
      if (audioRestartTimeout) clearTimeout(audioRestartTimeout);
      audioRestartTimeout = setTimeout(() => {
        if (isRecordingAudio) {
          try {
            recognition.start();
          } catch (err) {
            stopVoiceRecording();
          }
        }
      }, 150);
    }
  };

  return recognition;
}

function toggleVoiceRecording() {
  if (isRecordingAudio) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

function startVoiceRecording() {
  if (!isSpeechRecognitionSupported()) {
    alert('Reconhecimento de voz não suportado neste navegador. Recomendamos Google Chrome ou Microsoft Edge, ou você pode digitar o relato diretamente no campo de texto e clicar em "Melhorar com IA".');
    return;
  }

  try {
    const proc = document.getElementById('inputProcedureText');
    audioBaseProcedureText = proc ? deduplicateSpeechText(proc.value.trim()) : '';
    sessionFinalizedSegments = [];

    if (!speechRecognition) {
      speechRecognition = initSpeechRecognition();
    }
    speechRecognition.start();
    isRecordingAudio = true;

    // Atualização visual
    const btn = document.getElementById('btnVoiceRecord');
    const btnText = document.getElementById('voiceRecordText');
    const banner = document.getElementById('audioRecordIndicator');
    const liveBox = document.getElementById('audioLiveTranscriptBox');
    const liveText = document.getElementById('audioLiveInterimText');

    if (btn) btn.classList.add('recording-active');
    if (btnText) btnText.textContent = 'Parar Gravação';
    if (banner) banner.style.display = 'flex';
    if (liveBox && liveText) {
      liveText.textContent = 'Ouvindo... pode falar...';
      liveBox.style.display = 'flex';
    }

    audioRecordStartTime = Date.now();
    updateAudioRecordTimer();
    audioRecordTimerInterval = setInterval(updateAudioRecordTimer, 1000);
  } catch (err) {
    console.error('Erro ao iniciar reconhecimento de voz:', err);
    stopVoiceRecording();
  }
}

function updateAudioRecordTimer() {
  if (!audioRecordStartTime) return;
  const elapsedSec = Math.floor((Date.now() - audioRecordStartTime) / 1000);
  const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const s = String(elapsedSec % 60).padStart(2, '0');
  const timer = document.getElementById('audioRecordTimer');
  if (timer) {
    timer.textContent = `Gravando áudio (${m}:${s})...`;
  }
}

function stopVoiceRecording() {
  isRecordingAudio = false;
  if (audioRestartTimeout) {
    clearTimeout(audioRestartTimeout);
    audioRestartTimeout = null;
  }
  if (audioRecordTimerInterval) {
    clearInterval(audioRecordTimerInterval);
    audioRecordTimerInterval = null;
  }

  if (speechRecognition) {
    try {
      speechRecognition.stop();
    } catch (e) {}
  }

  const proc = document.getElementById('inputProcedureText');
  if (proc) {
    proc.value = deduplicateSpeechText(proc.value.trim());
  }

  sessionFinalizedSegments = [];
  audioBaseProcedureText = '';

  const btn = document.getElementById('btnVoiceRecord');
  const btnText = document.getElementById('voiceRecordText');
  const banner = document.getElementById('audioRecordIndicator');
  const liveBox = document.getElementById('audioLiveTranscriptBox');

  if (btn) btn.classList.remove('recording-active');
  if (btnText) btnText.textContent = 'Falar por Áudio';
  if (banner) banner.style.display = 'none';
  if (liveBox) liveBox.style.display = 'none';
}

async function refineProcedureTextWithAi() {
  if (isRecordingAudio) {
    stopVoiceRecording();
  }

  const procInput = document.getElementById('inputProcedureText');
  const cleanDraft = deduplicateSpeechText(procInput.value.trim());
  procInput.value = cleanDraft;

  const alertBox = document.getElementById('aiRefineStatus');
  alertBox.style.display = 'none';

  if (!cleanDraft) {
    alertBox.className = 'alert alert-error';
    alertBox.textContent = 'Digite ou dite por áudio as instruções ou observações da calibração antes de solicitar o aprimoramento da IA.';
    alertBox.style.display = 'block';
    procInput.focus();
    return;
  }

  if (!currentToken) {
    alertBox.className = 'alert alert-error';
    alertBox.textContent = 'Sessão expirada. Faça login novamente para acionar a IA.';
    alertBox.style.display = 'block';
    return;
  }

  // Salva o rascunho anterior para permitir Desfazer
  originalProcedureText = cleanDraft;

  const btn = document.getElementById('btnAiRefinePop');
  const btnText = document.getElementById('aiRefineBtnText');
  btn.disabled = true;
  btnText.textContent = 'Padronizando POP...';

  alertBox.className = 'alert alert-info';
  alertBox.innerHTML = '⚙️ <strong>Estruturando POP Metrológico:</strong> O DeepSeek v4.1 está organizando seu relato em seções formais (Aclimatação, Padrões, Sequência e Tolerâncias)...';
  alertBox.style.display = 'block';

  const manufacturer = document.getElementById('inputManufacturer').value.trim();
  const model = document.getElementById('inputModel').value.trim();
  const measurand = document.getElementById('inputMeasurand').value;

  try {
    const res = await fetch('/api/ai/refine-procedure', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        draftText,
        manufacturer,
        model,
        measurand
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao processar roteiro com IA.');
    }

    if (data.procedureText) {
      procInput.value = data.procedureText;
      procInput.classList.remove('is-invalid');
      procInput.classList.add('field-ai-highlight');
      setTimeout(() => procInput.classList.remove('field-ai-highlight'), 1800);

      const errSpan = document.getElementById('inputProcedureTextError');
      if (errSpan) errSpan.classList.remove('active');

      const undoBtn = document.getElementById('btnUndoProcedure');
      if (undoBtn) undoBtn.style.display = 'inline-flex';

      alertBox.className = 'alert alert-success';
      alertBox.innerHTML = `✨ <strong>POP Estruturado com Sucesso!</strong> Relato convertido em procedimento formal ABNT NBR ISO/IEC 17025. Se desejar restaurar o texto original, clique em <strong>Desfazer</strong>.`;
      alertBox.style.display = 'block';
    }
  } catch (err) {
    console.error('[AI Refine Error]', err);
    alertBox.className = 'alert alert-error';
    alertBox.innerHTML = `⚠️ <strong>Atenção:</strong> ${escapeHtml(err.message)}. O texto original foi mantido.`;
    alertBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Melhorar com IA';
  }
}

function undoProcedureText() {
  if (!originalProcedureText) return;
  const procInput = document.getElementById('inputProcedureText');
  procInput.value = originalProcedureText;
  const undoBtn = document.getElementById('btnUndoProcedure');
  if (undoBtn) undoBtn.style.display = 'none';

  const alertBox = document.getElementById('aiRefineStatus');
  if (alertBox) {
    alertBox.className = 'alert alert-info';
    alertBox.textContent = 'Texto anterior restaurado.';
    alertBox.style.display = 'block';
    setTimeout(() => {
      if (alertBox.textContent === 'Texto anterior restaurado.') {
        alertBox.style.display = 'none';
      }
    }, 3000);
  }
}

// Submissão do Formulário com TRAVAS ESTRICTAS
async function handleInstrumentSubmit(e) {
  e.preventDefault();
  clearFormErrors();

  const alertBox = document.getElementById('formAlert');
  alertBox.style.display = 'none';

  const id = document.getElementById('instrumentId').value;
  const isEdit = !!id;

  const requiredInputs = [
    { el: document.getElementById('inputTag'), errId: 'inputTagError', name: 'TAG de Identificação' },
    { el: document.getElementById('inputName'), errId: 'inputNameError', name: 'Nome do Equipamento' },
    { el: document.getElementById('inputManufacturer'), errId: 'inputManufacturerError', name: 'Fabricante' },
    { el: document.getElementById('inputModel'), errId: 'inputModelError', name: 'Modelo' },
    { el: document.getElementById('inputMeasurand'), errId: 'inputMeasurandError', name: 'Grandeza Metrológica' },
    { el: document.getElementById('inputRange'), errId: 'inputRangeError', name: 'Faixa de Medição' },
    { el: document.getElementById('inputTypicalPoints'), errId: 'inputTypicalPointsError', name: 'Pontos de Calibração Utilizados' },
    { el: document.getElementById('inputProcedureText'), errId: 'inputProcedureTextError', name: 'Roteiro de Calibração' }
  ];

  let hasError = false;
  let firstErrorField = null;

  // TRAVA 1: Campos de texto obrigatórios não podem ficar em branco
  for (const item of requiredInputs) {
    const val = item.el.value.trim();
    if (!val) {
      showFieldError(item.el, item.errId, `O campo "${item.name}" não pode ser deixado em branco.`);
      hasError = true;
      if (!firstErrorField) firstErrorField = item.el;
    }
  }

  // TRAVA 2: Foto do aparelho
  const photoInput = document.getElementById('inputPhoto');
  const usingDefaultPhoto = document.getElementById('usingDefaultPhoto')?.value === 'true';
  const hasPhotoFile = (photoInput.files && photoInput.files.length > 0) || !!currentCapturedPhotoFile;

  if (!isEdit && !hasPhotoFile && !usingDefaultPhoto) {
    // Se o usuário não enviou arquivo de foto nem capturou, ativa foto padrão de bancada automaticamente
    document.getElementById('usingDefaultPhoto').value = 'true';
  }

  if (hasError) {
    alertBox.textContent = 'Trava de validação ativada: Todos os campos destacados em vermelho são obrigatórios e não podem ficar em branco.';
    alertBox.style.display = 'block';
    if (firstErrorField) {
      firstErrorField.focus();
      firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // Montagem do FormData para upload seguro
  const formData = new FormData();
  formData.append('tag', document.getElementById('inputTag').value.trim());
  formData.append('name', document.getElementById('inputName').value.trim());
  formData.append('manufacturer', document.getElementById('inputManufacturer').value.trim());
  formData.append('model', document.getElementById('inputModel').value.trim());
  formData.append('measurand', document.getElementById('inputMeasurand').value.trim());
  formData.append('range', document.getElementById('inputRange').value.trim());
  formData.append('typical_points', document.getElementById('inputTypicalPoints').value.trim());
  formData.append('procedure_text', document.getElementById('inputProcedureText').value.trim());

  if (currentCapturedPhotoFile) {
    formData.append('photo', currentCapturedPhotoFile);
  } else if (photoInput.files && photoInput.files[0]) {
    formData.append('photo', photoInput.files[0]);
  } else if (document.getElementById('usingDefaultPhoto')?.value === 'true') {
    formData.append('use_default_photo', 'true');
  }

  const certInput = document.getElementById('inputCert');
  if (certInput.files && certInput.files[0]) {
    formData.append('certificate', certInput.files[0]);
  }

  const manualInput = document.getElementById('inputManual');
  if (manualInput.files && manualInput.files[0]) {
    formData.append('manual', manualInput.files[0]);
  }

  const procInput = document.getElementById('inputProcedure');
  if (procInput.files && procInput.files[0]) {
    formData.append('procedure', procInput.files[0]);
  }

  const btnSave = document.getElementById('btnSaveInstrument');
  btnSave.disabled = true;
  btnSave.querySelector('span').textContent = 'Salvando e validando...';

  try {
    const url = isEdit ? `/api/instruments/${id}` : '/api/instruments';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${currentToken}` },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      alertBox.textContent = data.error || 'Erro ao salvar instrumento.';
      alertBox.style.display = 'block';
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    closeFormModal();
    await loadInstruments();
  } catch (err) {
    alertBox.textContent = 'Erro de comunicação com o servidor.';
    alertBox.style.display = 'block';
  } finally {
    btnSave.disabled = false;
    btnSave.querySelector('span').textContent = 'Salvar Instrumento com Trava de Validação';
  }
}

// ============================================================
// GESTÃO DE USUÁRIOS (ÁREA ADMINISTRATIVA)
// ============================================================

async function openUsersModal() {
  document.getElementById('usersModal').style.display = 'flex';
  lockBodyScroll();
  document.getElementById('userAlert').style.display = 'none';
  document.getElementById('newUserForm').reset();
  await loadUsersList();
}

function closeUsersModal() {
  document.getElementById('usersModal').style.display = 'none';
  unlockBodyScroll();
}

async function loadUsersList() {
  try {
    const res = await fetch('/api/users', {
      headers: { Authorization: `Bearer ${currentToken}` }
    });

    if (!res.ok) return;

    const data = await res.json();
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    data.users.forEach(u => {
      const tr = document.createElement('tr');
      const isSelf = currentUser && currentUser.id === u.id;
      tr.innerHTML = `
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td><span class="mono">${escapeHtml(u.username)}</span></td>
        <td><span class="role-badge ${u.role}">${u.role.toUpperCase()}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="changeUserPasswordPrompt(${u.id}, '${escapeHtml(u.username)}')">Alterar Senha</button>
          ${!isSelf ? `<button class="btn btn-danger btn-sm" onclick="deleteUserPrompt(${u.id}, '${escapeHtml(u.name)}')">Excluir</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

async function handleNewUserSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('userAlert');
  alertBox.style.display = 'none';

  const username = document.getElementById('newUsername').value.trim();
  const name = document.getElementById('newFullName').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;

  if (!username || !name || !password) {
    alertBox.textContent = 'Preencha todos os campos do novo usuário. Campos em branco não são permitidos.';
    alertBox.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, name, password, role })
    });

    const data = await res.json();
    if (!res.ok) {
      alertBox.textContent = data.error || 'Erro ao cadastrar usuário.';
      alertBox.style.display = 'block';
      return;
    }

    document.getElementById('newUserForm').reset();
    await loadUsersList();
  } catch (err) {
    alertBox.textContent = 'Erro ao conectar ao servidor.';
    alertBox.style.display = 'block';
  }
}

async function changeUserPasswordPrompt(id, username) {
  const newPass = prompt(`Digite a nova senha para o usuário "${username}":`);
  if (newPass === null) return;
  if (!newPass.trim()) {
    alert('A senha não pode ser vazia ou conter apenas espaços.');
    return;
  }

  try {
    const res = await fetch(`/api/users/${id}/password`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: newPass.trim() })
    });

    const data = await res.json();
    if (res.ok) {
      alert('Senha atualizada com sucesso!');
    } else {
      alert(data.error || 'Erro ao atualizar senha.');
    }
  } catch (err) {
    alert('Erro ao conectar ao servidor.');
  }
}

async function deleteUserPrompt(id, name) {
  if (!confirm(`Deseja realmente remover o acesso de "${name}"?`)) return;

  try {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${currentToken}` }
    });

    const data = await res.json();
    if (res.ok) {
      await loadUsersList();
    } else {
      alert(data.error || 'Erro ao remover usuário.');
    }
  } catch (err) {
    alert('Erro ao conectar ao servidor.');
  }
}

// ============================================================
// AUXILIARES: VALIDAÇÃO & EVENT LISTENERS
// ============================================================

function setupEventListeners() {
  // Formulário de Login
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // Formulário de Instrumento
  document.getElementById('instrumentForm').addEventListener('submit', handleInstrumentSubmit);

  // Formulário de Novo Usuário (ADM)
  document.getElementById('newUserForm').addEventListener('submit', handleNewUserSubmit);

  // Campo de busca em tempo real com debounce
  let searchTimeout;
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadInstruments, 250);
  });

  // Atalho de teclado '/' para busca
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && !isModalOpen()) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      if (document.getElementById('cameraModal').style.display === 'flex') {
        closeCameraModal();
      } else if (document.getElementById('photoLightbox').style.display === 'flex') {
        closeZoomPhoto();
      } else if (document.getElementById('detailModal').style.display === 'flex') {
        closeDetailModal();
      } else if (document.getElementById('formModal').style.display === 'flex') {
        closeFormModal();
      } else if (document.getElementById('usersModal').style.display === 'flex') {
        closeUsersModal();
      }
    }
  });

  // Filtros por Grandeza
  const filterChips = document.getElementById('filterChips');
  filterChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeMeasurandFilter = chip.getAttribute('data-measurand') || '';
    loadInstruments();
  });

  // Disparadores de foto (Câmera do celular, Galeria e Seletor padrão)
  const camInput = document.getElementById('inputPhotoCamera');
  if (camInput) {
    camInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoFileSelected(e.target.files[0]);
      }
    });
  }

  const galInput = document.getElementById('inputPhotoGallery');
  if (galInput) {
    galInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoFileSelected(e.target.files[0]);
      }
    });
  }

  const stdPhotoInput = document.getElementById('inputPhoto');
  if (stdPhotoInput) {
    stdPhotoInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoFileSelected(e.target.files[0]);
      }
    });
  }

  // Limpar erro ao digitar nos campos obrigatórios
  document.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      const errorSpan = document.getElementById(`${input.id}Error`);
      if (errorSpan) errorSpan.classList.remove('active');
    });
  });
}

function showFieldError(inputElement, errorElementId, message) {
  inputElement.classList.add('is-invalid');
  const errorSpan = document.getElementById(errorElementId);
  if (errorSpan) {
    errorSpan.textContent = message;
    errorSpan.classList.add('active');
  }
}

function clearFieldErrors() {
  document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  document.querySelectorAll('.field-error').forEach(el => {
    el.textContent = '';
    el.classList.remove('active');
  });
}

function clearFormErrors() {
  clearFieldErrors();
  const alertBox = document.getElementById('formAlert');
  if (alertBox) alertBox.style.display = 'none';
}

function isModalOpen() {
  return document.getElementById('cameraModal').style.display === 'flex' ||
         document.getElementById('detailModal').style.display === 'flex' ||
         document.getElementById('formModal').style.display === 'flex' ||
         document.getElementById('usersModal').style.display === 'flex' ||
         document.getElementById('photoLightbox').style.display === 'flex';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
