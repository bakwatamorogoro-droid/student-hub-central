\set ON_ERROR_STOP on
TRUNCATE public.group_invites, public.students CASCADE;

-- 3 in GROUP 1 (under-filled), 8 in GROUP 2 (full), 1 in GROUP 4 (under-filled)
INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
SELECT gen_random_uuid(), 'A-'||g, 'A '||g, '0700'||g, 'SEMINA 1', 'Mwanaume', 'GROUP 1', now()
FROM generate_series(1,3) g;
INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
SELECT gen_random_uuid(), 'B-'||g, 'B '||g, '0710'||g, 'SEMINA 1', 'Mwanaume', 'GROUP 2', now()
FROM generate_series(1,8) g;
INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
VALUES (gen_random_uuid(), 'D-1', 'D 1', '07201', 'SEMINA 1', 'Mwanaume', 'GROUP 4', now());

\echo '--- 1. invite into a FULL group must fail ---'
DO $$
DECLARE src UUID; dst UUID;
BEGIN
  SELECT id INTO src FROM public.students WHERE reg_no='A-1';
  SELECT id INTO dst FROM public.students WHERE reg_no='B-1';
  BEGIN
    INSERT INTO public.group_invites (from_student_id, from_reg_no, from_name, from_semina, from_group,
      to_student_id, to_reg_no, to_name, to_semina, to_group)
    VALUES (src,'A-1','A 1','SEMINA 1','GROUP 1', dst,'B-1','B 1','SEMINA 1','GROUP 2');
    RAISE EXCEPTION 'FAIL: full group accepted an invite';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: %', SQLERRM;
  END;
END $$;

\echo '--- 2. invite out of a group of 5+ must fail ---'
DO $$
DECLARE src UUID; dst UUID;
BEGIN
  INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
  VALUES (gen_random_uuid(),'E-1','E 1','07301','SEMINA 1','Mwanaume','GROUP 5',now()),
         (gen_random_uuid(),'E-2','E 2','07302','SEMINA 1','Mwanaume','GROUP 5',now()),
         (gen_random_uuid(),'E-3','E 3','07303','SEMINA 1','Mwanaume','GROUP 5',now()),
         (gen_random_uuid(),'E-4','E 4','07304','SEMINA 1','Mwanaume','GROUP 5',now()),
         (gen_random_uuid(),'E-5','E 5','07305','SEMINA 1','Mwanaume','GROUP 5',now());
  SELECT id INTO src FROM public.students WHERE reg_no='E-1';
  SELECT id INTO dst FROM public.students WHERE reg_no='A-1';
  BEGIN
    INSERT INTO public.group_invites (from_student_id, from_reg_no, from_name, from_semina, from_group,
      to_student_id, to_reg_no, to_name, to_semina, to_group)
    VALUES (src,'E-1','E 1','SEMINA 1','GROUP 5', dst,'A-1','A 1','SEMINA 1','GROUP 1');
    RAISE EXCEPTION 'FAIL: 5-person group was allowed to move';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: %', SQLERRM;
  END;
END $$;

\echo '--- 3. cross-gender invite must fail ---'
DO $$
DECLARE src UUID; dst UUID;
BEGIN
  INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
  VALUES (gen_random_uuid(),'F-1','F 1','07401','SEMINA 1','Mwanamke','GROUP 6',now());
  SELECT id INTO src FROM public.students WHERE reg_no='F-1';
  SELECT id INTO dst FROM public.students WHERE reg_no='A-1';
  BEGIN
    INSERT INTO public.group_invites (from_student_id, from_reg_no, from_name, from_semina, from_group,
      to_student_id, to_reg_no, to_name, to_semina, to_group)
    VALUES (src,'F-1','F 1','SEMINA 1','GROUP 6', dst,'A-1','A 1','SEMINA 1','GROUP 1');
    RAISE EXCEPTION 'FAIL: cross-gender invite allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: %', SQLERRM;
  END;
END $$;

\echo '--- 4. invite to a student who never updated must fail ---'
DO $$
DECLARE src UUID; dst UUID;
BEGIN
  INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
  VALUES (gen_random_uuid(),'G-1','G 1','07501','SEMINA 1','Mwanaume','GROUP 1',NULL);
  SELECT id INTO src FROM public.students WHERE reg_no='D-1';
  SELECT id INTO dst FROM public.students WHERE reg_no='G-1';
  BEGIN
    INSERT INTO public.group_invites (from_student_id, from_reg_no, from_name, from_semina, from_group,
      to_student_id, to_reg_no, to_name, to_semina, to_group)
    VALUES (src,'D-1','D 1','SEMINA 1','GROUP 4', dst,'G-1','G 1','SEMINA 1','GROUP 1');
    RAISE EXCEPTION 'FAIL: un-updated student was invited';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: %', SQLERRM;
  END;
