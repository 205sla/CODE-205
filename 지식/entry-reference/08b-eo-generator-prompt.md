# 부록: 다른 AI에게 전달할 프롬프트

> 이 문서는 [`08-eo-format.md`](./08-eo-format.md)를 참고 자료로 사용해서 다른 AI에게 Chrome 확장 프로그램 개발을 위탁할 때 그대로 복사·붙여넣기 할 수 있는 프롬프트입니다.
>
> **사용법**
> 1. 아래 "프롬프트 시작" ~ "프롬프트 끝" 사이를 통째로 복사
> 2. 다른 AI(Claude / ChatGPT / Gemini 등) 새 대화에 붙여넣기
> 3. 같은 메시지에 **`08-eo-format.md` 전체를 첨부**하거나 본문 끝에 붙여넣기

---

## ━━━━━━━━━━━━━━━━━━━━ 프롬프트 시작 ━━━━━━━━━━━━━━━━━━━━

당신은 Chrome 확장 프로그램을 설계·구현하는 시니어 프론트엔드 엔지니어입니다. 다음 도구를 만들어주세요.

---

### 1. 만들 것 — **다량 모양 업로더**

> **여러 개의 모양이 포함된 `.eo` 파일을 생성합니다.**

엔트리(playentry.org)의 블록 코딩 사이트는 "오브젝트 추가하기 → 파일 올리기"로 사용자 이미지를 한 번에 **최대 10장**까지만 업로드할 수 있습니다. 이 제한을 우회하기 위해 **임의 개수의 이미지를 한 오브젝트에 포함한 `.eo` 파일을 미리 생성**해주는 Chrome 확장 프로그램을 만듭니다. 사용자는 이 확장 프로그램으로 만든 `.eo`를 엔트리에 업로드해 한 번에 모양 N장이 들어간 오브젝트를 추가합니다.

- **기능 이름**: 다량 모양 업로더
- **한 줄 설명**: 여러 개의 모양이 포함된 `.eo` 파일을 생성합니다.
- **Chrome 확장 프로그램 이름**: `다량 모양 업로더` (manifest의 `name` 필드)
- **결과 파일명**: `<오브젝트명>.eo` (기본값. 사용자가 오브젝트명을 "걷는 사람"이라 입력했으면 `걷는 사람.eo`)

엔트리의 `.eo` 파일 포맷·JSON 스키마·디렉터리 구조·썸네일 규칙·ID 형식·스케일 계산은 **첨부된 `08-eo-format.md`에 전부 정리되어 있습니다**. 그 문서를 **single source of truth로 사용**하고, 본 프롬프트는 UX와 비기능 요구사항만 정의합니다. 두 문서가 모순되면 `08-eo-format.md`가 우선.

### 2. 사용자 흐름 (UX)

1. **확장 프로그램 설치 → 툴바 아이콘 클릭** → 별도의 Chrome 탭이 열림 (full-page UI)
2. 사용자가 그 탭에서:
   - 오브젝트 이름 입력 (필수)
   - 이미지 파일 N장 드래그-드롭 또는 파일 선택 (개수 제한 없음, 단 §6 크기 제약 준수)
   - 각 모양에 대해:
     - 모양 이름 편집 (기본값: 파일명에서 확장자 제거)
     - 순서 드래그로 재정렬
     - 삭제 가능
   - 기본 모양(`selectedPictureId`) 라디오 버튼으로 지정 (기본은 첫 번째)
   - 표시 배율(scale) 조정 — 자동 계산값을 보여주고 사용자가 슬라이더로 override 가능
3. **"생성" 버튼 클릭 → 브라우저가 `.eo` 파일 다운로드**
4. 사용자는 그 파일을 엔트리 사이트에서 업로드

### 3. 기능 요구사항

