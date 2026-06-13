# Test fixtures

Deterministic sample files for import/upload tests. Safe to commit — they
contain only synthetic data (no real PII).

- `sample.csv` — bulk-import rows (header + 3 records).
- `sample.vcf` — a single contact card (vCard 3.0).
- `sample.ics` — a single calendar event (iCalendar).

Add format-specific fixtures here as your PRD's file-upload features require,
keeping every value synthetic.
