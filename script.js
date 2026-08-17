'use strict';

/* ==========================================================================
   RITM Freelancer — front-end behaviour
   Organised in small, single-purpose sections:
     1. Generic helpers   (toast, clipboard, beep, color math)
     2. Appearance engine (theme presets, custom color, backgrounds, profiles)
     3. UI wiring          (modals, tabs, form submission)
   No inline "onclick" attributes are used — every interaction is bound
   here via addEventListener, mostly through event delegation so the
   dynamically-rendered swatches/thumbnails/profile chips don't need
   individual listeners re-attached on every re-render.
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Generic helpers
   -------------------------------------------------------------------------- */

function showToast(text, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = text;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function playBeep(freq = 550) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    osc.onended = () => ctx.close().catch(() => {});
  } catch (_) {
    /* Web Audio unavailable — silently skip the sound cue */
  }
}

function fallbackCopy(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (success) {
      showToast('لینک صفحه کپی شد! 📋');
      playBeep(750);
    } else {
      showToast('کپی خودکار ممکن نشد، لطفاً لینک را دستی کپی کنید.', true);
    }
  } catch (_) {
    showToast('کپی خودکار ممکن نشد، لطفاً لینک را دستی کپی کنید.', true);
  }
}

function copyPageLink() {
  const url = window.location.href;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        showToast('لینک صفحه کپی شد! 📋');
        playBeep(750);
      })
      .catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
}

