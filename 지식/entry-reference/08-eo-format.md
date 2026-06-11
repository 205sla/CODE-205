# 08. `.eo` (Entry Object) 파일 포맷 — 다량 모양 업로더용 생성 명세

> 이 문서는 **엔트리(playentry.org)에서 가져오기·내보내기 가능한 단일 오브젝트 파일(`.eo`)** 의 내부 구조와 생성 규칙을 정리한 것입니다. 엔트리 사이트의 "오브젝트 추가하기 → 파일 올리기"가 10개의 이미지로 제한되는 문제를 우회하기 위해, 한 오브젝트에 임의 개수의 모양(picture)을 포함한 `.eo` 파일을 외부에서 생성해 업로드하는 시나리오를 위한 기술 명세입니다.
>
> 이 명세를 구현하는 기능의 정식 이름은 **"다량 모양 업로더"** — *여러 개의 모양이 포함된 `.eo` 파일을 생성합니다*. (CODE 205 실험실 기능 + Chrome 확장 프로그램)
>
> **이 문서가 다루는 것**: 엔트리 고유의 파일 구조·JSON 스키마·경로 규약·ID 형식·썸네일 규칙·엔진 동작.
> **이 문서가 다루지 않는 것**: Chrome 확장 프로그램의 manifest, 권한, 메시지 패싱, 파일 다운로드 트리거 등 일반적인 확장 프로그램 지식.

---

## 1. 컨테이너 포맷

`.eo`는 **gzip(tar) — 즉 `.tar.gz`** 입니다.

| 단계 | 형식 | 비고 |
|---|---|---|
| 외부 | gzip | 엔트리 공식은 `memLevel: 6` 사용. 브라우저에서는 `CompressionStream('gzip')` 또는 `pako.gzip()` 가능. memLevel은 호환성에 영향 없음 |
| 내부 | POSIX tar | 디렉터리 엔트리 포함. mode `0755`(디렉터리)/`0644`(파일), mtime은 0(epoch)이어도 OK |

**검증**: 결과 파일을 `gunzip → tar -tf`로 확인했을 때 아래 구조가 나와야 합니다.

---

## 2. 내부 디렉터리 구조

```
object/                                ← 최상위 (반드시 존재. `.ent`의 temp/ 와 대응)
├── object.json                        ← 매니페스트 (1개)
├── {xx}/                              ← partition lv1 (파일명 첫 2자)
│   └── {yy}/                          ← partition lv2 (파일명 3~4자)
│       ├── image/
│       │   └── {filename}.{ext}       ← 원본 이미지
│       └── thumb/
│           └── {filename}.{ext}       ← 썸네일 (확장자는 image와 동일)
└── ... (이미지마다 동일 패턴)
```

### 실제 예시 (이미지 8개 오브젝트)

```
object/
├── object.json
├── 0e/2e/image/0e2ece94mpijsist0006b89619184dik.png
├── 0e/2e/thumb/0e2ece94mpijsist0006b89619184dik.png
├── 10/e2/image/10e2ece9mpijsist0006b89619183xo2.png
├── 10/e2/thumb/10e2ece9mpijsist0006b89619183xo2.png
├── 2e/ce/image/2ece9452mpijsist0006b89619185bic.png
├── 2e/ce/thumb/2ece9452mpijsist0006b89619185bic.png
├── 41/0e/image/410e2ecempijsist0006b89619183den.png
├── 41/0e/thumb/410e2ecempijsist0006b89619183den.png
├── 54/10/image/5410e2ecmpijsist0006b89619182goa.png
├── 54/10/thumb/5410e2ecmpijsist0006b89619182goa.png
├── ce/94/image/ce9452c7mpijsist0006b89619186313.png
├── ce/94/thumb/ce9452c7mpijsist0006b89619186313.png
├── e2/ec/image/e2ece945mpijsist0006b89619184w5t.png
├── e2/ec/thumb/e2ece945mpijsist0006b89619184w5t.png
├── ec/e9/image/ece9452cmpijsist0006b89619185puj.png
└── ec/e9/thumb/ece9452cmpijsist0006b89619185puj.png
```

### 규칙 요약

