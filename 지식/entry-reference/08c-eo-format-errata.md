# `.eo` 포맷 사양 정정 (errata) — 다량 모양 업로더

> **이 문서를 받은 AI에게**: 이전에 전달받은 `08-eo-format.md` / `08b-eo-generator-prompt.md` 의 다음 항목들이 부정확함을 확인했습니다. 실제 엔트리에서 export한 정상 작동 `.eo` 표본 2개를 추가 분석해 얻은 정정 사항이며, 기존 구현은 거의 그대로 두고 **아래 4개 항목만 수정**하면 됩니다.
>
> 표본:
> - 엔트리봇 + SVG 모양: PNG 2개 + SVG 2개 → 정상 작동
> - 엔트리봇 + JPG 모양: 사용자가 `다운로드.jpg` 직접 업로드한 케이스 → 엔트리가 PNG로 자동 변환해 저장

---

## 정정 1 — `imageType` 값은 `"png"` / `"svg"` 두 가지만

### 이전 사양 (틀림)
- `imageType: "png" | "jpg" | "jpeg" | "svg" | "gif" | "webp" | "bmp"` 모두 허용
- 입력 파일 확장자에 따라 imageType과 fileurl 확장자를 그대로 매핑

### 올바른 사양
- **`imageType`은 `"png"` 또는 `"svg"` 단 두 값만** 사용
- **비트맵 입력**(PNG/JPG/JPEG/GIF/WEBP)은 모두 **PNG로 재인코딩 후** 패키징
  - `imageType: "png"`
  - 파일 확장자 `.png`
  - `fileurl: temp/{xx}/{yy}/image/{filename}.png`
- **BMP는 엔트리가 자체적으로 미지원** — 확장 프로그램의 입력 단계에서 거부할 것

### 근거 (실측)
- 엔트리 런타임의 `_getImageType()` 함수: `return this.entryPaint.mode === this.graphicsMode.VECTOR ? "svg" : "png"` — **항상 `"svg"` 또는 `"png"` 둘 중 하나만 반환**
- 엔트리 페인트 툴의 export: `canvas.toDataURL("image/png")` — 모든 비트맵 export는 PNG
- 사용자가 엔트리 사이트에 `다운로드.jpg`를 직접 업로드한 뒤 그 오브젝트를 `.eo`로 export한 표본을 풀어보면:
  - picture의 `name`: `"다운로드.jpg"` (원본 파일명은 표시용으로 유지)
  - picture의 `imageType`: `"png"` (강제 변환됨)
  - picture의 `fileurl`: `temp/.../image/{filename}.png`
  - 실제 파일: `PNG image data, 225x225, 8-bit/color RGB` (진짜 PNG 바이트, RGB 모드)
- 즉 **엔트리는 비트맵 입력을 항상 PNG로 정규화**하므로, `.eo` 내부에 `imageType: "jpg"`를 그대로 넣으면 엔트리 임포터가 처리하지 못함

### 변환 코드 (브라우저)

```js
// JPG / JPEG / GIF / WEBP → PNG
async function bitmapToPng(file) {
  const bmp = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob, width: bmp.width, height: bmp.height };
}

// 입력 검증 — BMP 차단
function isAcceptedInput(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'bmp') return false;  // 엔트리 미지원
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
}
```

---

## 정정 2 — SVG picture는 파일 3개 필요 (썸네일은 항상 PNG)

### 이전 사양 (틀림)
- SVG picture의 tar 내 파일:
  - `image/{filename}.svg` (원본)
  - `thumb/{filename}.svg` (썸네일도 같은 SVG)

### 올바른 사양
- SVG picture는 **tar 안에 3개 파일이 모두 있어야** 함:

| 위치 | 파일 | 비고 |
|---|---|---|
| `image/{filename}.svg` | 원본 SVG 벡터 | `fileurl`이 가리키는 파일 |
| `image/{filename}.png` | **SVG를 원본 해상도(`dimension.width × height`)로 raster화한 PNG** | **누락하면 엔트리가 모양을 표시 못함** |
| `thumb/{filename}.png` | 긴 변 96px PNG 썸네일 | **SVG 썸네일은 동작 안 함, 반드시 PNG로 raster화** |