function buildQrUrl() {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.href)}&color=050505`;
}

/* ---- small color-math kit, used to derive a full palette from one hex ---- */

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

function shiftHue(hex, degrees) {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  hsl.h = (hsl.h + degrees + 360) % 360;
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function adjustLightness(hex, delta) {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  hsl.l = Math.max(0, Math.min(100, hsl.l + delta));
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* --------------------------------------------------------------------------
   2. Appearance engine
   -------------------------------------------------------------------------- */

const Appearance = (() => {
  const STORAGE = {
    theme: 'ritm-theme',
    color: 'ritm-custom-color',
    bg: 'ritm-bg',
    bgData: 'ritm-custom-bg-data',
    profiles: 'ritm-profiles',
  };

  const PRESET_THEMES = [
    { id: 'purple', label: 'بنفش (پیش‌فرض)', color: '#a855f7' },
    { id: 'cyan', label: 'آبی نئون', color: '#22d3ee' },
    { id: 'emerald', label: 'سبز زمردی', color: '#10b981' },
    { id: 'crimson', label: 'قرمز آتشین', color: '#f43f5e' },
    { id: 'amber', label: 'طلایی', color: '#f59e0b' },
  ];

  // Filenames resolve relative to /assets/. Add an entry here any time a
  // new preset background is dropped into that folder.
  const PRESET_BACKGROUNDS = [
    { id: 'backgrand.png', label: 'پیش‌فرض' },
    { id: 'backgrand2.png', label: 'پس‌زمینه ۲' },
    { id: 'backgrand3.png', label: 'پس‌زمینه ۳' },
    { id: 'none', label: 'بدون تصویر' },
  ];

  const MAX_PROFILES = 12;
  const UPLOAD_MAX_DIMENSION = 1600;
  const UPLOAD_JPEG_QUALITY = 0.82;

  const state = {
    theme: 'purple',
    customColor: null,
    background: 'backgrand.png',
    customBgData: null,
  };

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (_) { /* noop */ }
  }

  function buildCustomThemeVars(baseHex) {
    const accent = shiftHue(baseHex, -28);
    const indigo = shiftHue(baseHex, 45);
    return {
      '--purple-neon': baseHex,
      '--purple-glow': withAlpha(baseHex, 0.45),
      '--pink-neon': accent,
      '--pink-glow': withAlpha(accent, 0.3),
      '--indigo-glow': withAlpha(indigo, 0.35),
      '--glass-border': withAlpha(baseHex, 0.22),
      '--glass-hover': withAlpha(baseHex, 0.18),
      '--title-grad-2': adjustLightness(baseHex, 25),
      '--title-grad-3': accent,
      '--logo-grad-1': baseHex,
      '--logo-grad-2': accent,
      '--logo-grad-3': indigo,
      '--chip-bg': withAlpha(baseHex, 0.08),
      '--chip-border': withAlpha(baseHex, 0.25),
      '--chip-color': adjustLightness(baseHex, 35),
      '--chip-hover-bg': withAlpha(baseHex, 0.2),
      '--chip-hover-border': withAlpha(baseHex, 0.5),
      '--btn-grad-1': adjustLightness(baseHex, -12),
      '--btn-grad-2': baseHex,
      '--btn-hover-1': baseHex,
      '--btn-hover-2': adjustLightness(accent, 12),
      '--accent-soft': adjustLightness(baseHex, 20),
      '--orb-1': withAlpha(baseHex, 0.35),
      '--orb-2': withAlpha(indigo, 0.3),
      '--orb-3': withAlpha(accent, 0.15),
    };
  }

  const CUSTOM_VAR_KEYS = Object.keys(buildCustomThemeVars('#a855f7'));

  function applyVars(vars) {
    Object.entries(vars).forEach(([key, value]) => document.body.style.setProperty(key, value));
  }

  function clearCustomColorVars() {
    CUSTOM_VAR_KEYS.forEach((key) => document.body.style.removeProperty(key));
  }

  function flash() {
    const overlay = document.getElementById('appearanceFadeOverlay');
    if (!overlay) return;
    overlay.classList.add('flash');
    setTimeout(() => overlay.classList.remove('flash'), 220);
  }

  function themeColorFor(themeId) {
    const preset = PRESET_THEMES.find((t) => t.id === themeId);
    return preset ? preset.color : '#a855f7';
  }

  /* ---- theme / color ---- */

  function setTheme(themeId, { persist = true, doFlash = true } = {}) {
    clearCustomColorVars();
    state.theme = themeId;
    state.customColor = null;
    if (themeId === 'purple') document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', themeId);
    if (persist) { safeSet(STORAGE.theme, themeId); safeRemove(STORAGE.color); }
    if (doFlash) flash();
    syncThemeUI();
  }

  function setCustomColor(hex, { persist = true, doFlash = true } = {}) {
    document.body.removeAttribute('data-theme');
    state.theme = 'custom';
    state.customColor = hex;
    applyVars(buildCustomThemeVars(hex));
    if (persist) { safeSet(STORAGE.theme, 'custom'); safeSet(STORAGE.color, hex); }
    if (doFlash) flash();
    syncThemeUI();
  }

  function syncThemeUI() {
    document.querySelectorAll('.theme-swatch').forEach((el) => {
      el.classList.toggle('active', state.theme === el.dataset.theme);
    });
    const colorInput = document.getElementById('customColorInput');
    if (colorInput && state.customColor) colorInput.value = state.customColor;
  }

  /* ---- background ---- */

  function setBackground(bgId, { persist = true, doFlash = true } = {}) {
    state.background = bgId;
    document.body.style.setProperty('--bg-image', bgId === 'none' ? 'none' : `url('assets/${bgId}')`);
    if (persist) safeSet(STORAGE.bg, bgId);
    if (doFlash) flash();
    renderBackgroundGrid();
  }

  function setCustomBackground(dataUrl, { persist = true, doFlash = true } = {}) {
    state.background = 'custom';
    state.customBgData = dataUrl;
    document.body.style.setProperty('--bg-image', `url('${dataUrl}')`);
    if (persist) {
      const stored = safeSet(STORAGE.bgData, dataUrl);
      if (stored) {
        safeSet(STORAGE.bg, 'custom');
      } else {
        showToast('حجم تصویر برای ذخیره‌سازی زیاد است؛ فقط برای این بازدید اعمال شد.', true);
      }
    }
    if (doFlash) flash();
    renderBackgroundGrid();
  }

  function removeCustomBackground() {
    state.customBgData = null;
    safeRemove(STORAGE.bgData);
    setBackground('backgrand.png');
  }

  function compressImage(file, maxDim = UPLOAD_MAX_DIMENSION, quality = UPLOAD_JPEG_QUALITY) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read-failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode-failed'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('canvas-unsupported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleBackgroundFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('لطفاً یک فایل تصویری انتخاب کنید.', true);
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      setCustomBackground(dataUrl);
      showToast('پس‌زمینه با موفقیت تغییر کرد! 🖼️');
    } catch (_) {
      showToast('بارگذاری تصویر ناموفق بود.', true);
    }
  }

  /* ---- rendering ---- */

  function renderThemeGrid() {
    const grid = document.getElementById('themeSwatchGrid');
    if (!grid) return;
    grid.innerHTML = PRESET_THEMES.map((t) => `
      <button type="button" class="theme-swatch" style="background:${t.color}"
        data-theme="${t.id}" title="${t.label}" aria-label="${t.label}"></button>
    `).join('');
    syncThemeUI();
  }

  function renderBackgroundGrid() {
    const grid = document.getElementById('bgThumbGrid');
    if (!grid) return;
    let html = '';
    if (state.customBgData) {
      html += `
        <div class="bg-thumb custom-bg-thumb ${state.background === 'custom' ? 'active' : ''}"
          style="background-image:url('${state.customBgData}')" data-bg="custom" title="تصویر من">
          <button type="button" class="bg-thumb-remove" data-action="remove-custom-bg" title="حذف تصویر" aria-label="حذف تصویر">×</button>
        </div>`;
    }
    html += PRESET_BACKGROUNDS.map((b) => {
      const active = state.background === b.id ? 'active' : '';
      if (b.id === 'none') {
        return `<button type="button" class="bg-thumb bg-thumb-none ${active}" data-bg="${b.id}" title="${b.label}">${b.label}</button>`;
      }
      return `<button type="button" class="bg-thumb ${active}" style="background-image:url('assets/${b.id}')" data-bg="${b.id}" title="${b.label}" aria-label="${b.label}"></button>`;
    }).join('');
    grid.innerHTML = html;
  }

  /* ---- profiles (named snapshots of theme + background) ---- */

  function getProfiles() {
    try {
      const raw = safeGet(STORAGE.profiles);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveProfileList(list) {
    return safeSet(STORAGE.profiles, JSON.stringify(list));
  }

  function saveCurrentAsProfile(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('یک نام برای پروفایل وارد کنید.', true);
      return false;
    }
    const profile = {
      id: `profile_${Date.now()}`,
      name: trimmed,
      theme: state.theme,
      customColor: state.customColor,
      background: state.background,
      customBgData: state.background === 'custom' ? state.customBgData : null,
    };
    const profiles = [profile, ...getProfiles()].slice(0, MAX_PROFILES);
    const ok = saveProfileList(profiles);
    if (!ok) {
      showToast('ذخیره پروفایل ناموفق بود (حجم زیاد است).', true);
      return false;
    }
    renderProfileList();
    showToast('پروفایل ذخیره شد ✅');
    return true;
  }

  function applyProfile(id) {
    const profile = getProfiles().find((p) => p.id === id);
    if (!profile) return;
    if (profile.theme === 'custom' && profile.customColor) {
      setCustomColor(profile.customColor);
    } else {
      setTheme(profile.theme || 'purple');
    }
    if (profile.background === 'custom' && profile.customBgData) {
      setCustomBackground(profile.customBgData);
    } else {
      setBackground(profile.background || 'backgrand.png');
    }
    showToast(`پروفایل «${profile.name}» اعمال شد`);
  }

  function deleteProfile(id) {
    saveProfileList(getProfiles().filter((p) => p.id !== id));
    renderProfileList();
  }

  function renderProfileList() {
    const list = document.getElementById('profileList');
    if (!list) return;
    const profiles = getProfiles();
    if (!profiles.length) {
      list.innerHTML = '<div class="profile-empty">هنوز پروفایلی ذخیره نشده</div>';
      return;
    }
    list.innerHTML = profiles.map((p) => `
      <div class="profile-chip">
        <div class="profile-chip-name">
          <span class="profile-color-dot" style="background:${p.customColor || themeColorFor(p.theme)}"></span>
          <span>${escapeHtml(p.name)}</span>
        </div>
        <div class="profile-chip-actions">
          <button type="button" data-action="apply-profile" data-id="${p.id}" title="اعمال" aria-label="اعمال پروفایل"><i class="fa-solid fa-check"></i></button>
          <button type="button" data-action="delete-profile" data-id="${p.id}" title="حذف" aria-label="حذف پروفایل"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  /* ---- restore + init ---- */

  function restoreSavedState() {
    const savedTheme = safeGet(STORAGE.theme) || 'purple';
    const savedColor = safeGet(STORAGE.color);
    const savedBg = safeGet(STORAGE.bg) || 'backgrand.png';
    const savedBgData = safeGet(STORAGE.bgData);

    state.customBgData = savedBgData || null;

    if (savedTheme === 'custom' && savedColor) {
      setCustomColor(savedColor, { persist: false, doFlash: false });
    } else {
      setTheme(savedTheme, { persist: false, doFlash: false });
    }

    if (savedBg === 'custom' && savedBgData) {
      setCustomBackground(savedBgData, { persist: false, doFlash: false });
    } else {
      setBackground(savedBg, { persist: false, doFlash: false });
    }
  }

  function init() {
    renderThemeGrid();
    renderBackgroundGrid();
    renderProfileList();
    restoreSavedState();
  }

  return {
    init,
    setTheme,
    setCustomColor,
    setBackground,
    removeCustomBackground,
    handleBackgroundFile,
    saveCurrentAsProfile,
    applyProfile,
    deleteProfile,
  };
})();