- **최상위 `object/` 디렉터리 엔트리는 반드시 tar에 포함**. 일부 파서가 파일만 있고 디렉터리 엔트리가 없으면 실패.
- 파티션 경로: `object/{filename[0:2]}/{filename[2:4]}/{image|thumb}/{filename}.{ext}`
- `image/`와 `thumb/`는 항상 쌍으로 존재해야 함
- **`thumb/` 안의 파일은 항상 `.png`** (포맷 무관). SVG picture라도 thumb는 PNG로 raster화.
- **SVG picture는 `image/` 안에 `.svg` + `.png` 두 개를 함께 넣음** — fileurl은 `.svg`를 가리키지만, 같은 경로에 PNG raster 동반 파일이 없으면 엔트리가 표시 못함 (실측 확인)
- 비트맵 picture(PNG/JPG/GIF/WEBP)는 모두 PNG로 변환 후 패키징 — §9 참조. BMP는 엔트리 미지원

---

## 3. `object.json` 스키마

### 3.1 최상위

```jsonc
{
  "functions": [],
  "variables": [],
  "messages": [],
  "tables": [],
  "expansionBlocks": [],
  "aiUtilizeBlocks": [],
  "objects": [/* 길이 1 — .eo는 단일 오브젝트 파일 */]
}
```

- **항상 빈 배열로 두는 7개 필드**: `functions`, `variables`, `messages`, `tables`, `expansionBlocks`, `aiUtilizeBlocks`, `objects`의 외부 형제들. `.eo`는 단일 오브젝트만 표현하므로 변수·신호·함수 등 프로젝트 전역 데이터는 포함하지 않음.
- **`scenes` 필드는 작성하지 않음**. 오브젝트의 `scene` 필드는 임포트 시점에 엔트리가 자동으로 현재 활성 장면 ID로 재매핑.

### 3.2 `objects[0]` (오브젝트 본체)

```jsonc
{
  "id": "lt0j",                          // 4자리 짧은 ID (random base36)
  "name": "예제",                         // 사용자 표시 이름
  "script": "[]",                         // 블록 스크립트 — 빈 오브젝트는 "[]" 문자열
  "objectType": "sprite",                 // "sprite" | "textBox"
  "rotateMethod": "free",                 // "free" | "vertical" | "none"
  "scene": "7dwq",                        // 4자리 — 임의값 OK (임포트 시 재매핑)
  "selectedPictureId": "r9rx",            // sprite.pictures[*].id 중 하나
  "lock": false,
  "sprite": {
    "pictures": [/* §3.3 */],
    "sounds":   []                        // .eo 생성기는 소리 비워둠
  },
  "entity": {/* §3.4 */}
}
```

- `id`는 **이 파일 내에서만 유일**하면 됨. 4자리 lowercase 알파뉴메릭(`[a-z0-9]`) 권장.
- `script: "[]"` — 빈 스크립트. 문자열로 직렬화된 JSON 배열임에 주의(객체 아님).
- `scene` 값은 임포트 시 무시되지만 필드 자체는 존재해야 함. 임의 4자 문자열로 충분.

### 3.3 `objects[0].sprite.pictures[]` (모양 배열)

```jsonc
{
  "id": "8jqy",                                  // 4자리 짧은 ID (오브젝트 내 유일)
  "name": "걷고있는 사람_1",                       // 사용자 표시 이름
  "filename": "5410e2ecmpijsist0006b89619182goa", // 32자 — §4 참고
  "imageType": "png",                             // "png" | "jpg" | "svg" | ...
  "fileurl": "temp/54/10/image/5410e2ecmpijsist0006b89619182goa.png",
  "dimension": {
    "width":  224,                                // 픽셀 단위 원본 너비
    "height": 227,                                //          원본 높이
    "scaleX": 0.4434589800443459,                 // §7 참고 — 오브젝트의 표시 배율
    "scaleY": 0.4434589800443459                  // 일반적으로 scaleX와 동일
  }
}
```

