import { isRecord } from "@/lib/providers/server";
import type { JobListing } from "@/lib/jobs/types";
import { regionCountryCodes } from "@/lib/jobs/regions";
import isoCountries from "i18n-iso-countries";

type FeedName =
  | "Remotive"
  | "Jobicy"
  | "Arbeitnow"
  | "Himalayas"
  | "RemoteOK"
  | "RemoteJobsOrg"
  | "RemoteFirstJobs"
  | "WorkingNomads";

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
    GB: ["uk", "u.k.", "england", "scotland", "wales"],
    NL: ["holland"],
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
    if (locationHasPhrase(location, region)) codes.forEach((code) => countries.add(code));
  }
  if (locationHasPhrase(location, "APAC") || locationHasPhrase(location, "Asia Pacific")) {
    [...regionCountryCodes.Asia, ...regionCountryCodes.Oceania].forEach((code) =>
      countries.add(code)
    );
  }
  if (locationHasPhrase(location, "EMEA")) {
    [
      ...regionCountryCodes.Europe,
      ...regionCountryCodes.Africa,
      "AE",
      "BH",
      "IL",
      "IQ",
      "IR",
      "JO",
      "KW",
      "LB",
      "OM",
      "PS",
      "QA",
      "SA",
      "SY",
      "TR",
      "YE",
    ].forEach((code) => countries.add(code));
  }
  if (locationHasPhrase(location, "LATAM") || locationHasPhrase(location, "Latin America")) {
    regionCountryCodes.Americas.forEach((code) => countries.add(code));
  }
  if (/worldwide|anywhere|global|all countries|remote anywhere/i.test(location))
    countries.add("WW");
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

function workModeFor(job: Record<string, unknown>, source: FeedName) {
  if (source !== "Arbeitnow" || job.remote === true) return "Remote";
  const details = `${text(job.title)} ${text(job.location)} ${text(job.description)}`;
  return /\bhybrid\b/i.test(details) ? "Hybrid" : "Office";
}