- JSON 필드는 `imageType: "svg"`, `fileurl`은 `.svg` 그대로 유지

### 비트맵 picture와의 차이

| | 비트맵 picture | SVG picture |
|---|---|---|
| `image/` 안 파일 수 | 1개 (`.png`) | **2개 (`.svg` + `.png`)** |
| `thumb/` 안 파일 수 | 1개 (`.png`) | 1개 (`.png`) |
| 총 tar 파일 수 | 2개 | **3개** |
| `imageType` | `"png"` | `"svg"` |
| `fileurl` 확장자 | `.png` | `.svg` |

### 근거 (실측)

엔트리에서 export한 정상 작동 `.eo` (엔트리봇 + SVG 모양 2장)의 tar 구조를 풀어보면:

```
object/40/5b/image/405b4054...s33m.svg     (6.5KB - SVG 벡터, fileurl이 가리킴)
object/40/5b/image/405b4054...s33m.png     (13KB - 237×381 RGBA PNG raster)
object/40/5b/thumb/405b4054...s33m.png     (3KB - 60×96 RGBA PNG thumb)
```

`fileurl`이 `.svg`를 가리키지만, 같은 디렉터리에 PNG 동반 파일이 함께 있고 `thumb/`는 PNG만 있음.

### 변환 코드 (브라우저)

```js
// SVG 원본 해상도 raster (image/ 안에 들어갈 PNG)
async function rasterizeSvgFullSize(svgText, width, height) {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 썸네일 raster (96px 긴 변)
function thumbSize(w, h) {
  return w >= h
    ? { w: 96, h: Math.round(h * 96 / w) }
    : { w: Math.round(w * 96 / h), h: 96 };
}

async function rasterizeSvgThumb(svgText, srcW, srcH) {
  const { w, h } = thumbSize(srcW, srcH);
  return await rasterizeSvgFullSize(svgText, w, h);
}

// SVG의 원본 dimension 추출 — width/height 속성 우선, 없으면 viewBox
function extractSvgDimensions(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  let w = parseFloat(svg.getAttribute('width'));
  let h = parseFloat(svg.getAttribute('height'));
  if (!w || !h) {
    const vb = svg.getAttribute('viewBox');
    if (vb) {
      const [, , vw, vh] = vb.trim().split(/\s+/).map(Number);
      w = w || vw;
      h = h || vh;
    }
  }
  return { width: Math.round(w), height: Math.round(h) };
}
```

---

## 정정 3 — `entity.regX/regY`는 소수점 유지

### 이전 사양 (틀림)
- `regX = Math.floor(entity.width / 2)`
- `regY = Math.floor(entity.height / 2)`

### 올바른 사양
- `regX = entity.width / 2` — **소수점 유지** (예: `237 / 2 = 118.5`)
- `regY = entity.height / 2` — **소수점 유지** (예: `381 / 2 = 190.5`)
- `floor`, `round` 등을 적용하지 말 것

### 근거 (실측)
엔트리에서 export한 정상 작동 표본의 `entity`:
```json
{
  "regX": 118.5,      // ← width(237) / 2, 정수가 아님
  "regY": 190.5,      // ← height(381) / 2
  "width": 237,
  "height": 381,
  "scaleX": 0.3508771929824561,
  "scaleY": 0.3508771929824561
}
```

`floor`를 적용해 `regX=118`, `regY=190`으로 저장하면 회전·확대 시 중심이 0.5픽셀씩 어긋남.

---

## 정정 4 — `dimension.scaleX/scaleY`는 picture마다 선택 사항

### 이전 사양 (과도하게 엄격함)
- 모든 picture의 `dimension`에 `scaleX/scaleY`를 반드시 명시

