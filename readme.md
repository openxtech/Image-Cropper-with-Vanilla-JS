# ClaudeCrop

**v1.0.2** — Plugin de recadrage d'image vanilla ES6+, sans dépendance.

Réécriture moderne de [cropit](https://github.com/scottcheng/cropit) avec support natif des ratios d'aspect, du zoom à la molette, du pinch-to-zoom tactile, d'une API événementielle complète, du verrouillage des éditions et de la traçabilité de l'origine du chargement d'image.

---

## Sommaire

- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [HTML requis](#html-requis)
- [Options](#options)
  - [Éléments](#éléments)
  - [Dimensions](#dimensions)
  - [Zoom](#zoom)
  - [Comportement](#comportement)
  - [Verrouillage des éditions](#verrouillage-des-éditions)
  - [Ratio d'aspect](#ratio-daspect)
  - [Fond d'image](#fond-dimage)
  - [État initial](#état-initial)
  - [Callbacks](#callbacks)
- [API publique](#api-publique)
  - [Méthodes](#méthodes)
  - [Getters / Setters](#getters--setters)
  - [Ratios prédéfinis](#ratios-prédéfinis)
  - [Méthode statique parseRatio](#méthode-statique-parseratio)
- [Événements (EventEmitter)](#événements-eventemitter)
- [Formats de ratio acceptés](#formats-de-ratio-acceptés)
- [Export](#export)
- [Gestion des erreurs](#gestion-des-erreurs)
- [Exemples](#exemples)
- [Migrer depuis cropit](#migrer-depuis-cropit)
- [Compatibilité](#compatibilité)

---

## Installation

### Via `<script>` (bundle standalone)

```html
<script src="claudecrop.js"></script>
```

Le constructeur est exposé globalement sous `window.ClaudeCrop`.

### CommonJS / Node

```js
const ClaudeCrop = require('./claudecrop.js');
```

### AMD (RequireJS)

```js
define(['claudecrop'], function(ClaudeCrop) { … });
```

---

## Démarrage rapide

```html
<!-- 1. Structure HTML minimale -->
<div id="crop-root">
  <div class="cc-preview"></div>
  <input type="file" class="cc-image-input">
  <input type="range" class="cc-image-zoom-input">
</div>

<!-- 2. Inclure le plugin -->
<script src="claudecrop.js"></script>

<!-- 3. Instancier -->
<script>
  const cc = new ClaudeCrop('#crop-root', {
    aspectRatio: '16:9',
    maxZoom: 3,
    wheelZoom: true,
    onImageLoaded: () => console.log('Image prête !'),
  });

  // Charger une image par URL
  cc.loadImage('https://example.com/photo.jpg');

  // Exporter le recadrage
  const dataUrl = cc.export({ type: 'image/jpeg', quality: 0.92 });
</script>
```

---

## HTML requis

ClaudeCrop recherche ses éléments à l'intérieur du conteneur racine via des sélecteurs CSS par défaut. Ces sélecteurs sont tous personnalisables via les options.

| Élément | Sélecteur par défaut | Rôle |
|---|---|---|
| Zone de prévisualisation | `.cc-preview` | Affiche l'image et le cadre de recadrage |
| Input fichier | `input.cc-image-input` | Sélection de fichier local |
| Slider de zoom | `input.cc-image-zoom-input` | Contrôle du niveau de zoom |

Le slider doit être de type `range` ; ClaudeCrop y positionne automatiquement les attributs `min`, `max` et `step`.

### Exemple HTML complet

```html
<div id="crop-root">

  <!-- Zone de prévisualisation (obligatoire) -->
  <div class="cc-preview" style="width: 600px; height: 400px;"></div>

  <!-- Contrôles (tous optionnels) -->
  <input type="file" class="cc-image-input">
  <input type="range" class="cc-image-zoom-input">

  <!-- Boutons personnalisés -->
  <button onclick="cc.rotateCW()">↻ Rotation</button>
  <button onclick="cc.reset()">⊙ Reset</button>
</div>
```

> **Remarque :** Si aucun slider ni input fichier n'est trouvé, ClaudeCrop fonctionne toujours — le chargement et le zoom se font via `loadImage()` et la molette/pinch.

---

## Options

Toutes les options sont passées en second argument du constructeur.

```js
const cc = new ClaudeCrop(element, options);
```

### Éléments

| Option | Type | Défaut | Description |
|---|---|---|---|
| `previewEl` | `string \| Element` | `'.cc-preview'` | Zone de prévisualisation / recadrage |
| `fileInputEl` | `string \| Element` | `'input.cc-image-input'` | Input `type="file"` |
| `zoomSliderEl` | `string \| Element` | `'input.cc-image-zoom-input'` | Slider `type="range"` |

Acceptent aussi bien un sélecteur CSS qu'un élément DOM direct.

```js
const cc = new ClaudeCrop('#root', {
  previewEl:    document.getElementById('my-preview'),
  fileInputEl:  '#my-file-input',
  zoomSliderEl: '#my-slider',
});
```

### Dimensions

| Option | Type | Défaut | Description |
|---|---|---|---|
| `width` | `number \| null` | `null` | Largeur forcée de la zone de preview en px. Si `null`, utilise `clientWidth`. |
| `height` | `number \| null` | `null` | Hauteur forcée en px. |

### Zoom

| Option | Type | Défaut | Description |
|---|---|---|---|
| `minZoom` | `'fill' \| 'fit' \| number` | `'fill'` | Zoom minimum. `'fill'` : l'image remplit toujours la zone. `'fit'` : au moins un bord couvre la zone. Nombre : valeur absolue. |
| `maxZoom` | `number` | `1` | Zoom maximum autorisé (ex: `3` = 300 % de la taille originale). |
| `initialZoom` | `'min' \| 'image' \| number` | `'min'` | Zoom à l'ouverture d'une image. `'min'` : zoom minimum. `'image'` : taille originale (100 %). |
| `exportZoom` | `number` | `1` | Ratio entre la taille exportée et la taille du preview. `2` → export en double résolution. |
| `wheelZoom` | `boolean` | `true` | Active le zoom à la molette de la souris. |
| `pinchZoom` | `boolean` | `true` | Active le zoom par pincement (écrans tactiles). |

### Comportement

| Option | Type | Défaut | Description |
|---|---|---|---|
| `freeMove` | `boolean` | `false` | Si `true`, l'image peut être déplacée librement hors des limites de la zone. Par défaut, l'image reste toujours dans le cadre. |
| `allowDragNDrop` | `boolean` | `true` | Autorise le glisser-déposer d'un fichier image sur la zone de preview. |
| `smallImage` | `'allow' \| 'stretch' \| 'reject'` | `'reject'` | Comportement si l'image est plus petite que le conteneur. `'allow'` : zoom réduit jusqu'à la taille originale. `'stretch'` : suit `minZoom`. `'reject'` : déclenche `onImageError`. |

### Verrouillage des éditions

| Option | Type | Défaut | Description |
|---|---|---|---|
| `locked` | `boolean` | `false` | Si `true`, toutes les interactions d'édition sont désactivées dès l'initialisation (drag, zoom molette/pinch/slider, rotation, reset). Le chargement de fichier reste actif. Appelez `unlock()` pour réactiver. |

```js
// Démarrer verrouillé — l'utilisateur ne peut pas encore éditer
const cc = new ClaudeCrop('#root', {
  locked: true,
  onLock:   () => console.log('Éditions verrouillées'),
  onUnlock: () => console.log('Éditions déverrouillées'),
});

// Plus tard, autoriser l'édition
document.getElementById('edit-btn').addEventListener('click', () => cc.unlock());
```

> **Différence avec `disable()`** : `lock()` bloque uniquement les interactions d'édition mais laisse le chargement de fichier (`<input type="file">`) actif. `disable()` désactive tout, y compris l'input fichier, et applique la classe `cc-disabled`.

### Ratio d'aspect

| Option | Type | Défaut | Description |
|---|---|---|---|
| `aspectRatio` | `string \| object \| number \| null` | `null` | Ratio de recadrage souhaité. Voir [Formats de ratio acceptés](#formats-de-ratio-acceptés). `null` = pas de contrainte. |
| `aspectRatioFit` | `'contain' \| 'cover'` | `'contain'` | Comment le cadre de recadrage se positionne dans le preview. `'contain'` : cadre entièrement visible. `'cover'` : cadre couvre tout le preview. |
| `showCropFrame` | `boolean` | `true` | Affiche l'overlay semi-transparent avec le cadre, les poignées et la grille des tiers. |

### Fond d'image

| Option | Type | Défaut | Description |
|---|---|---|---|
| `imageBackground` | `boolean` | `false` | Affiche une version floue et transparente de l'image en fond du preview (effet de bleed). |
| `imageBackgroundBorderWidth` | `number \| [top, right, bottom, left]` | `[0,0,0,0]` | Largeur en px du fond visible autour du cadre principal. |

### État initial

| Option | Type | Défaut | Description |
|---|---|---|---|
| `imageState` | `object \| null` | `null` | Restaure un état précédent. Objet avec `{ src, zoom, offset }` tel que retourné par `cc.imageState`. |

```js
const cc = new ClaudeCrop('#root', {
  imageState: {
    src: 'https://example.com/photo.jpg',
    zoom: 1.4,
    offset: { x: -42, y: -18 },
  },
});
```

### Callbacks

Équivalents aux événements émis, mais sous forme de fonctions déclarées dans les options.

| Option | Paramètres | Description |
|---|---|---|
| `onFileChange` | `(event)` | L'utilisateur a sélectionné un fichier. |
| `onFileReaderError` | — | Erreur lors de la lecture du fichier. |
| `onImageLoading` | — | Début du chargement d'une image. |
| `onImageLoaded` | `(source)` | Image chargée et affichée avec succès. `source` indique l'origine : `'api'` (appel direct à `loadImage()`), `'fileinput'` (sélection de fichier), `'dragdrop'` (glisser-déposer), `'restore'` (restauration via `imageState`). |
| `onImageError` | `(error)` | Échec du chargement. Voir [Gestion des erreurs](#gestion-des-erreurs). |
| `onZoomEnabled` | — | Le slider de zoom est activé (image zoomable). |
| `onZoomDisabled` | — | Le slider de zoom est désactivé. |
| `onZoomChange` | `(zoom: number)` | Le niveau de zoom a changé. |
| `onOffsetChange` | `({ x, y })` | La position de l'image a changé. |
| `onAspectRatioChange` | `({ w, h } \| null)` | Le ratio d'aspect a changé. |
| `onLock` | — | Les éditions viennent d'être verrouillées (via `lock()` ou `locked: true`). |
| `onUnlock` | — | Les éditions viennent d'être déverrouillées (via `unlock()`). |

---

## API publique

### Méthodes

#### `loadImage(src, source?): Promise<void>`

Charge une image par URL ou data URI. Retourne une Promise résolue quand l'image est prête.

Le paramètre optionnel `source` permet de préciser l'origine du chargement. Il est transmis à `onImageLoaded` et à l'événement `imageloaded`. Utile pour distinguer un chargement programmatique d'un chargement utilisateur dans vos propres callbacks.

| Valeur de `source` | Description |
|---|---|
| `'api'` | Appel direct à `loadImage()` _(défaut)_ |
| `'fileinput'` | Sélection via `<input type="file">` _(géré en interne)_ |
| `'dragdrop'` | Glisser-déposer sur la zone de preview _(géré en interne)_ |
| `'restore'` | Restauration via l'option `imageState` _(géré en interne)_ |

```js
cc.loadImage('https://example.com/photo.jpg')
  .then(() => console.log('chargée'))
  .catch(err => console.error(err.message));

// Data URI
cc.loadImage('data:image/png;base64,iVBORw0K…');

// Avec source personnalisée
cc.loadImage(myUrl, 'api');
```

```js
// Réagir différemment selon l'origine
cc.on('imageloaded', (source) => {
  if (source === 'dragdrop') {
    showToast('Image déposée avec succès !');
  } else if (source === 'fileinput') {
    showToast('Fichier chargé.');
  }
  console.log('Source du chargement :', source);
  // → 'api' | 'fileinput' | 'dragdrop' | 'restore'
});
```

---

#### `lock(): void`

Verrouille toutes les interactions d'édition : drag, zoom (molette, pinch, slider), rotation et reset. Le chargement de fichier via l'input reste actif.

Ajoute la classe `cc-locked` sur l'élément racine. Émet l'événement `lock` et appelle `onLock`. Sans effet si déjà verrouillé.

```js
cc.lock();
console.log(cc.isLocked); // → true
```

---

#### `unlock(): void`

Déverrouille les interactions d'édition précédemment bloquées par `lock()` ou l'option `locked: true`.

Retire la classe `cc-locked`. Émet l'événement `unlock` et appelle `onUnlock`. Sans effet si déjà déverrouillé.

```js
cc.unlock();
console.log(cc.isLocked); // → false
```

---

#### `disable(): void`

Désactive **toutes** les interactions, y compris l'input fichier. Ajoute la classe `cc-disabled` sur l'élément racine.

> Pour ne bloquer que les éditions tout en gardant le chargement actif, préférez `lock()`.

---

#### `enable(): void`

Réactive toutes les interactions. Retire la classe `cc-disabled`.

---

#### `setAspectRatio(ratio): void`

Définit ou supprime le ratio de recadrage dynamiquement.

```js
cc.setAspectRatio('16:9');          // Paysage HD
cc.setAspectRatio('4:3');           // Photo classique
cc.setAspectRatio('1:1');           // Carré
cc.setAspectRatio('9:16');          // Portrait mobile
cc.setAspectRatio({ w: 5, h: 4 }); // Objet
cc.setAspectRatio(2.35);            // Ratio décimal (cinémascope)
cc.setAspectRatio(null);            // Libre — supprime le cadre
```

---

#### `getAspectRatio(): { w, h } | null`

Retourne le ratio actuel sous forme d'objet, ou `null` si aucun ratio n'est défini.

```js
const ratio = cc.getAspectRatio();
// → { w: 16, h: 9 }  ou  null
```

---

#### `export(options?): string | null`

Exporte la zone recadrée en data URL. Quand un ratio est défini, exporte exactement la zone délimitée par le cadre.

```js
// PNG (défaut)
const png = cc.export();

// JPEG avec qualité
const jpg = cc.export({ type: 'image/jpeg', quality: 0.85 });

// Taille originale (ignore exportZoom)
const full = cc.export({ originalSize: true });

// Avec fond blanc pour JPEG
const jpg2 = cc.export({ type: 'image/jpeg', fillBg: '#ffffff' });
```

**Paramètres :**

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `type` | `string` | `'image/png'` | Type MIME : `'image/png'`, `'image/jpeg'`, `'image/webp'` |
| `quality` | `number` | `0.92` | Qualité JPEG/WebP, de `0` à `1` |
| `originalSize` | `boolean` | `false` | Si `true`, ignore `exportZoom` et exporte à l'échelle 1:1 du zoom actuel |
| `fillBg` | `string` | `'#fff'` | Couleur de fond pour les formats sans transparence |

Retourne `null` si aucune image n'est chargée.

---

#### `exportBlob(options?): Promise<Blob>`

Identique à `export()` mais retourne une `Promise<Blob>`, utile pour l'upload direct.

```js
const blob = await cc.exportBlob({ type: 'image/jpeg', quality: 0.9 });

// Upload direct
const formData = new FormData();
formData.append('image', blob, 'crop.jpg');
await fetch('/api/upload', { method: 'POST', body: formData });
```

---

#### `centerImage(): void`

Centre l'image dans la zone de recadrage (ou dans le cadre si un ratio est défini).

```js
cc.centerImage();
```

---

#### `rotateCW(): void`

Rotation de 90° dans le sens des aiguilles d'une montre. Sans effet si l'instance est verrouillée.

---

#### `rotateCCW(): void`

Rotation de 90° dans le sens inverse des aiguilles d'une montre. Sans effet si l'instance est verrouillée.

---

#### `reset(): void`

Remet l'image au zoom initial et la recentre. La rotation est aussi réinitialisée à 0°. Sans effet si l'instance est verrouillée.

---

#### `isZoomable(): boolean`

Retourne `true` si l'image peut être zoomée avec les réglages actuels (i.e. `minZoom !== maxZoom`).

---

#### `destroy(): void`

Supprime les listeners, retire les éléments injectés par le plugin du DOM et vide l'EventEmitter.

```js
cc.destroy();
```

---

### Getters / Setters

| Propriété | Lecture | Écriture | Type | Description |
|---|---|---|---|---|
| `zoom` | ✅ | ✅ | `number` | Niveau de zoom actuel. Contraint entre `minZoom` et `maxZoom`. L'écriture zoom vers le centre du preview. |
| `offset` | ✅ | ✅ | `{ x, y }` | Position de l'image en pixels. L'écriture déclenche `_renderImage()`. |
| `imageSrc` | ✅ | ✅ | `string` | URL de l'image courante. L'écriture appelle `loadImage()`. |
| `imageState` | ✅ | — | `{ src, zoom, offset }` | Snapshot de l'état courant, restaurable via l'option `imageState`. |
| `imageSize` | ✅ | — | `{ width, height }` | Dimensions de l'image en tenant compte de la rotation. |
| `imageWidth` | ✅ | — | `number` | Largeur effective (permutée si rotation 90°/270°). |
| `imageHeight` | ✅ | — | `number` | Hauteur effective. |
| `previewSize` | ✅ | ✅ | `{ width, height }` | Dimensions de la zone de preview. L'écriture redimensionne l'élément et recalcule le cadre. |
| `minZoom` | ✅ | ✅ | `string \| number` | Zoom minimum. L'écriture reconfigure le Zoomer. |
| `maxZoom` | ✅ | ✅ | `number` | Zoom maximum. |
| `exportZoom` | ✅ | ✅ | `number` | Ratio d'export. |
| `initialZoom` | ✅ | ✅ | `string \| number` | Zoom à l'ouverture. |
| `rotation` | ✅ | — | `number` | Rotation courante en degrés (`0`, `90`, `180`, `270`). |
| `aspectRatio` | ✅ | ✅ | `object \| null` | Ratio actuel `{ w, h }`. L'écriture appelle `setAspectRatio()`. |
| `cropRect` | ✅ | — | `{ x, y, width, height }` | Rectangle de recadrage dans le repère du preview (en px). `null` si pas de ratio. |
| `isLocked` | ✅ | — | `boolean` | `true` si les éditions sont actuellement verrouillées via `lock()` ou `locked: true`. |

```js
// Exemples de lecture / écriture
console.log(cc.zoom);        // → 1.35
cc.zoom = 2;                  // Zoom vers le centre à ×2

console.log(cc.cropRect);    // → { x: 50, y: 28, width: 500, height: 281 }

cc.previewSize = { width: 800, height: 450 }; // Redimensionner live

console.log(cc.isLocked);    // → false
cc.lock();
console.log(cc.isLocked);    // → true

const state = cc.imageState; // Snapshot
// … plus tard :
new ClaudeCrop('#root', { imageState: state }); // Restaurer
```

---

### Ratios prédéfinis

`ClaudeCrop.RATIOS` expose des constantes pratiques :

```js
ClaudeCrop.RATIOS.FREE    // null       — pas de contrainte
ClaudeCrop.RATIOS.SQUARE  // '1:1'
ClaudeCrop.RATIOS.R4_3    // '4:3'
ClaudeCrop.RATIOS.R3_4    // '3:4'
ClaudeCrop.RATIOS.R16_9   // '16:9'
ClaudeCrop.RATIOS.R9_16   // '9:16'
ClaudeCrop.RATIOS.R3_2    // '3:2'
ClaudeCrop.RATIOS.R2_3    // '2:3'
ClaudeCrop.RATIOS.R21_9   // '21:9'    — ultrawide
ClaudeCrop.RATIOS.GOLDEN  // '1.618:1' — nombre d'or

// Usage
cc.setAspectRatio(ClaudeCrop.RATIOS.R16_9);
```

---

### Méthode statique `parseRatio`

`ClaudeCrop.parseRatio(ratio)` — convertit n'importe quel format en `{ w, h }` ou `null`.

```js
ClaudeCrop.parseRatio('16:9');       // → { w: 16, h: 9 }
ClaudeCrop.parseRatio('1:1');        // → { w: 1, h: 1 }
ClaudeCrop.parseRatio(1.777);        // → { w: 1.777, h: 1 }
ClaudeCrop.parseRatio({ w:4, h:3 }); // → { w: 4, h: 3 }
ClaudeCrop.parseRatio(null);         // → null
ClaudeCrop.parseRatio('invalid');    // → null
```

---

## Événements (EventEmitter)

ClaudeCrop implémente un EventEmitter minimal avec `.on()`, `.off()` et `.once()`.

```js
// Abonner
cc.on('imageloaded', () => {
  console.log('Image prête, taille :', cc.imageSize);
});

// Une seule fois
cc.once('imageerror', (err) => {
  alert(`Erreur ${err.code} : ${err.message}`);
});

// Se désabonner
const handler = (z) => console.log('Zoom :', z);
cc.on('zoomchange', handler);
cc.off('zoomchange', handler);
```

### Liste des événements

| Événement | Données | Description |
|---|---|---|
| `filechange` | `Event` | L'utilisateur a sélectionné un fichier. |
| `filereaderror` | — | Erreur lors de la lecture du fichier. |
| `imageloading` | — | Début du chargement. |
| `imageloaded` | `source: string` | Image chargée et affichée. `source` vaut `'api'`, `'fileinput'`, `'dragdrop'` ou `'restore'`. |
| `imageerror` | `{ code, message }` | Échec du chargement. |
| `zoomenabled` | — | Slider de zoom activé. |
| `zoomdisabled` | — | Slider de zoom désactivé. |
| `zoomchange` | `number` | Nouveau niveau de zoom. |
| `offsetchange` | `{ x, y }` | Nouvelle position de l'image. |
| `aspectratiochange` | `{ w, h } \| null` | Nouveau ratio (ou `null` si libéré). |
| `lock` | — | Les éditions viennent d'être verrouillées. |
| `unlock` | — | Les éditions viennent d'être déverrouillées. |

---

## Formats de ratio acceptés

`setAspectRatio()` et l'option `aspectRatio` acceptent tous les formats suivants :

```js
// Chaîne "largeur:hauteur"
cc.setAspectRatio('16:9');
cc.setAspectRatio('4:3');
cc.setAspectRatio('1:1');
cc.setAspectRatio('9:16');    // portrait
cc.setAspectRatio('21:9');    // cinémascope
cc.setAspectRatio('1.618:1'); // nombre d'or

// Objet { w, h }
cc.setAspectRatio({ w: 16, h: 9 });

// Objet { width, height }
cc.setAspectRatio({ width: 4, height: 3 });

// Nombre décimal (ratio = w/1)
cc.setAspectRatio(1.777);   // ≈ 16:9
cc.setAspectRatio(1.333);   // ≈ 4:3

// Supprimer le ratio
cc.setAspectRatio(null);
cc.setAspectRatio(undefined);
```

---

## Export

### Coordonnées exportées

Quand un `aspectRatio` est défini, `export()` et `exportBlob()` exportent **uniquement** la zone délimitée par le `cropRect` — pas le preview en entier.

```
┌─────────────────────────────┐  ← preview (600×400)
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░┌───────────────────────┐░░│
│░░│                       │░░│  ← cropRect (500×281) pour 16:9
│░░│   zone exportée       │░░│
│░░└───────────────────────┘░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└─────────────────────────────┘
```

### Résolution d'export

La résolution finale dépend de `exportZoom` :

```
résolution = cropRect.width × exportZoom  ×  cropRect.height × exportZoom
```

Exemple — preview 600×338, ratio 16:9, `exportZoom: 2` :
- `cropRect` = 600×338
- Export = 1200×676 px

### Upload du blob

```js
const blob = await cc.exportBlob({ type: 'image/webp', quality: 0.88 });

const fd = new FormData();
fd.append('avatar', blob, 'avatar.webp');

fetch('/api/user/avatar', { method: 'POST', body: fd });
```

---

## Gestion des erreurs

`onImageError` (callback) et l'événement `imageerror` reçoivent un objet `error` :

| `error.code` | `error.message` | Cause |
|---|---|---|
| `0` | `"Image failed to load."` | URL inaccessible, CORS, réseau |
| `1` | `"Image is too small."` | Image plus petite que le conteneur avec `smallImage: 'reject'` |
| `2` | `"File is not a valid image."` | Fichier non-image sélectionné |

Ces codes sont aussi disponibles via `ClaudeCrop.ERRORS` :

```js
cc.on('imageerror', (err) => {
  if (err.code === ClaudeCrop.ERRORS.SMALL_IMAGE.code) {
    alert('Image trop petite. Minimum requis : 300×300 px.');
  }
});
```

---

## Exemples

### Changeur de ratio avec boutons

```html
<div id="crop-root">
  <div class="cc-preview" style="width:600px;height:400px"></div>
  <input type="file" class="cc-image-input">
  <input type="range" class="cc-image-zoom-input">
</div>

<div>
  <button onclick="cc.setAspectRatio('1:1')">⬛ 1:1</button>
  <button onclick="cc.setAspectRatio('4:3')">📷 4:3</button>
  <button onclick="cc.setAspectRatio('16:9')">🖥 16:9</button>
  <button onclick="cc.setAspectRatio('9:16')">📱 9:16</button>
  <button onclick="cc.setAspectRatio(null)">✂ Libre</button>
</div>

<script>
const cc = new ClaudeCrop('#crop-root', {
  aspectRatio: '1:1',
  maxZoom: 4,
  exportZoom: 2,
  smallImage: 'allow',
});
</script>
```

---

### Verrouillage des éditions à l'initialisation

Cas typique : afficher un aperçu en lecture seule, puis autoriser l'édition après une action utilisateur (bouton, authentification, etc.).

```html
<div id="crop-root">
  <div class="cc-preview" style="width:600px;height:400px"></div>
  <input type="file" class="cc-image-input">
  <input type="range" class="cc-image-zoom-input">
</div>

<button id="btn-edit" disabled>✏️ Modifier</button>
<button id="btn-lock">🔒 Verrouiller</button>

<script>
const cc = new ClaudeCrop('#crop-root', {
  aspectRatio: '16:9',
  locked: true,             // démarre en lecture seule
  onLock:   () => {
    document.getElementById('btn-edit').disabled = false;
    document.getElementById('btn-lock').disabled = true;
  },
  onUnlock: () => {
    document.getElementById('btn-edit').disabled = true;
    document.getElementById('btn-lock').disabled = false;
  },
});

cc.loadImage('https://example.com/photo.jpg');

document.getElementById('btn-edit').addEventListener('click', () => cc.unlock());
document.getElementById('btn-lock').addEventListener('click', () => cc.lock());
</script>
```

---

### Verrouillage conditionnel via événements

```js
const cc = new ClaudeCrop('#root', { aspectRatio: '4:3' });

cc.on('lock',   () => console.log('🔒 Verrouillé  — isLocked:', cc.isLocked));
cc.on('unlock', () => console.log('🔓 Déverrouillé — isLocked:', cc.isLocked));

// Verrouiller automatiquement après l'export
document.getElementById('save-btn').addEventListener('click', async () => {
  const blob = await cc.exportBlob({ type: 'image/jpeg', quality: 0.9 });
  // … upload …
  cc.lock(); // empêcher de nouvelles modifications après sauvegarde
});
```

---

### Sauvegarde et restauration d'état

```js
// Sauvegarder
const state = cc.imageState;
localStorage.setItem('crop-state', JSON.stringify(state));

// Restaurer
const saved = JSON.parse(localStorage.getItem('crop-state'));
const cc = new ClaudeCrop('#root', { imageState: saved });
```

---

### Export et upload AJAX

```js
document.getElementById('save-btn').addEventListener('click', async () => {
  try {
    const blob = await cc.exportBlob({
      type: 'image/jpeg',
      quality: 0.9,
    });

    const fd = new FormData();
    fd.append('photo', blob, 'recadrage.jpg');

    const res = await fetch('/api/photos', { method: 'POST', body: fd });
    const { url } = await res.json();
    console.log('Photo enregistrée :', url);
  } catch (e) {
    console.error('Erreur export :', e);
  }
});
```

---

### Rotation et ratio combinés

```js
const cc = new ClaudeCrop('#root', {
  aspectRatio: '3:4', // Portrait
  maxZoom: 3,
});

// Passer du portrait au paysage
document.getElementById('rotate-btn').addEventListener('click', () => {
  cc.rotateCW();
  const current = cc.getAspectRatio();
  if (current) {
    // Inverser le ratio après rotation
    cc.setAspectRatio(`${current.h}:${current.w}`);
  }
});
```

---

### Avatar carré avec double résolution

```js
const cc = new ClaudeCrop('#avatar-root', {
  aspectRatio: '1:1',
  width: 300,
  height: 300,
  exportZoom: 2,       // Export en 600×600
  maxZoom: 5,
  minZoom: 'fill',
  smallImage: 'allow',
});

async function saveAvatar() {
  const blob = await cc.exportBlob({ type: 'image/png' });
  // blob est un PNG 600×600
}
```

---

## Migrer depuis cropit

ClaudeCrop est une réécriture de [cropit](https://github.com/scottcheng/cropit). Voici les changements notables.

### Suppression de jQuery

```js
// ❌ cropit (jQuery requis)
$('#image-cropper').cropit({ maxZoom: 3 });
const data = $('#image-cropper').cropit('export');

// ✅ ClaudeCrop (vanilla JS)
const cc = new ClaudeCrop('#image-cropper', { maxZoom: 3 });
const data = cc.export();
```

### Classes CSS

| cropit | ClaudeCrop |
|---|---|
| `cropit-preview` | `cc-preview` |
| `cropit-image-input` | `cc-image-input` |
| `cropit-image-zoom-input` | `cc-image-zoom-input` |
| `cropit-image-loading` | `cc-image-loading` |
| `cropit-image-loaded` | `cc-image-loaded` |
| `cropit-drag-hovered` | `cc-drag-hovered` |
| `cropit-disabled` | `cc-disabled` |
| _(n/a)_ | `cc-locked` _(nouveau)_ |

### Méthodes

| cropit | ClaudeCrop |
|---|---|
| `$el.cropit('export')` | `cc.export()` |
| `$el.cropit('isZoomable')` | `cc.isZoomable()` |
| `$el.cropit('rotateCW')` | `cc.rotateCW()` |
| `$el.cropit('reenable')` | `cc.enable()` |
| `$el.cropit('disable')` | `cc.disable()` |
| `$el.cropit('imageSrc', url)` | `cc.imageSrc = url` ou `cc.loadImage(url)` |
| _(n/a)_ | `cc.lock()` / `cc.unlock()` _(nouveau)_ |

### Nouveautés

| Fonctionnalité | cropit | ClaudeCrop |
|---|---|---|
| Ratio d'aspect | ❌ | ✅ `setAspectRatio()` |
| Zoom à la molette | ❌ | ✅ option `wheelZoom` |
| Pinch-to-zoom | ❌ | ✅ option `pinchZoom` |
| Chargement Promise | ❌ | ✅ `loadImage()` retourne une `Promise` |
| EventEmitter | ❌ | ✅ `.on()` / `.off()` / `.once()` |
| Export Blob | ❌ | ✅ `exportBlob()` retourne `Promise<Blob>` |
| Verrouillage des éditions | ❌ | ✅ option `locked`, `lock()` / `unlock()` |
| Origine du chargement | ❌ | ✅ `onImageLoaded(source)` / événement `imageloaded` avec `source` |
| Dépendance jQuery | ✅ obligatoire | ❌ aucune |

---

## Compatibilité

ClaudeCrop utilise des APIs modernes. Les navigateurs suivants sont supportés :

| Navigateur | Version minimale |
|---|---|
| Chrome / Edge | 79+ |
| Firefox | 79+ |
| Safari | 13.1+ |
| Safari iOS | 13.4+ |
| Chrome Android | 79+ |

**APIs utilisées :**
- `Pointer Events API` — drag unifié souris / touch / stylet
- `fetch API` — chargement des images distantes
- `FileReader API` — lecture des fichiers locaux
- `Canvas 2D API` — rendu de l'export
- `ES6 Classes`, `Proxy getters/setters`, `Map`, `Promise`

> Pour les environnements plus anciens, un transpileur (Babel) et des polyfills (`fetch`, `Promise`) sont nécessaires.

---

## Licence

MIT — libre d'utilisation, de modification et de distribution.

---

*Basé sur [cropit](https://github.com/scottcheng/cropit) de Scott Cheng — réécrit et étendu par ClaudeCrop v1.0.2.*