function normalizeJob(job: Record<string, unknown>, source: FeedName): JobListing | null {
  // ---------- ID ----------
  let rawId: unknown;
  if (source === "Arbeitnow") rawId = job.slug;
  else if (source === "Himalayas") rawId = job.guid ?? job.applicationLink;
  else if (source === "RemoteJobsOrg") rawId = job.id;
  else if (source === "RemoteFirstJobs") rawId = job.id;
  else if (source === "WorkingNomads") {
    // extract numeric id from url like /job/go/1906010/
    const url = text(job.url);
    const match = url.match(/\/(\d+)\/?$/);
    rawId = match?.[1] ?? job.url;
  } else rawId = job.id ?? job.job_id;

  const id =
    typeof rawId === "number" && Number.isFinite(rawId) ? String(rawId) : text(rawId);

  // ---------- Title ----------
  const title = text(
    source === "Jobicy"
      ? job.jobTitle
      : source === "RemoteOK"
        ? job.position
        : source === "RemoteJobsOrg" || source === "RemoteFirstJobs" || source === "WorkingNomads"
          ? job.title
          : job.title
  );

  // ---------- Company ----------
  const company = text(
    source === "Jobicy" || source === "Himalayas"
      ? job.companyName
      : source === "RemoteOK"
        ? job.company
        : source === "RemoteJobsOrg"
          ? isRecord(job.company)
            ? job.company.name
            : ""
          : source === "RemoteFirstJobs"
            ? job.company_name
            : source === "WorkingNomads"
              ? job.company_name
              : job.company_name
  );

  // ---------- Location ----------
  let rawLocation: unknown;
  if (source === "Remotive") rawLocation = job.candidate_required_location;
  else if (source === "Jobicy") rawLocation = job.jobGeo;
  else if (source === "Himalayas") rawLocation = job.locationRestrictions;
  else if (source === "RemoteOK") rawLocation = job.location;
  else if (source === "RemoteJobsOrg") rawLocation = job.location;
  else if (source === "RemoteFirstJobs") rawLocation = job.locations; // array
  else if (source === "WorkingNomads") rawLocation = job.location;
  else rawLocation = job.location;

  const location = Array.isArray(rawLocation)
    ? rawLocation.filter((v): v is string => typeof v === "string").join(", ") ||
      "Worldwide / Remote"
    : text(rawLocation) || "Worldwide / Remote";

  // ---------- Application URL ----------
  const applicationUrl =
    safeUrl(
      source === "Himalayas"
        ? job.applicationLink
        : source === "RemoteOK"
          ? job.apply_url
          : source === "RemoteJobsOrg"
            ? job.apply_url ?? job.url
            : source === "RemoteFirstJobs"
              ? job.url
              : source === "WorkingNomads"
                ? job.url
                : job.url
    ) || safeUrl(job.url);

  if (!id || !title || !company || !applicationUrl) return null;

  // ---------- Posted date ----------
  let dateValue: unknown;
  if (source === "Remotive") dateValue = job.publication_date;
  else if (source === "Jobicy" || source === "Himalayas") dateValue = job.pubDate;
  else if (source === "RemoteOK") dateValue = job.date;
  else if (source === "RemoteJobsOrg") dateValue = job.posted_at;
  else if (source === "RemoteFirstJobs") dateValue = job.published_at;
  else if (source === "WorkingNomads") dateValue = job.pub_date;
  else dateValue = job.created_at;

  const postedAt =
    typeof dateValue === "number" && (source === "Arbeitnow" || source === "Himalayas")
      ? new Date(dateValue * 1000).toISOString()
      : typeof dateValue === "string" && Number.isFinite(Date.parse(dateValue))
        ? new Date(dateValue).toISOString()
        : "";

  // ---------- Summary ----------
  const summary = text(
    source === "Jobicy"
      ? job.jobExcerpt
      : source === "Himalayas"
        ? job.description ?? job.excerpt
        : source === "RemoteJobsOrg" ||
            source === "RemoteFirstJobs" ||
            source === "WorkingNomads"
          ? job.description
          : job.description
  );

  const matchedCountries = countriesFor(location);

  return {
    id: `${source.toLowerCase()}-${id}`,
    title: title.slice(0, 200),
    company: company.slice(0, 200),
    location: location.slice(0, 200),
    workMode: workModeFor(job, source),
    postedAt,
    summary: summary.slice(0, 1200) || null,
    applicationUrl,
    countryCode: matchedCountries[0] ?? "WW",
    countryCodes: matchedCountries,
    matchScore: 0,
    matchedSkills: [],
    source,
  };
}

