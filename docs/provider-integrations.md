# Provider Integrations

The job explorer is public. Supabase configuration, user accounts, and job-provider keys are not required.

## Live Job Feeds

The Jobs view uses public feeds from Remotive, Jobicy, Arbeitnow, Remote OK, and Himalayas through `GET /api/companies`. Arbeitnow entries are classified using its remote flag and explicit hybrid language; remaining non-remote listings are marked as office. Himalayas pages are fetched as the user loads more; its API reports a large total, but each cursor page returns only 20 jobs. The explorer starts with a bounded batch and continues on demand. Listings are deduplicated by normalized application URL and company/title/country targets.

Remotive is queried for software-development roles; Jobicy is queried without an industry filter because its endpoint returns remote jobs and rejects unknown slugs. Arbeitnow pages 1–4 include remote and non-remote listings; explicit hybrid terms are classified as Hybrid and other non-remote listings as Work from office. Remote OK and Himalayas are remote-job sources. Feed coverage, pagination, and deduplication mean the merged inventory is not a guaranteed 10,000 unique openings. Country counts reflect recognized country targets; only locations explicitly marked worldwide are considered eligible everywhere. Unknown regions are not treated as worldwide.

## Companies

The Companies view groups distinct employers from the loaded job pages and links to a web search for each employer’s official site. It grows as additional job pages are loaded; it does not claim a fixed 5,000-company catalog or list companies without a matching job-feed record.

## Resume Role Filter

PDF and DOCX resumes up to 10 MB can be uploaded to `POST /api/resume/analyze`. PDF.js and Mammoth extract text on the app server; deterministic keyword rules identify a role and skills. The uploaded file and extracted text are not stored. The explorer filters the already-loaded job feed in the browser. Scanned/image-only PDFs, unsupported formats, and unreadable files cannot be processed, and the unfiltered job feed remains available.

## Coming Soon

AI-powered career features are not available yet. Their UI opens a Coming Soon notice. Resume extraction, role filtering, and job ranking use local deterministic rules and make no AI-provider calls.
