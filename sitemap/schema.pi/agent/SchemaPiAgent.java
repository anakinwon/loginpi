// schema.pi DDL 로컬 에이전트(2026-10-18) — 사내망·Tibero DB 에 승인된 DDL 을 JDBC URL 또는 JNDI DataSource 로 실행하는 단독 jar
// 동작 : 서버에 HTTPS 로 작업을 묻고(바깥으로만 접속, 인바운드 포트 없음) → 해시·문장 화이트리스트·URL/JNDI 규칙 재검사 → 실행 → 문장별 결과 보고
// 실행 : java -cp "schemapi-agent.jar;<JDBC 드라이버>.jar" SchemaPiAgent [agent.properties]   (리눅스는 ; 대신 :)
//        java -cp schemapi-agent.jar SchemaPiAgent --selftest ../test/fixtures/sql-guard.json   (서버와 같은 판정인지 검사)
// 외부 라이브러리 없음(Java 17 표준). 토큰 = 환경변수 SCHEMAPI_AGENT_TOKEN, DB 비밀번호 = 환경변수 SCHEMAPI_PWD_<접속ID 앞 8자 대문자>
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Hashtable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Pattern;

public class SchemaPiAgent {
  static final String VERSION = "1.1.0"; // 1.1.0 = CREATE 직전 DROP … CASCADE 허용(2026-10-20)

  // ── 문장 화이트리스트(src/lib/modelpi/sql-guard.ts 와 같은 규칙) ──
  static final String ID = "[A-Za-z][A-Za-z0-9_]*";
  static final String IDS = ID + "(?:\\s*,\\s*" + ID + ")*";
  static final String STR = "'(?:[^']|'')*'";
  static final Pattern[] FIXED = {
    Pattern.compile("^COMMENT\\s+ON\\s+TABLE\\s+" + ID + "\\s+IS\\s+" + STR + "$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^COMMENT\\s+ON\\s+COLUMN\\s+" + ID + "\\." + ID + "\\s+IS\\s+" + STR + "$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^CREATE\\s+UNIQUE\\s+INDEX\\s+" + ID + "\\s+ON\\s+" + ID + "\\s*\\(\\s*" + IDS + "\\s*\\)$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^ALTER\\s+TABLE\\s+" + ID + "\\s+ADD\\s+CONSTRAINT\\s+" + ID + "\\s+PRIMARY\\s+KEY\\s+(?:\\(\\s*" + IDS + "\\s*\\)\\s+)?USING\\s+INDEX\\s+" + ID + "$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^CREATE\\s+SEQUENCE\\s+" + ID + "\\s+START\\s+WITH\\s+\\d{1,18}\\s+INCREMENT\\s+BY\\s+\\d{1,18}\\s+NOCACHE$", Pattern.CASE_INSENSITIVE),
  };
  static final Pattern CREATE_TABLE = Pattern.compile("^CREATE\\s+TABLE\\s+" + ID + "\\s*\\(([\\s\\S]*)\\)$", Pattern.CASE_INSENSITIVE);
  // CREATE 직전 DROP(2026-10-20) — 스크립트에서 바로 다음 문장이 같은 테이블 CREATE TABLE 일 때만(deniedAt)
  static final Pattern[] DROP = {
    Pattern.compile("^DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+(" + ID + ")\\s+CASCADE$", Pattern.CASE_INSENSITIVE),
    Pattern.compile("^DROP\\s+TABLE\\s+(" + ID + ")\\s+CASCADE\\s+CONSTRAINTS$", Pattern.CASE_INSENSITIVE),
  };
  static final Pattern CREATE_NM = Pattern.compile("^CREATE\\s+TABLE\\s+(" + ID + ")\\s*\\(", Pattern.CASE_INSENSITIVE);
  static String dropTarget(String stmt) {
    for (Pattern p : DROP) { var m = p.matcher(stmt.trim()); if (m.matches()) return m.group(1).toUpperCase(); }
    return null;
  }
  // 거부할 첫 문장 순번(0부터), 없으면 -1
  static int deniedAt(List<String> stmts) {
    for (int i = 0; i < stmts.size(); i++) {
      if (!stmtAllowed(stmts.get(i))) return i;
      String d = dropTarget(stmts.get(i));
      if (d == null) continue;
      var m = i + 1 < stmts.size() ? CREATE_NM.matcher(stmts.get(i + 1).trim()) : null;
      if (m == null || !m.find() || !m.group(1).toUpperCase().equals(d)) return i;
    }
    return -1;
  }
  static final Pattern BAD_WORD = Pattern.compile("\\b(SELECT|INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|BEGIN|DECLARE|CALL|COPY|REFERENCES|FOREIGN|AS\\s+SELECT|INTO|FUNCTION|PROCEDURE|TRIGGER|LANGUAGE|DO)\\b", Pattern.CASE_INSENSITIVE);

