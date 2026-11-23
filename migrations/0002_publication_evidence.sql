ALTER TABLE observations ADD COLUMN first_site_ok TEXT;
ALTER TABLE observations ADD COLUMN first_ready_site_ok TEXT;
ALTER TABLE observations ADD COLUMN last_site_ok TEXT;
ALTER TABLE observations ADD COLUMN prior_site_ok TEXT;

-- Recover only explicitly recorded successful checks, never fetch timestamps.
UPDATE observations SET
  first_site_ok=(SELECT MIN(at) FROM runs WHERE runs.date=observations.date AND outcome IN ('published','unchanged') AND detail LIKE '%site=ok%'),
  first_ready_site_ok=(SELECT MIN(at) FROM runs WHERE runs.date=observations.date AND outcome IN ('published','unchanged') AND detail LIKE '%status=ready;site=ok%'),
  last_site_ok=(SELECT MAX(at) FROM runs WHERE runs.date=observations.date AND outcome IN ('published','unchanged') AND detail LIKE '%site=ok%');

UPDATE observations SET prior_site_ok=(SELECT MAX(at) FROM runs WHERE runs.date=date(observations.date,'-1 day') AND outcome IN ('published','unchanged') AND detail LIKE '%site=ok%' AND at<observations.first_seen);