/* --------------------------------------------------------------------------
   3. UI wiring — modals, tabs, appearance controls, contact form
   -------------------------------------------------------------------------- */

function openModal(modal) {
  if (modal) modal.classList.add('active');
}

function closeModal(modal) {
  if (modal) modal.classList.remove('active');
}

function switchSettingsTab(tabId) {
  document.querySelectorAll('.settings-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.settings-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabId);
  });
}

function wireModals() {
  const qrModal = document.getElementById('qrModal');
  const settingsModal = document.getElementById('settingsModal');

  document.getElementById('btnShare')?.addEventListener('click', () => {
    const qrImg = document.getElementById('qrImage');
    if (qrImg) qrImg.src = buildQrUrl();
    openModal(qrModal);
    playBeep(600);
  });

  document.getElementById('btnSettings')?.addEventListener('click', () => {
    openModal(settingsModal);
    playBeep(600);
  });

  document.getElementById('btnCopyLink')?.addEventListener('click', copyPageLink);
  document.getElementById('btnCopyLinkModal')?.addEventListener('click', copyPageLink);
  document.getElementById('logoContainer')?.addEventListener('click', () => playBeep());

  // Click outside the modal box (on the dark overlay) closes it.
  // Clicks inside the box itself must not bubble up and trigger that close.
  [qrModal, settingsModal].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
    modal?.querySelector('.modal-box')?.addEventListener('click', (e) => e.stopPropagation());
  });

  document.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal-overlay')));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(qrModal);
      closeModal(settingsModal);
    }
  });

  document.getElementById('settingsTabs')?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.settings-tab');
    if (tabBtn) switchSettingsTab(tabBtn.dataset.tab);
  });
}