  static boolean stmtAllowed(String stmt) {
    String s = stmt.trim();
    String bare = s.replaceAll(STR, "''");
    long quotes = bare.chars().filter(c -> c == '\'').count();
    if (s.isEmpty() || quotes % 2 == 1 || Pattern.compile(";|--|/\\*|\\*/|\"|\\$|\\\\").matcher(bare).find()) return false;
    for (Pattern p : FIXED) if (p.matcher(s).matches()) return true;
    if (dropTarget(s) != null) return true;
    var m = CREATE_TABLE.matcher(bare);
    if (!m.matches()) return false;
    String body = m.group(1);
    if (!body.matches("[A-Za-z0-9_\\s,().'-]*")) return false;
    return !BAD_WORD.matcher(body).find();
  }

  // ── 접속 URL·JNDI 규칙(src/lib/modelpi/jdbc-url.ts urlStorable·jndiOk 와 같은 규칙) ──
  static final String HOST = "(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9.-]+)";
  static boolean urlOk(String u, String dbms) {
    if (u.length() > 1000 || Pattern.compile("[\\s#;]").matcher(u).find()) return false;
    if (u.toLowerCase().matches(".*(password|pwd|user)=.*")) return false;
    switch (dbms) {
      case "0014": {
        String[] parts = u.split("\\?", 2);
        if (!parts[0].matches("^jdbc:postgresql://" + HOST + "(:\\d{1,5})?/[A-Za-z0-9_.$-]+$")) return false;
        if (parts.length == 1) return true;
        for (String kv : parts[1].split("&")) if (!kv.matches("^(sslmode|ApplicationName|currentSchema|connectTimeout)=[\\w.-]{1,64}$")) return false;
        return true;
      }
      case "0001": return u.matches("(?i)^jdbc:oracle:thin:@(//)?" + HOST + "(:\\d{1,5})?[/:][A-Za-z0-9_.$#-]+$");
      case "0013": return u.matches("(?i)^jdbc:tibero:thin:@" + HOST + "(:\\d{1,5})?:[A-Za-z0-9_.$#-]+$");
      default: return false;
    }
  }
  // URL 의 호스트[:포트] — 허용 호스트 대조용(형식은 urlOk 가 먼저 검사)
  static String[] hostOf(String u) {
    var m = Pattern.compile("^jdbc:(?:postgresql://|oracle:thin:@(?://)?|tibero:thin:@)" + HOST + "(?::(\\d{1,5}))?", Pattern.CASE_INSENSITIVE).matcher(u);
    return m.find() ? new String[] { m.group(1).toLowerCase(), m.group(2) } : null;
  }
  // 허용 호스트(보안 검토 2026-10-18) — 이 PC 설정 allow.hosts 에 있는 호스트(·포트)로만 접속, 서버가 URL 을 바꿔도 비밀번호를 다른 곳으로 보내지 않음
  static boolean hostAllowed(String[] hp, Set<String> allow) {
    if (hp == null) return false;
    return allow.contains(hp[0]) || (hp[1] != null && allow.contains(hp[0] + ":" + hp[1]));
  }
  static boolean jndiOk(String n) {
    return n.length() <= 255 && n.matches("^(java:(comp/env|global|app|module|jboss)/)?[A-Za-z0-9_][A-Za-z0-9_/.-]*$") && !n.contains("..");
  }

