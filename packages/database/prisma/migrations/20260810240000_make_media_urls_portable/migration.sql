-- Media URLs must not retain the host address because it can change.
UPDATE "Form"
SET "questions" = regexp_replace(
  "questions"::text,
  'https?://[^"/]+/api/media/object',
  '/api/media/object',
  'g'
)::jsonb
WHERE "questions"::text ~ 'https?://[^"/]+/api/media/object';

UPDATE "InspectionResult"
SET "answers" = regexp_replace(
  "answers"::text,
  'https?://[^"/]+/api/media/object',
  '/api/media/object',
  'g'
)::jsonb
WHERE "answers"::text ~ 'https?://[^"/]+/api/media/object';
