-- Old unchanged runs reused an earlier page check. They cannot prove last-seen.
-- Published legacy runs and new raw-linked runs did perform a production fetch.
UPDATE observations SET last_site_ok=(
  SELECT MAX(at) FROM runs
  WHERE runs.date=observations.date AND detail LIKE '%site=ok%'
    AND (outcome='published' OR detail LIKE '%;raw=polls/%')
) WHERE date<'2026-11-23';

UPDATE observations SET prior_site_ok=(
  SELECT MAX(at) FROM runs
  WHERE runs.date=date(observations.date,'-1 day') AND at<observations.first_seen
    AND detail LIKE '%site=ok%'
    AND (outcome='published' OR detail LIKE '%;raw=polls/%')
) WHERE date<'2026-11-23';
