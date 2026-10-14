/**
 * Vitest global setup: every unit test runs in one fixed timezone, whatever the machine or the CI runner uses.
 * The Session Report baseline (test/fixtures/report-before-t21.json) holds times formatted in local time, so
 * it can only match in the zone it was made in. US Eastern, where the baseline was captured.
 */
export default function setup(): void {
  process.env.TZ = 'America/New_York';
}
