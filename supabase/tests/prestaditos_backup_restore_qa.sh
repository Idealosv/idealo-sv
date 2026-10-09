#!/usr/bin/env bash
# Recovery rehearsal ONLY against disposable local PostgreSQL database.
set -euo pipefail
if [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" ]]; then
  echo "REFUSED: remote database address"; exit 1
fi
if [[ "$PGDATABASE" != "prestaditos_ephemeral" ]]; then
  echo "REFUSED: requires disposable prestaditos_ephemeral database"; exit 1
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
backup="$tmp/prestaditos-qa.dump"
restored="prestaditos_restore_qa"
checksums() {
 local db="$1"
 local tab digest
 for tab in inv_investors inv_investments inv_applications inv_payments inv_portal_enrollments inv_portal_links inv_portal_withdrawals inv_audit_log; do
   digest="$(PGDATABASE="$db" psql -X -A -t -v ON_ERROR_STOP=1 -c "
     select count(*)::text||'|'||md5(coalesce(string_agg(to_jsonb(t)::text, chr(10) order by to_jsonb(t)::text),''))
     from public.$tab t;")"
   printf '%s|%s\n' "$tab" "$digest"
 done
}
echo 'Backup ONLY fake-data postgres to a temporary artifact'
checksums "$PGDATABASE" > "$tmp/before.txt"
# Runner has pg_dump 16 while ephemeral service is PostgreSQL 17.
# Use client tools from the SAME 17-alpine image already pulled for the service.
docker run --rm --network host -e PGPASSWORD="$PGPASSWORD" postgres:17-alpine \
 pg_dump --format=custom --no-owner -h 127.0.0.1 -p 5432 -U postgres -d "$PGDATABASE" > "$backup"
test -s "$backup"
createdb "$restored"
docker run --rm -i --network host -e PGPASSWORD="$PGPASSWORD" postgres:17-alpine \
 pg_restore --exit-on-error --no-owner -h 127.0.0.1 -p 5432 -U postgres -d "$restored" \
 < "$backup" >"$tmp/pgrestore.log" 2>&1 || {
 cat "$tmp/pgrestore.log"; exit 1
}
checksums "$restored" > "$tmp/after.txt"
diff -u "$tmp/before.txt" "$tmp/after.txt"
echo 'PASS: eight investor, ledger and audit tables match byte-for-byte at record level'
policy="$(PGDATABASE="$restored" psql -X -tA -v ON_ERROR_STOP=1 -c "
 select bool_and(relrowsecurity)::text from pg_class
 where oid in ('public.inv_portal_enrollments'::regclass,'public.inv_portal_links'::regclass,'public.inv_portal_withdrawals'::regclass);")"
[[ "$policy" == "true" ]] || { echo "FAIL: restored row-level security missing"; exit 1; }
deny="$(PGDATABASE="$restored" psql -X -tA -v ON_ERROR_STOP=1 -c "
 select (not has_table_privilege('anon','public.inv_portal_enrollments','SELECT')
 and not has_table_privilege('anon','public.inv_portal_withdrawals','SELECT'))::text;")"
[[ "$deny" == "true" ]] || { echo "FAIL: restored grants too broad"; exit 1; }
echo 'PASS: restored RLS and anonymous access grants intact'
psql -X -v ON_ERROR_STOP=1 -c "
 update public.inv_investors set status='ACTIVE'
 where id='a1111111-1111-4111-8111-111111111111';" >/dev/null
live_status="$(psql -X -tA -c "
 select status from public.inv_investors where id='a1111111-1111-4111-8111-111111111111';")"
restored_status="$(PGDATABASE="$restored" psql -X -tA -c "
 select status from public.inv_investors where id='a1111111-1111-4111-8111-111111111111';")"
[[ "$live_status" == "ACTIVE" && "$restored_status" == "BLOCKED" ]] || {
 echo "FAIL: backup did not preserve a previously blocked account"; exit 1
}
echo 'PASS: recovered snapshot is unaffected by later writes to original QA DB'
echo 'DISPOSABLE BACKUP AND RESTORE TESTS PASSED: no production access'
