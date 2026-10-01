import { isRecord } from "@/lib/providers/server";
import type { JobListing } from "@/lib/jobs/types";
import { regionCountryCodes } from "@/lib/jobs/regions";
import isoCountries from "i18n-iso-countries";

type FeedName =
  | "Remotive"
  | "Jobicy"
  | "Arbeitnow"
  | "ArbeitnowUK"
  | "Himalayas"
  | "RemoteOK"
  | "RemoteJobsOrg"
  | "RemoteFirstJobs"
  | "WorkingNomads"
  | "Greenhouse"
  | "Lever"
  | "Ashby"
  | "SmartRecruiters";

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function locationHasPhrase(location: string, phrase: string) {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const normalizedLocation = ` ${normalize(location)} `;
  const normalizedPhrase = ` ${normalize(phrase)} `;
  return normalizedLocation.includes(normalizedPhrase);
}

function countriesFor(location: string) {
  const aliases: Record<string, string[]> = {
    US: ["usa", "u.s.a", "united states of america"],
    GB: ["uk", "u.k.", "england", "scotland", "wales", "great britain"],
    NL: ["holland", "netherlands"],
    IN: ["india", "bharat"],
    DE: ["germany", "deutschland"],
    FR: ["france"],
    CA: ["canada"],
    AU: ["australia"],
    SG: ["singapore"],
    AE: ["uae", "dubai", "abu dhabi"],
  };

  const countries = new Set(
    Object.keys(isoCountries.getAlpha2Codes()).filter((code) => {
      const name = isoCountries.getName(code, "en");
      return (
        Boolean(name && locationHasPhrase(location, name)) ||
        (aliases[code] ?? []).some((alias) => locationHasPhrase(location, alias))
      );
    })
  );

  for (const [region, codes] of Object.entries(regionCountryCodes)) {
    if (locationHasPhrase(location, region)) {
      codes.forEach((code) => countries.add(code));
    }
  }

  if (
    locationHasPhrase(location, "APAC") ||
    locationHasPhrase(location, "Asia Pacific")
  ) {
    [...regionCountryCodes.Asia, ...regionCountryCodes.Oceania].forEach((code) =>
      countries.add(code)
    );
  }

  if (locationHasPhrase(location, "EMEA")) {
    [
      ...regionCountryCodes.Europe,
      ...regionCountryCodes.Africa,
      "AE", "BH", "IL", "IQ", "IR", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "YE",
    ].forEach((code) => countries.add(code));
  }

  if (
    locationHasPhrase(location, "LATAM") ||
    locationHasPhrase(location, "Latin America")
  ) {
    regionCountryCodes.Americas.forEach((code) => countries.add(code));
  }

  if (
    /bangalore|bengaluru|mumbai|delhi|new delhi|noida|gurgaon|gurugram|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|kochi|coimbatore|india/i.test(
      location
    )
  ) {
    countries.add("IN");
  }

  if (/berlin|munich|frankfurt|hamburg|cologne|stuttgart|germany/i.test(location)) {
    countries.add("DE");
  }

  if (/london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|united kingdom/i.test(location)) {
    countries.add("GB");
  }

  if (/worldwide|anywhere|global|all countries|remote anywhere/i.test(location)) {
    countries.add("WW");
  }

  return [...countries];
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function detectWorkMode(
  title: string,
  location: string,
  description: string,
  source: FeedName,
  job: Record<string, unknown>
): "Remote" | "Hybrid" | "Office" {
  if (source === "Arbeitnow" || source === "ArbeitnowUK") {
    if (job.remote === true) return "Remote";
    const details = `${title} ${location} ${description}`;
    return /\bhybrid\b/i.test(details) ? "Hybrid" : "Office";
  }

  if (source === "Ashby") {
    if (job.isRemote === true || /remote/i.test(text(job.workplaceType))) return "Remote";
    if (/hybrid/i.test(text(job.workplaceType))) return "Hybrid";
    return "Office";
  }

  if (source === "SmartRecruiters" && isRecord(job.location)) {
    if (job.location.remote === true) return "Remote";
  }

  if (source === "Lever") {
    const workplace = text(job.workplaceType).toLowerCase();
    if (workplace.includes("remote")) return "Remote";
    if (workplace.includes("hybrid")) return "Hybrid";
    if (workplace.includes("on-site") || workplace.includes("onsite")) return "Office";
  }

  const details = `${title} ${location} ${description}`.toLowerCase();
  if (/\bhybrid\b/.test(details)) return "Hybrid";
  if (/\b(remote|work from home|wfh|work-from-home|fully remote|100% remote)\b/.test(details)) {
    return "Remote";
  }
  if (
    /\b(on[- ]?site|office|wfo|work from office|in[- ]office|warehouse|clinic|store|branch|plant|field|hospital|retail|lab|hotel|flight|restaurant)\b/.test(
      details
    )
  ) {
    return "Office";
  }

  return "Remote";
}

function normalizeJob(job: Record<string, unknown>, source: FeedName): JobListing | null {
  let rawId: unknown;
  if (source === "Arbeitnow" || source === "ArbeitnowUK") rawId = job.slug;
  else if (source === "Himalayas") rawId = job.guid ?? job.applicationLink;
  else if (source === "RemoteJobsOrg") rawId = job.id;
  else if (source === "RemoteFirstJobs") rawId = job.id;
  else if (source === "WorkingNomads") {
    const url = text(job.url);
    const match = url.match(/\/(\d+)\/?$/);
    rawId = match?.[1] ?? job.url;
  } else if (source === "Greenhouse") rawId = job.id ?? job.internal_job_id;
  else if (source === "Lever") rawId = job.id;
  else if (source === "Ashby") rawId = job.id ?? job.jobId;
  else if (source === "SmartRecruiters") rawId = job.uuid ?? job.id;
  else rawId = job.id ?? job.job_id;

  const id = typeof rawId === "number" && Number.isFinite(rawId) ? String(rawId) : text(rawId);

  const title = text(
    source === "Jobicy"
      ? job.jobTitle
      : source === "RemoteOK"
        ? job.position
        : source === "Lever"
          ? job.text
          : source === "SmartRecruiters"
            ? job.name
            : job.title
  );

  const company = text(
    source === "Jobicy" || source === "Himalayas"
      ? job.companyName
      : source === "RemoteOK"
        ? job.company
        : source === "RemoteJobsOrg"
          ? isRecord(job.company)
            ? job.company.name
            : ""
          : source === "RemoteFirstJobs" || source === "WorkingNomads"
            ? job.company_name
            : source === "Greenhouse" ||
                source === "Lever" ||
                source === "Ashby" ||
                source === "SmartRecruiters"
              ? text((job as { _company?: unknown })._company)
              : job.company_name
  );

  let rawLocation: unknown;
  if (source === "Remotive") rawLocation = job.candidate_required_location;
  else if (source === "Jobicy") rawLocation = job.jobGeo;
  else if (source === "Himalayas") rawLocation = job.locationRestrictions;
  else if (source === "RemoteOK") rawLocation = job.location;
  else if (source === "RemoteJobsOrg") rawLocation = job.location;
  else if (source === "RemoteFirstJobs") rawLocation = job.locations;
  else if (source === "WorkingNomads") rawLocation = job.location;
  else if (source === "ArbeitnowUK") rawLocation = job.location || "United Kingdom";
  else if (source === "Greenhouse") {
    rawLocation = isRecord(job.location) ? job.location.name : job.location;
  } else if (source === "Lever") {
    rawLocation =
      isRecord(job.categories) && typeof job.categories.location === "string"
        ? job.categories.location
        : job.location;
  } else if (source === "Ashby") {
    rawLocation =
      job.location ??
      (Array.isArray(job.secondaryLocations)
        ? job.secondaryLocations
            .map((item) => (isRecord(item) ? text(item.location) : ""))
            .filter(Boolean)
            .join(", ")
        : "");
  } else if (source === "SmartRecruiters") {
    const loc = isRecord(job.location) ? job.location : {};
    rawLocation =
      [text(loc.city), text(loc.region), text(loc.country)].filter(Boolean).join(", ") ||
      (loc.remote === true ? "Remote" : "");
  } else {
    rawLocation = job.location;
  }

  const location = Array.isArray(rawLocation)
    ? rawLocation.filter((v): v is string => typeof v === "string").join(", ") ||
      "Worldwide / Remote"
    : text(rawLocation) || "Worldwide / Remote";

  let applicationUrl = "";
  if (source === "SmartRecruiters") {
    const companyId =
      text((job as { _companySlug?: unknown })._companySlug) ||
      (isRecord(job.company) ? text(job.company.identifier) : "");
    const postingId = text(job.uuid) || text(job.id);
    if (companyId && postingId) {
      applicationUrl = `https://jobs.smartrecruiters.com/${companyId}/${postingId}`;
    }
  } else {
    applicationUrl =
      safeUrl(
        source === "Himalayas"
          ? job.applicationLink
          : source === "RemoteOK"
            ? job.apply_url
            : source === "RemoteJobsOrg"
              ? job.apply_url ?? job.url
              : source === "RemoteFirstJobs" || source === "WorkingNomads"
                ? job.url
                : source === "Greenhouse"
                  ? job.absolute_url
                  : source === "Lever"
                    ? job.hostedUrl ?? job.applyUrl
                    : source === "Ashby"
                      ? job.jobUrl ?? job.applyUrl
                      : job.url
      ) || safeUrl(job.url);
  }

  if (!id || !title || !company || !applicationUrl) return null;

  let dateValue: unknown;
  if (source === "Remotive") dateValue = job.publication_date;
  else if (source === "Jobicy" || source === "Himalayas") dateValue = job.pubDate;
  else if (source === "RemoteOK") dateValue = job.date;
  else if (source === "RemoteJobsOrg") dateValue = job.posted_at;
  else if (source === "RemoteFirstJobs") dateValue = job.published_at;
  else if (source === "WorkingNomads") dateValue = job.pub_date;
  else if (source === "Greenhouse") dateValue = job.updated_at;
  else if (source === "Lever") dateValue = job.createdAt;
  else if (source === "Ashby") dateValue = job.publishedAt ?? job.updatedAt;
  else if (source === "SmartRecruiters") dateValue = job.releasedDate;
  else dateValue = job.created_at;

  const postedAt =
    typeof dateValue === "number"
      ? source === "Arbeitnow" || source === "ArbeitnowUK" || source === "Himalayas"
        ? new Date(dateValue * 1000).toISOString()
        : new Date(dateValue).toISOString()
      : typeof dateValue === "string" && Number.isFinite(Date.parse(dateValue))
        ? new Date(dateValue).toISOString()
        : "";

  const summary = text(
    source === "Jobicy"
      ? job.jobExcerpt
      : source === "Himalayas"
        ? job.description ?? job.excerpt
        : source === "Greenhouse"
          ? job.content
          : source === "Lever"
            ? job.descriptionPlain
            : source === "Ashby"
              ? job.descriptionPlain ?? job.descriptionHtml
              : source === "SmartRecruiters"
                ? job.description
                : job.description
  );

  const workMode = detectWorkMode(title, location, summary, source, job);
  const matchedCountries = countriesFor(location);
  const countryCodes = matchedCountries.length > 0 ? matchedCountries : ["WW"];

  return {
    id: `${source.toLowerCase()}-${id}`,
    title: title.slice(0, 200),
    company: company.slice(0, 200),
    location: location.slice(0, 200),
    workMode,
    postedAt,
    summary: summary.slice(0, 1200) || null,
    applicationUrl,
    countryCode: countryCodes[0],
    countryCodes,
    matchScore: 0,
    matchedSkills: [],
    source,
  };
}

function dedupeJobs(jobs: JobListing[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    let canonicalUrl = "";
    try {
      const url = new URL(job.applicationUrl);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (
          key.toLowerCase().startsWith("utm_") ||
          ["ref", "source"].includes(key.toLowerCase())
        ) {
          url.searchParams.delete(key);
        }
      }
      canonicalUrl = url.toString().replace(/\/$/, "").toLowerCase();
    } catch {
      canonicalUrl = job.applicationUrl.toLowerCase();
    }

    const normalizedLocation = job.countryCodes?.length
      ? [...job.countryCodes].sort().join(" ")
      : job.location;
    const normalizedText = `${job.company} ${job.title} ${normalizedLocation}`
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const semanticKey = `job:${normalizedText}`;
    if (seen.has(canonicalUrl) || seen.has(semanticKey)) return false;
    seen.add(canonicalUrl);
    seen.add(semanticKey);
    return true;
  });
}