  static String sha256(String s) throws Exception {
    byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
    StringBuilder b = new StringBuilder();
    for (byte x : d) b.append(String.format("%02x", x));
    return b.toString();
  }

  // ── 최소 JSON(객체·배열·문자열·숫자·true/false/null) ──
  static final class Json {
    final String s; int i;
    Json(String s) { this.s = s; }
    static Object parse(String s) { Json j = new Json(s); j.ws(); Object v = j.val(); j.ws(); if (j.i != s.length()) throw new IllegalArgumentException("json"); return v; }
    void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    Object val() {
      ws();
      char c = s.charAt(i);
      if (c == '{') { i++; Map<String, Object> m = new LinkedHashMap<>(); ws(); if (s.charAt(i) == '}') { i++; return m; }
        while (true) { ws(); String k = str(); ws(); expect(':'); m.put(k, val()); ws(); if (s.charAt(i) == ',') { i++; continue; } expect('}'); return m; } }
      if (c == '[') { i++; List<Object> a = new ArrayList<>(); ws(); if (s.charAt(i) == ']') { i++; return a; }
        while (true) { a.add(val()); ws(); if (s.charAt(i) == ',') { i++; continue; } expect(']'); return a; } }
      if (c == '"') return str();
      if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
      if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
      if (s.startsWith("null", i)) { i += 4; return null; }
      int st = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
      return Double.parseDouble(s.substring(st, i));
    }
    void expect(char c) { if (s.charAt(i++) != c) throw new IllegalArgumentException("json " + c); }
    String str() {
      expect('"'); StringBuilder b = new StringBuilder();
      while (true) { char c = s.charAt(i++);
        if (c == '"') return b.toString();
        if (c != '\\') { b.append(c); continue; }
        char e = s.charAt(i++);
        switch (e) { case 'n' -> b.append('\n'); case 't' -> b.append('\t'); case 'r' -> b.append('\r'); case 'b' -> b.append('\b'); case 'f' -> b.append('\f');
          case 'u' -> { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; } default -> b.append(e); } }
    }
    static String q(String v) {
      if (v == null) return "null";
      StringBuilder b = new StringBuilder("\"");
      for (char c : v.toCharArray()) { if (c == '"' || c == '\\') b.append('\\').append(c); else if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
      return b.append('"').toString();
    }
  }

  // ── 설정 ──
  final Properties p = new Properties();
  final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(15)).build(); // h2c 업그레이드 시도 없이(일부 프록시·개발 서버가 끊음)
  String server, token;
  int pollSec;
  final Set<String> allowHosts = new HashSet<>();

  SchemaPiAgent(String cfg) throws Exception {
    if (Files.exists(Path.of(cfg))) try (InputStream in = new FileInputStream(cfg)) { p.load(in); }
    server = p.getProperty("server.url", "https://schem.vercel.app").replaceAll("/+$", "");
    URI su = URI.create(server);
    boolean local = "localhost".equals(su.getHost()) || "127.0.0.1".equals(su.getHost());
    if (!"https".equals(su.getScheme()) && !local) throw new IllegalArgumentException("server.url 은 https 만(로컬 시험 localhost 제외)");
    token = System.getenv("SCHEMAPI_AGENT_TOKEN");
    if (token == null || token.isBlank()) { token = p.getProperty("agent.token"); if (token != null) log("경고 : 토큰이 설정 파일에 평문으로 있습니다 — 환경변수 SCHEMAPI_AGENT_TOKEN 권장"); }
    if (token == null || !token.matches("^spa_[\\w-]{43}$")) throw new IllegalArgumentException("에이전트 토큰(SCHEMAPI_AGENT_TOKEN) 없음·형식 오류");
    pollSec = Math.max(5, Integer.parseInt(p.getProperty("poll.seconds", "15")));
    for (String h : p.getProperty("allow.hosts", "").split(",")) if (!h.isBlank()) allowHosts.add(h.trim().toLowerCase());
    if (allowHosts.isEmpty()) log("경고 : allow.hosts 가 비어 있어 JDBC URL 접속은 모두 거부됩니다(JNDI 만 가능) — 접속할 DB 호스트를 적으십시오");
  }