| 항목 | 요구사항 |
|---|---|
| 입력 | PNG / JPG / JPEG / GIF / WEBP / SVG. 다중 선택 + 드래그-드롭 둘 다. **BMP는 엔트리 미지원 — 입력 단계에서 거부** |
| **포맷 변환 (필수)** | **§ 3.1 아래 표 참조** — JPG 등은 PNG 변환 필수. SVG는 PNG raster 동반 파일 필수 |
| 미리보기 | 각 모양 카드에 썸네일(생성된 96px PNG 썸네일 그대로) + 원본 크기 표시 |
| 검증 | 합산 크기가 10MB를 넘으면 사용자에게 경고. 개별 이미지가 1MB 초과 시 경고 (차단 X, 정보 제공) |
| 진행률 | 이미지 N장 디코딩·변환·썸네일 생성 중 progress bar |
| 결과 파일명 | `<오브젝트명>.eo` (특수문자 sanitize) |
| 오프라인 | 전부 클라이언트 측 처리. 외부 서버 통신 금지 |
| i18n | 한국어 UI |

#### 3.1 포맷 변환 규칙 — **반드시 지킬 것**

엔트리는 `imageType` 값으로 **`"png"`와 `"svg"` 단 두 가지만** 인식합니다. JPG/GIF/WEBP를 그대로 넣으면 엔트리에서 표시되지 않습니다 (실측 확인됨 — 엔트리 사이트가 JPG를 직접 업로드받으면 내부적으로 PNG로 재인코딩 후 `imageType: "png"`로 저장). BMP는 엔트리 자체가 지원하지 않으므로 확장 프로그램에서 거부하세요. 다음 표대로 처리하세요.

| 입력 파일 | `imageType` | `image/` 안에 넣을 파일 | `thumb/` 안에 넣을 파일 |
|---|---|---|---|
| PNG | `"png"` | `{filename}.png` (원본) | `{filename}.png` (96px) |
| JPG / JPEG / GIF / WEBP | `"png"` | `{filename}.png` (**PNG로 재인코딩**) | `{filename}.png` (96px) |
| SVG | `"svg"` | `{filename}.svg` (원본) **+ `{filename}.png` (원본 해상도 raster)** | `{filename}.png` (96px raster) |

**핵심 두 가지 함정** — 이 두 가지를 어기면 첨부된 `08-eo-format.md` § 13 "자주 발생하는 오류" 표의 "PNG 모양은 나오는데 JPG/SVG 모양만 안 나옴" 증상이 그대로 재현됩니다:

1. **비트맵은 모두 PNG로 변환** — JPG를 `imageType: "jpg"`로 그대로 두지 말 것
2. **SVG는 raster 동반 파일 3개 필요** — `image/.svg` + `image/.png` + `thumb/.png`. 썸네일을 SVG로 두면 안 됨

`fileurl`의 확장자는 위 표의 첫 번째 `image/` 파일을 가리킵니다 (PNG는 `.png`, SVG는 `.svg`).

브라우저 측 변환 함수:

```js
// JPG/GIF/WEBP → PNG
async function toPng(file) {
  const bmp = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  return { blob: await canvas.convertToBlob({ type: 'image/png' }), width: bmp.width, height: bmp.height };
}

// SVG → 원본 해상도 PNG raster
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

### 4. 기술 스택

- **확장 프로그램 manifest v3**
- 별도 탭 UI: 일반적인 HTML/CSS/JS. 프레임워크 사용 여부는 자유 (Vanilla / Vue / React / Svelte 어느 쪽도 OK — 단, 빌드 산출물이 정적 파일이어야 함)
- **gzip 압축**: 브라우저 내장 `CompressionStream('gzip')` 우선, 호환성 fallback 필요 시 `pako` 번들
- **tar 빌드**: 외부 라이브러리 사용 시 가능한 한 가벼운 것(예: `js-untar`/`tar-stream`/직접 구현). 디렉터리 엔트리 포함 필수
- 이미지 디코딩: `createImageBitmap` / `<img>` + canvas
- 다운로드: `chrome.downloads.download` 또는 `<a download>` + `URL.createObjectURL`

### 5. 산출물

다음 파일들을 한 폴더 구조로 제공:

```
eo-generator/
├── manifest.json              (v3, action.default_title, 탭 열기 권한)
├── background.js              (icon click → chrome.tabs.create)
├── app/
│   ├── index.html
│   ├── app.css
│   ├── app.js                 (또는 빌드된 번들)
│   └── lib/                   (필요 시 pako 등)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png            (단순 임시 아이콘이라도 OK)
```

- 빌드 단계가 필요하다면 `package.json`과 빌드 스크립트 포함
- 사용자가 폴더를 `chrome://extensions → 압축 해제된 확장 프로그램 로드`로 바로 설치할 수 있어야 함