async function fetchFeed(url: string, cache = true) {
  try {
    const cacheOptions = cache
      ? { next: { revalidate: 3600 } }
      : { cache: "no-store" as const };
    const response = await fetch(url, {
      ...cacheOptions,
      headers: {
        Accept: "application/json",
        "User-Agent": "JobPilot/1.0",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchAllBatched(
  urls: { url: string; cache?: boolean }[],
  batchSize = 10
) {
  const results: (unknown | null)[] = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const part = await Promise.all(
      batch.map((item) => fetchFeed(item.url, item.cache ?? true))
    );
    results.push(...part);
  }
  return results;
}

// STAGE 1 (FAST BOARDS): Sub-second initial response
const FAST_GREENHOUSE_BOARDS = [
  { slug: "stripe", name: "Stripe" },
  { slug: "spotify", name: "Spotify" },
  { slug: "airbnb", name: "Airbnb" },
  { slug: "figma", name: "Figma" },
  { slug: "notion", name: "Notion" },
  { slug: "razorpay", name: "Razorpay" },
] as const;

const FAST_LEVER_BOARDS = [
  { slug: "netflix", name: "Netflix" },
  { slug: "shopify", name: "Shopify" },
  { slug: "coursera", name: "Coursera" },
] as const;

// STAGE 2 BOARDS
const BATCH_2_GREENHOUSE = [
  { slug: "buzzfeed", name: "BuzzFeed" },
  { slug: "theathletic", name: "The Athletic" },
  { slug: "warbyparker", name: "Warby Parker" },
  { slug: "glossier", name: "Glossier" },
  { slug: "allbirds", name: "Allbirds" },
  { slug: "gymshark", name: "Gymshark" },
  { slug: "modernhealth", name: "Modern Health" },
  { slug: "hims", name: "Hims & Hers" },
  { slug: "robinhood", name: "Robinhood" },
  { slug: "coinbase", name: "Coinbase" },
  { slug: "doordash", name: "DoorDash" },
  { slug: "freshworks", name: "Freshworks" },
] as const;

const BATCH_2_LEVER = [
  { slug: "duolingo", name: "Duolingo" },
  { slug: "pentagram", name: "Pentagram" },
  { slug: "palantir", name: "Palantir" },
  { slug: "postman", name: "Postman" },
  { slug: "lyft", name: "Lyft" },
  { slug: "udemy", name: "Udemy" },
] as const;

// STAGE 3 BOARDS
const BATCH_3_BOARDS = [
  { type: "gh" as const, slug: "chewy", name: "Chewy" },
  { type: "gh" as const, slug: "getyourguide", name: "GetYourGuide" },
  { type: "gh" as const, slug: "flexport", name: "Flexport" },
  { type: "gh" as const, slug: "klarna", name: "Klarna" },
  { type: "gh" as const, slug: "deliveroo", name: "Deliveroo" },
  { type: "gh" as const, slug: "instacart", name: "Instacart" },
  { type: "gh" as const, slug: "monzo", name: "Monzo" },
  { type: "gh" as const, slug: "revolut", name: "Revolut" },
  { type: "ashby" as const, slug: "openai", name: "OpenAI" },
  { type: "ashby" as const, slug: "anthropic", name: "Anthropic" },
  { type: "ashby" as const, slug: "linear", name: "Linear" },
  { type: "ashby" as const, slug: "vercel", name: "Vercel" },
  { type: "ashby" as const, slug: "ramp", name: "Ramp" },
  { type: "sr" as const, slug: "IKEA", name: "IKEA" },
  { type: "sr" as const, slug: "Colliers", name: "Colliers" },
  { type: "sr" as const, slug: "Visa", name: "Visa" },
] as const;

export async function GET() {
  try {
    const fastRequests: { url: string; cache?: boolean }[] = [
      { url: "https://remotive.com/api/remote-jobs?limit=150" },
      { url: "https://jobicy.com/api/v2/remote-jobs?count=100" },
      { url: "https://remoteok.com/api" },
      { url: "https://himalayas.app/jobs/api?limit=25" },
      { url: "https://remotejobs.org/api/v1/jobs?limit=60" },
      { url: "https://remotefirstjobs.com/api/search-jobs" },
      { url: "https://www.workingnomads.com/api/exposed_jobs/" },
      { url: "https://www.arbeitnow.com/api/job-board-api?page=1" },
      { url: "https://www.arbeitnow.co.uk/api/job-board-api?page=1" },
      ...FAST_GREENHOUSE_BOARDS.map(({ slug }) => ({
        url: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
        cache: false,
      })),
      ...FAST_LEVER_BOARDS.map(({ slug }) => ({
        url: `https://api.lever.co/v0/postings/${slug}?mode=json`,
        cache: false,
      })),
    ];

    const feedResults = await fetchAllBatched(fastRequests, 8);

    let i = 0;
    const remotiveData = feedResults[i++];
    const jobicyData = feedResults[i++];
    const remoteOkData = feedResults[i++];
    const himalayasData = feedResults[i++];
    const remoteJobsOrgData = feedResults[i++];
    const remoteFirstJobsData = feedResults[i++];
    const workingNomadsData = feedResults[i++];
    const arbeitnow1 = feedResults[i++];
    const arbeitnowUk1 = feedResults[i++];

    const greenhouseData = feedResults.slice(i, i + FAST_GREENHOUSE_BOARDS.length);
    i += FAST_GREENHOUSE_BOARDS.length;
    const leverData = feedResults.slice(i, i + FAST_LEVER_BOARDS.length);

    const remotiveJobs = isRecord(remotiveData)
      ? records(remotiveData.jobs).map((j) => normalizeJob(j, "Remotive"))
      : [];
    const jobicyJobs = isRecord(jobicyData)
      ? records(jobicyData.jobs).map((j) => normalizeJob(j, "Jobicy"))
      : [];
    const remoteOkJobs = records(remoteOkData)
      .filter((j) => j.id && j.position)
      .map((j) => normalizeJob(j, "RemoteOK"));
    const himalayasJobs = isRecord(himalayasData)
      ? records(himalayasData.jobs).map((j) => normalizeJob(j, "Himalayas"))
      : [];
    const remoteJobsOrgJobs = isRecord(remoteJobsOrgData)
      ? records(remoteJobsOrgData.data).map((j) => normalizeJob(j, "RemoteJobsOrg"))
      : [];
    const remoteFirstJobsJobs = isRecord(remoteFirstJobsData)
      ? records(remoteFirstJobsData.jobs).map((j) => normalizeJob(j, "RemoteFirstJobs"))
      : [];
    const workingNomadsJobs = Array.isArray(workingNomadsData)
      ? records(workingNomadsData).map((j) => normalizeJob(j, "WorkingNomads"))
      : [];

    const arbeitnowJobs = [
      ...(isRecord(arbeitnow1) ? records(arbeitnow1.data).map((j) => normalizeJob(j, "Arbeitnow")) : []),
      ...(isRecord(arbeitnowUk1) ? records(arbeitnowUk1.data).map((j) => normalizeJob(j, "ArbeitnowUK")) : []),
    ];

    const greenhouseJobs = greenhouseData.flatMap((data, idx) => {
      if (!isRecord(data)) return [];
      const board = FAST_GREENHOUSE_BOARDS[idx];
      return records(data.jobs)
        .map((job) => {
          (job as Record<string, unknown>)._company = board.name;
          return normalizeJob(job, "Greenhouse");
        })
        .filter((j): j is JobListing => j !== null);
    });

    const leverJobs = leverData.flatMap((data, idx) => {
      if (!Array.isArray(data)) return [];
      const board = FAST_LEVER_BOARDS[idx];
      return records(data)
        .map((job) => {
          (job as Record<string, unknown>)._company = board.name;
          return normalizeJob(job, "Lever");
        })
        .filter((j): j is JobListing => j !== null);
    });

    const initialJobs = dedupeJobs(
      [
        ...remotiveJobs,
        ...jobicyJobs,
        ...remoteOkJobs,
        ...himalayasJobs,
        ...remoteJobsOrgJobs,
        ...remoteFirstJobsJobs,
        ...workingNomadsJobs,
        ...arbeitnowJobs,
        ...greenhouseJobs,
        ...leverJobs,
      ].filter((j): j is JobListing => j !== null)
    );

    // Initial composite state pointing to Stage 2
    const nextCursor = Buffer.from(
      JSON.stringify({
        stage: 2,
        himalayas: isRecord(himalayasData) && typeof himalayasData.nextCursor === "string" ? himalayasData.nextCursor : null,
        arbeitnowPage: 2,
        arbeitnowUkPage: 2,
      })
    ).toString("base64");

    return Response.json({
      jobCount: initialJobs.length,
      jobs: initialJobs,
      nextCursor,
      hasMoreStages: true,
    });
  } catch {
    return Response.json(
      { error: "The live job feeds are temporarily unavailable. Refresh once." },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.cursor !== "string") {
      return Response.json({ error: "Invalid cursor payload." }, { status: 400 });
    }

    let state = {
      stage: 2,
      himalayas: null as string | null,
      arbeitnowPage: 2,
      arbeitnowUkPage: 2,
    };

    try {
      const decoded = Buffer.from(body.cursor, "base64").toString("utf-8");
      state = { ...state, ...JSON.parse(decoded) };
    } catch {
      state.himalayas = body.cursor;
    }

    const pages: JobListing[] = [];

    // --- STAGE 2: Category sweeps + Batch 2 boards ---
    if (state.stage === 2) {
      const requests: { url: string; cache?: boolean }[] = [
        { url: "https://remotive.com/api/remote-jobs?category=marketing" },
        { url: "https://remotive.com/api/remote-jobs?category=design" },
        { url: "https://remotive.com/api/remote-jobs?category=sales" },
        { url: "https://remotive.com/api/remote-jobs?category=customer-support" },
        { url: "https://remotive.com/api/remote-jobs?category=human-resources" },
        ...[2, 3, 4, 5].map((p) => ({
          url: `https://www.arbeitnow.com/api/job-board-api?page=${p}`,
          cache: false,
        })),
        ...BATCH_2_GREENHOUSE.map(({ slug }) => ({
          url: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
          cache: false,
        })),
        ...BATCH_2_LEVER.map(({ slug }) => ({
          url: `https://api.lever.co/v0/postings/${slug}?mode=json`,
          cache: false,
        })),
      ];

      const results = await fetchAllBatched(requests, 10);
      let idx = 0;
      const remCat = results.slice(idx, idx + 5);
      idx += 5;
      const arbPages = results.slice(idx, idx + 4);
      idx += 4;
      const ghPages = results.slice(idx, idx + BATCH_2_GREENHOUSE.length);
      idx += BATCH_2_GREENHOUSE.length;
      const levPages = results.slice(idx, idx + BATCH_2_LEVER.length);

      remCat.forEach((d) => {
        if (isRecord(d)) pages.push(...records(d.jobs).map((j) => normalizeJob(j, "Remotive")).filter((j): j is JobListing => j !== null));
      });
      arbPages.forEach((d) => {
        if (isRecord(d)) pages.push(...records(d.data).map((j) => normalizeJob(j, "Arbeitnow")).filter((j): j is JobListing => j !== null));
      });
      ghPages.forEach((d, i) => {
        if (!isRecord(d)) return;
        const b = BATCH_2_GREENHOUSE[i];
        pages.push(...records(d.jobs).map((j) => { (j as Record<string, unknown>)._company = b.name; return normalizeJob(j, "Greenhouse"); }).filter((j): j is JobListing => j !== null));
      });
      levPages.forEach((d, i) => {
        if (!Array.isArray(d)) return;
        const b = BATCH_2_LEVER[i];
        pages.push(...records(d).map((j) => { (j as Record<string, unknown>)._company = b.name; return normalizeJob(j, "Lever"); }).filter((j): j is JobListing => j !== null));
      });

      const nextCursor = Buffer.from(
        JSON.stringify({
          stage: 3,
          himalayas: state.himalayas,
          arbeitnowPage: 6,
          arbeitnowUkPage: 2,
        })
      ).toString("base64");

      return Response.json({
        jobs: dedupeJobs(pages),
        nextCursor,
        hasMoreStages: true,
      });
    }

    // --- STAGE 3: Batch 3 Boards + Next Arbeitnow chunk ---
    if (state.stage === 3) {
      const requests: { url: string; cache?: boolean }[] = [
        ...[6, 7, 8, 9, 10].map((p) => ({
          url: `https://www.arbeitnow.com/api/job-board-api?page=${p}`,
          cache: false,
        })),
        ...[2, 3, 4, 5].map((p) => ({
          url: `https://www.arbeitnow.co.uk/api/job-board-api?page=${p}`,
          cache: false,
        })),
        ...BATCH_3_BOARDS.map((b) => {
          if (b.type === "gh") return { url: `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`, cache: false };
          if (b.type === "ashby") return { url: `https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`, cache: false };
          return { url: `https://api.smartrecruiters.com/v1/companies/${b.slug}/postings?limit=100&offset=0`, cache: false };
        }),
      ];

      const results = await fetchAllBatched(requests, 10);
      let idx = 0;
      const arbPages = results.slice(idx, idx + 5);
      idx += 5;
      const arbUkPages = results.slice(idx, idx + 4);
      idx += 4;
      const b3Pages = results.slice(idx, idx + BATCH_3_BOARDS.length);

      arbPages.forEach((d) => {
        if (isRecord(d)) pages.push(...records(d.data).map((j) => normalizeJob(j, "Arbeitnow")).filter((j): j is JobListing => j !== null));
      });
      arbUkPages.forEach((d) => {
        if (isRecord(d)) pages.push(...records(d.data).map((j) => normalizeJob(j, "ArbeitnowUK")).filter((j): j is JobListing => j !== null));
      });
      b3Pages.forEach((d, i) => {
        if (!isRecord(d)) return;
        const b = BATCH_3_BOARDS[i];
        if (b.type === "gh" || b.type === "ashby") {
          pages.push(...records(d.jobs).map((j) => { (j as Record<string, unknown>)._company = b.name; return normalizeJob(j, b.type === "gh" ? "Greenhouse" : "Ashby"); }).filter((j): j is JobListing => j !== null));
        } else if (b.type === "sr") {
          pages.push(...records(d.content).map((j) => { (j as Record<string, unknown>)._company = b.name; (j as Record<string, unknown>)._companySlug = b.slug; return normalizeJob(j, "SmartRecruiters"); }).filter((j): j is JobListing => j !== null));
        }
      });

      const nextCursor = Buffer.from(
        JSON.stringify({
          stage: 4,
          himalayas: state.himalayas,
          arbeitnowPage: 11,
          arbeitnowUkPage: 6,
        })
      ).toString("base64");

      return Response.json({
        jobs: dedupeJobs(pages),
        nextCursor,
        hasMoreStages: true,
      });
    }

    // --- STAGE 4+ / MANUAL LOAD MORE (Deep Pagination) ---
    const nextFetches: { url: string; source: FeedName }[] = [];
    if (state.arbeitnowPage < 45) {
      for (let p = 0; p < 4; p++) {
        nextFetches.push({
          url: `https://www.arbeitnow.com/api/job-board-api?page=${state.arbeitnowPage + p}`,
          source: "Arbeitnow",
        });
      }
    }
    if (state.himalayas) {
      nextFetches.push({
        url: `https://himalayas.app/jobs/api?limit=25&cursor=${encodeURIComponent(state.himalayas)}`,
        source: "Himalayas",
      });
    }

    const results = await Promise.all(
      nextFetches.map(async (req) => {
        const data = await fetchFeed(req.url, false);
        return { data, source: req.source };
      })
    );

    let nextHimalayasCursor: string | null = null;
    for (const res of results) {
      if (!isRecord(res.data)) continue;
      if (res.source === "Arbeitnow") {
        pages.push(...records(res.data.data).map((j) => normalizeJob(j, "Arbeitnow")).filter((j): j is JobListing => j !== null));
      } else if (res.source === "Himalayas") {
        pages.push(...records(res.data.jobs).map((j) => normalizeJob(j, "Himalayas")).filter((j): j is JobListing => j !== null));
        if (typeof res.data.nextCursor === "string") nextHimalayasCursor = res.data.nextCursor;
      }
    }

    const nextState = {
      stage: 4,
      himalayas: nextHimalayasCursor,
      arbeitnowPage: state.arbeitnowPage + 4,
      arbeitnowUkPage: state.arbeitnowUkPage,
    };

    const hasMore = nextState.arbeitnowPage < 50 || Boolean(nextState.himalayas);

    return Response.json({
      jobs: dedupeJobs(pages),
      nextCursor: hasMore ? Buffer.from(JSON.stringify(nextState)).toString("base64") : null,
      hasMoreStages: false,
    });
  } catch {
    return Response.json({ error: "Could not load more listings." }, { status: 502 });
  }
}