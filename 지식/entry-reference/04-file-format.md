# 04. `.ent` 파일 포맷

원본: [file/2024-07-24-ent.md](https://github.com/entrylabs/docs/blob/master/source/entryjs/file/2024-07-24-ent.md)

## 소개

**"내 컴퓨터에 저장하기"** 기능은 현재 작품을 `.ent` 확장자의 **gzipped tar 아카이브**로 패키징합니다. 아카이브 내부에는 `project.json`(프로젝트 데이터)과 모든 에셋(이미지·썸네일·소리)이 포함됩니다.

## 파일 구조

```
project.ent          (gzipped tar)
└── temp/
    ├── project.json       ← 전체 프로젝트 데이터
    ├── 0a/
    │   └── …              ← assets 폴더
    │
    ...
    └── fd/
        └── …
```

- **최상위 `temp/` 폴더** 필수
- 아래에 `project.json` 하나 + assets 폴더들
- `.ent`는 `tar`로 압축 해제가 가능합니다 (`tar xzf file.ent`).

## Asset 폴더 구조

모든 asset 파일명은 **난수 fileId**로 생성되며, fileId의 **앞 4자**로 2단계 폴더 경로를 만듭니다.

```js
// 엔트리 공식 fileId 생성
const { uid } = require('uid');
const Puid    = require('puid');
const puid    = new Puid();
const createFileId = () => uid(8) + puid.generate();
// 결과 예시: "e49448cdlyy4s42e0013f820158i7nqj" (32자, 소문자 알파뉴메릭)
```

fileId가 `e49448cdlyy4s42e0013f820158i7nqj`라면:

| 종류 | 경로 |
|---|---|
| 이미지 | `temp/e4/94/image/e49448cdlyy4s42e0013f820158i7nqj.png` |
| 썸네일 | `temp/e4/94/thumb/e49448cdlyy4s42e0013f820158i7nqj.png` |
| 사운드 | `temp/e4/94/sound/e49448cdlyy4s42e0013f820158i7nqj.mp3` |

> **우리 프로젝트**: `server.js`의 `entryStyleHash()`로 base36 32자 랜덤 생성. hex가 아니라 `[0-9a-z]` 공식 관례를 따름.

## 압축 옵션

엔트리 공식은 npm `tar` 패키지를 사용하며 gzip `memLevel: 6` 설정.

```js
await tar.c(
    {
        file: destination,        // 출력 .ent 경로
        gzip: { memLevel: 6 },
        cwd,                       // 작업 디렉토리
        filter: (path, stat) => {
            try { return !stat.isSymbolicLink(); }
            catch (e) { return false; }
        },
        portable: true,
    },
    [fileList]                      // temp 폴더 내용
);
```

### 압축 해제

```js
await tar.x({
    file: target,                   // .ent 경로
    cwd: destination,               // 풀 경로
    filter: (path, entry) => {
        const { type, size } = entry;
        return type !== 'SymbolicLink'
            && maxSize > size
            && checkExtName(entry);
    },
});
```

- **심볼릭 링크**는 압축·해제 양쪽에서 필터링
- 크기·확장자 검증 포함

> **우리 프로젝트**: `server.js`의 `makeTar`/`tarHeader`/`extractTarFile`이 동등 기능을 제공. `zlib.gzipSync(buf, { memLevel: 6 })`으로 공식 옵션 일치.

## 경로 규약 (매우 중요)

**`.ent` 파일을 `playentry.org`와 호환시키려면 asset 경로를 위 규약대로 맞춰야 합니다.**

서로 다른 서버 환경(예: 우리 CODE 205의 `/images/mascot/*` 또는 `/api/problems/:id/asset/*`)에서 만들어진 에셋을 엔트리에 넘기려면 **경로 재작성**이 필요합니다.

### 우리 서버에서 엔트리로 (export)

1. `project.json` 안의 모든 `picture.fileurl` / `picture.thumbUrl` / `sound.fileurl`을 스캔
2. 엔트리 외부 경로(`/images/…`, `/api/…` 등)를 **로컬 fs나 다른 서버에서 읽어** 바이트 확보
3. `createFileId()` 또는 그 등가로 새 fileId 생성
4. tar 안에 `temp/<fileId[0:2]>/<fileId[2:4]>/(image|thumb|sound)/<fileId>.<ext>`로 배치
5. project.json의 `fileurl`을 위 경로로 재작성, `filename`에는 **확장자 없는 fileId**만 저장
6. `tar + gzip(memLevel:6)`로 `.ent` 생성

### 엔트리에서 우리 서버로 (import)

1. `.ent` gunzip → tar 엔트리 순회
2. `temp/project.json`을 JSON으로 파싱
3. 에셋 파일들(`temp/XX/YY/…`)은 서버 내부에 **그대로 보관**하거나, 실제 파일 시스템으로 복사
4. `fileurl`이 `temp/…`를 가리키면 **서버가 감시 가능한 경로로 재작성** (예: `/api/problems/:id/asset/…`)

> **우리 프로젝트**: `server.js`의 `rewriteAssetUrl`이 바로 이 일을 담당.

## Picture 필드와 엔트리 엔진 로직

엔트리 엔진(`entry.min.js`)은 picture의 `fileurl` / `thumbUrl` / `filename`을 **우선순위**로 사용:

```js
// updateThumbnailView (요약)
if (t.thumbUrl || t.fileurl) {
    this.thumbUrl = t.thumbUrl || t.fileurl;       // 1순위: thumbUrl
                                                    // 2순위: fileurl (썸네일로도 재사용)
} else {
    this.thumbUrl = Entry.defaultPath + "/uploads/"
        + r.substring(0,2) + "/" + r.substring(2,4)
        + "/thumb/" + r + ".png";                   // 3순위: filename으로 .png 동적 파생
}
```

결론:
- **`thumbUrl` 필드가 있으면 엔진은 그걸 그대로 씀** — 확장자 `.svg`여도 OK
- `thumbUrl` 없이 `fileurl`만 있으면 엔진은 `fileurl`을 썸네일로 재사용
- 둘 다 없으면 `filename`으로 `.png` 경로를 조합하며, 이때는 `.png` 확장자 고정

따라서 **자체 SVG 캐릭터**를 쓸 때 별도 PNG 래스터라이즈 없이도 썸네일 렌더가 됩니다. `thumbUrl`을 정확히 지정하면.

## 주의사항

- 파일 경로 불일치로 `.ent`가 열리지 않는다면 **project.json의 fileurl이 tar 내부 실제 경로와 정확히 일치**하는지 먼저 확인.
- `filename` 필드는 엔트리 서버가 업로드 시 재매핑 키로 쓸 수 있으므로 **누락하지 말 것**.
- `temp/` 최상위 디렉토리 엔트리가 없으면 일부 파서에서 파싱 실패 가능.

## 참고

- [`Project Data`](./05-data-schemas.md#project-data) — `.ent` 내부 `project.json`의 최상위 스키마
- [`Object Data`](./05-data-schemas.md#object-data) — `objects[]` 각 요소
- npm `tar` 패키지: https://www.npmjs.com/package/tar
- npm `uid`: https://www.npmjs.com/package/uid
- npm `puid`: https://www.npmjs.com/package/puid