function dedupeJobs(jobs: JobListing[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
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
    const canonicalUrl = url.toString().replace(/\/$/, "").toLowerCase();
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
      signal: AbortSignal.timeout(7000),
    });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const feedResults = await Promise.all([
    // Existing
    fetchFeed("https://remotive.com/api/remote-jobs?category=software-dev&limit=200"),
    fetchFeed("https://jobicy.com/api/v2/remote-jobs?count=100"),
    ...[1, 2, 3, 4].map((page) =>
      fetchFeed(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, false)
    ),
    fetchFeed("https://remoteok.com/api"),
    fetchFeed("https://himalayas.app/jobs/api?limit=20"),

    // New free no-key feeds
    fetchFeed("https://remotejobs.org/api/v1/jobs?limit=50&category=programming"),
    fetchFeed(
      "https://remotefirstjobs.com/api/search-jobs?category=software_development"
    ),
    fetchFeed("https://www.workingnomads.com/api/exposed_jobs/"),
  ]);

  const remotiveData = feedResults[0];
  const jobicyData = feedResults[1];
  const arbeitnowPages = feedResults.slice(2, 6);
  const remoteOkData = feedResults[6];
  const himalayasData = feedResults[7];
  const remoteJobsOrgData = feedResults[8];
  const remoteFirstJobsData = feedResults[9];
  const workingNomadsData = feedResults[10];

  const remotiveJobs = isRecord(remotiveData)
    ? records(remotiveData.jobs).map((job) => normalizeJob(job, "Remotive"))
    : [];
  const jobicyJobs = isRecord(jobicyData)
    ? records(jobicyData.jobs).map((job) => normalizeJob(job, "Jobicy"))
    : [];
  const arbeitnowJobs = arbeitnowPages.flatMap((data) =>
    isRecord(data)
      ? records(data.data)
          .filter((job) => typeof job.remote === "boolean")
          .map((job) => normalizeJob(job, "Arbeitnow"))
      : []
  );
  const remoteOkJobs = records(remoteOkData)
    .filter((job) => job.id && job.position)
    .map((job) => normalizeJob(job, "RemoteOK"));
  const himalayasJobs = isRecord(himalayasData)
    ? records(himalayasData.jobs).map((job) => normalizeJob(job, "Himalayas"))
    : [];

  // New sources
  const remoteJobsOrgJobs = isRecord(remoteJobsOrgData)
    ? records(remoteJobsOrgData.data).map((job) =>
        normalizeJob(job, "RemoteJobsOrg")
      )
    : [];

  const remoteFirstJobsJobs = isRecord(remoteFirstJobsData)
    ? records(remoteFirstJobsData.jobs).map((job) =>
        normalizeJob(job, "RemoteFirstJobs")
      )
    : [];

  const workingNomadsJobs = Array.isArray(workingNomadsData)
    ? records(workingNomadsData).map((job) =>
        normalizeJob(job, "WorkingNomads")
      )
    : [];

  const jobs = dedupeJobs(
    [
      ...remotiveJobs,
      ...jobicyJobs,
      ...arbeitnowJobs,
      ...remoteOkJobs,
      ...himalayasJobs,
      ...remoteJobsOrgJobs,
      ...remoteFirstJobsJobs,
      ...workingNomadsJobs,
    ].filter((job): job is JobListing => job !== null)
  );

  if (
    !jobs.length &&
    !remotiveData &&
    !jobicyData &&
    arbeitnowPages.every((data) => !data) &&
    !remoteOkData &&
    !himalayasData &&
    !remoteJobsOrgData &&
    !remoteFirstJobsData &&
    !workingNomadsData
  ) {
    return Response.json(
      { error: "The live job feeds are temporarily unavailable." },
      { status: 502 }
    );
  }

  return Response.json({
    jobCount: jobs.length,
    jobs,
    nextCursor:
      isRecord(himalayasData) && typeof himalayasData.nextCursor === "string"
        ? himalayasData.nextCursor
        : null,
  });
}

// POST stays the same (only used for Himalayas pagination)
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      typeof body.cursor !== "string" ||
      body.cursor.length > 500
    ) {
      return Response.json(
        { error: "A valid pagination cursor is required." },
        { status: 400 }
      );
    }
    let cursor: string | null = body.cursor;
    const pages: JobListing[] = [];
    for (let page = 0; page < 3 && cursor; page += 1) {
      const data = await fetchFeed(
        `https://himalayas.app/jobs/api?limit=20&cursor=${encodeURIComponent(cursor)}`
      );
      if (!isRecord(data)) break;
      pages.push(
        ...records(data.jobs)
          .map((job) => normalizeJob(job, "Himalayas"))
          .filter((job): job is JobListing => job !== null)
      );
      cursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
    }
    if (pages.length === 0)
      return Response.json(
        { error: "Could not load the next remote job page." },
        { status: 502 }
      );
    return Response.json({ jobs: dedupeJobs(pages), nextCursor: cursor });
  } catch {
    return Response.json(
      { error: "Could not load the next remote job page." },
      { status: 502 }
    );
  }
}