# tests/fixtures/

Pre-made fixtures shipped in the bundle. File-upload Playwright specs reference these by path so they have real files to exercise.

`verify-test-realness.mjs` knows these exist and expects upload-category specs to call `setInputFiles` with one of them.

## Provided fixtures

| File | Format | Notes |
|---|---|---|
| `sample.csv` | CSV (text) | 10 rows + header. Contact-style schema (id, name, email, role, created_at). |
| `sample.vcf` | vCard 3.0 (text) | Single contact. Use for VCF import specs. |
| `sample.ics` | iCalendar (text) | Single event. Use for calendar import specs. |

## Binary fixtures (project must add)

The bundle ships text-format fixtures only. Binary fixtures are project-specific:

| File | What to add |
|---|---|
| `sample.pdf` | Any short PDF (1-2 pages). Reuse a public-domain document or generate via `pandoc`. |
| `sample-image.jpg` | Any 200×200 JPEG. The smaller, the better for test speed. |
| `sample-audio.mp3` | A 3-5 second silent or test-tone MP3. ~80KB is fine. |

Add these during Phase 0 if any P0 user story involves uploading the corresponding format. Don't ship a placeholder — `verify-test-realness.mjs` checks the file exists, not its contents.