- **`fileurl`의 `temp/` 접두어에 주의**. tar 내부 실제 경로는 `object/...`이지만 JSON에는 `temp/...`로 기록. (엔트리 엔진이 임포트 시 `temp/`를 자체 스토리지 경로로 재작성)
- `dimension.width/height`는 **원본 픽셀 크기**. 화면에 표시되는 크기는 `entity.width × entity.scaleX`로 별도 계산.
- `dimension.scaleX/scaleY`는 모든 picture가 **동일한 값을 공유** (오브젝트의 표시 배율). §7 계산.

### 3.4 `objects[0].entity` (초기 상태)

```jsonc
{
  "x": 0,                                         // 스테이지 중앙 기준 좌표
  "y": 0,
  "regX": 190,                                    // selectedPicture.dimension.width / 2  (홀수면 .5 유지)
  "regY": 190,                                    // selectedPicture.dimension.height / 2 (홀수면 .5 유지)
  "scaleX": 0.4434589800443459,                   // picture.dimension.scaleX 와 동일
  "scaleY": 0.4434589800443459,
  "rotation": 0,
  "direction": 90,                                // 진행 방향 (90 = 오른쪽)
  "width":  380,                                  // selectedPicture.dimension.width
  "height": 380,                                  // selectedPicture.dimension.height
  "font": "undefinedpx ",                         // sprite엔 무의미하지만 필드 존재 필요
  "visible": true
}
```

- **`entity.width/height/regX/regY`는 `selectedPictureId`가 가리키는 picture의 dimension에서 파생**:
  - `width  = selected.dimension.width`
  - `height = selected.dimension.height`
  - `regX   = width / 2`   (정수 나눗셈 X — 홀수면 `.5` 그대로 유지. 예: 237/2 = 118.5)
  - `regY   = height / 2`  (홀수면 `.5` 유지. 예: 381/2 = 190.5)
- `entity.scaleX/Y`는 모든 picture의 `dimension.scaleX/Y`와 같은 값.
- `font: "undefinedpx "`는 엔트리 기본값 그대로. textBox가 아니어도 필드는 존재.

---

## 4. `filename` 생성 규칙

### 형식
- **32자 lowercase 알파뉴메릭** (`/^[a-z0-9]{32}$/`)
- 확장자는 포함하지 않음 (파일명에만 추가)
- 엔트리 공식 알고리즘: `uid(8) + puid.generate()` — `uid` 패키지의 8자 랜덤 + `puid`의 24자 분산 식별자

### 실용적 대체
공식 알고리즘을 그대로 쓸 필요는 없습니다. 다음 조건을 만족하면 엔트리가 정상 인식합니다.

- 정확히 32자
- 문자 집합 `[a-z0-9]`
- 같은 `.eo` 내 다른 picture의 filename과 충돌하지 않음
- **파티션 경로(첫 4자)가 충돌해도 OK** — `image/`와 `thumb/` 하위 파일명만 유일하면 됨

### 추천 구현 (확장 프로그램)

```js
function entryStyleFileId() {
  const CH = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += CH[Math.floor(Math.random() * CH.length)];
  return s;
}
```

- 또는 `crypto.getRandomValues(new Uint8Array(20))` → base36 변환 후 앞 32자 사용

### 짧은 ID (object.id, picture.id, scene)

- 4자리 lowercase 알파뉴메릭
- 예: `lt0j`, `8jqy`, `wygf`, `r9rx`, `7dwq`
- 같은 `.eo` 내에서 유일하면 충분 (filename과 별개 네임스페이스)

---

## 5. 썸네일 생성 규칙

엔트리는 모양 패널과 오브젝트 카드에 썸네일을 표시합니다. 원본 이미지가 클 경우 매번 다운스케일하면 비효율적이므로 `.eo` 내부에 미리 생성된 썸네일을 포함합니다.

### 크기 규칙

**"긴 변이 96px이 되도록 비율 유지 축소"**

| 원본 크기 | 썸네일 크기 |
|---|---|
| 380 × 380  | 96 × 96  |
| 219 × 400  | 53 × 96  |
| 215 × 400  | 52 × 96  |
| 224 × 227  | 95 × 96  |
| 144 × 336  | 41 × 96  |
| 173 × 329  | 50 × 96  |
| 162 × 336  | 46 × 96  |
| 194 × 400  | 47 × 96  |

