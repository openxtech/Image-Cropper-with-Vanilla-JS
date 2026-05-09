/*!
 * ClaudeCrop - v1.0.1
 * A flexible, jQuery-free image cropping plugin with aspect ratio support
 *
 * Features:
 *  - Zero dependencies (no jQuery)
 *  - Pointer Events API (mouse + touch + stylus unified)
 *  - Pinch-to-zoom support
 *  - Mouse wheel zoom
 *  - Promise-based image loading
 *  - EventEmitter API (.on / .off / .once)
 *  - exportBlob() for async Blob export
 *  - Full rotation support
 *  - Aspect ratio lock (1:1, 4:3, 16:9, 9:16, or any custom ratio)
 *  - Edit locking (lock/unlock interactions at init or runtime)
 *  - ES6 classes, tree-shakeable
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.ClaudeCrop = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ─────────────────────────── Constants ──────────────────────────── */

  const ERRORS = {
    IMAGE_FAILED_TO_LOAD: { code: 0, message: 'Image failed to load.' },
    SMALL_IMAGE:          { code: 1, message: 'Image is too small.' },
    INVALID_FILE:         { code: 2, message: 'File is not a valid image.' },
  };

  const CLASS = {
    PREVIEW:         'cc-preview',
    IMAGE_CONTAINER: 'cc-preview-image-container',
    PREVIEW_IMAGE:   'cc-preview-image',
    BG_CONTAINER:    'cc-preview-background-container',
    BG_IMAGE:        'cc-preview-background',
    CROP_OVERLAY:    'cc-crop-overlay',
    CROP_FRAME:      'cc-crop-frame',
    IMAGE_LOADING:   'cc-image-loading',
    IMAGE_LOADED:    'cc-image-loaded',
    DRAG_HOVERED:    'cc-drag-hovered',
    DISABLED:        'cc-disabled',
    LOCKED:          'cc-locked',   // NEW: edit-locked state (interactions blocked, file input still active)
  };

  /* ─────────────────────────── Utilities ──────────────────────────── */

  const clamp  = (v, min, max) => Math.max(min, Math.min(max, v));
  const round2 = (x) => Math.round(x * 100) / 100;
  const exists = (v) => v !== undefined && v !== null;

  function normalizeEl(el, root) {
    if (!el) return null;
    if (typeof el === 'string') return (root || document).querySelector(el);
    return el instanceof Element ? el : null;
  }

  function css(el, styles) { Object.assign(el.style, styles); }

  function createElement(tag, className, styles = {}) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    css(el, styles);
    return el;
  }

  /**
   * Parse an aspect ratio into { w, h } numbers.
   * Accepts:
   *   - '16:9' | '4:3' | '1:1' | '9:16'  (string)
   *   - { w: 16, h: 9 }                   (object)
   *   - { width: 16, height: 9 }          (object)
   *   - 1.777...                           (number → w=ratio, h=1)
   *   - null | undefined                  → free (no ratio)
   * @param {string|object|number|null} ratio
   * @returns {{ w: number, h: number }|null}
   */
  function parseRatio(ratio) {
    if (!ratio) return null;

    if (typeof ratio === 'number') {
      return ratio > 0 ? { w: ratio, h: 1 } : null;
    }

    if (typeof ratio === 'string') {
      const parts = ratio.split(':').map(Number);
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        return { w: parts[0], h: parts[1] };
      }
      return null;
    }

    if (typeof ratio === 'object') {
      const w = ratio.w || ratio.width;
      const h = ratio.h || ratio.height;
      if (w > 0 && h > 0) return { w, h };
    }

    return null;
  }

  /* ──────────────────────────── EventEmitter ───────────────────────── */

  class EventEmitter {
    constructor() { this._listeners = {}; }

    on(event, fn) {
      (this._listeners[event] = this._listeners[event] || []).push({ fn, once: false });
      return this;
    }

    once(event, fn) {
      (this._listeners[event] = this._listeners[event] || []).push({ fn, once: true });
      return this;
    }

    off(event, fn) {
      if (!this._listeners[event]) return this;
      this._listeners[event] = this._listeners[event].filter(l => l.fn !== fn);
      return this;
    }

    emit(event, ...args) {
      (this._listeners[event] || []).slice().forEach(l => {
        l.fn(...args);
        if (l.once) this.off(event, l.fn);
      });
      return this;
    }
  }

  /* ──────────────────────────── Zoomer ────────────────────────────── */

  class Zoomer {
    constructor() { this.minZoom = 1; this.maxZoom = 1; }

    setup({ imageSize, previewSize, exportZoom = 1, maxZoom = 1, minZoom = 'fill', smallImage = 'reject' }) {
      if (!imageSize || !previewSize) return;
      const wR = previewSize.width  / imageSize.width;
      const hR = previewSize.height / imageSize.height;

      this.minZoom = minZoom === 'fit'  ? Math.min(wR, hR)
                   : minZoom === 'fill' ? Math.max(wR, hR)
                   : Number(minZoom) || Math.max(wR, hR);

      if (smallImage === 'allow') this.minZoom = Math.min(this.minZoom, 1);
      this.maxZoom = Math.max(this.minZoom, maxZoom / exportZoom);
    }

    clamp(z)        { return clamp(z, this.minZoom, this.maxZoom); }
    sliderToZoom(p) { return this.minZoom === this.maxZoom ? this.minZoom : p * (this.maxZoom - this.minZoom) + this.minZoom; }
    zoomToSlider(z) { return this.minZoom === this.maxZoom ? 0 : (z - this.minZoom) / (this.maxZoom - this.minZoom); }
    isZoomable()    { return this.minZoom !== this.maxZoom; }
  }

  /* ──────────────────────────── ClaudeCrop ─────────────────────────── */

  class ClaudeCrop extends EventEmitter {
    /**
     * @param {string|Element} element - Root container
     * @param {object} options
     * @param {boolean} [options.locked=false]
     *   Start with all edit interactions locked (drag, zoom, rotation).
     *   File loading remains active. Call unlock() to re-enable edits.
     * @param {string|object|number|null} [options.aspectRatio=null]
     *   Lock crop to a ratio. Examples: '16:9', '4:3', '1:1', '9:16',
     *   { w:16, h:9 }, 1.777, null (free).
     * @param {'contain'|'cover'} [options.aspectRatioFit='contain']
     *   How the crop frame fits inside the preview when ratio is set.
     *   'contain' → crop frame is as large as possible without overflow.
     *   'cover'   → crop frame covers the full preview (overflow is clipped).
     */
    constructor(element, options = {}) {
      super();

      this._el = normalizeEl(element) || (typeof element === 'string' ? document.querySelector(element) : element);
      if (!this._el) throw new Error('[ClaudeCrop] Invalid element.');

      this._opts = Object.assign({
        // Elements
        previewEl:    '.' + CLASS.PREVIEW,
        fileInputEl:  'input.cc-image-input',
        zoomSliderEl: 'input.cc-image-zoom-input',

        // Dimensions
        width:  null,
        height: null,

        // Zoom
        minZoom:     'fill',
        maxZoom:     1,
        initialZoom: 'min',
        exportZoom:  1,
        wheelZoom:   true,
        pinchZoom:   true,

        // Behavior
        freeMove:       false,
        allowDragNDrop: true,
        smallImage:     'reject',

        // ── Edit lock (NEW) ────────────────────────────────────────
        locked: false,   // true → start locked; call unlock() to re-enable
        // ──────────────────────────────────────────────────────────

        // ── Aspect ratio ───────────────────────────────────────────
        aspectRatio:    null,      // '16:9' | '4:3' | '1:1' | '9:16' | {w,h} | number | null
        aspectRatioFit: 'contain', // 'contain' | 'cover'
        showCropFrame:  true,      // show the animated crop-frame overlay when ratio is set
        // ──────────────────────────────────────────────────────────

        // Background overlay
        imageBackground: false,
        imageBackgroundBorderWidth: [0, 0, 0, 0],

        // Initial state
        imageState: null,

        // Callbacks
        onFileChange:      () => {},
        onFileReaderError: () => {},
        onImageLoading:    () => {},
        onImageLoaded:     () => {},
        onImageError:      () => {},
        onZoomEnabled:     () => {},
        onZoomDisabled:    () => {},
        onZoomChange:      () => {},
        onOffsetChange:    () => {},
        onAspectRatioChange: () => {},
        onLock:            () => {},   // NEW
        onUnlock:          () => {},   // NEW
      }, options);

      this._zoomer      = new Zoomer();
      this._imageLoaded = false;
      this._zoom        = 1;
      this._offset      = { x: 0, y: 0 };
      this._rotation    = 0;
      this._locked      = false;   // NEW: internal lock flag (set properly in _init)

      // Parse initial aspect ratio
      this._aspectRatio = parseRatio(this._opts.aspectRatio);

      this._image    = new Image();
      this._preImage = new Image();
      this._image.crossOrigin = this._preImage.crossOrigin = 'anonymous';
      this._image.onload    = () => this._onImageLoaded();
      this._preImage.onload = () => this._onPreImageLoaded();
      this._image.onerror = this._preImage.onerror = () =>
        this._onImageError(ERRORS.IMAGE_FAILED_TO_LOAD);

      this._init();
    }

    /* ──────── Initialisation ──────── */

    _init() {
      this._preview    = normalizeEl(this._opts.previewEl, this._el)    || this._el.querySelector('.' + CLASS.PREVIEW) || this._el;
      this._fileInput  = normalizeEl(this._opts.fileInputEl, this._el);
      this._zoomSlider = normalizeEl(this._opts.zoomSliderEl, this._el);

      this._previewSize = {
        width:  this._opts.width  || this._preview.clientWidth,
        height: this._opts.height || this._preview.clientHeight,
      };

      css(this._preview, { position: 'relative', overflow: 'hidden' });

      // Image element
      this._imgEl = createElement('img', CLASS.PREVIEW_IMAGE, {
        position: 'absolute', transformOrigin: 'top left',
        willChange: 'transform', userSelect: 'none', pointerEvents: 'none',
      });
      this._imgEl.alt = '';

      // Drag container
      this._imgContainer = createElement('div', CLASS.IMAGE_CONTAINER, {
        position: 'absolute', inset: '0',
        cursor: 'grab', touchAction: 'none',
      });
      this._imgContainer.appendChild(this._imgEl);
      this._preview.appendChild(this._imgContainer);

      // Background
      if (this._opts.imageBackground) {
        const bw = Array.isArray(this._opts.imageBackgroundBorderWidth)
          ? this._opts.imageBackgroundBorderWidth
          : [0, 1, 2, 3].map(() => this._opts.imageBackgroundBorderWidth);

        this._bgEl = createElement('img', CLASS.BG_IMAGE, {
          position: 'absolute', transformOrigin: 'top left',
          willChange: 'transform', pointerEvents: 'none',
          filter: 'blur(8px)', opacity: '0.45',
          left: bw[3] + 'px', top: bw[0] + 'px',
        });
        this._bgEl.alt = '';

        this._bgContainer = createElement('div', CLASS.BG_CONTAINER, {
          position: 'absolute', zIndex: '0',
          top: -bw[0]+'px', right: -bw[1]+'px', bottom: -bw[2]+'px', left: -bw[3]+'px',
          overflow: 'hidden',
        });
        this._bgContainer.appendChild(this._bgEl);
        this._preview.prepend(this._bgContainer);
      }

      if (this._fileInput) this._fileInput.setAttribute('accept', 'image/*');
      if (this._zoomSlider) {
        this._zoomSlider.min  = '0';
        this._zoomSlider.max  = '1';
        this._zoomSlider.step = '0.001';
      }

      this._setInitialZoomOption(this._opts.initialZoom);
      this._buildCropFrame();
      this._applyCropFrame();
      this._bindListeners();

      // Apply initial lock state AFTER listeners are bound so lock() can
      // properly reflect the locked cursor without removing event listeners.
      if (this._opts.locked) this.lock();

      if (this._opts.imageState && this._opts.imageState.src) {
        this.loadImage(this._opts.imageState.src);
      }
    }

    _setInitialZoomOption(opt) {
      this._opts.initialZoom = opt;
      this._initialZoom = (opt === 'image') ? 1 : 0;
    }

    /* ──────── Crop Frame (aspect ratio overlay) ──────── */

    _buildCropFrame() {
      this._cropOverlay = createElement('div', CLASS.CROP_OVERLAY, {
        position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '10',
      });

      const curtainStyle = {
        position: 'absolute', background: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(1px)', transition: 'all .25s ease',
      };

      this._curtains = {
        top:    createElement('div', '', { ...curtainStyle }),
        right:  createElement('div', '', { ...curtainStyle }),
        bottom: createElement('div', '', { ...curtainStyle }),
        left:   createElement('div', '', { ...curtainStyle }),
      };
      Object.values(this._curtains).forEach(c => this._cropOverlay.appendChild(c));

      this._cropFrame = createElement('div', CLASS.CROP_FRAME, {
        position: 'absolute', boxSizing: 'border-box',
        border: '2px solid rgba(255,255,255,0.85)',
        pointerEvents: 'none', transition: 'all .25s ease',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
      });

      for (let i = 1; i <= 2; i++) {
        const vl = createElement('div', '', {
          position: 'absolute', top: '0', bottom: '0',
          left: (i * 100 / 3) + '%', width: '1px',
          background: 'rgba(255,255,255,0.18)',
        });
        const hl = createElement('div', '', {
          position: 'absolute', left: '0', right: '0',
          top: (i * 100 / 3) + '%', height: '1px',
          background: 'rgba(255,255,255,0.18)',
        });
        this._cropFrame.appendChild(vl);
        this._cropFrame.appendChild(hl);
      }

      const corners = [
        { top: '-4px', left: '-4px' },
        { top: '-4px', right: '-4px' },
        { bottom: '-4px', left: '-4px' },
        { bottom: '-4px', right: '-4px' },
      ];
      corners.forEach(pos => {
        const h = createElement('div', '', {
          position: 'absolute', width: '14px', height: '14px',
          background: '#fff', borderRadius: '2px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          ...pos,
        });
        this._cropFrame.appendChild(h);
      });

      this._cropOverlay.appendChild(this._cropFrame);
      this._preview.appendChild(this._cropOverlay);
    }

    _applyCropFrame() {
      const pw = this._previewSize.width;
      const ph = this._previewSize.height;

      if (!this._aspectRatio) {
        this._cropRect = { x: 0, y: 0, width: pw, height: ph };
        css(this._cropOverlay, { display: 'none' });
        return;
      }

      if (!this._opts.showCropFrame) {
        css(this._cropOverlay, { display: 'none' });
      } else {
        css(this._cropOverlay, { display: 'block' });
      }

      const { w: rw, h: rh } = this._aspectRatio;
      const targetRatio  = rw / rh;
      const previewRatio = pw / ph;
      const fit          = this._opts.aspectRatioFit;

      let cropW, cropH;

      if (fit === 'cover') {
        if (targetRatio > previewRatio) { cropW = pw; cropH = pw / targetRatio; }
        else                            { cropH = ph; cropW = ph * targetRatio; }
      } else {
        if (targetRatio > previewRatio) { cropW = pw; cropH = pw / targetRatio; }
        else                            { cropH = ph; cropW = ph * targetRatio; }
      }

      cropW = Math.round(cropW);
      cropH = Math.round(cropH);

      const cx = Math.round((pw - cropW) / 2);
      const cy = Math.round((ph - cropH) / 2);

      this._cropRect = { x: cx, y: cy, width: cropW, height: cropH };

      css(this._curtains.top,    { top: '0', left: '0', right: '0',    height: cy + 'px' });
      css(this._curtains.bottom, { bottom: '0', left: '0', right: '0', height: (ph - cy - cropH) + 'px' });
      css(this._curtains.left,   { top: cy+'px', left: '0',            width: cx+'px', height: cropH+'px' });
      css(this._curtains.right,  { top: cy+'px', right: '0',           width: (pw - cx - cropW)+'px', height: cropH+'px' });

      css(this._cropFrame, { top: cy+'px', left: cx+'px', width: cropW+'px', height: cropH+'px' });
    }

    /* ──────── Listener management ──────── */

    _bindListeners() {
      this._h = {
        fileChange:  this._onFileChange.bind(this),
        pointerDown: this._onPointerDown.bind(this),
        pointerMove: this._onPointerMove.bind(this),
        pointerUp:   this._onPointerUp.bind(this),
        wheel:       this._onWheel.bind(this),
        dragover:    this._onDragOver.bind(this),
        drop:        this._onDrop.bind(this),
        dragleave:   this._onDragLeave.bind(this),
        slider:      this._onSliderChange.bind(this),
      };

      if (this._fileInput) this._fileInput.addEventListener('change', this._h.fileChange);

      this._imgContainer.addEventListener('pointerdown',   this._h.pointerDown);
      this._imgContainer.addEventListener('pointermove',   this._h.pointerMove);
      this._imgContainer.addEventListener('pointerup',     this._h.pointerUp);
      this._imgContainer.addEventListener('pointercancel', this._h.pointerUp);

      if (this._opts.wheelZoom)
        this._imgContainer.addEventListener('wheel', this._h.wheel, { passive: false });

      if (this._opts.allowDragNDrop) {
        this._imgContainer.addEventListener('dragover',  this._h.dragover);
        this._imgContainer.addEventListener('drop',      this._h.drop);
        this._imgContainer.addEventListener('dragleave', this._h.dragleave);
      }

      if (this._zoomSlider) this._zoomSlider.addEventListener('input', this._h.slider);
    }

    _unbindListeners() {
      if (this._fileInput) this._fileInput.removeEventListener('change', this._h.fileChange);
      ['pointerdown','pointermove','pointerup','pointercancel'].forEach(ev =>
        this._imgContainer.removeEventListener(ev, ev === 'pointerdown' ? this._h.pointerDown : ev === 'pointermove' ? this._h.pointerMove : this._h.pointerUp)
      );
      this._imgContainer.removeEventListener('wheel',    this._h.wheel);
      this._imgContainer.removeEventListener('dragover', this._h.dragover);
      this._imgContainer.removeEventListener('drop',     this._h.drop);
      this._imgContainer.removeEventListener('dragleave',this._h.dragleave);
      if (this._zoomSlider) this._zoomSlider.removeEventListener('input', this._h.slider);
    }

    /* ──────── File & image loading ──────── */

    _onFileChange(e) {
      const file = e.target.files && e.target.files[0];
      this._opts.onFileChange(e); this.emit('filechange', e);
      if (file) this._loadFile(file);
    }

    _loadFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        this._onImageError(ERRORS.INVALID_FILE);
        this._opts.onFileReaderError(); this.emit('filereaderror');
        return;
      }
      const reader = new FileReader();
      reader.onload  = e => this.loadImage(e.target.result);
      reader.onerror = () => { this._opts.onFileReaderError(); this.emit('filereaderror'); };
      reader.readAsDataURL(file);
    }

    loadImage(src) {
      if (!src) return Promise.reject(new Error('No src provided'));

      this._opts.onImageLoading(); this.emit('imageloading'); this._setLoadingClass();

      return new Promise((resolve, reject) => {
        this._loadResolve = resolve;
        this._loadReject  = reject;

        if (src.startsWith('data:') || src.startsWith('blob:')) {
          this._preImage.src = src;
        } else {
          fetch(src)
            .then(r => r.ok ? r.blob() : Promise.reject())
            .then(blob => { this._preImage.src = URL.createObjectURL(blob); })
            .catch(() => this._onImageError(ERRORS.IMAGE_FAILED_TO_LOAD));
        }
      });
    }

    _onPreImageLoaded() {
      if (this._shouldRejectImage({ imageWidth: this._preImage.naturalWidth, imageHeight: this._preImage.naturalHeight })) {
        this._onImageError(ERRORS.SMALL_IMAGE);
        if (this._image.src) this._setLoadedClass();
        return;
      }
      this._image.src = this._preImage.src;
    }

    _onImageLoaded() {
      this._rotation = 0;
      this._setupZoomer(
        this._opts.imageState && exists(this._opts.imageState.zoom)
          ? this._opts.imageState.zoom
          : this._initialZoom
      );

      if (this._opts.imageState && this._opts.imageState.offset) {
        this.offset = this._opts.imageState.offset;
      } else {
        this.centerImage();
      }

      this._opts.imageState = {};
      this._imgEl.src = this._image.src;
      if (this._bgEl) this._bgEl.src = this._image.src;

      this._setLoadedClass();
      this._imageLoaded = true;

      this._opts.onImageLoaded(); this.emit('imageloaded');
      if (this._loadResolve) { this._loadResolve(); this._loadResolve = null; }
    }

    _onImageError(err) {
      this._removeLoadingClass();
      this._opts.onImageError(err); this.emit('imageerror', err);
      if (this._loadReject) { this._loadReject(err); this._loadReject = null; }
    }

    /* ──────── Pointer ──────── */

    _onPointerDown(e) {
      if (this._locked) return;                          // ← LOCK GUARD
      if (!this._imageLoaded || e.button > 0) return;
      this._activePointers = this._activePointers || new Map();
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._imgContainer.setPointerCapture(e.pointerId);

      if (this._activePointers.size === 1) {
        this._dragOrigin   = { x: e.clientX, y: e.clientY };
        this._moveContinue = true;
        this._imgContainer.style.cursor = 'grabbing';
      }

      if (this._activePointers.size === 2 && this._opts.pinchZoom) {
        this._pinchStartDist = this._getPinchDist();
        this._pinchStartZoom = this._zoom;
        this._moveContinue   = false;
      }

      e.preventDefault();
    }

    _onPointerMove(e) {
      if (this._locked) return;                          // ← LOCK GUARD
      if (!this._imageLoaded || !this._activePointers || !this._activePointers.has(e.pointerId)) return;
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._activePointers.size === 2 && this._opts.pinchZoom) {
        const scale = this._getPinchDist() / (this._pinchStartDist || 1);
        this.zoom = this._pinchStartZoom * scale;
        return;
      }

      if (this._moveContinue && this._activePointers.size === 1) {
        this.offset = {
          x: this._offset.x + e.clientX - this._dragOrigin.x,
          y: this._offset.y + e.clientY - this._dragOrigin.y,
        };
        this._dragOrigin = { x: e.clientX, y: e.clientY };
      }

      e.preventDefault();
    }

    _onPointerUp(e) {
      if (this._activePointers) this._activePointers.delete(e.pointerId);
      if (!this._activePointers || this._activePointers.size === 0) {
        this._moveContinue = false;
        // Restore cursor according to lock state
        this._imgContainer.style.cursor = this._locked ? 'default' : 'grab';
      }
    }

    _getPinchDist() {
      if (!this._activePointers || this._activePointers.size < 2) return 0;
      const [a, b] = [...this._activePointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    /* ──────── Wheel ──────── */

    _onWheel(e) {
      if (this._locked) return;                          // ← LOCK GUARD
      if (!this._imageLoaded) return;
      e.preventDefault();

      const delta   = e.deltaY > 0 ? -0.05 : 0.05;
      const rect    = this._preview.getBoundingClientRect();
      const mx      = e.clientX - rect.left;
      const my      = e.clientY - rect.top;
      const oldZoom = this._zoom;
      const newZoom = this._zoomer.clamp(oldZoom + delta * (this._zoomer.maxZoom - this._zoomer.minZoom));

      if (newZoom === oldZoom) return;

      const ratio = newZoom / oldZoom;
      this._zoom  = newZoom;
      this.offset = { x: mx - (mx - this._offset.x) * ratio, y: my - (my - this._offset.y) * ratio };

      this._syncSlider();
      this._opts.onZoomChange(newZoom); this.emit('zoomchange', newZoom);
    }

    /* ──────── Drag & drop ──────── */

    _onDragOver(e)  { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; this._preview.classList.add(CLASS.DRAG_HOVERED); }
    _onDragLeave()  { this._preview.classList.remove(CLASS.DRAG_HOVERED); }
    _onDrop(e) {
      e.preventDefault(); e.stopPropagation();
      this._preview.classList.remove(CLASS.DRAG_HOVERED);
      const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
      if (f) this._loadFile(f);
    }

    /* ──────── Slider ──────── */

    _onSliderChange() {
      if (this._locked) return;                          // ← LOCK GUARD
      if (!this._imageLoaded) return;
      const z = this._zoomer.sliderToZoom(+this._zoomSlider.value);
      if (z !== this._zoom) this.zoom = z;
    }

    _syncSlider() {
      if (this._zoomSlider) this._zoomSlider.value = this._zoomer.zoomToSlider(this._zoom);
    }

    /* ──────── Zoom logic ──────── */

    _setupZoomer(targetZoom) {
      this._zoomer.setup({
        imageSize:  this.imageSize,
        previewSize: this._cropRect
          ? { width: this._cropRect.width, height: this._cropRect.height }
          : this._previewSize,
        exportZoom: this._opts.exportZoom,
        maxZoom:    this._opts.maxZoom,
        minZoom:    this._opts.minZoom,
        smallImage: this._opts.smallImage,
      });

      this._zoom = exists(targetZoom) ? this._zoomer.clamp(targetZoom) : this._zoom;
      this._syncSlider();
      // Respect lock state when deciding slider enabled/disabled
      if (!this._locked) {
        this._zoomer.isZoomable() ? this._enableSlider() : this._disableSlider();
      }
    }

    _fixOffset({ x, y }) {
      if (!this._imageLoaded) return { x, y };

      const iw = this.imageWidth  * this._zoom;
      const ih = this.imageHeight * this._zoom;
      const cr = this._cropRect || { x: 0, y: 0, width: this._previewSize.width, height: this._previewSize.height };

      if (!this._opts.freeMove) {
        const minX = cr.x + cr.width  - iw;
        const minY = cr.y + cr.height - ih;
        const maxX = cr.x;
        const maxY = cr.y;

        if (iw >= cr.width)  { x = clamp(x, minX, maxX); }
        else                  { x = clamp(x, maxX, minX); }
        if (ih >= cr.height) { y = clamp(y, minY, maxY); }
        else                  { y = clamp(y, maxY, minY); }
      }

      return { x: round2(x), y: round2(y) };
    }

    /* ──────── Render ──────── */

    _renderImage() {
      const { x, y } = this._rotatedOffset;
      const t = `translate(${x}px,${y}px) scale(${this._zoom}) rotate(${this._rotation}deg)`;
      css(this._imgEl, { transform: t });
      if (this._bgEl) css(this._bgEl, { transform: t });
    }

    get _rotatedOffset() {
      const { x, y } = this._offset;
      const iw = this._image.naturalWidth, ih = this._image.naturalHeight;
      const z = this._zoom, r = this._rotation;
      return {
        x: x + (r === 90  ? ih * z : 0) + (r === 180 ? iw * z : 0),
        y: y + (r === 180 ? ih * z : 0) + (r === 270 ? iw * z : 0),
      };
    }

    /* ──────── CSS class helpers ──────── */

    _setLoadingClass()   { this._preview.classList.remove(CLASS.IMAGE_LOADED); this._preview.classList.add(CLASS.IMAGE_LOADING); }
    _setLoadedClass()    { this._preview.classList.remove(CLASS.IMAGE_LOADING); this._preview.classList.add(CLASS.IMAGE_LOADED); }
    _removeLoadingClass(){ this._preview.classList.remove(CLASS.IMAGE_LOADING); }
    _enableSlider()      { if (this._zoomSlider) this._zoomSlider.removeAttribute('disabled'); this._opts.onZoomEnabled(); this.emit('zoomenabled'); }
    _disableSlider()     { if (this._zoomSlider) this._zoomSlider.setAttribute('disabled', true); this._opts.onZoomDisabled(); this.emit('zoomdisabled'); }

    _shouldRejectImage({ imageWidth, imageHeight }) {
      if (this._opts.smallImage !== 'reject') return false;
      const pw = this._previewSize.width, ph = this._previewSize.height;
      return imageWidth  * this._opts.maxZoom < pw * this._opts.exportZoom
          || imageHeight * this._opts.maxZoom < ph * this._opts.exportZoom;
    }

    /* ────────────────────────────────────────────────────────────────
     *  PUBLIC API
     * ──────────────────────────────────────────────────────────────── */

    /** Center the image inside the crop zone */
    centerImage() {
      if (!this._image.naturalWidth || !this._zoom) return;
      const cr = this._cropRect || { x: 0, y: 0, width: this._previewSize.width, height: this._previewSize.height };
      this.offset = {
        x: cr.x + (cr.width  - this.imageWidth  * this._zoom) / 2,
        y: cr.y + (cr.height - this.imageHeight * this._zoom) / 2,
      };
    }

    /**
     * Rotate 90° clockwise.
     * No-op when locked.
     */
    rotateCW() {
      if (this._locked) return;                          // ← LOCK GUARD
      this._rotation = (this._rotation + 90) % 360;
      if (this._imageLoaded) { this._setupZoomer(); this.centerImage(); }
    }

    /**
     * Rotate 90° counter-clockwise.
     * No-op when locked.
     */
    rotateCCW() {
      if (this._locked) return;                          // ← LOCK GUARD
      this._rotation = (this._rotation + 270) % 360;
      if (this._imageLoaded) { this._setupZoomer(); this.centerImage(); }
    }

    /** Reset zoom and center. No-op when locked. */
    reset() {
      if (this._locked) return;                          // ← LOCK GUARD
      if (!this._imageLoaded) return;
      this._rotation = 0;
      this._setupZoomer(this._initialZoom);
      this.centerImage();
    }

    /** Disable all interactions (including file input). Adds cc-disabled class. */
    disable() {
      this._unbindListeners();
      this._disableSlider();
      this._el.classList.add(CLASS.DISABLED);
    }

    /** Re-enable all interactions. Removes cc-disabled class. */
    enable() {
      this._bindListeners();
      if (this._zoomer.isZoomable()) this._enableSlider();
      this._el.classList.remove(CLASS.DISABLED);
    }

    /**
     * Lock all edit interactions (drag, zoom, rotation).
     * File loading via the file input remains active.
     * Emits 'lock' and calls onLock callback.
     */
    lock() {
      if (this._locked) return;
      this._locked = true;
      this._el.classList.add(CLASS.LOCKED);
      this._imgContainer.style.cursor = 'default';
      this._disableSlider();
      this._opts.onLock();
      this.emit('lock');
    }

    /**
     * Unlock edit interactions previously locked with lock() or locked:true.
     * Emits 'unlock' and calls onUnlock callback.
     */
    unlock() {
      if (!this._locked) return;
      this._locked = false;
      this._el.classList.remove(CLASS.LOCKED);
      this._imgContainer.style.cursor = 'grab';
      if (this._imageLoaded && this._zoomer.isZoomable()) this._enableSlider();
      this._opts.onUnlock();
      this.emit('unlock');
    }

    /** @returns {boolean} Whether edits are currently locked */
    get isLocked() { return this._locked; }

    isZoomable() { return this._zoomer.isZoomable(); }

    setAspectRatio(ratio) {
      this._aspectRatio = parseRatio(ratio);
      this._opts.aspectRatio = ratio;
      this._applyCropFrame();

      if (this._imageLoaded) {
        this._setupZoomer();
        this.centerImage();
      }

      this._opts.onAspectRatioChange(this._aspectRatio);
      this.emit('aspectratiochange', this._aspectRatio);
    }

    getAspectRatio() { return this._aspectRatio ? { ...this._aspectRatio } : null; }

    export(options = {}) {
      if (!this._image.src) return null;

      const opts = Object.assign({
        type: 'image/png', quality: 0.92, originalSize: false, fillBg: '#fff',
      }, options);

      const exportZoom = opts.originalSize ? 1 / this._zoom : this._opts.exportZoom;
      const cr = this._cropRect || { x: 0, y: 0, width: this._previewSize.width, height: this._previewSize.height };

      const canvas = document.createElement('canvas');
      canvas.width  = cr.width  * exportZoom;
      canvas.height = cr.height * exportZoom;
      const ctx = canvas.getContext('2d');

      if (opts.type === 'image/jpeg') {
        ctx.fillStyle = opts.fillBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const ox = (this._rotatedOffset.x - cr.x) * exportZoom;
      const oy = (this._rotatedOffset.y - cr.y) * exportZoom;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(this._rotation * Math.PI / 180);
      ctx.drawImage(
        this._image, 0, 0,
        this._zoom * exportZoom * this._image.naturalWidth,
        this._zoom * exportZoom * this._image.naturalHeight
      );
      ctx.restore();

      return canvas.toDataURL(opts.type, opts.quality);
    }

    exportBlob(options = {}) {
      return new Promise((resolve, reject) => {
        const dataUrl = this.export(options);
        if (!dataUrl) return reject(new Error('No image loaded'));
        fetch(dataUrl).then(r => r.blob()).then(resolve).catch(reject);
      });
    }

    destroy() {
      this._unbindListeners();
      this._imgContainer.remove();
      if (this._bgContainer) this._bgContainer.remove();
      if (this._cropOverlay) this._cropOverlay.remove();
      this._listeners = {};
    }

    /* ──────── Getters / Setters ──────── */

    get zoom() { return this._zoom; }
    set zoom(v) {
      v = this._zoomer.clamp(v);
      if (this._imageLoaded && this._offset) {
        const old = this._zoom;
        const cx  = this._previewSize.width  / 2;
        const cy  = this._previewSize.height / 2;
        this._zoom = v;
        this.offset = {
          x: cx - (cx - this._offset.x) * v / old,
          y: cy - (cy - this._offset.y) * v / old,
        };
      } else { this._zoom = v; }
      this._syncSlider();
      this._opts.onZoomChange(v); this.emit('zoomchange', v);
    }

    get offset() { return this._offset; }
    set offset(p) {
      if (!p || !exists(p.x) || !exists(p.y)) return;
      this._offset = this._fixOffset(p);
      this._renderImage();
      this._opts.onOffsetChange(this._offset); this.emit('offsetchange', this._offset);
    }

    get imageSrc()     { return this._image.src; }
    set imageSrc(s)    { this.loadImage(s); }
    get imageState()   { return { src: this._image.src, offset: this._offset, zoom: this._zoom }; }
    get imageWidth()   { return this._rotation % 180 === 0 ? this._image.naturalWidth  : this._image.naturalHeight; }
    get imageHeight()  { return this._rotation % 180 === 0 ? this._image.naturalHeight : this._image.naturalWidth;  }
    get imageSize()    { return { width: this.imageWidth, height: this.imageHeight }; }
    get previewSize()  { return { ...this._previewSize }; }
    set previewSize(s) {
      if (!s || s.width <= 0 || s.height <= 0) return;
      this._previewSize = { width: s.width, height: s.height };
      css(this._preview, { width: s.width + 'px', height: s.height + 'px' });
      this._applyCropFrame();
      if (this._imageLoaded) this._setupZoomer();
    }

    get minZoom()      { return this._opts.minZoom; }
    set minZoom(v)     { this._opts.minZoom = v; this._setupZoomer(); }
    get maxZoom()      { return this._opts.maxZoom; }
    set maxZoom(v)     { this._opts.maxZoom = v; this._setupZoomer(); }
    get exportZoom()   { return this._opts.exportZoom; }
    set exportZoom(v)  { this._opts.exportZoom = v; this._setupZoomer(); }
    get initialZoom()  { return this._opts.initialZoom; }
    set initialZoom(v) { this._setInitialZoomOption(v); }
    get rotation()     { return this._rotation; }
    get aspectRatio()  { return this._aspectRatio; }
    set aspectRatio(v) { this.setAspectRatio(v); }
    get cropRect()     { return this._cropRect ? { ...this._cropRect } : null; }
  }

  /* ──────── Statics ──────── */
  ClaudeCrop.ERRORS      = ERRORS;
  ClaudeCrop.parseRatio  = parseRatio;
  ClaudeCrop.version     = '1.0.1';

  ClaudeCrop.RATIOS = {
    FREE:    null,
    SQUARE:  '1:1',
    R4_3:    '4:3',
    R3_4:    '3:4',
    R16_9:   '16:9',
    R9_16:   '9:16',
    R3_2:    '3:2',
    R2_3:    '2:3',
    R21_9:   '21:9',
    GOLDEN:  '1.618:1',
  };

  return ClaudeCrop;
});