  static void log(String m) { System.out.println(java.time.LocalDateTime.now().withNano(0) + " " + m); }

  HttpResponse<String> post(String path, String body) throws Exception {
    return http.send(HttpRequest.newBuilder(URI.create(server + path)).timeout(Duration.ofSeconds(60)).header("Authorization", "Bearer " + token).header("Content-Type", "application/json").header("User-Agent", "schemapi-agent/" + VERSION).POST(HttpRequest.BodyPublishers.ofString(body == null ? "{}" : body)).build(), HttpResponse.BodyHandlers.ofString());
  }

  String pwdOf(String connId) {
    String env = "SCHEMAPI_PWD_" + connId.replace("-", "").substring(0, 8).toUpperCase();
    String v = System.getenv(env);
    if (v != null) return v;
    v = p.getProperty("conn." + connId + ".password");
    if (v != null) log("경고 : 접속 " + connId + " 비밀번호가 설정 파일에 평문으로 있습니다 — 환경변수 " + env + " 권장");
    return v;
  }

  Connection open(Map<String, Object> job) throws Exception {
    String connId = (String) job.get("conn_id"), dbms = (String) job.get("dbms_cd");
    String url = p.getProperty("conn." + connId + ".url", (String) job.get("conn_url"));
    String jndi = p.getProperty("conn." + connId + ".jndi", (String) job.get("jndi_nm"));
    String usr = p.getProperty("conn." + connId + ".user", (String) job.get("usr_nm"));
    String pwd = pwdOf(connId);
    if (jndi != null && !jndi.isBlank()) {
      if (!jndiOk(jndi)) throw new SecurityException("허용되지 않는 JNDI 이름");
      Hashtable<String, String> env = new Hashtable<>();
      if (p.getProperty("jndi.factory") != null) env.put(javax.naming.Context.INITIAL_CONTEXT_FACTORY, p.getProperty("jndi.factory"));
      if (p.getProperty("jndi.provider.url") != null) env.put(javax.naming.Context.PROVIDER_URL, p.getProperty("jndi.provider.url"));
      javax.sql.DataSource ds = (javax.sql.DataSource) new javax.naming.InitialContext(env).lookup(jndi);
      return usr != null && pwd != null ? ds.getConnection(usr, pwd) : ds.getConnection();
    }
    if (url == null || !urlOk(url, dbms)) throw new SecurityException("허용되지 않는 JDBC URL(형식·DBMS 불일치·인자)");
    if (!hostAllowed(hostOf(url), allowHosts)) throw new SecurityException("allow.hosts 에 없는 호스트 — 이 PC 설정에 접속할 DB 호스트를 추가하십시오(비밀번호를 보내지 않음)");
    return DriverManager.getConnection(url, usr, pwd);
  }

  static String mask(String m, String... hide) {
    String s = m == null ? "" : m.replaceAll("\\s+", " ");
    for (String h : hide) if (h != null && h.length() >= 2) s = s.replace(h, "***");
    return s.length() > 200 ? s.substring(0, 200) : s;
  }

  record Res(int seq, String rslt, String errCd, String errMsg, Long ms) {
    String json() { return "{\"seq\":" + seq + ",\"rslt\":" + Json.q(rslt) + ",\"err_cd\":" + Json.q(errCd) + ",\"err_msg\":" + Json.q(errMsg) + ",\"ms\":" + (ms == null ? "null" : ms) + "}"; }
  }

  void report(String reqId, String nonce, int tryNo, List<Res> rs, String fin) throws Exception {
    StringBuilder b = new StringBuilder("{\"run_nonce\":" + Json.q(nonce) + ",\"try_no\":" + tryNo + ",\"final\":" + Json.q(fin) + ",\"results\":[");
    for (int k = 0; k < rs.size(); k++) b.append(k > 0 ? "," : "").append(rs.get(k).json());
    HttpResponse<String> r = post("/api/agent/jobs/" + reqId + "/result", b.append("]}").toString());
    if (r.statusCode() != 200) log("결과 보고 실패 " + r.statusCode() + " : " + mask(r.body()));
  }