```js
function thumbSize(w, h) {
  if (w >= h) {
    return { w: 96, h: Math.round(h * 96 / w) };
  }
  return { w: Math.round(w * 96 / h), h: 96 };
}
```

- 반올림은 `Math.round` (실측치 기준). `Math.floor`/`ceil`을 써도 ±1px 차이로 동작에는 영향 없음.
- 썸네일은 원본과 **같은 포맷**(`.png` → `.png`, `.svg` → `.svg`)으로 저장.
- SVG는 다운스케일 없이 원본 그대로 복사해도 됨 (엔트리 엔진이 viewBox로 알아서 렌더). 단, 파일 사이즈를 줄이려면 별도 처리.

### 브라우저에서 PNG 다운스케일

```js
async function makeThumbBlob(imgBitmap) {
  const t = thumbSize(imgBitmap.width, imgBitmap.height);
  const canvas = new OffscreenCanvas(t.w, t.h);
  canvas.getContext('2d').drawImage(imgBitmap, 0, 0, t.w, t.h);
  return await canvas.convertToBlob({ type: 'image/png' });
}
```

---

## 6. 엔진의 썸네일 경로 해석

엔트리 엔진은 picture의 썸네일 경로를 다음 우선순위로 결정 (`entry.min.js` 내 `updateThumbnailView` 동작):

1. `picture.thumbUrl` — 명시되어 있으면 그대로 사용
2. `picture.fileurl` — 1이 없으면 원본을 썸네일로 fallback
3. `picture.filename`에서 동적 파생: `<defaultPath>/uploads/<f0f1>/<f2f3>/thumb/<filename>.png`

### `.eo`에서의 권장 방식

위 예시 파일과 같이 **`thumbUrl`을 JSON에 적지 않음**. 대신 다음 두 가지가 보장되면 됨:

- `picture.fileurl`이 `temp/{xx}/{yy}/image/{filename}.{ext}`로 정확히 작성
- tar 내부에 `object/{xx}/{yy}/thumb/{filename}.{ext}`가 동일 확장자로 존재

엔진이 fileurl을 1차로 사용하면서 우리 tar 안의 thumb는 백업 경로로 살아남으므로 동작에 문제 없음. **굳이 `thumbUrl`을 추가할 필요 없음**.

---

## 7. `scaleX/scaleY` 계산

엔트리는 오브젝트를 스테이지에 처음 추가할 때, **긴 변이 약 200px이 되도록** 초기 배율을 설정합니다.

```js
function initialScale(maxDimensionOfFirstPicture) {
  return 200 / maxDimensionOfFirstPicture;
}
// 예: 첫 picture가 451 × 451 → scale = 200/451 = 0.4434589800443459
```

### 적용 규칙

- 오브젝트의 **모든 picture는 동일한 `dimension.scaleX/scaleY`**를 가져야 함 (오브젝트 단위로 공유되는 표시 배율)
- `entity.scaleX/scaleY`도 같은 값
- 기준이 되는 "첫 picture"는 **`pictures[0]`** (배열 첫 원소). `selectedPictureId`와 별개.

### 실용적 추천

확장 프로그램 사용자가 8장의 이미지를 업로드한다면:
- `pictures[0]`의 `max(width, height)`를 기준으로 `scale = 200 / max(w,h)` 계산
- 그 값을 모든 picture와 entity에 동일 적용
- 또는 사용자에게 스케일 슬라이더를 제공해 임의 값 허용 (이 경우 1.0 권장)

---

## 8. `selectedPictureId` 와 의존 필드

`selectedPictureId`는 오브젝트가 처음 스테이지에 올라갔을 때 보여줄 모양의 ID입니다.

| 의존 필드 | 값 |
|---|---|
| `entity.width`  | `pictures.find(p => p.id === selectedPictureId).dimension.width` |
| `entity.height` | 같은 picture의 `dimension.height` |
| `entity.regX`   | `entity.width / 2`  (소수점 유지) |
| `entity.regY`   | `entity.height / 2` (소수점 유지) |

`pictures[0]`이 아닌 임의 picture를 선택해도 OK. 단, 위 4개 필드는 반드시 selected picture에 맞춰야 시각적으로 정확.

---

## 9. 지원 이미지 포맷과 제약

