# 서가 — 할 일을 끝내면 책이 꽂히는 투두리스트

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 페이지 뼈대 |
| `style.css` | 화면 디자인 (폰 / 노트북 자동 전환, 기준 폭 900px) |
| `app.js` | 화면과 기능 전부 (주간 책장, 지금 5분, 뽑기, 서가, 도감, 원고함) |
| `store.js` | 데이터 저장 (이 기기 저장 / Firebase 동기화) |
| `firebase-config.js` | Firebase 설정값을 넣는 곳 |

설정값이 비어 있으면 **이 기기에만 저장**돼요. 폰과 노트북에서 같은 목록을 보려면 아래 2번까지 해 주세요.

---

## 1. GitHub Pages에 올리기

1. GitHub에 로그인 → 오른쪽 위 **+** → **New repository**
2. 이름 예: `seoga` → **Public** → **Create repository**
3. 저장소 화면에서 **Add file → Upload files** → 이 폴더의 파일 6개(`README.md` 포함)를 끌어다 놓기 → **Commit changes**
4. 저장소의 **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: **main**, 폴더 **/ (root)** → **Save**
5. 1~2분 뒤 같은 화면 위쪽에 주소가 나와요: `https://<깃허브아이디>.github.io/seoga/`

이 주소를 폰과 노트북에서 열면 돼요. 폰에서는 브라우저 메뉴의 **홈 화면에 추가**를 하면 앱처럼 열 수 있어요.

> 아직 2번을 안 했으면 기기마다 데이터가 따로 저장돼요.

---

## 2. Firebase 연결 (폰 ↔ 노트북 동기화)

Firebase는 구글의 무료 서비스예요. 개인 투두리스트 정도는 무료 사용량 안에서 충분해요.

### 2-1. 프로젝트 만들기
1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 이름 `seoga` → Google 애널리틱스는 **사용 안 함** → 만들기

### 2-2. 웹 앱 등록 → 설정값 복사
1. 프로젝트 개요 화면에서 **웹(`</>`) 아이콘** 클릭
2. 앱 닉네임 `seoga` → **앱 등록** (Hosting 체크는 하지 않아도 돼요)
3. 화면에 나오는 `const firebaseConfig = { ... }` 안의 값들을 복사
4. `firebase-config.js`를 열어 빈칸(`""`)을 그 값으로 채우기

```js
export const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "seoga-xxxx.firebaseapp.com",
  projectId: "seoga-xxxx",
  storageBucket: "seoga-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

> 이 값들은 비밀번호가 아니라 '어느 프로젝트인지' 알려주는 주소 같은 거라서, 공개 저장소에 올라가도 괜찮아요. 데이터 보호는 2-4의 보안 규칙이 맡아요.

### 2-3. 구글 로그인 켜기
1. 왼쪽 메뉴 **빌드 → Authentication → 시작하기**
2. **Sign-in method** 탭 → **Google** → 사용 설정 → 지원 이메일 선택 → 저장
3. **Settings** 탭 → **승인된 도메인** → **도메인 추가** → `<깃허브아이디>.github.io` 입력

### 2-4. 데이터베이스 만들기 + 보안 규칙
1. 왼쪽 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**
2. 위치: `asia-northeast3 (서울)` → **프로덕션 모드**로 시작
3. **규칙** 탭에서 내용을 전부 지우고 아래로 바꾼 뒤 **게시**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

본인 계정으로 로그인한 사람만 본인 데이터를 읽고 쓸 수 있다는 규칙이에요.

### 2-5. 다시 올리기
수정한 `firebase-config.js`를 GitHub 저장소에 다시 업로드(같은 이름으로 덮어쓰기)하면 끝이에요. 사이트를 열면 **Google로 로그인** 화면이 나오고, 폰과 노트북에서 같은 구글 계정으로 로그인하면 목록이 맞춰져요.

- 처음 로그인할 때 그 기기에 이미 저장된 할 일이 있으면 클라우드로 옮겨져요.
- 두 기기에서 거의 동시에 고치면 나중에 저장한 쪽이 남아요.

---

## 사용 규칙 요약

- **할 일**: 이름 · 마감일(필수) · 두께 S/M/L · 중요 표시
- **전집**: 큰 일을 2~10권으로 나누고 권마다 마감일을 따로 정해요. 모두 끝내면 '전집 북엔드'를 받아요.
- **주간 책장**: 월~일 7칸이에요. 끝낸 일은 **끝낸 날** 칸에 책으로 꽂혀요.
- **기한 지난 일**: 자동으로 오늘 칸으로 옮겨져요. '어제에서 옮겨옴', 'n일 전에서 옮겨옴'으로 표시돼요.
- **다가오는 할 일**: 이번 주 이후 마감은 '다음 주 ~요일', 'n주 뒤 ~요일'로 표시돼요. 주는 월~일 기준이에요.
- **지금 5분**: 오늘(+지난) 할 일 중 중요한 것, 마감이 이른 것 순으로 추천해요.
- **보상**
  - 할 일 하나를 처음 시작할 때 부속품을 1개 뽑아요. 하루의 첫 착수에는 '오늘의 책갈피'가 나와요.
  - 끝내면 책이 완성되고, 8% 확률로 금박 희귀본이 나와요.
  - 같은 일을 다시 시작해도 뽑기는 한 번뿐이에요.
- **벌칙 없음**: 놓친 일은 사라지거나 시들지 않아요.

## 고치고 싶을 때

- 희귀본 확률: `app.js` 맨 위 `RARE_CHANCE`
- 타이머 길이: `TIMER_MS`
- 책 색: `PALETTE`
- 부속품 목록: `ITEMS`
- 화면 색: `style.css` 맨 위 `:root`
