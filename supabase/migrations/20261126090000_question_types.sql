-- The builder offers six question types; the table allowed four.
--
-- `questions_question_type_check` was written with the original set
-- (true_false, multiple_choice, short_answer, matching). The UI later gained
-- `multi_select` and `ordering`, and the student page and grader both handle
-- them, but the constraint was never widened. Saving either one failed with
-- 23514 while the builder reported success, so a teacher's work disappeared
-- without a word.
--
-- Both new types store what the existing shapes already carry: `options` is an
-- array of choices, `correct_answer` is an array (the picks, or the order).

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (
    question_type IN (
      'true_false',
      'multiple_choice',
      'short_answer',
      'matching',
      'multi_select',
      'ordering'
    )
  );

-- Rows written before `correct_answer` became required in the builder may have
-- an empty array, which is not a useful answer but is not null either. Nothing
-- to backfill: the column has always been NOT NULL.