### 엔트리가 인식하는 `imageType` 값은 **단 두 가지**

| `imageType` | 용도 | 입력 가능한 원본 |
|---|---|---|
| `"png"` | 모든 비트맵 | PNG, JPG/JPEG, GIF, WEBP — 모두 PNG로 **변환 후** 패키징 (BMP는 엔트리 미지원) |
| `"svg"` | 벡터 | SVG 원본 + 같은 위치에 PNG raster 동반 파일 필수 |

`"jpg"`, `"jpeg"`, `"gif"`, `"webp"` 등의 값은 엔트리 런타임의 `_getImageType()`이 절대로 반환하지 않으며, 엔트리 페인트 툴도 `canvas.toDataURL("image/png")`로만 이미지를 export합니다. 실제로 엔트리 사이트에 JPG 파일(`다운로드.jpg`)을 직접 업로드한 뒤 그 오브젝트를 `.eo`로 export해보면, `imageType`은 `"png"`로 바뀌고 파일 자체도 RGB PNG로 재인코딩되어 저장됩니다 (`fileurl`도 `.png`로 끝남). 즉 **엔트리는 비트맵 입력을 항상 PNG로 정규화**하며, `.eo` 안에 `imageType: "jpg"`를 넣어도 처리되지 않습니다.

**BMP**는 엔트리 자체가 지원하지 않으므로 입력에서 거부하거나 사용자에게 다른 포맷으로 변환을 요청해야 합니다.

### 비트맵 처리 (PNG/JPG/JPEG/GIF/WEBP)

원본 포맷과 관계없이 다음으로 통일:

| 위치 | 파일 |
|---|---|
| `image/{filename}.png` | PNG 변환본 (원본 해상도) |
| `thumb/{filename}.png` | PNG 썸네일 (긴 변 96px, §5) |
| `fileurl` | `temp/{xx}/{yy}/image/{filename}.png` |
| `imageType` | `"png"` |

JPG 등을 PNG로 변환할 때는 `Image` → `canvas.drawImage` → `canvas.toBlob({ type: 'image/png' })`.

### SVG 처리 (벡터)

엔트리에서 export한 작동 표본을 역공학하면, SVG picture 1개당 **3개 파일이 모두 존재**해야 합니다.

| 위치 | 파일 | 비고 |
|---|---|---|
| `image/{filename}.svg` | 원본 SVG 벡터 (fileurl이 가리킴) | `.svg` 그대로 |
| `image/{filename}.png` | **SVG를 원본 해상도(`dimension.width × height`)로 raster화한 PNG** | **이 동반 파일이 없으면 SVG가 표시되지 않음** |
| `thumb/{filename}.png` | **PNG 썸네일** (긴 변 96px) | **`.svg` 썸네일은 동작하지 않음** — 반드시 raster화 |

JSON 필드는:

```json
{
  "filename": "abc123...",
  "imageType": "svg",
  "fileurl": "temp/ab/c1/image/abc123....svg",
  "dimension": { "width": 237, "height": 381, "scaleX": ..., "scaleY": ... }
}
```

브라우저에서 SVG를 PNG로 raster화하는 코드:

```js
async function rasterizeSvg(svgText, width, height) {
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);
  return await canvas.convertToBlob({ type: 'image/png' });
}
```

원본 SVG의 width/height(또는 viewBox)에서 dimension을 추출한 뒤, 같은 크기의 PNG raster를 만들어 image/에 함께 넣고, 96px 썸네일 PNG도 별도로 생성.

### 크기 제약

- **개별 이미지 파일**: 1 MB 이하 권장 (엔트리 사이트 직접 업로드 시 검증값)
- **`.eo` 파일 전체**: 10 MB 이하 (엔트리 사이트의 `.eo` 업로드 검증값 = `10485760` bytes)
- 압축 후 기준이므로 큰 이미지가 많으면 사전 다운스케일/최적화 필요
- SVG는 PNG raster 동반 파일까지 포함되므로 픽셀 기준으로는 PNG-only 대비 약 1.5배 부피

---

## 10. 생성 체크리스트

확장 프로그램이 `.eo`를 만들 때 검증해야 할 항목:

- [ ] **포맷별 분기 결정** — 입력 파일이 SVG인지 비트맵인지 판별
- [ ] **비트맵(PNG/JPG/GIF/WEBP)** → 캔버스에서 PNG로 재인코딩 (§9). `imageType = "png"`, 확장자 `.png`. BMP는 입력 차단
- [ ] **SVG** → 원본 SVG 보존 + 같은 해상도의 PNG raster 생성 (§9). `imageType = "svg"`, fileurl 확장자 `.svg`
- [ ] 각 picture에 대해 32자 filename 생성 (중복 없음)
- [ ] 픽셀 크기(width/height) 추출 — PNG는 `Image.naturalWidth/Height`, SVG는 width/height 속성 또는 viewBox
- [ ] 썸네일을 §5 규칙으로 생성 (긴 변 96px) — **항상 PNG**
- [ ] `pictures[0]`의 최대 변 기준 scale 계산 (§7)
- [ ] `object.json` 작성 (§3 모든 필드 누락 없이)
- [ ] entity 파생값: regX=width/2, regY=height/2 (소수점 유지)
- [ ] tar 빌드:
  - [ ] 최상위 `object/` 디렉터리 엔트리 포함
  - [ ] 각 partition 디렉터리 엔트리 포함
  - [ ] `object/object.json` 파일
  - [ ] **비트맵 picture**: `image/{filename}.png` + `thumb/{filename}.png` (2개 파일)
  - [ ] **SVG picture**: `image/{filename}.svg` + `image/{filename}.png` + `thumb/{filename}.png` (3개 파일)
  - [ ] 파일 모드 0644, 디렉터리 모드 0755
- [ ] gzip 압축 (mtime 0이어도 무방)
- [ ] 결과 파일 확장자 `.eo`로 저장
- [ ] 최종 크기 10 MB 이하 확인
- [ ] (선택) 자체 테스트: 결과 파일을 엔트리 사이트에서 열어 모양 N개 모두 보이는지 확인

---

## 11. 워크플로 다이어그램

```
사용자 입력
  ├── 이미지 N장 (drag-drop)
  ├── 오브젝트 이름
  └── 각 모양의 이름 (선택, 미입력 시 파일명 사용)
        │
        ▼
[모양별 처리]
  - filename = entryStyleFileId()
  - 입력이 SVG인가?
      ├── YES → originalSvg, pngRaster = await rasterizeSvg(svg, w, h)
      │         dimension = SVG width/height 추출
      │         thumb = await makeThumbBlob(pngRaster)
      │         imageType = "svg", fileurl ext = ".svg"
      └── NO  → pngBytes = (이미 PNG) ?? await convertToPng(input)
                dimension = pngBytes의 width/height
                thumb = await makeThumbBlob(pngBytes)
                imageType = "png", fileurl ext = ".png"
        │
        ▼
[전체 처리]
  - pictures[].dimension.scaleX = 200 / max(pictures[0].w, pictures[0].h)
  - selectedPictureId = pictures[0].id (또는 사용자 선택)
  - entity = computeEntityFrom(selected)
        │
        ▼
[Tar 빌드]
  - object/ (디렉터리)
  - object/object.json
  - 비트맵 picture: image/{name}.png + thumb/{name}.png
  - SVG picture: image/{name}.svg + image/{name}.png + thumb/{name}.png
        │
        ▼
[Gzip 압축]
  - CompressionStream('gzip') 또는 pako.gzip()
        │
        ▼
[저장]
  - chrome.downloads.download({ filename: '<오브젝트명>.eo', ... })
```

---

## 12. 완전한 최소 예시 (이미지 1장)

업로드: `hello.png` (200 × 150 픽셀)

### tar 엔트리

```
object/                                     [dir, 0755]
object/72/                                  [dir, 0755]
object/72/4f/                               [dir, 0755]
object/72/4f/image/                         [dir, 0755]
object/72/4f/image/724fabc1xyz...32chars.png  [file, 0644, original 200x150 PNG]
object/72/4f/thumb/                         [dir, 0755]
object/72/4f/thumb/724fabc1xyz...32chars.png  [file, 0644, 96x72 PNG]
object/object.json                          [file, 0644]
```

### `object/object.json`