function wireAppearanceControls() {
  document.getElementById('themeSwatchGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-swatch');
    if (btn) Appearance.setTheme(btn.dataset.theme);
  });

  document.getElementById('customColorInput')?.addEventListener('input', (e) => {
    Appearance.setCustomColor(e.target.value);
  });

  document.getElementById('bgThumbGrid')?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-action="remove-custom-bg"]');
    if (removeBtn) {
      e.stopPropagation();
      Appearance.removeCustomBackground();
      return;
    }
    const thumb = e.target.closest('.bg-thumb');
    if (thumb && thumb.dataset.bg !== 'custom') {
      Appearance.setBackground(thumb.dataset.bg);
    }
  });

  const uploadZone = document.getElementById('bgUploadZone');
  const uploadInput = document.getElementById('bgUploadInput');
  if (uploadZone && uploadInput) {
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) Appearance.handleBackgroundFile(file);
      uploadInput.value = ''; // allow re-selecting the same file later
    });
    ['dragover', 'dragenter'].forEach((evt) => {
      uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
      });
    });
    uploadZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) Appearance.handleBackgroundFile(file);
    });
  }

  const profileNameInput = document.getElementById('profileNameInput');
  document.getElementById('profileSaveBtn')?.addEventListener('click', () => {
    if (Appearance.saveCurrentAsProfile(profileNameInput?.value || '')) {
      profileNameInput.value = '';
    }
  });
  profileNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (Appearance.saveCurrentAsProfile(profileNameInput.value)) {
        profileNameInput.value = '';
      }
    }
  });

  document.getElementById('profileList')?.addEventListener('click', (e) => {
    const applyBtn = e.target.closest('[data-action="apply-profile"]');
    const delBtn = e.target.closest('[data-action="delete-profile"]');
    if (applyBtn) Appearance.applyProfile(applyBtn.dataset.id);
    if (delBtn) Appearance.deleteProfile(delBtn.dataset.id);
  });
}

function wireContactForm() {
  const orderForm = document.getElementById('orderForm');
  if (!orderForm) return;
  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span>در حال ارسال...</span> <i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
      const response = await fetch(orderForm.action, {
        method: 'POST',
        body: new FormData(orderForm),
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        showToast('درخواست شما با موفقیت ارسال شد! 🚀');
        orderForm.reset();
        playBeep(880);
      } else {
        let message = 'ارسال درخواست ناموفق بود. لطفاً دوباره تلاش کنید.';
        try {
          const data = await response.json();
          if (data && Array.isArray(data.errors) && data.errors.length) {
            message = data.errors.map((err) => err.message).join('، ');
          }
        } catch (_) {
          /* response wasn't JSON — keep the generic message */
        }
        showToast(message, true);
      }
    } catch (_) {
      showToast('خطا در اتصال به اینترنت. لطفاً دوباره تلاش کنید.', true);
    } finally {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('copyrightYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const qrImg = document.getElementById('qrImage');
  if (qrImg) qrImg.src = buildQrUrl();

  Appearance.init();
  wireModals();
  wireAppearanceControls();
  wireContactForm();
});
