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

# DB 초기화
sudo rm -rf ./data && sudo docker-compose restart
```

---

## 🎮 사용법

1. 닉네임 설정
2. "참았다!" 버튼으로 기록
3. 랭킹에서 순위 확인
4. 그룹 만들어 친구와 경쟁 (6자리 코드 공유)

🦁💰
