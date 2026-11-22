\set ON_ERROR_STOP off
BEGIN;
SELECT public.answer_group_invite(
  (SELECT id FROM public.group_invites WHERE from_reg_no='M-2'),
  (SELECT id FROM public.students WHERE reg_no='H-1'),
  true) AS result;
COMMIT;
