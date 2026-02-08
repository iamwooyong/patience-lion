# 🦁 참고 사자

참고, 아낀 돈으로 주식 사자!

> DS218+ (10GB RAM) 기준

## 🚀 설치 (1분 컷)

```bash
# SSH 접속
ssh admin@NAS_IP

# Git clone
cd /volume1/docker
sudo git clone https://github.com/YOUR_USERNAME/patience-lion.git
cd patience-lion

# 실행
sudo docker-compose up -d --build
```

끝! → `http://NAS_IP:3080` 접속

## 🔄 업데이트 (10초 컷)

```bash
cd /volume1/docker/patience-lion
sudo git pull
sudo docker-compose up -d --build
```

---

## 📱 폰에서 앱처럼 쓰기

**iOS**: 사이트 접속 → 공유 → "홈 화면에 추가"
**Android**: 사이트 접속 → 메뉴 → "홈 화면에 추가"

---

## 🔧 설정

포트 변경하려면 `docker-compose.yml` 수정:
```yaml
ports:
  - "원하는포트:3001"
```

### 환경 변수

루트에 `.env` 파일을 만들어 아래 값을 설정할 수 있습니다. 예시는 `.env.example`에 있습니다.

- `TUNNEL_TOKEN` : cloudflared 터널 토큰 (선택)
- `PORT` : 컨테이너 내부 포트 (기본 3001)
- `DATABASE_URL` : PostgreSQL 접속 URL (docker-compose에 기본값 포함)

### 데이터베이스

PostgreSQL 16을 사용하며, `docker-compose.yml`에 포함되어 자동으로 실행됩니다.
데이터는 Docker named volume(`pgdata`)에 저장됩니다.

---

## 🐛 문제 해결

```bash
# 로그 확인
sudo docker-compose logs -f

# 재시작
sudo docker-compose restart

# 완전 재빌드
sudo docker-compose down
sudo docker-compose up -d --build

# DB 초기화 (주의: 모든 데이터 삭제)
sudo docker-compose down -v
sudo docker-compose up -d --build
```

---

## 🎮 사용법

1. 닉네임 설정
2. "참았다!" 버튼으로 기록
3. 랭킹에서 순위 확인
4. 그룹 만들어 친구와 경쟁 (6자리 코드 공유)

🦁💰
