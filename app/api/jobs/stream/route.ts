import { isRecord } from "@/lib/providers/server";
import type { JobListing } from "@/lib/jobs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  | "WeWorkRemotely"
  | "Remotewx"
  | "RemoteJobsAPI"
  | "TheMuse"
  | "Adzuna"
  | "Jooble"
  | "Reed"
  | "USAJobs"
  | "Arbeitsagentur"
  | "Findwork"
  | "ReliefWeb"
  | "Greenhouse"
  | "Lever"
  | "Ashby"
  | "SmartRecruiters"
  | "Recruitee"
  | "Workable"
  | "Personio"
  | "BambooHR"
  | "Teamtailor"
  | "Rippling"
  | "Breezy"
  | "PythonJobs";

const REMOTE_ONLY = new Set<FeedName>([
  "Remotive",
  "Jobicy",
  "Himalayas",
  "RemoteOK",
  "RemoteJobsOrg",
  "RemoteFirstJobs",
  "WorkingNomads",
  "WeWorkRemotely",
  "Remotewx",
  "RemoteJobsAPI",
  "USAJobs",
  "Arbeitsagentur",
]);

const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000; 
const UPDATE_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_STREAM_LIFETIME_MS = 5 * 60 * 1000;
const CONCURRENCY_LIMIT = 4;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function idText(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
}

function rec(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function nameOf(value: unknown) {
  return isRecord(value) ? value.name ?? value.display_name : value;
}

function joinParts(...parts: unknown[]) {
  return parts.map(text).filter(Boolean).join(", ");
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function firstUrl(...values: unknown[]) {
  for (const value of values) {
    const url = safeUrl(value);
    if (url) return url;
  }
  return "";
}

function enc(value: string) {
  return encodeURIComponent(value);
}

function env(key: string) {
  return process.env[key]?.trim() || "";
}

function list(key: string, fallback: string[]) {
  const value = env(key);
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : fallback;
}

function toIso(value: unknown, seconds = false) {
  try {
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(seconds ? value * 1000 : value).toISOString();
    }
    if (typeof value === "string" && value.trim()) {
      const dmy = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      const parsed = dmy ? Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]) : Date.parse(value);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
  } catch {
    // fall through
  }
  return "";
}

function htmlToText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function rows(payload: unknown, ...keys: string[]) {
  if (Array.isArray(payload)) return records(payload);
  if (isRecord(payload)) {
    for (const key of keys) {
      if (Array.isArray(payload[key])) return records(payload[key]);
    }
  }
  return [];
}

function tagCompany(
  jobs: Record<string, unknown>[],
  slug: string,
  company: string = slug
): Record<string, unknown>[] {
  return jobs.map((job) => ({ ...job, _company: company, _companySlug: slug }));
}

function xmlDecode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlRecords(xml: unknown, tag: string, fields: string[]): Record<string, unknown>[] {
  if (typeof xml !== "string") return [];
  const blocks =
    xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "gi")) ?? [];
  return blocks.map((block) => {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      const match = block.match(
        new RegExp(`<${field}(?:\\s[^>]*)?>([\\s\\S]*?)</${field}>`, "i")
      );
      if (match) out[field] = xmlDecode(match[1]).trim();
    }
    return out;
  });
}

/* -------------------------------------------------------------------------- */
/* Work mode detection                                                        */
/* -------------------------------------------------------------------------- */

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

  if ((source === "Findwork" || source === "Recruitee" || source === "Breezy") && job.remote === true) return "Remote";
  if (source === "Workable" && job.telecommuting === true) return "Remote";

  if (source === "BambooHR") {
    const type = String(job.locationType ?? "");
    if (job.isRemote === true || type === "1") return "Remote";
    if (type === "2") return "Hybrid";
  }

  const details = `${title} ${location} ${description}`.toLowerCase();
  if (/\bhybrid\b/.test(details)) return "Hybrid";
  if (/\b(remote|work from home|wfh|work-from-home|fully remote|100% remote|home ?office)\b/.test(details)) {
    return "Remote";
  }
  if (
    /\b(on[- ]?site|office|wfo|work from office|in[- ]office|warehouse|clinic|store|branch|plant|field|hospital|retail|lab|hotel|flight|restaurant)\b/.test(
      details
    )
  ) {
    return "Office";
  }

  return REMOTE_ONLY.has(source) ? "Remote" : "Office";
}

