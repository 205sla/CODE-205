-- CODE 205 SQLite 스키마 (v5)
-- src/db/init.js가 첫 부트 때 멱등 적용한다 (CREATE TABLE IF NOT EXISTS).
-- 컬럼 추가/제약 변경은 새 마이그레이션 단계로 분리 (단순 테이블 추가는 여기에).

-- ─────── users ───────
-- username: 로그인 ID (영숫자+_, 3-20자). 항상 lowercase로 저장된다 — authService.normalizeUsername
--           User123/USER123이 별개 계정으로 가입되는 사칭·혼동을 막기 위해.
-- email:    선택. NULL이면 비밀번호 분실 복구 불가 (학교 발급 계정 등 이메일 없는 학생 배려).
--           SQLite는 UNIQUE 컬럼에서 NULL 다중 허용 → 이메일 미입력 사용자 여러 명 OK.
-- birth_year: 14세 이상 가입 정책 검증용. 가입 시점에만 검증, DB는 단순 저장.
-- display_name: 화면 표시용 별칭. NULL이면 username을 표시.
-- created_at / last_login_at: Unix epoch (sec).
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    email         TEXT    UNIQUE,
    password_hash TEXT    NOT NULL,
    birth_year    INTEGER NOT NULL,
    display_name  TEXT,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
);

-- email은 UNIQUE 제약으로 자동 인덱스가 생기지만, 명시적으로 한 번 더 두진 않는다.
-- username도 UNIQUE라서 인덱스 자동.

-- ─────── solutions (v2) ───────
-- 사용자가 해결한 문제 기록. 클라이언트 localStorage(`entry:solved`)와 양방향 병합.
-- problem_id는 폴더명(3자리 문자열, 예: "017"). 외래키 X — 문제가 삭제되거나 번호가 바뀌어도
-- 기록은 유지(잘못된 데이터로 보일 뿐 NOT NULL/CASCADE 영향 없음).
-- (user_id, problem_id) PRIMARY KEY로 같은 사용자의 같은 문제는 1행만.
CREATE TABLE IF NOT EXISTS solutions (
    user_id    INTEGER NOT NULL,
    problem_id TEXT    NOT NULL,
    solved_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, problem_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────── submissions (v3) ───────
-- 정답 통과 시 자동 저장된 코드 (Entry.exportProject 결과를 JSON.stringify).
-- 문제당 1행만 (PRIMARY KEY로 자동 덮어쓰기 — INSERT OR REPLACE 사용).
-- 코드 한도는 라우트 레벨에서 100KB로 강제. ON DELETE CASCADE로 사용자 삭제 시 자동 정리.
CREATE TABLE IF NOT EXISTS submissions (
    user_id      INTEGER NOT NULL,
    problem_id   TEXT    NOT NULL,
    code         TEXT    NOT NULL,
    submitted_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, problem_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────── sync_projects (v4) ───────
-- Entry Online에 연결할 작품 등록.
-- 같은 Entry 작품은 여러 CODE 205 사용자가 각각 등록할 수 있지만,
-- 한 사용자는 같은 작품을 중복 등록할 수 없다.
CREATE TABLE IF NOT EXISTS sync_projects (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id    INTEGER NOT NULL,
    entry_project_id TEXT    NOT NULL,
    room_size        INTEGER NOT NULL CHECK (room_size BETWEEN 2 AND 8),
    token            TEXT    UNIQUE NOT NULL,
    created_at       INTEGER NOT NULL,
    UNIQUE (owner_user_id, entry_project_id),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────── sync_usage (v5) ───────
-- Entry Online 작품별 일자 사용량 롤업.
-- WebSocket 핫패스에서는 메모리에 누적하고 usageMeter가 주기적으로 합쳐 쓴다.
-- 등록을 삭제했다가 다시 추가해도 과거 사용량을 유지하도록 sync_projects가 아니라
-- 사용자와 Entry 작품 ID를 기준으로 보관한다.
CREATE TABLE IF NOT EXISTS sync_usage (
    owner_user_id    INTEGER NOT NULL,
    entry_project_id TEXT    NOT NULL,
    day              TEXT    NOT NULL,
    connections      INTEGER NOT NULL DEFAULT 0,
    messages_in      INTEGER NOT NULL DEFAULT 0,
    messages_out     INTEGER NOT NULL DEFAULT 0,
    bytes_in         INTEGER NOT NULL DEFAULT 0,
    bytes_out        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_user_id, entry_project_id, day),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────── schema_version ───────
-- 마이그레이션 추적용. baseline 버전(이 schema.sql이 표현하는 상태)은 init.js의
-- BASELINE_VERSION 상수가 결정하고, 새 DB 부트 시 한 번만 INSERT한다.
-- 이후 schema 변경은 init.js의 MIGRATIONS 배열에 ALTER 단계로 추가.
CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);
