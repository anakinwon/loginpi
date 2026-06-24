-- DA-APPROVED: msg_theme 테마 영문명 컬럼 추가 (다국어 지원)
-- theme_nm_en: VARCHAR(100) nullable — ko 외 locale 표시용

ALTER TABLE msg_theme
  ADD COLUMN IF NOT EXISTS theme_nm_en VARCHAR(100);

-- 기존 20개 테마 영문명 초기 적재
UPDATE msg_theme SET theme_nm_en = 'My Town'             WHERE theme_cd = 'MY_TOWN'           AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Weather'             WHERE theme_cd = 'WEATHER'           AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Travel'              WHERE theme_cd = 'TRAVEL'            AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Food & Restaurants'  WHERE theme_cd = 'FOOD_SPOTS'        AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Daily Chat'          WHERE theme_cd = 'DAILY_CHAT'        AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Info Sharing'        WHERE theme_cd = 'INFO_SHARE'        AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Second-Hand & Sharing' WHERE theme_cd = 'SECONDHAND'      AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Hobbies & Clubs'     WHERE theme_cd = 'HOBBY_GROUP'       AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'World Cup'           WHERE theme_cd = 'WORLD_CUP'         AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Premier League'      WHERE theme_cd = 'EPL'               AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Major League Baseball' WHERE theme_cd = 'MLB'             AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'E-Sports'            WHERE theme_cd = 'ESPORTS'           AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'NBA Basketball'      WHERE theme_cd = 'NBA'               AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Champions League'    WHERE theme_cd = 'UCL'               AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Formula 1'           WHERE theme_cd = 'F1'                AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'UFC & MMA'           WHERE theme_cd = 'UFC_MMA'           AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'K-League'            WHERE theme_cd = 'K_LEAGUE'          AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'PGA Tour Golf'       WHERE theme_cd = 'PGA_GOLF'          AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Tennis Grand Slam'   WHERE theme_cd = 'TENNIS_GRAND_SLAM' AND del_yn = 'N';
UPDATE msg_theme SET theme_nm_en = 'Pi Investing'        WHERE theme_cd = 'CRYPTO_TRADING'    AND del_yn = 'N';