### 올바른 사양
- **`dimension.scaleX/scaleY`는 picture마다 선택 사항**. 일부 picture에는 있고 일부에는 없어도 동작에 영향 없음.
- 단 **`entity.scaleX/scaleY`는 반드시 명시** (오브젝트의 표시 배율)

### 근거 (실측)
정상 작동 표본에서 한 picture는 다음과 같이 `dimension`에 width/height만 있음:
```json
{
  "id": "th6c",
  "dimension": { "width": 220, "height": 350 },   // ← scaleX/Y 없음
  "filename": "e4405b40...",
  "imageType": "png",
  "fileurl": "..."
}
```
다른 picture에는 scaleX/Y가 있고, 그래도 정상 작동.

---

## 검증 체크리스트

수정 후 생성한 `.eo`를 `gunzip` + `tar -tvf` 로 풀어 다음을 확인:

- [ ] `object.json`의 모든 `pictures[].imageType`이 **`"png"` 또는 `"svg"`** 둘 중 하나
- [ ] 비트맵 picture는 `image/{filename}.png` 1개 + `thumb/{filename}.png` 1개 (총 2개)
- [ ] SVG picture는 `image/{filename}.svg` + `image/{filename}.png` + `thumb/{filename}.png` (총 **3개**)
- [ ] **모든 `thumb/` 안 파일의 확장자가 `.png`** (`.svg` 썸네일 없음)
- [ ] `entity.regX === entity.width / 2` (소수점 유지)
- [ ] `entity.regY === entity.height / 2` (소수점 유지)
- [ ] 입력 단계에서 `.bmp` 파일 거부

---

## 자주 발생하는 오류와 정확한 매핑

이 errata가 다루는 모든 증상:

| 증상 | 원인 | 정정 |
|---|---|---|
| JPG로 업로드한 모양만 안 보임, PNG는 보임 | `imageType: "jpg"` 그대로 둠 | 정정 1 — PNG로 변환 후 `imageType: "png"` |
| SVG로 업로드한 모양만 안 보임 | `image/{filename}.png` 동반 파일 누락 또는 `thumb/`가 `.svg` | 정정 2 — 3-파일 패키지 |
| 모양 회전·확대 시 중심이 0.5px 어긋남 | `regX/regY`를 `floor`로 처리 | 정정 3 — 소수점 유지 |
| BMP 파일 업로드 시 멈춤 또는 깨짐 | BMP를 PNG로 변환 시도 또는 그대로 패키징 | 정정 1 — 입력 거부 |
| 일부 picture만 표시되고 일부는 안 보임 | `dimension.scaleX/Y` 누락을 에러로 처리 | 정정 4 — 선택 사항으로 처리 |

---

## 참고: 정상 작동 표본의 object.json 구조 (실측)

엔트리에서 직접 export한 .eo의 단일 picture 예시 (SVG 케이스):

```json
{
  "id": "w1mm",
  "name": "(3)엔트리봇_2",
  "filename": "405b4054mpima0qj0006a2c943acs33m",
  "imageType": "svg",
  "fileurl": "temp/40/5b/image/405b4054mpima0qj0006a2c943acs33m.svg",
  "dimension": {
    "width": 237,
    "height": 381,
    "scaleX": 0.3508771929824561,
    "scaleY": 0.3508771929824561
  }
}
```

같은 picture에 대해 tar 안에는:
```
object/40/5b/image/405b4054...s33m.svg     (원본 SVG, fileurl이 가리킴)
object/40/5b/image/405b4054...s33m.png     (237×381 raster PNG)
object/40/5b/thumb/405b4054...s33m.png     (60×96 raster PNG)
```

`entity`:
```json
{
  "x": 0, "y": 0,
  "regX": 118.5,
  "regY": 190.5,
  "scaleX": 0.3508771929824561,
  "scaleY": 0.3508771929824561,
  "rotation": 0,
  "direction": 90,
  "width": 237,
  "height": 381,
  "font": "undefinedpx ",
  "visible": true
}
```

이 4가지 정정 사항만 반영하면 `.eo`가 엔트리 사이트에서 모든 모양과 함께 정상 동작합니다.
