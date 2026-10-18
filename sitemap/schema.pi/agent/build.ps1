# schema.pi DDL 로컬 에이전트 빌드(Windows) — SchemaPiAgent.java → schemapi-agent.jar(Java 17 대상, 외부 라이브러리 없음). 사용 : powershell -File build.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command javac -ErrorAction SilentlyContinue)) { throw 'javac 없음 — JDK 17 이상 설치' }
if (Test-Path out) { Remove-Item -Recurse -Force out }
New-Item -ItemType Directory out | Out-Null
javac --release 17 -encoding UTF-8 -d out SchemaPiAgent.java
if ($LASTEXITCODE -ne 0) { throw 'javac 실패' }
jar --create --file schemapi-agent.jar --main-class SchemaPiAgent -C out .
Remove-Item -Recurse -Force out
java -cp schemapi-agent.jar SchemaPiAgent --selftest ..\test\fixtures\sql-guard.json
if ($LASTEXITCODE -ne 0) { throw '자체 검사 실패 — 서버와 판정이 다릅니다' }
Write-Output 'schemapi-agent.jar 생성'
