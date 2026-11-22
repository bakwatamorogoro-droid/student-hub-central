-- Holds the answer open for two seconds after taking the seat, so the second
-- session is guaranteed to arrive while this transaction still owns the group.
\set ON_ERROR_STOP off
BEGIN;
SELECT public.answer_group_invite(
  (SELECT id FROM public.group_invites WHERE from_reg_no='M-1'),
  (SELECT id FROM public.students WHERE reg_no='H-1'),
  true) AS result;
SELECT pg_sleep(2);
COMMIT;
