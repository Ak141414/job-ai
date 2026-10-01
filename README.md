# JobPilot

A public global job explorer for browsing live remote openings, filtering by country, and narrowing listings with a PDF or DOCX resume.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Supabase, sign-in, and provider keys are not required. Listings come from Remotive, Jobicy, Arbeitnow, Remote OK, and Himalayas; Arbeitnow may include remote, hybrid, and office jobs. More Himalayas listings load through its cursor as you browse. The Companies view groups unique employers from loaded jobs and links to a company-site search. PDF and DOCX resume filtering applies locally to loaded listings. Provider coverage and limits are described in [docs/provider-integrations.md](docs/provider-integrations.md).

## Checks

```bash
npm run lint
npm run build
```
