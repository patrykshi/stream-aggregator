/* Nuvio Hub — Artwork Studio 2.0 Canvas Controller (Fabric.js wrapper)
 * Gerencia manipulação direta, transformações, camadas, guias magnéticas e exportação de alta fidelidade. */
(() => {
  'use strict';

  class ArtworkCanvas {
    constructor(canvasEl, options = {}) {
      this.canvasEl = canvasEl;
      this.options = options;
      this.width = options.width || 1280;
      this.height = options.height || 720;
      this.scale = 1;
      this.safeMarginsVisible = false;
      this.scrimLayer = null;
      this.bgConfig = {
        type: 'gradient',
        primary: '#182b42',
        secondary: '#060c15',
        accent: '#38bdf8',
        pattern: 'glow',
        scrimOpacity: 0.70
      };

      this.listeners = {
        selectionChange: [],
        modified: [],
        layersChange: []
      };

      this.initFabric();
    }

    initFabric() {
      if (!globalThis.fabric) {
        console.error('Fabric.js não encontrado.');
        return;
      }

      this.fCanvas = new globalThis.fabric.Canvas(this.canvasEl, {
        width: this.width,
        height: this.height,
        preserveObjectStacking: true,
        selection: true,
        backgroundColor: '#070b14',
        uniformScaling: false,
        stopContextMenu: true,
        fireRightClick: true
      });

      // Custom styling for active object controls
      globalThis.fabric.Object.prototype.transparentCorners = false;
      globalThis.fabric.Object.prototype.cornerColor = '#38bdf8';
      globalThis.fabric.Object.prototype.cornerStrokeColor = '#0f172a';
      globalThis.fabric.Object.prototype.borderColor = '#38bdf8';
      globalThis.fabric.Object.prototype.cornerSize = 10;
      globalThis.fabric.Object.prototype.cornerStyle = 'circle';
      globalThis.fabric.Object.prototype.borderScaleFactor = 1.5;
      globalThis.fabric.Object.prototype.borderDashArray = [4, 4];

      // Bind events
      this.fCanvas.on('selection:created', e => this.emitSelection(e.selected?.[0] || null));
      this.fCanvas.on('selection:updated', e => this.emitSelection(e.selected?.[0] || null));
      this.fCanvas.on('selection:cleared', () => this.emitSelection(null));

      this.fCanvas.on('object:modified', () => {
        this.emitModified();
        this.emitLayersChange();
      });
      this.fCanvas.on('object:added', () => this.emitLayersChange());
      this.fCanvas.on('object:removed', () => this.emitLayersChange());

      // Smart snapping during movement
      this.fCanvas.on('object:moving', e => this.handleObjectMoving(e));

      // After render hook to draw alignment guidelines and safe margins
      this.fCanvas.on('after:render', () => this.drawOverlays());
    }

    handleObjectMoving(e) {
      const obj = e.target;
      if (!obj) return;
      const snapThreshold = 10;
      const centerX = this.width / 2;
      const centerY = this.height / 2;

      const objCenterX = obj.left + (obj.getScaledWidth() / 2);
      const objCenterY = obj.top + (obj.getScaledHeight() / 2);

      this.guideX = null;
      this.guideY = null;

      // Snap X to canvas center
      if (Math.abs(objCenterX - centerX) < snapThreshold) {
        obj.left = centerX - (obj.getScaledWidth() / 2);
        this.guideX = centerX;
      }
      // Snap Y to canvas center
      if (Math.abs(objCenterY - centerY) < snapThreshold) {
        obj.top = centerY - (obj.getScaledHeight() / 2);
        this.guideY = centerY;
      }
    }

    drawOverlays() {
      if (this.isExporting) return;
      const ctx = this.fCanvas.contextContainer;
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(this.fCanvas.viewportTransform[0], 0, 0, this.fCanvas.viewportTransform[3], this.fCanvas.viewportTransform[4], this.fCanvas.viewportTransform[5]);

      // Magnetic alignment guides
      if (this.guideX !== null && this.guideX !== undefined) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.guideX, 0);
        ctx.lineTo(this.guideX, this.height);
        ctx.stroke();
      }
      if (this.guideY !== null && this.guideY !== undefined) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, this.guideY);
        ctx.lineTo(this.width, this.guideY);
        ctx.stroke();
      }

      // Safe zones overlay (TV 5% action safe and 10% title safe)
      if (this.safeMarginsVisible) {
        const m5X = this.width * 0.05;
        const m5Y = this.height * 0.05;
        const m10X = this.width * 0.10;
        const m10Y = this.height * 0.10;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(m5X, m5Y, this.width - (m5X * 2), this.height - (m5Y * 2));

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(m10X, m10Y, this.width - (m10X * 2), this.height - (m10Y * 2));

        ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.font = '10px monospace';
        ctx.fillText('Margem de Segurança (TV 10%)', m10X + 8, m10Y + 14);
      }

      ctx.restore();
    }

    setSafeMarginsVisible(visible) {
      this.safeMarginsVisible = Boolean(visible);
      this.fCanvas.requestRenderAll();
    }

    toggleSafeMargins() {
      this.setSafeMarginsVisible(!this.safeMarginsVisible);
      return this.safeMarginsVisible;
    }

    setDimensions(width, height) {
      this.width = width;
      this.height = height;
      this.fCanvas.setWidth(width * this.scale);
      this.fCanvas.setHeight(height * this.scale);
      this.fCanvas.setZoom(this.scale);
      this.updateScrimLayer();
      this.fCanvas.requestRenderAll();
    }

    fitToViewport(containerWidth, containerHeight, padding = 48) {
      const availW = Math.max(200, containerWidth - padding);
      const availH = Math.max(200, containerHeight - padding);
      const scaleX = availW / this.width;
      const scaleY = availH / this.height;
      const scale = Math.min(scaleX, scaleY, 1.25); // Max 125% when screen allows

      this.scale = Math.max(0.15, Math.min(3.0, scale));
      this.fCanvas.setWidth(this.width * this.scale);
      this.fCanvas.setHeight(this.height * this.scale);
      this.fCanvas.setZoom(this.scale);
      this.fCanvas.requestRenderAll();
      return this.scale;
    }

    setZoomLevel(zoomFactor) {
      this.scale = Math.max(0.15, Math.min(3.0, zoomFactor));
      this.fCanvas.setWidth(this.width * this.scale);
      this.fCanvas.setHeight(this.height * this.scale);
      this.fCanvas.setZoom(this.scale);
      this.fCanvas.requestRenderAll();
      return this.scale;
    }

    /* ---------------- Background & Scrim ---------------- */

    applyBackground(bgConfig) {
      this.bgConfig = { ...this.bgConfig, ...bgConfig };
      const { type, primary = '#182b42', secondary = '#060c15', accent = '#38bdf8', direction = 'diagonal', imageUrl } = this.bgConfig;

      if (type === 'solid') {
        this.fCanvas.setBackgroundColor(primary, () => this.fCanvas.requestRenderAll());
        this.fCanvas.setBackgroundImage(null, () => this.fCanvas.requestRenderAll());
      } else if (type === 'gradient') {
        let gradient;
        if (direction === 'radial') {
          gradient = new globalThis.fabric.Gradient({
            type: 'radial',
            coords: {
              r1: 0,
              r2: Math.max(this.width, this.height) * 0.75,
              x1: this.width * 0.5,
              y1: this.height * 0.45,
              x2: this.width * 0.5,
              y2: this.height * 0.45
            },
            colorStops: [
              { offset: 0, color: primary },
              { offset: 0.65, color: secondary },
              { offset: 1, color: '#04070e' }
            ]
          });
        } else if (direction === 'horizontal') {
          gradient = new globalThis.fabric.Gradient({
            type: 'linear',
            coords: { x1: 0, y1: 0, x2: this.width, y2: 0 },
            colorStops: [
              { offset: 0, color: secondary },
              { offset: 0.5, color: primary },
              { offset: 1, color: secondary }
            ]
          });
        } else {
          // Diagonal
          gradient = new globalThis.fabric.Gradient({
            type: 'linear',
            coords: { x1: 0, y1: 0, x2: this.width, y2: this.height },
            colorStops: [
              { offset: 0, color: secondary },
              { offset: 0.55, color: primary },
              { offset: 1, color: '#04070e' }
            ]
          });
        }
        this.fCanvas.setBackgroundColor(gradient, () => this.fCanvas.requestRenderAll());
        this.fCanvas.setBackgroundImage(null, () => this.fCanvas.requestRenderAll());
      } else if ((type === 'image' || type === 'mosaic' || type === 'ai') && imageUrl) {
        globalThis.fabric.Image.fromURL(imageUrl, img => {
          if (!img) return;
          const scaleX = this.width / img.width;
          const scaleY = this.height / img.height;
          const scale = Math.max(scaleX, scaleY);
          img.set({
            originX: 'center',
            originY: 'center',
            left: this.width / 2,
            top: this.height / 2,
            scaleX: scale,
            scaleY: scale
          });
          this.fCanvas.setBackgroundImage(img, () => {
            this.updateScrimLayer();
            this.fCanvas.requestRenderAll();
            this.emitModified();
          });
        }, { crossOrigin: 'anonymous' });
      }

      this.updateScrimLayer();
    }

    updateScrimLayer() {
      // Find or create bottom cinematic scrim gradient
      let scrim = this.fCanvas.getObjects().find(o => o.isScrim);
      const opacity = this.bgConfig.scrimOpacity !== undefined ? this.bgConfig.scrimOpacity : 0.70;

      if (opacity <= 0.05) {
        if (scrim) {
          this.fCanvas.remove(scrim);
        }
        return;
      }

      const scrimGrad = new globalThis.fabric.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: 0, y2: this.height },
        colorStops: [
          { offset: 0, color: 'rgba(6, 8, 15, 0.15)' },
          { offset: 0.45, color: 'rgba(6, 8, 15, 0.35)' },
          { offset: 0.75, color: `rgba(5, 7, 12, ${Math.min(0.95, opacity * 1.1)})` },
          { offset: 1, color: `rgba(4, 6, 10, ${Math.min(0.98, opacity * 1.25)})` }
        ]
      });

      if (!scrim) {
        scrim = new globalThis.fabric.Rect({
          left: 0,
          top: 0,
          width: this.width,
          height: this.height,
          fill: scrimGrad,
          selectable: false,
          evented: false,
          isScrim: true,
          layerName: 'Sobreposição Escura (Scrim)',
          layerType: 'scrim'
        });
        // Place scrim above background but beneath content
        this.fCanvas.add(scrim);
        this.fCanvas.sendToBack(scrim);
      } else {
        scrim.set({
          width: this.width,
          height: this.height,
          fill: scrimGrad
        });
        this.fCanvas.sendToBack(scrim);
      }
      this.fCanvas.requestRenderAll();
    }

    /* ---------------- Elements Creation ---------------- */

    addText({
      text = 'Título da Coleção',
      fontSize = 54,
      fontFamily = 'Manrope',
      fill = '#ffffff',
      fontWeight = 'bold',
      textAlign = 'center',
      left = null,
      top = null,
      isTitle = false,
      isSubtitle = false,
      stroke = '#07111e',
      strokeWidth = 2,
      shadow = null
    } = {}) {
      const centerX = left !== null ? left : this.width / 2;
      const centerY = top !== null ? top : isTitle ? this.height * 0.78 : isSubtitle ? this.height * 0.70 : this.height / 2;

      const defaultShadow = isTitle ? new globalThis.fabric.Shadow({
        color: 'rgba(0, 0, 0, 0.75)',
        blur: 16,
        offsetX: 0,
        offsetY: 4
      }) : null;

      const textbox = new globalThis.fabric.Textbox(text, {
        left: centerX,
        top: centerY,
        originX: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'right' : 'left',
        originY: 'middle',
        width: Math.min(this.width * 0.88, 800),
        fontSize,
        fontFamily,
        fill,
        fontWeight,
        textAlign,
        stroke,
        strokeWidth: strokeWidth || 0,
        paintFirst: 'stroke',
        shadow: shadow || defaultShadow,
        lineHeight: 1.15,
        editable: true,
        layerId: `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        layerName: isTitle ? `Título: ${text.slice(0, 20)}` : isSubtitle ? `Subtítulo: ${text.slice(0, 20)}` : `Texto: ${text.slice(0, 20)}`,
        layerType: 'text'
      });

      this.fCanvas.add(textbox);
      this.fCanvas.setActiveObject(textbox);
      this.fCanvas.requestRenderAll();
      this.emitModified();
      return textbox;
    }

    addImage(imageUrl, {
      left = null,
      top = null,
      width = null,
      height = null,
      asCover = false,
      title = 'Imagem'
    } = {}) {
      return new Promise((resolve, reject) => {
        globalThis.fabric.Image.fromURL(imageUrl, img => {
          if (!img) return reject(Error('Falha ao carregar imagem no canvas.'));

          let scaleX = 1;
          let scaleY = 1;

          if (asCover) {
            scaleX = this.width / img.width;
            scaleY = this.height / img.height;
            const maxScale = Math.max(scaleX, scaleY);
            img.set({
              left: this.width / 2,
              top: this.height / 2,
              originX: 'center',
              originY: 'center',
              scaleX: maxScale,
              scaleY: maxScale
            });
          } else {
            // Fit nicely inside canvas center
            const maxW = width || Math.min(this.width * 0.65, 600);
            const maxH = height || Math.min(this.height * 0.65, 600);
            const s = Math.min(maxW / img.width, maxH / img.height, 1);
            img.set({
              left: left !== null ? left : this.width / 2,
              top: top !== null ? top : this.height / 2,
              originX: 'center',
              originY: 'center',
              scaleX: s,
              scaleY: s
            });
          }

          img.set({
            layerId: `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            layerName: title || 'Imagem',
            layerType: 'image'
          });

          this.fCanvas.add(img);
          this.fCanvas.setActiveObject(img);
          this.fCanvas.requestRenderAll();
          this.emitModified();
          resolve(img);
        }, { crossOrigin: 'anonymous' });
      });
    }

    addShape(shapeType = 'rect', options = {}) {
      const centerX = options.left !== null && options.left !== undefined ? options.left : this.width / 2;
      const centerY = options.top !== null && options.top !== undefined ? options.top : this.height / 2;
      let obj;

      const baseOpts = {
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        fill: options.fill || '#38bdf8',
        stroke: options.stroke || 'transparent',
        strokeWidth: options.strokeWidth || 0,
        opacity: options.opacity !== undefined ? options.opacity : 1,
        layerId: `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        layerType: 'shape'
      };

      if (shapeType === 'circle') {
        obj = new globalThis.fabric.Circle({
          ...baseOpts,
          radius: options.radius || 48,
          layerName: options.layerName || 'Círculo'
        });
      } else if (shapeType === 'badgeBox') {
        const size = options.size || 80;
        obj = new globalThis.fabric.Rect({
          ...baseOpts,
          width: size,
          height: size,
          rx: Math.round(size * 0.28),
          ry: Math.round(size * 0.28),
          fill: options.fill || 'rgba(7, 10, 18, 0.75)',
          stroke: options.stroke || '#38bdf8',
          strokeWidth: options.strokeWidth || 2.5,
          layerName: options.layerName || 'Moldura de Ícone'
        });
      } else if (shapeType === 'line') {
        obj = new globalThis.fabric.Line([centerX - 100, centerY, centerX + 100, centerY], {
          ...baseOpts,
          stroke: options.fill || '#38bdf8',
          strokeWidth: options.strokeWidth || 3,
          layerName: options.layerName || 'Linha Divisória'
        });
      } else {
        // Rectangle
        obj = new globalThis.fabric.Rect({
          ...baseOpts,
          width: options.width || 200,
          height: options.height || 120,
          rx: options.rx || 8,
          ry: options.ry || 8,
          layerName: options.layerName || 'Retângulo'
        });
      }

      this.fCanvas.add(obj);
      this.fCanvas.setActiveObject(obj);
      this.fCanvas.requestRenderAll();
      this.emitModified();
      return obj;
    }

    addIconBadge({ icon = '★', size = 84, fill = '#38bdf8', left = null, top = null } = {}) {
      const centerX = left !== null ? left : this.width / 2;
      const centerY = top !== null ? top : this.height * 0.35;

      const badgeRect = new globalThis.fabric.Rect({
        width: size,
        height: size,
        rx: Math.round(size * 0.28),
        ry: Math.round(size * 0.28),
        fill: '#070a12',
        opacity: 0.85,
        stroke: fill,
        strokeWidth: 2.5,
        originX: 'center',
        originY: 'center'
      });

      const iconText = new globalThis.fabric.Text(icon, {
        fontSize: Math.round(size * 0.52),
        fontFamily: 'Manrope, system-ui, sans-serif',
        fontWeight: '900',
        fill: '#ffffff',
        originX: 'center',
        originY: 'center'
      });

      const group = new globalThis.fabric.Group([badgeRect, iconText], {
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        layerId: `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        layerName: `Ícone: ${icon}`,
        layerType: 'icon'
      });

      this.fCanvas.add(group);
      this.fCanvas.setActiveObject(group);
      this.fCanvas.requestRenderAll();
      this.emitModified();
      return group;
    }

    /* ---------------- Layers Inspection & Actions ---------------- */

    getLayers() {
      // Return objects from top of stack to bottom (excluding scrim)
      const objects = this.fCanvas.getObjects().filter(o => !o.isScrim);
      return objects.map((obj, i) => ({
        index: i,
        id: obj.layerId || `obj_${i}`,
        name: obj.layerName || (obj.type === 'textbox' ? `Texto: ${obj.text?.slice(0, 16)}` : obj.type),
        type: obj.layerType || obj.type,
        visible: obj.visible !== false,
        locked: Boolean(obj.lockMovementX),
        active: this.fCanvas.getActiveObject() === obj,
        obj
      })).reverse();
    }

    selectLayer(id) {
      const obj = this.fCanvas.getObjects().find(o => o.layerId === id);
      if (obj) {
        this.fCanvas.setActiveObject(obj);
        this.fCanvas.requestRenderAll();
        this.emitSelection(obj);
      }
    }

    setLayerVisibility(id, visible) {
      const obj = this.fCanvas.getObjects().find(o => o.layerId === id);
      if (obj) {
        obj.visible = Boolean(visible);
        this.fCanvas.requestRenderAll();
        this.emitModified();
        this.emitLayersChange();
      }
    }

    setLayerLock(id, locked) {
      const obj = this.fCanvas.getObjects().find(o => o.layerId === id);
      if (obj) {
        const isLocked = Boolean(locked);
        obj.lockMovementX = isLocked;
        obj.lockMovementY = isLocked;
        obj.lockRotation = isLocked;
        obj.lockScalingX = isLocked;
        obj.lockScalingY = isLocked;
        obj.selectable = !isLocked;
        this.fCanvas.requestRenderAll();
        this.emitModified();
        this.emitLayersChange();
      }
    }

    renameLayer(id, newName) {
      const obj = this.fCanvas.getObjects().find(o => o.layerId === id);
      if (obj && newName) {
        obj.layerName = String(newName).slice(0, 60);
        this.emitLayersChange();
      }
    }

    reorderLayer(id, delta) {
      // delta: +1 means bring forward, -1 means send backward
      const obj = this.fCanvas.getObjects().find(o => o.layerId === id);
      if (!obj) return;
      if (delta > 0) {
        this.fCanvas.bringForward(obj);
      } else {
        this.fCanvas.sendBackwards(obj);
      }
      // Ensure scrim stays behind all user content
      const scrim = this.fCanvas.getObjects().find(o => o.isScrim);
      if (scrim) this.fCanvas.sendToBack(scrim);

      this.fCanvas.requestRenderAll();
      this.emitModified();
      this.emitLayersChange();
    }

    duplicateSelected() {
      const active = this.fCanvas.getActiveObject();
      if (!active || active.isScrim) return;

      active.clone(cloned => {
        cloned.set({
          left: active.left + 24,
          top: active.top + 24,
          layerId: `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          layerName: `${active.layerName || 'Elemento'} (cópia)`
        });
        this.fCanvas.add(cloned);
        this.fCanvas.setActiveObject(cloned);
        this.fCanvas.requestRenderAll();
        this.emitModified();
        this.emitLayersChange();
      });
    }

    deleteSelected() {
      const active = this.fCanvas.getActiveObject();
      if (!active || active.isScrim) return;
      this.fCanvas.remove(active);
      this.fCanvas.discardActiveObject();
      this.fCanvas.requestRenderAll();
      this.emitModified();
      this.emitLayersChange();
    }

    clearUserLayers() {
      const userObjects = this.fCanvas.getObjects().filter(o => !o.isScrim);
      userObjects.forEach(o => this.fCanvas.remove(o));
      this.fCanvas.discardActiveObject();
      this.fCanvas.requestRenderAll();
      this.emitModified();
      this.emitLayersChange();
    }

    /* ---------------- Shape & Layout Adaptation ---------------- */

    changeShape(newShapeSpec) {
      const oldWidth = this.width;
      const oldHeight = this.height;
      const newWidth = newShapeSpec.width;
      const newHeight = newShapeSpec.height;

      const ratioX = newWidth / oldWidth;
      const ratioY = newHeight / oldHeight;

      // Adapt all user elements proportionally
      const objects = this.fCanvas.getObjects().filter(o => !o.isScrim);
      objects.forEach(obj => {
        obj.set({
          left: Math.round(obj.left * ratioX),
          top: Math.round(obj.top * ratioY)
        });
        obj.setCoords();
      });

      this.setDimensions(newWidth, newHeight);
      this.applyBackground(this.bgConfig);
      this.emitModified();
      this.emitLayersChange();
    }

    /* ---------------- Serialization & Export ---------------- */

    toJSON() {
      const canvasJson = this.fCanvas.toJSON([
        'layerId',
        'layerName',
        'layerType',
        'isScrim',
        'lockMovementX',
        'lockMovementY',
        'lockRotation',
        'lockScalingX',
        'lockScalingY',
        'selectable'
      ]);

      return {
        width: this.width,
        height: this.height,
        bgConfig: this.bgConfig,
        canvasJson
      };
    }

    loadFromJSON(doc) {
      return new Promise(resolve => {
        if (!doc) return resolve(false);

        if (doc.width && doc.height) {
          this.width = doc.width;
          this.height = doc.height;
          this.fCanvas.setWidth(this.width * this.scale);
          this.fCanvas.setHeight(this.height * this.scale);
          this.fCanvas.setZoom(this.scale);
        }

        if (doc.bgConfig) {
          this.bgConfig = { ...doc.bgConfig };
        }

        if (doc.canvasJson) {
          this.fCanvas.loadFromJSON(doc.canvasJson, () => {
            this.applyBackground(this.bgConfig);
            this.fCanvas.requestRenderAll();
            this.emitLayersChange();
            resolve(true);
          });
        } else {
          this.applyBackground(this.bgConfig);
          this.fCanvas.requestRenderAll();
          resolve(true);
        }
      });
    }

    exportToDataUrl(format = 'webp', quality = 0.90) {
      // 1. Deselect active element to remove handles and bounding boxes from export
      const activeObj = this.fCanvas.getActiveObject();
      this.fCanvas.discardActiveObject();

      // 2. Suppress guides, safe margins, and overlays
      this.isExporting = true;

      // 3. Export at native 1x resolution independent of current zoom
      const currentZoom = this.fCanvas.getZoom();
      const currentWidth = this.fCanvas.getWidth();
      const currentHeight = this.fCanvas.getHeight();

      // Reset zoom for unscaled rasterization
      this.fCanvas.setZoom(1);
      this.fCanvas.setWidth(this.width);
      this.fCanvas.setHeight(this.height);
      this.fCanvas.renderAll();

      const mimeType = format === 'png' ? 'image/png' : format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/webp';
      const fabricFormat = mimeType === 'image/jpeg' ? 'jpeg' : mimeType === 'image/png' ? 'png' : 'webp';
      const dataUrl = this.fCanvas.toDataURL({
        format: fabricFormat,
        quality: Math.max(0.1, Math.min(1, Number(quality) || 0.90)),
        multiplier: 1
      });

      // 4. Restore zoom and selection state
      this.isExporting = false;
      this.fCanvas.setZoom(currentZoom);
      this.fCanvas.setWidth(currentWidth);
      this.fCanvas.setHeight(currentHeight);
      if (activeObj) {
        this.fCanvas.setActiveObject(activeObj);
      }
      this.fCanvas.requestRenderAll();

      return dataUrl;
    }

    /* ---------------- Event Dispatching ---------------- */

    onSelectionChange(fn) { this.listeners.selectionChange.push(fn); }
    onModified(fn) { this.listeners.modified.push(fn); }
    onLayersChange(fn) { this.listeners.layersChange.push(fn); }

    emitSelection(obj) {
      this.listeners.selectionChange.forEach(fn => fn(obj));
    }
    emitModified() {
      this.listeners.modified.forEach(fn => fn());
    }
    emitLayersChange() {
      const layers = this.getLayers();
      this.listeners.layersChange.forEach(fn => fn(layers));
    }
  }

  globalThis.ArtworkCanvas = ArtworkCanvas;
})();