END $$;

\echo '--- 5. valid invite, then only the invitee may answer ---'
INSERT INTO public.group_invites (from_student_id, from_reg_no, from_name, from_semina, from_group,
  to_student_id, to_reg_no, to_name, to_semina, to_group)
SELECT s.id,'D-1','D 1','SEMINA 1','GROUP 4', a.id,'A-1','A 1','SEMINA 1','GROUP 1'
FROM public.students s, public.students a WHERE s.reg_no='D-1' AND a.reg_no='A-1';
DO $$
DECLARE inv UUID; a UUID; d UUID;
BEGIN
  SELECT id INTO inv FROM public.group_invites WHERE from_reg_no='D-1';
  SELECT id INTO a FROM public.students WHERE reg_no='A-1';
  SELECT id INTO d FROM public.students WHERE reg_no='D-1';
  BEGIN
    PERFORM public.answer_group_invite(inv, d, true);
    RAISE EXCEPTION 'FAIL: the mover answered their own invitation';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: %', SQLERRM;
  END;
  PERFORM public.answer_group_invite(inv, a, true);
  RAISE NOTICE 'accepted; mover now in %',
    (SELECT student_group FROM public.students WHERE id=d);
  RAISE NOTICE 'other pending invites for mover: %',
    (SELECT count(*) FROM public.group_invites WHERE from_student_id=d AND status='pending');
END $$;

\echo '--- 6. a second answer on the same invite must fail ---'
DO $$
DECLARE inv UUID; a UUID;
BEGIN
  SELECT id INTO inv FROM public.group_invites WHERE from_reg_no='D-1';
  SELECT id INTO a FROM public.students WHERE reg_no='A-1';
  BEGIN
    PERFORM public.answer_group_invite(inv, a, true);
    RAISE EXCEPTION 'FAIL: invitation answered twice';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: %', SQLERRM;
  END;
END $$;

\echo '--- 7. a stale invite (mover already left) is cancelled ---'
DO $$
DECLARE src UUID; dst UUID; inv UUID;
BEGIN
  INSERT INTO public.students (id, reg_no, full_name, phone, semina, gender, student_group, group_confirmed_at)
  VALUES (gen_random_uuid(),'H-1','H 1','07601','SEMINA 1','Mwanaume','GROUP 7',now());
  SELECT id INTO src FROM public.students WHERE reg_no='H-1';
  SELECT id INTO dst FROM public.students WHERE reg_no='A-1';
  INSERT INTO public.group_invites (from_student_id, from_reg_no, from_name, from_semina, from_group,
    to_student_id, to_reg_no, to_name, to_semina, to_group)
  VALUES (src,'H-1','H 1','SEMINA 1','GROUP 7', dst,'A-1','A 1','SEMINA 1','GROUP 1')
  RETURNING id INTO inv;
  -- the mover is moved elsewhere by an admin before the answer arrives
  UPDATE public.students SET student_group='GROUP 8' WHERE id=src;
  DECLARE out TEXT; g TEXT;
  BEGIN
    out := public.answer_group_invite(inv, dst, true);
    IF out <> 'cancelled' THEN
      RAISE EXCEPTION 'FAIL: stale invite returned %', out;
    END IF;
    SELECT status INTO g FROM public.group_invites WHERE id=inv;
    IF g <> 'cancelled' THEN
      RAISE EXCEPTION 'FAIL: invite left as % instead of cancelled', g;
    END IF;
    RAISE NOTICE 'PASS: returned cancelled and the card can be cleared';
    RAISE NOTICE 'mover group is still: %',
      (SELECT student_group FROM public.students WHERE id=src);
  END;
END $$;

\echo '--- 8. group count never exceeds 8 ---'
DO $$
DECLARE total INT;
BEGIN
  SELECT count(*) INTO total FROM public.students
  WHERE student_group='GROUP 1' AND semina='SEMINA 1' AND lower(gender)='mwanaume';
  RAISE NOTICE 'GROUP 1 seats: %', total;
  IF total > 8 THEN RAISE EXCEPTION 'FAIL: over capacity'; END IF;
END $$;