```json
{
  "functions": [],
  "variables": [],
  "messages": [],
  "tables": [],
  "expansionBlocks": [],
  "aiUtilizeBlocks": [],
  "objects": [
    {
      "id": "ab12",
      "name": "내 오브젝트",
      "script": "[]",
      "objectType": "sprite",
      "rotateMethod": "free",
      "scene": "scn1",
      "selectedPictureId": "p001",
      "lock": false,
      "sprite": {
        "pictures": [
          {
            "id": "p001",
            "name": "hello",
            "filename": "724fabc1xyz0000000000000000000abc",
            "imageType": "png",
            "fileurl": "temp/72/4f/image/724fabc1xyz0000000000000000000abc.png",
            "dimension": {
              "width":  200,
              "height": 150,
              "scaleX": 1.0,
              "scaleY": 1.0
            }
          }
        ],
        "sounds": []
      },
      "entity": {
        "x": 0,
        "y": 0,
        "regX": 100,
        "regY": 75,
        "scaleX": 1.0,
        "scaleY": 1.0,
        "rotation": 0,
        "direction": 90,
        "width":  200,
        "height": 150,
        "font": "undefinedpx ",
        "visible": true
      }
    }
  ]
}
```

> 이 JSON과 위 tar 구조로 만든 `.eo`를 엔트리 사이트에서 "오브젝트 추가하기 → 파일 올리기"로 업로드하면 오브젝트 1개가 추가되고 모양 패널에 "hello" 모양이 나타납니다.

---

## 13. 디버깅·검증 팁

### 만든 `.eo`를 검증하는 가장 빠른 방법

1. `gzip -d sample.eo` → `sample.tar` 추출
2. `tar -tvf sample.tar` → 디렉터리 구조 확인 (object/ 최상위 OK?)
3. `tar -xf sample.tar -C ./out` → 풀고 `out/object/object.json`을 JSON 파서로 검증
4. 엔트리 사이트(`https://playentry.org/ws/`)에서 새 프로젝트 → 오브젝트 추가 → 파일 → 만든 `.eo` 업로드

### 자주 발생하는 오류

| 증상 | 원인 |
|---|---|
| 업로드 시 "지원하지 않는 파일" | 확장자가 `.eo`가 아님 / gzip 헤더 깨짐 |
| 업로드는 되지만 모양 패널이 비어있음 | `pictures[].fileurl`이 `temp/...`가 아닌 다른 prefix / tar 내부 경로 불일치 |
| **PNG 모양은 나오는데 JPG 모양만 안 나옴** | JPG를 그대로 넣고 `imageType: "jpg"`로 지정 — §9에 따라 PNG로 변환 후 `imageType: "png"`로 패키징해야 함 |
| **SVG 모양만 안 나옴** | 셋 중 하나: (1) `image/{filename}.png` 동반 raster 누락, (2) `thumb/{filename}.svg`로 SVG 썸네일을 넣음 — PNG 썸네일 필수, (3) SVG 자체에 엔트리가 처리 못하는 요소 포함 |
| 일부 모양만 보이고 일부는 깨진 아이콘 | 해당 picture의 thumb 파일이 tar에 없거나 확장자 불일치 |
| 오브젝트가 추가되긴 했는데 너무 작음/큼 | `entity.scaleX/Y` 계산 오류 (§7) |
| 오브젝트가 회전 중심이 어긋남 | `entity.regX/Y`가 selected picture 기준이 아님 (§8) — 소수점 유지 필요 |

---

## 부록: 참조 자료

이 명세는 다음 자료의 분석을 종합한 것입니다.

- 엔트리 공식 `.ent` 포맷 문서: <https://github.com/entrylabs/docs/blob/master/source/entryjs/file/2024-07-24-ent.md>
- 엔트리 공식 typedef (project-data, object-data 등): <https://github.com/entrylabs/docs/tree/master/source/entryjs/typedef>
- `entry-tool` 번들 내 업로드 검증 로직: `/^image\//`, `/\.eo$/` 분기와 1MB/10MB 크기 제한
- 실제 엔트리에서 내보낸 `.eo` 파일 구조 역공학 (이미지 8장 오브젝트 표본)
