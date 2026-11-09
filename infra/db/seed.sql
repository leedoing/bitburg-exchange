-- 기존 회원 500명 (traffic-gen의 기존 회원 매수 흐름에서 사용)
INSERT INTO users (id, name, tier, kyc_status, created_at)
SELECT
  'u_' || lpad(n::text, 6, '0'),
  '데모회원' || n,
  CASE WHEN n % 10 = 0 THEN 'vip' ELSE 'regular' END,
  'approved',
  now() - (n || ' days')::interval
FROM generate_series(1, 500) AS n
ON CONFLICT (id) DO NOTHING;
