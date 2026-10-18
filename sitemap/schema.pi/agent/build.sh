#!/usr/bin/env bash
# schema.pi DDL 로컬 에이전트 빌드 — SchemaPiAgent.java → schemapi-agent.jar(Java 17 대상, 외부 라이브러리 없음). 사용 : ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v javac >/dev/null || { echo "javac 없음 — JDK 17 이상 설치"; exit 1; }
rm -rf out && mkdir -p out
javac --release 17 -encoding UTF-8 -d out SchemaPiAgent.java
jar --create --file schemapi-agent.jar --main-class SchemaPiAgent -C out .
rm -rf out
java -cp schemapi-agent.jar SchemaPiAgent --selftest ../test/fixtures/sql-guard.json
echo "schemapi-agent.jar 생성"
