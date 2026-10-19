ALTER TABLE "Form" ADD COLUMN "createdById" TEXT, ADD COLUMN "createdByName" TEXT;

-- Recover historical authors only from successful publication events for this revision.
UPDATE "Form" AS form
SET "createdById" = publication."actorId", "createdByName" = publication.name
FROM (
  SELECT DISTINCT ON (event.payload->'result'->>'id')
    event.payload->'result'->>'id' AS "formId", event."actorId", actor.name
  FROM "AuditEvent" event
  JOIN "User" actor ON actor.id = event."actorId"
  WHERE event."entityType" = 'Forms'
    AND event.type IN ('FORMS_CREATE', 'FORMS_UPDATE', 'FORMS_DUPLICATE')
    AND event.outcome = 'SUCCESS'
  ORDER BY event.payload->'result'->>'id', event."occurredAt" ASC
) publication
WHERE form.id = publication."formId";