/* -------------------------------------------------------------------------- */
/* Mappers                                                                    */
/* -------------------------------------------------------------------------- */

type Mapped = {
  id: unknown;
  title: unknown;
  company: unknown;
  location: unknown;
  url: string;
  date: string;
  summary: unknown;
};

type Raw = Record<string, unknown>;

function arbeitnow(uk: boolean) {
  return (j: Raw): Mapped => ({
    id: j.slug,
    title: j.title,
    company: j.company_name,
    location: uk ? j.location || "United Kingdom" : j.location,
    url: safeUrl(j.url),
    date: toIso(j.created_at, true),
    summary: j.description,
  });
}

const MAPPERS: Record<FeedName, (job: Raw) => Mapped> = {
  Remotive: (j) => ({
    id: j.id,
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location,
    url: safeUrl(j.url),
    date: toIso(j.publication_date),
    summary: j.description,
  }),
  Jobicy: (j) => ({
    id: j.id,
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo,
    url: safeUrl(j.url),
    date: toIso(j.pubDate),
    summary: j.jobExcerpt,
  }),
  Arbeitnow: arbeitnow(false),
  ArbeitnowUK: arbeitnow(true),
  Himalayas: (j) => ({
    id: j.guid ?? j.applicationLink,
    title: j.title,
    company: j.companyName,
    location: j.locationRestrictions,
    url: firstUrl(j.applicationLink, j.url),
    date: toIso(j.pubDate, true),
    summary: j.description ?? j.excerpt,
  }),
  RemoteOK: (j) => ({
    id: j.id,
    title: j.position,
    company: j.company,
    location: j.location,
    url: firstUrl(j.apply_url, j.url),
    date: toIso(j.date),
    summary: j.description,
  }),
  RemoteJobsOrg: (j) => ({
    id: j.id,
    title: j.title,
    company: nameOf(j.company),
    location: j.location,
    url: firstUrl(j.apply_url ?? j.url, j.url),
    date: toIso(j.posted_at),
    summary: j.description,
  }),
  RemoteFirstJobs: (j) => ({
    id: j.id,
    title: j.title,
    company: j.company_name,
    location: j.locations,
    url: safeUrl(j.url),
    date: toIso(j.published_at),
    summary: j.description,
  }),
  WorkingNomads: (j) => {
    const url = text(j.url);
    const match = url.match(/\/(\d+)\/?$/);
    return {
      id: match?.[1] ?? j.url,
      title: j.title,
      company: j.company_name,
      location: j.location,
      url: safeUrl(j.url),
      date: toIso(j.pub_date),
      summary: j.description,
    };
  },
  WeWorkRemotely: (j) => {
    const raw = text(j.title);
    const split = raw.indexOf(": ");
    return {
      id: j.guid ?? j.link,
      title: split > 0 ? raw.slice(split + 2) : raw,
      company: split > 0 ? raw.slice(0, split) : "",
      location: j.region,
      url: firstUrl(j.link, j.guid),
      date: toIso(j.pubDate),
      summary: j.description,
    };
  },
  Remotewx: (j) => ({
    id: j.id ?? j.slug ?? j.url,
    title: j.title ?? j.position,
    company: nameOf(j.company) ?? j.company_name,
    location: j.location ?? j.candidate_required_location,
    url: firstUrl(j.url, j.apply_url, j.link),
    date: toIso(j.published_at ?? j.date ?? j.created_at),
    summary: j.description,
  }),
  RemoteJobsAPI: (j) => ({
    id: j.id ?? j.url,
    title: j.title,
    company: j.company,
    location: j.location,
    url: safeUrl(j.url),
    date: toIso(j.published),
    summary: j.description ?? j.category,
  }),
  TheMuse: (j) => ({
    id: j.id,
    title: j.name,
    company: nameOf(j.company),
    location: records(j.locations)
      .map((l) => text(l.name))
      .filter(Boolean),
    url: safeUrl(rec(j.refs).landing_page),
    date: toIso(j.publication_date),
    summary: j.contents,
  }),
  Adzuna: (j) => ({
    id: j.id,
    title: j.title,
    company: nameOf(j.company),
    location: nameOf(j.location),
    url: safeUrl(j.redirect_url),
    date: toIso(j.created),
    summary: j.description,
  }),
  Jooble: (j) => ({
    id: j.id ?? j.link,
    title: j.title,
    company: j.company,
    location: j.location,
    url: safeUrl(j.link),
    date: toIso(j.updated),
    summary: j.snippet,
  }),
  Reed: (j) => ({
    id: j.jobId,
    title: j.jobTitle,
    company: j.employerName,
    location: j.locationName,
    url: safeUrl(j.jobUrl),
    date: toIso(j.date),
    summary: j.jobDescription,
  }),
  USAJobs: (j) => {
    const apply = Array.isArray(j.ApplyURI) ? j.ApplyURI[0] : undefined;
    return {
      id: j.id ?? j.PositionID,
      title: j.PositionTitle,
      company: j.OrganizationName,
      location: j.PositionLocationDisplay,
      url: firstUrl(j.PositionURI, apply),
      date: toIso(j.PublicationStartDate),
      summary: j.QualificationSummary,
    };
  },
  Arbeitsagentur: (j) => {
    const place = rec(j.arbeitsort);
    return {
      id: j.refnr,
      title: j.titel,
      company: j.arbeitgeber,
      location: joinParts(place.ort, place.region, place.land),
      url: j.refnr ? safeUrl(`https://www.arbeitsagentur.de/jobsuche/jobdetail/${enc(text(j.refnr))}`) : "",
      date: toIso(j.aktuelleVeroeffentlichungsdatum),
      summary: j.beruf,
    };
  },
  Findwork: (j) => ({
    id: j.id,
    title: j.role,
    company: j.company_name,
    location: j.location,
    url: safeUrl(j.url),
    date: toIso(j.date_posted),
    summary: j.text,
  }),
  ReliefWeb: (j) => {
    const f = rec(j.fields);
    const sources = records(f.source);
    const countries = records(f.country);
    return {
      id: j.id,
      title: f.title,
      company: sources.length > 0 ? nameOf(sources[0]) : "Humanitarian Organization",
      location: countries.map((c) => text(c.name)).filter(Boolean).join(", ") || "Global",
      url: safeUrl(f.url),
      date: toIso(rec(f.date).created),
      summary: f.body,
    };
  },
  Greenhouse: (j) => ({
    id: j.id ?? j.internal_job_id,
    title: j.title,
    company: j._company,
    location: isRecord(j.location) ? j.location.name : j.location,
    url: safeUrl(j.absolute_url),
    date: toIso(j.updated_at),
    summary: j.content,
  }),
  Lever: (j) => ({
    id: j.id,
    title: j.text,
    company: j._company,
    location:
      isRecord(j.categories) && typeof j.categories.location === "string"
        ? j.categories.location
        : j.location,
    url: firstUrl(j.hostedUrl ?? j.applyUrl, j.url),
    date: toIso(j.createdAt),
    summary: j.descriptionPlain,
  }),
  Ashby: (j) => ({
    id: j.id ?? j.jobId,
    title: j.title,
    company: j._company,
    location:
      j.location ??
      (Array.isArray(j.secondaryLocations)
        ? j.secondaryLocations
            .map((item) => (isRecord(item) ? text(item.location) : ""))
            .filter(Boolean)
            .join(", ")
        : ""),
    url: firstUrl(j.jobUrl ?? j.applyUrl, j.url),
    date: toIso(j.publishedAt ?? j.updatedAt),
    summary: j.descriptionPlain ?? j.descriptionHtml,
  }),
  SmartRecruiters: (j) => {
    const loc = rec(j.location);
    const companyId = text(j._companySlug) || text(rec(j.company).identifier);
    const postingId = text(j.uuid) || text(j.id);
    return {
      id: j.uuid ?? j.id,
      title: j.name,
      company: j._company,
      location:
        joinParts(loc.city, loc.region, loc.country) || (loc.remote === true ? "Remote" : ""),
      url:
        companyId && postingId
          ? safeUrl(`https://jobs.smartrecruiters.com/${companyId}/${postingId}`)
          : "",
      date: toIso(j.releasedDate),
      summary: j.description,
    };
  },
  Recruitee: (j) => ({
    id: j.id ?? j.guid,
    title: j.title,
    company: j.company_name ?? j._company,
    location: text(j.location) || joinParts(j.city, j.country),
    url: firstUrl(j.careers_url, j.url),
    date: toIso(j.created_at ?? j.published_at),
    summary: j.description,
  }),
  Workable: (j) => ({
    id: j.shortcode ?? j.code ?? j.id,
    title: j.title,
    company: j._company,
    location: joinParts(j.city, j.state, j.country),
    url: firstUrl(j.url, j.shortlink, j.application_url),
    date: toIso(j.created_at ?? j.published_on),
    summary: j.description,
  }),
  Personio: (j) => ({
    id: j.id,
    title: j.name,
    company: j._company,
    location: j.office,
    url: j.id ? safeUrl(`https://${text(j._companySlug)}.jobs.personio.de/job/${enc(idText(j.id))}`) : "",
    date: toIso(j.createdAt),
    summary: j.jobDescriptions,
  }),
  BambooHR: (j) => {
    const loc = rec(j.location);
    const ats = rec(j.atsLocation);
    return {
      id: j.id,
      title: j.jobOpeningName,
      company: j._company,
      location: joinParts(loc.city ?? ats.city, loc.state ?? ats.state, ats.country),
      url: j.id ? safeUrl(`https://${text(j._companySlug)}.bamboohr.com/careers/${enc(idText(j.id))}`) : "",
      date: "",
      summary: j.departmentLabel,
    };
  },
  Teamtailor: (j) => ({
    id: j.guid ?? j.link,
    title: j.title,
    company: j._company,
    location: "",
    url: firstUrl(j.link, j.guid),
    date: toIso(j.pubDate),
    summary: j.description,
  }),
  Rippling: (j) => ({
    id: j.uuid ?? j.id,
    title: j.name,
    company: j._company,
    location: rec(j.workLocation).label,
    url: safeUrl(j.url),
    date: toIso(j.createdAt),
    summary: nameOf(j.department),
  }),
  Breezy: (j) => ({
    id: j.id,
    title: j.title,
    company: j._company,
    location: isRecord(j.location) ? joinParts(j.location.city, j.location.country) : j.location,
    url: safeUrl(j.url),
    date: toIso(j.published_date),
    summary: j.description,
  }),
  PythonJobs: (j) => ({
    id: j.guid ?? j.link,
    title: j.title,
    company: "Python Community",
    location: "Worldwide / Remote",
    url: firstUrl(j.link, j.guid),
    date: toIso(j.pubDate),
    summary: j.description,
  }),
};