  @SuppressWarnings("unchecked")
  void runJob(Map<String, Object> job) throws Exception {
    String reqId = (String) job.get("req_id"), nonce = (String) job.get("run_nonce"), dbms = (String) job.get("dbms_cd");
    int tryNo = ((Double) job.get("try_no")).intValue();
    List<String> stmts = new ArrayList<>();
    for (Object o : (List<Object>) job.get("stmts")) stmts.add((String) o);
    Set<Integer> done = new HashSet<>();
    for (Object o : (List<Object>) job.get("done_seqs")) done.add(((Double) o).intValue());
    List<Res> rs = new ArrayList<>();
    log("작업 " + reqId + " 시도 " + tryNo + " · 문장 " + stmts.size() + "개");
    // 서버와 같은 대조 — 하나라도 어긋나면 실행하지 않고 실패 보고
    String bad = !sha256(String.join(";\n", stmts)).equals(job.get("sha256")) ? "HASH" : null;
    int den = bad == null ? deniedAt(stmts) : -1;
    if (den >= 0) bad = "DENIED#" + (den + 1);
    if (bad != null) {
      rs.add(new Res(1, "ERR", "AGT_GUARD", "에이전트 검사 실패 : " + bad, null));
      for (int k = 2; k <= stmts.size(); k++) rs.add(new Res(k, "SKIP", null, null, null));
      report(reqId, nonce, tryNo, rs, "FAIL");
      return;
    }
    String usr = (String) job.get("usr_nm");
    boolean pg = "0014".equals(dbms);
    try (Connection cn = open(job)) {
      String host = cn.getMetaData().getURL();
      cn.setAutoCommit(!pg); // PostgreSQL = 한 트랜잭션, Oracle·Tibero = DDL 문장마다 커밋(실패 지점부터 다음 시도에서 재개)
      int at = -1;
      try (Statement st = cn.createStatement()) {
        st.setQueryTimeout(60);
        // PostgreSQL : search_path 를 현재 스키마 하나로 고정(트랜잭션 한정) — 한정 없는 DROP 이 다른 스키마 같은 이름 테이블을 지우지 않게(서버 runPg 와 같음)
        if (pg) st.execute("SELECT set_config('search_path', quote_ident(coalesce(current_schema(), 'public')), true)");
        for (int k = 0; k < stmts.size(); k++) {
          int seq = k + 1;
          if (done.contains(seq)) { rs.add(new Res(seq, "SKIP", null, "이전 시도에서 성공", null)); continue; }
          at = k;
          long t0 = System.currentTimeMillis();
          try {
            st.execute(stmts.get(k));
            rs.add(new Res(seq, "OK", null, null, System.currentTimeMillis() - t0));
          } catch (SQLException e) {
            // CREATE 직전 DROP 의 '테이블 없음'(Oracle ORA-00942, Tibero [확인중 : 오류코드 — 7071·메시지로 판정]) = 성공 기록(재시도에서 다시 DROP 되지 않게)
            String em = String.valueOf(e.getMessage());
            boolean tib = "0013".equals(dbms);
            if (dropTarget(stmts.get(k)) != null && (tib ? Math.abs(e.getErrorCode()) == 7071 || em.matches("(?is).*(not (be )?found|does not exist|존재하지).*") : e.getErrorCode() == 942)) {
              rs.add(new Res(seq, "OK", null, "테이블 없음 — DROP 건너뜀", System.currentTimeMillis() - t0));
              continue;
            }
            // Tibero 자동 증가 시퀀스 : DROP TABLE 이 시퀀스는 지우지 않아 다시 실행하면 '이미 있음' — 기존 시퀀스 그대로 사용(OK 기록) [확인중 : 티베로 오류코드]
            if (tib && stmts.get(k).trim().toUpperCase().startsWith("CREATE SEQUENCE") && em.matches("(?is).*(already|이미).*")) {
              rs.add(new Res(seq, "OK", null, "시퀀스 이미 있음 — 기존 시퀀스 사용", System.currentTimeMillis() - t0));
              continue;
            }
            rs.add(new Res(seq, "ERR", e.getSQLState() != null ? e.getSQLState() : String.valueOf(e.getErrorCode()), mask(e.getMessage(), host, usr), System.currentTimeMillis() - t0));
            for (int r = k + 1; r < stmts.size(); r++) rs.add(new Res(r + 1, "SKIP", null, null, null));
            break;
          }
        }
      }
      boolean err = rs.stream().anyMatch(x -> "ERR".equals(x.rslt()));
      if (pg) {
        if (err) { cn.rollback(); rs.replaceAll(x -> "OK".equals(x.rslt()) ? new Res(x.seq(), "RBK", null, null, x.ms()) : x); }
        else cn.commit();
        report(reqId, nonce, tryNo, rs, err ? "FAIL" : "DONE");
      } else {
        boolean anyOk = !done.isEmpty() || rs.stream().anyMatch(x -> "OK".equals(x.rslt()));
        report(reqId, nonce, tryNo, rs, !err ? "DONE" : anyOk ? "PART" : "FAIL");
      }
      log("작업 " + reqId + " 끝 — " + (err ? "오류 있음" : "완료"));
    } catch (Exception e) {
      rs.clear();
      int first = 0;
      while (first < stmts.size() && done.contains(first + 1)) first++;
      for (int k = 0; k < stmts.size(); k++) rs.add(done.contains(k + 1) ? new Res(k + 1, "SKIP", null, "이전 시도에서 성공", null) : k == first ? new Res(k + 1, "ERR", "CONN", mask(e.getClass().getSimpleName() + " " + e.getMessage(), usr), null) : new Res(k + 1, "SKIP", null, null, null));
      report(reqId, nonce, tryNo, rs, done.isEmpty() ? "FAIL" : "PART");
      log("작업 " + reqId + " 접속 실패 : " + mask(e.getMessage(), usr));
    }
  }

