# Security Review Rules

어떤 프로젝트에도 적용 가능한 보안 검사 규칙

각 항목은 **OWASP Top 10 (2021)** 분류와 **CWE (Common Weakness Enumeration)** 코드를 명시한다.

---

## 목차

1. [심각도 기준](#심각도-기준)
2. [검사 절차](#검사-절차)
3. [OWASP Top 10 매핑](#owasp-top-10-매핑)
4. [공통 검사 항목](#공통-검사-항목)
   - [A01 시크릿 노출](#a01-시크릿-노출)
   - [A02 인증](#a02-인증)
   - [A03 인가 / IDOR](#a03-인가--idor)
   - [A04 입력 검증](#a04-입력-검증)
   - [A05 SQL Injection](#a05-sql-injection)
   - [A06 XSS](#a06-xss)
   - [A07 CSRF](#a07-csrf)
   - [A08 Command Injection](#a08-command-injection)
   - [A09 Path Traversal](#a09-path-traversal)
   - [A10 파일 업로드](#a10-파일-업로드)
   - [A11 SSRF](#a11-ssrf)
   - [A12 에러 처리 / 로깅](#a12-에러-처리--로깅)
   - [A13 패키지 취약점](#a13-패키지-취약점)
   - [A14 보안 헤더](#a14-보안-헤더)
   - [A15 세션 / 쿠키](#a15-세션--쿠키)
   - [A16 암호화](#a16-암호화)
5. [스택별 추가 규칙](#스택별-추가-규칙)
6. [도구별 명령어](#도구별-명령어)
7. [출력 포맷](#출력-포맷)
8. [참고 자료](#참고-자료)

---

## 심각도 기준

| 심각도 | 정의 | CVSS 대응 | 예시 |
|--------|------|-----------|------|
| 🔴 CRITICAL | 즉시 악용 가능, 인증 없이 시스템 장악/데이터 유출 직결 | 9.0–10.0 | RCE, 인증 우회, 시크릿 노출 |
| 🟠 HIGH | 명확한 공격 경로, 일부 조건 충족 시 악용 | 7.0–8.9 | SQL injection, IDOR, HIGH npm audit |
| 🟡 MEDIUM | 조건부 악용 또는 다중 방어 중 일부 누락 | 4.0–6.9 | 보안 헤더 누락, CSRF 토큰 부재 |
| 🟢 LOW | 모범 사례 위반, 직접 악용 어려움 | 0.1–3.9 | 약한 패스워드 정책, 자세한 에러 메시지 |
| ℹ️ INFO | 정보 제공, 즉시 조치 불필요 | — | 권장 사항 |

---

## 검사 절차

1. **변경 파일 식별** — `git diff main...HEAD --name-only`
2. **자동화 도구 실행** — `npm audit`, `gitleaks`, `semgrep`, `osv-scanner`
3. **수동 코드 리뷰** — 아래 검사 항목 순서대로 점검
4. **스택별 규칙 적용** — 사용 중인 프레임워크 추가 검사
5. **이슈 분류** — 심각도 + OWASP 카테고리 + CWE 코드 부여
6. **수정안 제시** — 위치(파일:라인) + 취약/안전 코드 + 참고 링크

---

## OWASP Top 10 매핑

| OWASP 2021 | 본 문서 항목 |
|------------|-------------|
| A01 Broken Access Control | A02 인증, A03 인가/IDOR, A09 Path Traversal |
| A02 Cryptographic Failures | A01 시크릿 노출, A16 암호화 |
| A03 Injection | A04 입력 검증, A05 SQL Injection, A06 XSS, A08 Command Injection |
| A04 Insecure Design | (설계 단계 — 본 문서 범위 외) |
| A05 Security Misconfiguration | A12 에러/로깅, A14 보안 헤더, A15 세션/쿠키 |
| A06 Vulnerable Components | A13 패키지 취약점 |
| A07 Identification & Auth Failures | A02 인증, A15 세션/쿠키 |
| A08 Software & Data Integrity Failures | A11 SSRF, A10 파일 업로드 |
| A09 Security Logging Failures | A12 에러 처리/로깅 |
| A10 SSRF | A11 SSRF |

---

## 공통 검사 항목

### A01 시크릿 노출

- **OWASP**: A02 Cryptographic Failures
- **CWE**: [CWE-798](https://cwe.mitre.org/data/definitions/798.html) Hardcoded Credentials, [CWE-200](https://cwe.mitre.org/data/definitions/200.html) Information Exposure, [CWE-312](https://cwe.mitre.org/data/definitions/312.html) Cleartext Storage

**검사 대상**
- 하드코딩된 API key, password, token, private key
- `.env`, `.env.*` 파일의 git 추적 여부
- 클라이언트 노출 접두사(`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `PUBLIC_`)에 시크릿
- 커밋 히스토리에 남은 시크릿
- 로그/에러 메시지에 시크릿 출력

**취약 패턴**
```ts
const API_KEY = "sk_live_abc123...";              // ❌ 하드코딩
console.log("user logged in", { token: jwt });    // ❌ 로그 노출
// .env (committed)
DATABASE_URL=postgres://user:pass@host/db          // ❌ git 추적
```

**안전 패턴**
```ts
const API_KEY = process.env.API_KEY!;
logger.info("user logged in", { userId: user.id });  // 토큰 X
// .gitignore: .env*
```

**도구**: `gitleaks detect --source .`, `trufflehog filesystem .`

---

### A02 인증

- **OWASP**: A07 Identification and Authentication Failures
- **CWE**: [CWE-287](https://cwe.mitre.org/data/definitions/287.html) Improper Authentication, [CWE-307](https://cwe.mitre.org/data/definitions/307.html) Improper Restriction of Excessive Auth Attempts, [CWE-521](https://cwe.mitre.org/data/definitions/521.html) Weak Password Requirements

**검사 대상**
- 보호 라우트에 인증 미들웨어 누락
- 약한 패스워드 정책 (길이, 복잡도)
- brute force 방어 부재 (rate limit, account lockout)
- JWT 시크릿이 약하거나 하드코딩
- 토큰 만료 시간 과도하게 김 / 영구 토큰
- MFA 미지원 (민감 작업)

**안전 패턴**
```ts
jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
// + rate limit + bcrypt(password, 12)
```

---

### A03 인가 / IDOR

- **OWASP**: A01 Broken Access Control
- **CWE**: [CWE-285](https://cwe.mitre.org/data/definitions/285.html) Improper Authorization, [CWE-639](https://cwe.mitre.org/data/definitions/639.html) Authorization Bypass Through User-Controlled Key (IDOR), [CWE-862](https://cwe.mitre.org/data/definitions/862.html) Missing Authorization

**검사 대상**
- DB 쿼리에 소유권(`user_id`) 필터 누락
- 클라이언트 권한 체크만, 서버 재검증 없음
- 권한 체크 없는 admin 엔드포인트
- 토큰의 role/claim을 신뢰 (서버 검증 누락)

**취약 패턴**
```ts
// ❌ id만 — 다른 유저 데이터 조작 가능
db.events.delete({ where: { id: eventId } });
```

**안전 패턴**
```ts
// ✅ 소유권 검증
db.events.delete({ where: { id: eventId, user_id: session.userId } });
// ✅ 서버 사이드 role 재검증
if (session.role !== 'admin') return res.status(403).end();
```

---

### A04 입력 검증

- **OWASP**: A03 Injection
- **CWE**: [CWE-20](https://cwe.mitre.org/data/definitions/20.html) Improper Input Validation, [CWE-1287](https://cwe.mitre.org/data/definitions/1287.html) Improper Validation of Specified Type

**검사 대상**
- 외부 입력(body, query, params, headers, cookies)을 검증 없이 사용
- 화이트리스트 대신 블랙리스트 필터
- 정규식 ReDoS 취약

**안전 패턴 — 스키마 검증**
```ts
import { z } from 'zod';
const Schema = z.object({
  title: z.string().min(1).max(200),
  count: z.number().int().min(0),
});
const result = Schema.safeParse(req.body);
if (!result.success) return res.status(400).json(result.error);
```

---

### A05 SQL Injection

- **OWASP**: A03 Injection
- **CWE**: [CWE-89](https://cwe.mitre.org/data/definitions/89.html) SQL Injection

**취약 패턴**
```ts
db.query(`SELECT * FROM users WHERE id = '${userId}'`);   // ❌
```

**안전 패턴**
```ts
db.query('SELECT * FROM users WHERE id = $1', [userId]);  // ✅ Parameterized
prisma.user.findUnique({ where: { id: userId } });        // ✅ ORM
```

---

### A06 XSS

- **OWASP**: A03 Injection
- **CWE**: [CWE-79](https://cwe.mitre.org/data/definitions/79.html) Cross-site Scripting, [CWE-80](https://cwe.mitre.org/data/definitions/80.html) Basic XSS

**취약 패턴**
```tsx
<div dangerouslySetInnerHTML={{ __html: userInput }} />    // ❌
<a href={userUrl}>click</a>                                 // ❌ javascript: 가능
element.innerHTML = userInput;                              // ❌
```

**안전 패턴**
```tsx
<div>{userInput}</div>                                      // ✅ React 자동 escape
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
// URL 검증
const safe = /^https?:\/\//.test(url) ? url : '#';
```

---

### A07 CSRF

- **OWASP**: A01 Broken Access Control
- **CWE**: [CWE-352](https://cwe.mitre.org/data/definitions/352.html) Cross-Site Request Forgery

**검사 대상**
- 상태 변경 API(POST/PUT/DELETE)에 CSRF 보호 없음
- 쿠키 인증 + `SameSite=None` + CSRF 토큰 부재
- `GET`으로 상태 변경

**안전 패턴**
- `SameSite=Lax` 또는 `Strict` 쿠키
- CSRF 토큰 (double-submit cookie / synchronizer token)
- 또는 `Authorization: Bearer` 헤더 인증 (쿠키 미사용)

---

### A08 Command Injection

- **OWASP**: A03 Injection
- **CWE**: [CWE-78](https://cwe.mitre.org/data/definitions/78.html) OS Command Injection, [CWE-77](https://cwe.mitre.org/data/definitions/77.html) Command Injection

**취약 패턴**
```ts
exec(`convert ${userFilename} out.png`);                    // ❌
exec(`ping ${userHost}`);                                   // ❌
```

**안전 패턴**
```ts
execFile('convert', [userFilename, 'out.png']);             // ✅ shell 안 거침
if (!/^[a-zA-Z0-9._-]+$/.test(userFilename)) throw Error(); // ✅ 화이트리스트
```

---

### A09 Path Traversal

- **OWASP**: A01 Broken Access Control
- **CWE**: [CWE-22](https://cwe.mitre.org/data/definitions/22.html) Path Traversal, [CWE-23](https://cwe.mitre.org/data/definitions/23.html) Relative Path Traversal

**취약 패턴**
```ts
const file = fs.readFileSync(`./uploads/${req.params.name}`);
// 공격: ?name=../../etc/passwd                              // ❌
```

**안전 패턴**
```ts
import path from 'path';
const safe = path.normalize(req.params.name).replace(/^(\.\.[/\\])+/, '');
const full = path.join('/safe/uploads', safe);
if (!full.startsWith('/safe/uploads/')) throw Error('invalid');
```

---

### A10 파일 업로드

- **OWASP**: A04 Insecure Design / A08 Data Integrity
- **CWE**: [CWE-434](https://cwe.mitre.org/data/definitions/434.html) Unrestricted Upload of File with Dangerous Type, [CWE-400](https://cwe.mitre.org/data/definitions/400.html) Uncontrolled Resource Consumption

**검사 대상**
- 확장자 검증 없음 → `.php`, `.jsp`, `.aspx`, `.svg` 업로드 가능
- MIME 타입 클라이언트 사이드만 검증
- 업로드 디렉토리 스크립트 실행 가능
- 파일명 sanitize 누락 (`../`)
- 크기 제한 없음 → DoS

**안전 패턴**
- 확장자 **화이트리스트** (`.jpg`, `.png`, `.webp`)
- 서버에서 magic bytes 검사 (`file-type` 패키지)
- 업로드 디렉토리 실행 권한 차단
- 파일명 재생성 (UUID)
- 크기 제한 (예: 5MB)

---

### A11 SSRF

- **OWASP**: A10 Server-Side Request Forgery
- **CWE**: [CWE-918](https://cwe.mitre.org/data/definitions/918.html) Server-Side Request Forgery

**취약 패턴**
```ts
const res = await fetch(req.query.url);
// 공격: ?url=http://169.254.169.254/latest/meta-data       // ❌ AWS 메타데이터
```

**안전 패턴**
- 허용 도메인 화이트리스트
- 사설망 IP 차단 (`127.0.0.1`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `::1`, `fc00::/7`)
- DNS rebinding 방어 (요청 직전 IP 재확인)

---

### A12 에러 처리 / 로깅

- **OWASP**: A05 Security Misconfiguration, A09 Security Logging Failures
- **CWE**: [CWE-209](https://cwe.mitre.org/data/definitions/209.html) Information Exposure Through Error Message, [CWE-532](https://cwe.mitre.org/data/definitions/532.html) Insertion of Sensitive Info into Log File, [CWE-778](https://cwe.mitre.org/data/definitions/778.html) Insufficient Logging

**검사 대상**
- 스택 트레이스가 응답에 포함
- DB 에러 메시지 노출 (스키마 누출)
- 로그에 password/token/PII 기록
- production에서 debug 모드 활성화
- 인증/인가 실패 로그 부재

**안전 패턴**
```ts
try { ... } catch (e) {
  logger.error({ err: e, userId: session.userId });
  return res.status(500).json({ error: 'Internal Server Error' });
}
```

---

### A13 패키지 취약점

- **OWASP**: A06 Vulnerable and Outdated Components
- **CWE**: [CWE-1104](https://cwe.mitre.org/data/definitions/1104.html) Use of Unmaintained Third Party Components, [CWE-937](https://cwe.mitre.org/data/definitions/937.html) Known Vulnerabilities

**도구**
| 언어 | 명령어 |
|------|--------|
| Node | `npm audit`, `npm audit fix`, `pnpm audit` |
| Python | `pip-audit`, `safety check` |
| PHP | `composer audit` |
| 전체 | `osv-scanner -r .`, `snyk test` |

**검사 포인트**
- HIGH/CRITICAL 취약점 존재 여부
- 메이저 버전 뒤처짐
- 사용 안 하는 의존성 (공격 면적 ↓)
- transitive 의존성도 `overrides` 등으로 강제 가능

---

### A14 보안 헤더

- **OWASP**: A05 Security Misconfiguration
- **CWE**: [CWE-693](https://cwe.mitre.org/data/definitions/693.html) Protection Mechanism Failure, [CWE-1021](https://cwe.mitre.org/data/definitions/1021.html) Improper Restriction of Rendered UI

**필수 헤더**
| 헤더 | 권장 값 | 역할 |
|------|---------|------|
| `Content-Security-Policy` | `default-src 'self'; ...` | XSS / 데이터 주입 방어 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS 강제 |
| `X-Frame-Options` | `DENY` 또는 `SAMEORIGIN` | 클릭재킹 |
| `X-Content-Type-Options` | `nosniff` | MIME 스니핑 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | referrer 최소화 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | 브라우저 API 제한 |
| `Cross-Origin-Opener-Policy` | `same-origin` | XS-Leaks 방어 |

**검증**: [securityheaders.com](https://securityheaders.com) A 이상

---

### A15 세션 / 쿠키

- **OWASP**: A07 Auth Failures
- **CWE**: [CWE-614](https://cwe.mitre.org/data/definitions/614.html) Sensitive Cookie Without Secure Flag, [CWE-1004](https://cwe.mitre.org/data/definitions/1004.html) Sensitive Cookie Without HttpOnly, [CWE-384](https://cwe.mitre.org/data/definitions/384.html) Session Fixation

**검사 대상**
- 쿠키 `Secure`, `HttpOnly`, `SameSite` 플래그
- 세션 ID 예측 가능 여부
- 로그아웃 시 서버 세션 무효화
- 로그인 후 세션 ID 갱신 (fixation 방어)

**안전 설정**
```ts
res.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60,
});
```

---

### A16 암호화

- **OWASP**: A02 Cryptographic Failures
- **CWE**: [CWE-327](https://cwe.mitre.org/data/definitions/327.html) Broken/Risky Crypto Algorithm, [CWE-326](https://cwe.mitre.org/data/definitions/326.html) Inadequate Encryption Strength, [CWE-916](https://cwe.mitre.org/data/definitions/916.html) Weak Hash for Password

**금지 항목**
- MD5, SHA1 (패스워드 / 무결성용)
- DES, 3DES, RC4
- ECB 모드
- 자체 구현 암호 알고리즘

**안전 패턴**
| 용도 | 권장 |
|------|------|
| 패스워드 해싱 | `bcrypt`, `argon2`, `scrypt` |
| 대칭 암호 | AES-256-GCM |
| 무결성 | SHA-256 / SHA-3 |
| 난수 | `crypto.randomBytes` (Node), `secrets` (Python) |
| TLS | 1.2 이상, 1.3 권장 |

---

## 스택별 추가 규칙

### Next.js
- [ ] `NEXT_PUBLIC_*` 접두사에 시크릿 없는지
- [ ] `next.config.ts`에 보안 헤더 설정
- [ ] API Route / Server Action에서 인증·인가 재검증
- [ ] `rewrites`/`redirects`가 open redirect 만들지 않는지
- [ ] `next/image` `remotePatterns` 화이트리스트
- [ ] Middleware에서 인증 우회 가능 경로 없는지

### Supabase
- [ ] **모든 테이블 RLS 활성화**
- [ ] RLS 정책에 `auth.uid() = user_id` 등 row-level 검증
- [ ] `service_role` 키는 서버 전용 (클라이언트 노출 금지)
- [ ] 클라이언트 쿼리에 명시적 `.eq('user_id', user.id)` (RLS 이중 방어)
- [ ] Storage 버킷 RLS 설정
- [ ] Edge Function / Realtime 권한 검증

### Node.js / Express
- [ ] `helmet()` 미들웨어
- [ ] `express-rate-limit` (brute force)
- [ ] `cors` 화이트리스트 (와일드카드 `*` 금지)
- [ ] body parser 크기 제한 (`limit: '10kb'`)
- [ ] `cookie-parser` 서명 쿠키
- [ ] `eval`, `Function()`, `vm.runInNewContext` 사용자 입력 금지

### React / Vue / Svelte
- [ ] `dangerouslySetInnerHTML` / `v-html` / `{@html}` 사용 검토
- [ ] 외부 URL `<a href>`, `window.open` 검증
- [ ] `target="_blank"`에 `rel="noopener noreferrer"`

### Django
- [ ] `DEBUG = False` (production)
- [ ] `SECRET_KEY` 환경변수
- [ ] `ALLOWED_HOSTS` 명시
- [ ] `CSRF_COOKIE_SECURE`, `SESSION_COOKIE_SECURE = True`
- [ ] Raw SQL은 `params` 사용, f-string 금지

### Flask
- [ ] `Flask-WTF` CSRF 토큰
- [ ] `app.debug = False`
- [ ] `SECRET_KEY` 환경변수
- [ ] `pickle`, `yaml.load` 사용자 입력 금지 (`yaml.safe_load`)

### PHP
- [ ] `eval`, `system`, `exec`, `passthru` 사용자 입력 금지
- [ ] `include`/`require` 사용자 입력 금지 (LFI/RFI)
- [ ] `register_globals` off, `display_errors` off (production)
- [ ] PDO prepared statement (mysqli_query 직접 X)

### Spring Boot (Java)
- [ ] `spring-security` 적용
- [ ] CSRF 토큰 (기본 활성)
- [ ] `@PreAuthorize` 권한 어노테이션
- [ ] Actuator endpoint 인증 필수
- [ ] JdbcTemplate parameterized query

### Go
- [ ] `database/sql` placeholder 사용 (`?`, `$1`)
- [ ] `html/template` (자동 escape) vs `text/template` 구분
- [ ] `os/exec`에 `CommandContext` + 인자 배열

---

## 도구별 명령어

### 시크릿 스캔
```bash
gitleaks detect --source .                  # 커밋 히스토리
gitleaks detect --source . --no-git         # 현재 파일만
trufflehog filesystem .
trufflehog git file://.
```

### 패키지 취약점
```bash
# Node
npm audit && npm audit fix
npm audit --json | jq '.vulnerabilities'

# Python
pip-audit
safety check

# 멀티 언어
osv-scanner -r .
snyk test
```

### 정적 분석 (SAST)
```bash
semgrep --config=p/owasp-top-ten .
semgrep --config=p/security-audit .
semgrep --config=p/r2c-security-audit .

# 언어별
npx eslint --plugin security .              # JavaScript/TypeScript
bandit -r .                                 # Python
brakeman                                    # Ruby on Rails
gosec ./...                                 # Go
```

### 보안 헤더 / TLS
```bash
curl -I https://example.com
nmap --script ssl-enum-ciphers -p 443 example.com
# 또는 https://securityheaders.com, https://www.ssllabs.com/ssltest/
```

### 컨테이너 / IaC
```bash
trivy image myimage:tag
trivy fs .
checkov -d .                                # Terraform/CloudFormation
```

---

## 출력 포맷

검사 결과 보고 시 다음 형식을 따른다.

```markdown
# 보안 검사 결과

## 요약
- 🔴 CRITICAL: N개
- 🟠 HIGH: N개
- 🟡 MEDIUM: N개
- 🟢 LOW: N개

## 발견 취약점

### 🔴 CRITICAL — 1. [짧은 제목]
- **위치**: `path/to/file.ts:123`
- **분류**: OWASP A01 / CWE-639 (IDOR)
- **문제**: 무엇이 왜 위험한지 1-2문장
- **공격 시나리오**: 어떻게 악용되는지
- **취약 코드**:
  ```ts
  // 현재 코드
  ```
- **수정 코드**:
  ```ts
  // 수정 후
  ```
- **참고**: 관련 CWE/CVE 링크

### 🟠 HIGH — 2. ...
```

---

## 참고 자료

- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) — 검증 표준
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [CWE Database](https://cwe.mitre.org/)
- [CVE Database](https://cve.mitre.org/)
- [NVD (National Vulnerability Database)](https://nvd.nist.gov/)
- [Mozilla Web Security Guidelines](https://infosec.mozilla.org/guidelines/web_security)
- [SANS Top 25](https://www.sans.org/top25-software-errors/)