### 6. 코드 품질 기준

- **모든 로직 모듈을 작은 함수로 쪼개고 각 함수 위에 한국어 주석으로 의도 명시**
- `08-eo-format.md`의 § 번호를 코드 주석에서 인용 (예: `// §5 썸네일 규칙: 긴 변 96px`)
- 에러 처리: 잘못된 이미지(디코딩 실패), 빈 이름, 0장 업로드 → 사용자에게 명확한 메시지
- 매직 넘버 배제 — `THUMBNAIL_LONG_EDGE = 96`, `MAX_TOTAL_BYTES = 10 * 1024 * 1024` 등 상수화

### 7. 검증

생성한 `.eo`를 다음 방법으로 검증할 수 있어야 합니다.

1. **로컬 검증**: `gunzip <file>.eo | tar -tvf -` 로 풀어 보고 `08-eo-format.md § 2` 구조와 비교
2. **엔진 검증**: <https://playentry.org/ws/>에서 새 작품 → 오브젝트 추가하기 → 파일 → 생성한 `.eo` 업로드 → 모든 모양이 모양 패널에 나타나는지 확인
3. **자체 unit test 권장** (필수 아님): `object.json` 빌더의 출력이 §3 스키마와 일치하는지, 썸네일 크기 계산이 §5 표와 일치하는지

### 8. 범위 외

다음은 **요청에 포함되지 않음** — 시간 쓰지 마세요.

- 엔트리 계정 로그인·자동 업로드 (사용자가 수동으로 업로드)
- 사운드(`sounds[]`) 지원 — 빈 배열로 고정
- 블록 스크립트 편집 — `script: "[]"` 고정
- 여러 오브젝트를 한 `.eo`에 — 항상 `objects.length === 1`
- 변수·신호·함수 — 모두 빈 배열
- 다국어 — 한국어만

### 9. 결과물 제출 시

- 압축 해제만 하면 바로 설치 가능한 확장 프로그램 폴더
- `README.md`에 설치 방법·사용 방법·검증 방법
- 주요 함수에 대한 짧은 설명 (어느 함수가 § 어떤 항목을 구현하는지)

---

작업 시작 전에 `08-eo-format.md`를 처음부터 끝까지 읽고, **모호한 항목이 있으면 구현 전에 질문**하세요. 추측으로 진행하지 마시고요.

## ━━━━━━━━━━━━━━━━━━━━ 프롬프트 끝 ━━━━━━━━━━━━━━━━━━━━

---

## 함께 제공해야 할 첨부물

이 프롬프트만으로는 다른 AI가 엔트리 고유의 디테일을 모르므로, **반드시 함께 보내야 할 것**:

| 파일 | 역할 |
|---|---|
| [`08-eo-format.md`](./08-eo-format.md) | 엔트리 `.eo` 포맷 단일 진실 — 이 프롬프트가 참조하는 §1~§13 전부 |
| (선택) 예제 `.eo` 파일 | 다른 AI가 직접 풀어보면서 구조를 익힐 수 있도록 |

## 프롬프트 활용 팁

- AI가 manifest v2/v3을 혼동하지 않도록 §4에서 **v3**임을 명시했습니다. 만약 사용 AI가 manifest v2로 응답하면 명시적으로 "v3로 다시 작성" 지시.
- 빌드 도구(Vite/Webpack 등)를 쓰는 AI에게는 "산출물이 정적 파일이어야 함" 강조 — 사용자는 그냥 폴더를 Chrome에 로드만 하면 되도록.
- AI가 보안상 이유로 외부 CDN 스크립트를 권장하면 거부 — 확장 프로그램의 CSP 기본 정책이 inline·remote 스크립트를 차단함. 모든 라이브러리는 번들 안에.
- 만약 AI가 만든 첫 산출물이 동작하지 않으면, 실제 `.eo`를 `gunzip → tar -tvf`로 풀어 디렉터리 엔트리 누락·`temp/` 접두어 누락·thumb 파일 누락 셋 중 하나를 가장 먼저 의심.