function normalizeJob(job: Raw, source: FeedName): JobListing | null {
  const mapped = MAPPERS[source](job);

  const id = idText(mapped.id);
  const title = text(mapped.title);
  const company = text(mapped.company);
  const applicationUrl = mapped.url;
  if (!id || !title || !company || !applicationUrl) return null;

  const fallbackLocation = REMOTE_ONLY.has(source) ? "Worldwide / Remote" : "Not specified";
  const location = Array.isArray(mapped.location)
    ? mapped.location.filter((v): v is string => typeof v === "string").join(", ") ||
      fallbackLocation
    : text(mapped.location) || fallbackLocation;

  const summary = htmlToText(text(mapped.summary));
  const workMode = detectWorkMode(title, location, summary, source, job);

  return {
    id: `${source.toLowerCase()}-${id}`,
    title: title.slice(0, 200),
    company: company.slice(0, 200),
    location: location.slice(0, 200),
    workMode,
    postedAt: mapped.date,
    summary: summary.slice(0, 1200) || null,
    applicationUrl,
    countryCode: "WW",
    countryCodes: ["WW"],
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

/* -------------------------------------------------------------------------- */
/* Feed Registry                                                              */
/* -------------------------------------------------------------------------- */

type FetchSpec = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  format?: "json" | "text";
  maxPages?: number;
};

type FeedSource = {
  name: FeedName;
  spec: FetchSpec;
  extract: (payload: unknown) => Raw[];
};

function buildSources(): FeedSource[] {
  const sources: FeedSource[] = [
    {
      name: "Remotive",
      spec: { url: "https://remotive.com/api/remote-jobs" },
      extract: (p) => rows(p, "jobs"),
    },
    {
      name: "Jobicy",
      spec: { url: "https://jobicy.com/api/v2/remote-jobs?count=500" },
      extract: (p) => rows(p, "jobs"),
    },
    {
      name: "RemoteOK",
      spec: { url: "https://remoteok.com/api" },
      extract: (p) => rows(p).filter((j) => j.id && j.position),
    },
    {
      name: "Himalayas",
      spec: { url: "https://himalayas.app/jobs/api?limit=100" },
      extract: (p) => rows(p, "jobs"),
    },
    {
      name: "RemoteJobsOrg",
      spec: { url: "https://remotejobs.org/api/v1/jobs?limit=250" },
      extract: (p) => rows(p, "data"),
    },
    {
      name: "RemoteFirstJobs",
      spec: { url: "https://remotefirstjobs.com/api/search-jobs" },
      extract: (p) => rows(p, "jobs"),
    },
    {
      name: "WorkingNomads",
      spec: { url: "https://www.workingnomads.com/api/exposed_jobs/" },
      extract: (p) => rows(p),
    },
    {
      name: "Arbeitnow",
      spec: { url: "https://www.arbeitnow.com/api/job-board-api?page=1", maxPages: 5 },
      extract: (p) => rows(p, "data"),
    },
    {
      name: "ArbeitnowUK",
      spec: { url: "https://www.arbeitnow.co.uk/api/job-board-api?page=1", maxPages: 5 },
      extract: (p) => rows(p, "data"),
    },
    {
      name: "WeWorkRemotely",
      spec: { url: "https://weworkremotely.com/remote-jobs.rss", format: "text" },
      extract: (p) =>
        xmlRecords(p, "item", ["title", "link", "guid", "pubDate", "description", "region"]),
    },
    {
      name: "Remotewx",
      spec: { url: "https://remotewx.com/api" },
      extract: (p) => rows(p, "jobs", "data", "results"),
    },
    {
      name: "RemoteJobsAPI",
      spec: { url: "https://remote-jobs-api.tten.no/v1/jobs?limit=500" },
      extract: (p) => rows(p, "jobs", "data", "results", "items"),
    },
    {
      name: "TheMuse",
      spec: {
        url: `https://www.themuse.com/api/public/jobs?page=1${
          env("THEMUSE_API_KEY") ? `&api_key=${enc(env("THEMUSE_API_KEY"))}` : ""
        }`,
        maxPages: 10,
      },
      extract: (p) => rows(p, "results"),
    },
    {
      name: "Arbeitsagentur",
      spec: {
        url: "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs?arbeitszeit=ho&size=200&page=1",
        headers: { "X-API-Key": "jobboerse-jobsuche" },
        maxPages: 5,
      },
      extract: (p) => rows(p, "stellenangebote"),
    },
    {
      name: "ReliefWeb",
      spec: { url: "https://api.reliefweb.int/v2/jobs?appname=jobpilot&limit=250", maxPages: 5 },
      extract: (p) => rows(p, "data"),
    },
    {
      name: "PythonJobs",
      spec: { url: "https://www.python.org/jobs/feed/v1/", format: "text" },
      extract: (p) => xmlRecords(p, "item", ["title", "link", "guid", "pubDate", "description"]),
    },
  ];

  /* ---- Jooble Configuration (Using your key) ---- */
  const joobleKey = env("JOOBLE_API_KEY") || "0f41cd1d-07bb-49e3-add2-e3d49b4ce14d";
  const joobleSectors = ["work", "remote", "manager", "engineer", "analyst", "support", "sales", "marketing"];
  for (const keyword of joobleSectors) {
    sources.push({
      name: "Jooble",
      spec: {
        url: `https://jooble.org/api/${enc(joobleKey)}`,
        method: "POST",
        body: { keywords: keyword, page: 1 },
        maxPages: 3,
      },
      extract: (p) => rows(p, "jobs"),
    });
  }

  /* ---- Adzuna Configuration (Using your credentials) ---- */
  const adzunaId = env("ADZUNA_APP_ID") || "039383ec";
  const adzunaKey = env("ADZUNA_APP_KEY") || "74e1c868f4fe3984d1bcc525deb9f8dc";
  const adzunaKeywords = ["job", "remote", "specialist", "assistant", "consultant"];
  if (adzunaId && adzunaKey) {
    for (const country of list("ADZUNA_COUNTRIES", ["gb", "us"])) {
      for (const keyword of adzunaKeywords) {
        const params = new URLSearchParams({
          app_id: adzunaId,
          app_key: adzunaKey,
          results_per_page: "50",
          what: keyword,
          "content-type": "application/json",
        });
        sources.push({
          name: "Adzuna",
          spec: { url: `https://api.adzuna.com/v1/api/jobs/${enc(country)}/search/1?${params}`, maxPages: 3 },
          extract: (p) => rows(p, "results"),
        });
      }
    }
  }

  /* ---- Large Enterprise ATS Corporations ---- */
  const enterpriseSlugs = [
    "stripe", "discord", "figma", "notion", "coinbase", "airbnb", "pinterest", "reddit", 
    "slack", "palantir", "hashicorp", "canva", "netflix", "unity3d", "ramp", "linear", 
    "vanta", "retool", "scaleai", "Visa", "bosch", "mcdonalds", "huggingface", "blueground"
  ];
  for (const slug of enterpriseSlugs) {
    sources.push({
      name: "Greenhouse",
      spec: { url: `https://boards-api.greenhouse.io/v1/boards/${enc(slug)}/jobs?content=true` },
      extract: (p) => tagCompany(rows(p, "jobs"), slug),
    });
  }

  return sources;
}

/* -------------------------------------------------------------------------- */
/* Pagination & Execution Engine                                              */
/* -------------------------------------------------------------------------- */

async function fetchFeed(spec: FeedSpec): Promise<Raw[]> {
  const maxPages = spec.maxPages && spec.maxPages > 1 ? spec.maxPages : 1;
  const allRows: Raw[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      let targetUrl = spec.url;
      let currentBody = spec.body;

      if (maxPages > 1 && !spec.body) {
        const separator = targetUrl.includes("?") ? "&" : "?";
        if (targetUrl.includes("page=")) {
          targetUrl = targetUrl.replace(/page=\d+/, `page=${page}`);
        } else {
          targetUrl = `${targetUrl}${separator}page=${page}`;
        }
      }

      if (currentBody && typeof currentBody === "object") {
        currentBody = { ...(currentBody as Record<string, unknown>), page };
      }

      const hasBody = currentBody !== undefined;
      const response = await fetch(targetUrl, {
        method: spec.method ?? "GET",
        cache: "no-store",
        headers: {
          Accept: spec.format === "text" ? "application/rss+xml, application/xml, text/xml, */*" : "application/json",
          "User-Agent": "JobPilot/3.0",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...spec.headers,
        },
        body: hasBody ? JSON.stringify(currentBody) : undefined,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) break;
      const payload = spec.format === "text" ? await response.text() : await response.json();
      
      const items = rows(payload, "results", "jobs", "data", "items", "stellenangebote", "SearchResultItems");
      if (items.length === 0 && page > 1) break;

      allRows.push(...(Array.isArray(payload) ? payload : [payload]));
      if (maxPages === 1) break;
      await new Promise((r) => setTimeout(r, 60));
    } catch {
      break;
    }
  }

  return allRows;
}

async function processInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

type CountResult = { value: number; ok: number; total: number };

async function fetchJobCount(): Promise<CountResult> {
  const sources = buildSources();
  let ok = 0;

  const batches = await processInBatches(sources, CONCURRENCY_LIMIT, async (source) => {
    try {
      const rawPayloads = await fetchFeed(source.spec);
      if (!rawPayloads || rawPayloads.length === 0) return [] as JobListing[];

      const jobs: JobListing[] = [];
      for (const payload of rawPayloads) {
        const extractedRows = source.extract(payload);
        const normalized = extractedRows
          .map((job) => normalizeJob(job, source.name))
          .filter((job): job is JobListing => job !== null);
        jobs.push(...normalized);
      }

      if (jobs.length > 0) ok += 1;
      return jobs;
    } catch {
      return [] as JobListing[];
    }
  });

  const allJobs = batches.flat();
  const uniqueJobsCount = dedupeJobs(allJobs).length;

  return { value: uniqueJobsCount, ok, total: sources.length };
}

let cache: { result: CountResult; at: number } | null = null;
let inflight: Promise<CountResult> | null = null;

async function getJobCount(): Promise<CountResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;

  if (!inflight) {
    inflight = fetchJobCount()
      .then((result) => {
        if (result.value > 0 || !cache) cache = { result, at: Date.now() };
        return cache.result;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/* -------------------------------------------------------------------------- */
/* SSE Streaming Endpoint with Milestone Tracker                              */
/* -------------------------------------------------------------------------- */

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  let closed = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let updateTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(updateTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(lifetimeTimer);
    try {
      streamController?.close();
    } catch {
      // closed by client
    }
  };

  const send = (data: unknown) => {
    if (closed || !streamController) return;
    try {
      streamController.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      cleanup();
    }
  };

  const sendCount = async () => {
    try {
      const { value, ok, total } = await getJobCount();
      
      let tier = "Under 1k";
      if (value >= 20000) tier = "20k+ Target Reached";
      else if (value >= 15000) tier = "15k+ Tier";
      else if (value >= 10000) tier = "10k+ Tier";
      else if (value >= 5000) tier = "5k+ Tier";
      else if (value >= 1000) tier = "1k+ Tier";

      send({ 
        type: "count", 
        value, 
        tier,
        sources: { ok, total }, 
        timestamp: Date.now() 
      });
    } catch {
      send({ type: "error", message: "Failed to fetch job count", timestamp: Date.now() });
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      streamController = controller;
      request.signal.addEventListener("abort", cleanup);

      controller.enqueue(encoder.encode("retry: 5000\n\n"));

      heartbeatTimer = setInterval(() => {
        send({ type: "heartbeat", timestamp: Date.now() });
      }, HEARTBEAT_INTERVAL_MS);

      updateTimer = setInterval(() => {
        void sendCount();
      }, UPDATE_INTERVAL_MS);

      lifetimeTimer = setTimeout(cleanup, MAX_STREAM_LIFETIME_MS);

      send({ type: "heartbeat", timestamp: Date.now() });
      await sendCount();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}