  @SuppressWarnings("unchecked")
  boolean pollOnce() throws Exception {
    HttpResponse<String> r = post("/api/agent/jobs/claim", "{}");
    if (r.statusCode() == 204) return false;
    if (r.statusCode() == 401) throw new SecurityException("토큰이 폐기·만료되었습니다 — 새 토큰 발급");
    if (r.statusCode() != 200) { log("작업 조회 실패 " + r.statusCode()); return false; }
    Map<String, Object> body = (Map<String, Object>) Json.parse(r.body());
    if (body.get("test") != null) runTest((Map<String, Object>) body.get("test"));
    else runJob((Map<String, Object>) body.get("job"));
    return true;
  }

  // 접속 시험(화면 '연결 시험') — 접속해 SELECT 1 만, 결과(성공·실패 사유) 보고. DDL 은 실행하지 않음
  void runTest(Map<String, Object> t) throws Exception {
    String connId = (String) t.get("conn_id"), dbms = (String) t.get("dbms_cd"), usr = (String) t.get("usr_nm");
    boolean ok;
    String msg;
    try (Connection cn = open(t); Statement st = cn.createStatement()) {
      st.setQueryTimeout(15);
      st.execute("0014".equals(dbms) ? "SELECT 1" : "SELECT 1 FROM DUAL");
      ok = true;
      msg = cn.getMetaData().getDatabaseProductName() + " " + cn.getMetaData().getDatabaseProductVersion();
    } catch (Exception e) {
      ok = false;
      msg = e.getClass().getSimpleName() + " " + e.getMessage();
    }
    msg = mask(msg, usr);
    HttpResponse<String> r = post("/api/agent/conns/" + connId + "/test-result", "{\"req_dtm\":" + Json.q((String) t.get("req_dtm")) + ",\"ok\":" + ok + ",\"msg\":" + Json.q(msg) + "}");
    log("접속 시험 " + connId + " — " + (ok ? "성공" : "실패 : " + msg) + (r.statusCode() == 200 ? "" : " (보고 실패 " + r.statusCode() + ")"));
  }

