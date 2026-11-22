\set ON_ERROR_STOP on
-- GROUP T is one seat short of full, and two movers each hold a live invitation
-- into it. Both accepting at the same moment must leave the group at 8, not 9.
TRUNCATE public.group_invites, public.students CASCADE;

INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
SELECT gen_random_uuid(), 'T-'||g, 'T '||g, '0800'||g, 'SEMINA 1', 'Mwanaume', 'GROUP T', now()
FROM generate_series(1,6) g;
INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
VALUES (gen_random_uuid(), 'M-1', 'M 1', '08101', 'SEMINA 1', 'Mwanaume', 'GROUP M1', now()),
       (gen_random_uuid(), 'M-2', 'M 2', '08102', 'SEMINA 1', 'Mwanaume', 'GROUP M2', now()),
       (gen_random_uuid(), 'H-1', 'H 1', '08103', 'SEMINA 1', 'Mwanaume', 'GROUP T', now());

INSERT INTO public.group_invites (from_student_id, from_reg_no, from_name, from_semina, from_group,
  to_student_id, to_reg_no, to_name, to_semina, to_group)
SELECT s.id, s.reg_no, s.full_name, 'SEMINA 1', s.student_group,
       h.id, h.reg_no, h.full_name, 'SEMINA 1', 'GROUP T'
FROM public.students s, public.students h
WHERE s.reg_no IN ('M-1','M-2') AND h.reg_no='H-1';
