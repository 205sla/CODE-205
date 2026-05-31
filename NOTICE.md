# 3rd-Party Notices

이 저장소는 오픈소스 라이브러리를 번들링하여 사용합니다. 각 구성 요소의 저작권과 라이선스를 아래에 명시합니다.

## EntryJS

- **저장소**: https://github.com/entrylabs/entryjs
- **저작권**: Copyright 2015 Entry Labs
- **라이선스**: Apache License 2.0
- **라이선스 전문**: [`public/lib/entry-js/LICENSE`](public/lib/entry-js/LICENSE)
- **NOTICE 원본**: [`public/lib/entry-js/NOTICE`](public/lib/entry-js/NOTICE)
- **사용 위치**: `public/lib/entry-js/` (컴파일된 번들 포함)
- **변경사항 요약**:
    - 원본 소스 미수정
    - 채점 로직은 별도 파일(`public/js/editor.js`, `public/js/editor-pure.js`)에서 Entry 런타임을 호출하는 방식으로 추가
    - 실행 시 `Entry.engine.toggleRun`/`toggleStop`을 래핑하여 사용자 인터랙션 가드 추가 (editor.js `installEngineGuard`)
    - 블록 카테고리 일부 비활성화 (`analysis`, `ai_utilize`, `expansion`, `arduino`) — Entry가 공식 제공하는 옵션을 통한 설정

## entry-tool

- **저작권**: Copyright Entry Labs
- **라이선스**: MIT (npm `@entrylabs/tool` + GitHub [entrylabs/entry-tool](https://github.com/entrylabs/entry-tool) 확인)
- **라이선스 파일**: [`public/lib/entry-tool/LICENSE`](public/lib/entry-tool/LICENSE)
- **사용 위치**: `public/lib/entry-tool/`

## legacy-video

- **저작권**: Copyright Entry Labs
- **라이선스**: MIT (npm `@entrylabs/legacy-video` + GitHub [entrylabs/legacy-video](https://github.com/entrylabs/legacy-video) 확인)
- **라이선스 파일**: [`public/lib/legacy-video/LICENSE`](public/lib/legacy-video/LICENSE)
- **사용 위치**: `public/lib/legacy-video/`

## entry-paint, entry-lms, sound-editor

- **저작권**: Copyright Entry Labs (추정)
- **라이선스**: **명시적으로 선언되지 않음** (업스트림에 공개 저장소·NPM 패키지·라이선스 헤더 없음)
- **사용 위치**: `public/lib/entry-paint/`, `public/lib/entry-lms/`, `public/lib/sound-editor/`
- 동일 출처(Entry Labs)의 다른 오픈소스 패키지가 MIT 또는 Apache 2.0을 사용하는 점을 근거로 동일 기조의 재배포 허용을 가정하나, 공식 확인은 되지 않았습니다.
- 이 저장소를 포크/재배포하려는 분은 [Entry Labs](https://playentry.org)에 직접 문의하여 라이선스 상태를 확인하시기 바랍니다.

## 번들된 제3자 라이브러리 (vendored)

에디터(`public/editor.html`)가 사용하는 범용 라이브러리는 `public/lib/vendor/` 아래에 로컬 번들되어 있습니다. 각자의 원본 배포판 라이선스를 따릅니다(모두 MIT/BSD 계열).

| 라이브러리 | 버전 | 라이선스 | 출처 |
|---|---|---|---|
| jQuery | 1.9.1 | MIT | playentry.org 배포본 |
| jQuery UI | 1.10.4 | MIT | playentry.org 배포본 |
| Lodash | 4.17.x | MIT | playentry.org 배포본 |
| Velocity | 1.2.3 | MIT | playentry.org 배포본 |
| CodeMirror | 5.12.0 | MIT | playentry.org 배포본 |
| CreateJS (Preload/Easel/Sound) | 0.6.0 / 0.8.0 / 0.6.0 | MIT | playentry.org 배포본 |
| Socket.IO client | — | MIT | playentry.org 배포본 |
| React / ReactDOM | 18.3.1 | MIT | unpkg.com |
| JSHint | 2.9.5 | MIT | cdnjs |

> 이전에는 이 라이브러리들을 `https://playentry.org/lib/...` 및 `https://unpkg.com/...`에서 런타임 로드했으나, 완전 오프라인 동작과 외부 CDN 경로 변경 리스크 제거를 위해 로컬 번들로 전환했습니다. `python.js`(CodeMirror Python mode)도 함께 번들.

## 엔트리봇 및 관련 브랜드

"엔트리(Entry)"·"엔트리봇"·관련 캐릭터 이미지는 Entry Labs의 상표/저작물이며 본 프로젝트의 오픈소스 범위 밖입니다. 본 사이트는 Entry Labs의 공식 서비스가 아닙니다.

## "205" 상표권

본 서비스에서 사용되는 숫자 표지 **"205"** 는 대한민국 특허청에 출원된 등록 상표이며, 본 저장소 운영자가 권리를 보유합니다.

- **출원번호**: 40-2023-0165693
- **공식 정보 조회**: [doi.org/10.8080/4020230165693](https://doi.org/10.8080/4020230165693) (KIPRIS 특허정보원)
- **권리자**: 본 저장소 운영자 (세부 권리자 정보는 위 링크에서 확인 가능)

본 서비스(`code.205.kr`)는 권리자의 상기 상표를 적법하게 사용합니다. 본 저장소를 포크·재배포하려는 경우 "205" 상표의 사용은 별도 허락이 필요합니다. (소스 코드의 Apache 2.0 / MIT 라이선스 허락과는 독립적인 권리임)

---

## 이 저장소(CODE-205) 자체의 코드

상기 3rd-party 코드를 제외한 본 저장소 자체 저작물(server.js, public/js/\*, public/css/\*, public/contribute.html, public/index.html, problems/\* 등)은 별도 라이선스가 명시되지 않는 한 모든 권리가 저작자(205)에게 유보됩니다.