  // 공용 벡터로 문장 판정이 서버와 같은지 — 다르면 종료코드 1
  @SuppressWarnings("unchecked")
  static int selftest(String file) throws Exception {
    Map<String, Object> v = (Map<String, Object>) Json.parse(Files.readString(Path.of(file)));
    int bad = 0, n = 0;
    for (Object s : (List<Object>) v.get("allow")) { n++; if (!stmtAllowed((String) s)) { bad++; System.out.println("허용이어야 함 : " + s); } }
    for (Object s : (List<Object>) v.get("deny")) { n++; if (stmtAllowed((String) s)) { bad++; System.out.println("거부여야 함 : " + s); } }
    for (Object s : (List<Object>) v.get("script_ok")) { n++; List<String> l = new ArrayList<>(); for (Object o : (List<Object>) s) l.add((String) o); if (deniedAt(l) >= 0) { bad++; System.out.println("스크립트 허용이어야 함 : " + l); } }
    for (Object s : (List<Object>) v.get("script_bad")) { n++; List<String> l = new ArrayList<>(); for (Object o : (List<Object>) s) l.add((String) o); if (deniedAt(l) < 0) { bad++; System.out.println("스크립트 거부여야 함 : " + l); } }
    String[][] urls = { { "jdbc:tibero:thin:@10.0.0.5:8629:tibero", "0013", "Y" }, { "jdbc:oracle:thin:@//ora:1521/SVC", "0001", "Y" }, { "jdbc:postgresql://h:5432/d?sslmode=require", "0014", "Y" },
      { "jdbc:postgresql://h/d?socketFactory=x", "0014", "N" }, { "jdbc:postgresql://h/d?password=x", "0014", "N" }, { "jdbc:tibero:thin:@h:8629:t", "0014", "N" }, { "jdbc:h2:mem:x", "0014", "N" } };
    for (String[] u : urls) { n++; if (urlOk(u[0], u[1]) != "Y".equals(u[2])) { bad++; System.out.println("URL 판정 다름 : " + u[0]); } }
    Set<String> al = Set.of("10.0.0.5", "db.internal:5432");
    String[][] hs = { { "jdbc:tibero:thin:@10.0.0.5:8629:t", "Y" }, { "jdbc:postgresql://db.internal:5432/d", "Y" }, { "jdbc:postgresql://db.internal:6543/d", "N" }, { "jdbc:oracle:thin:@//evil.com:1521/S", "N" }, { "jdbc:postgresql://DB.INTERNAL:5432/d", "Y" } };
    for (String[] h : hs) { n++; if (hostAllowed(hostOf(h[0]), al) != "Y".equals(h[1])) { bad++; System.out.println("허용 호스트 판정 다름 : " + h[0]); } }
    String[][] jn = { { "java:comp/env/jdbc/ds", "Y" }, { "jdbc/TiberoDS", "Y" }, { "ldap://evil/x", "N" }, { "rmi://e/x", "N" }, { "java:comp/env/../x", "N" } };
    for (String[] j : jn) { n++; if (jndiOk(j[0]) != "Y".equals(j[1])) { bad++; System.out.println("JNDI 판정 다름 : " + j[0]); } }
    System.out.println("자체 검사 " + (n - bad) + "/" + n + " 일치");
    return bad == 0 ? 0 : 1;
  }

  public static void main(String[] a) throws Exception {
    if (a.length > 0 && "--selftest".equals(a[0])) System.exit(selftest(a.length > 1 ? a[1] : "sql-guard.json"));
    if (a.length > 0 && "--version".equals(a[0])) { System.out.println("schemapi-agent " + VERSION); return; }
    boolean once = List.of(a).contains("--once");
    String cfg = List.of(a).stream().filter(x -> !x.startsWith("--")).findFirst().orElse("agent.properties");
    SchemaPiAgent g = new SchemaPiAgent(cfg);
    log("schemapi-agent " + VERSION + " 시작 — 서버 " + g.server + ", " + g.pollSec + "초마다 확인");
    while (true) {
      try {
        boolean got = g.pollOnce();
        if (once) return;
        if (got) continue; // 남은 작업 바로 이어서
      } catch (SecurityException e) {
        log("중지 : " + e.getMessage());
        System.exit(2);
      } catch (Exception e) {
        log("오류 : " + mask(e.getMessage()));
        if (once) System.exit(1);
      }
      Thread.sleep(g.pollSec * 1000L);
    }
  }
}
