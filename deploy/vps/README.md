# EDU톡 VPS 배포

- 주소: https://edutalk.ai-hub-os.com
- 서버: 기존 Hostinger VPS, `/opt/edutalk`
- 공개 실행: `edutalk-web`, 로컬 포트 `127.0.0.1:4328`, 컨테이너 3000
- 연결: `edutalk-tunnel`, 전용 Cloudflare Tunnel `edutalk-vps`
- 현재 모드: **demo**. 실제 Supabase/Auth/결제/AI 키 없음. 기관·후기·성적은 체험 데이터이며 브라우저 저장은 운영 DB가 아니다.
- 공개 상용 출시를 뜻하지 않는다. 실제 운영 전 `docs/release-checklist.md`와 `pnpm release:check` 필요.

## 구성

소스는 `/opt/edutalk/releases/<release>`에 보관한다. 공식 `node:22-alpine` 컨테이너에서 `sh deploy/vps/build.sh` 실행 후 standalone 결과만 Dockerfile로 이미지화한다. 빌더는 1.5 CPU/2GB로 제한하고 실제 앱은 0.75 CPU/512MB로 제한한다. `compose.yaml`은 `EDUTALK_IMAGE` 릴리스 이미지를 받는다.

```sh
# 서버 릴리스 폴더에서, Linux 빌드 이후
# build context에는 standalone/static/public만 넣는다.
docker build -f deploy/vps/Dockerfile -t edutalk:<release> .
cd /opt/edutalk
EDUTALK_IMAGE=edutalk:<release> docker compose up -d
curl --fail http://127.0.0.1:4328/api/health
```

연결 토큰은 서버 `secrets/tunnel-token`에만 두고, 상위 폴더는 root 전용 700으로 유지한다. 토큰 파일은 비루트 cloudflared 컨테이너가 읽을 수 있게 마운트한다. 키나 토큰은 Git에 넣지 않는다.

## 재배포·되돌리기

새 릴리스는 기존 실행 이미지를 덮어쓰지 않고 별도 태그로 만든다. 현재 compose와 `.env`를 백업하고, 새 이미지 health 확인 후 도메인에서 홈·검색·기관 상세를 확인한다. 실패 시 `.env`의 EDUTALK_IMAGE를 이전 태그로 되돌리고 `docker compose up -d web`을 실행한다. 첫 배포에는 이전 EDU톡 서비스가 없으므로 문제 시 `docker compose stop web tunnel`로 EDU톡만 중지한다. 다른 서비스나 이미지를 정리하지 않는다.
