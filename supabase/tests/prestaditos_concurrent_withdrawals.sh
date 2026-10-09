#!/usr/bin/env bash
# EXECUTES ONLY AGAINST A DISPOSABLE POSTGRES QA DATABASE; no production DB secrets.
set -euo pipefail
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
query="select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
select public.inv_portal_submit_withdrawal(
 '11111111-1111-4111-8111-111111111111',
 'a4444444-4444-4444-8444-444444444444',
 'CAPITAL_RETURN',600,'Transferencia','Parallel QA request');"
psql -X -v ON_ERROR_STOP=1 -c "$query" >"$dir/one.log" 2>&1 &
p1=$!
psql -X -v ON_ERROR_STOP=1 -c "$query" >"$dir/two.log" 2>&1 &
p2=$!
set +e
wait "$p1"; s1=$?
wait "$p2"; s2=$?
set -e
if ! { [[ "$s1" -eq 0 && "$s2" -ne 0 ]] || [[ "$s2" -eq 0 && "$s1" -ne 0 ]]; }; then
  echo "FAIL: concurrent withdrawal attempts must yield exactly one accepted request."
  cat "$dir/one.log" "$dir/two.log"
  exit 1
fi
if [[ "$s1" -ne 0 ]]; then
  grep -q "Capital disponible insuficiente" "$dir/one.log" || { cat "$dir/one.log"; exit 1; }
else
  grep -q "Capital disponible insuficiente" "$dir/two.log" || { cat "$dir/two.log"; exit 1; }
fi
count="$(psql -tAX -c "select count(*) from public.inv_portal_withdrawals
 where investor_id='a1111111-1111-4111-8111-111111111111'
 and payment_type='CAPITAL_RETURN'
 and status in ('PENDING','REVIEW','APPROVED')")"
if [[ "$count" != "1" ]]; then
  echo "FAIL: expected exactly one open capital reservation after simultaneous requests; observed $count"
  exit 1
fi
echo "PASS: two overlapping capital withdrawals were serialized; one succeeded and the other was denied."
