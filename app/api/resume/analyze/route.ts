import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import type { ResumeProfile } from "@/lib/jobs/types";
import { extractResumeProfile } from "@/lib/resume/extract-profile";

export const runtime = "nodejs";

const maxResumeBytes = 10 * 1024 * 1024;
const maxResumePages = 80;

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxResumeBytes + 64 * 1024) {
      return Response.json({ error: "The resume must be no larger than 10 MB." }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("resume");
    if (!(file instanceof File)) {
      return Response.json({ error: "Choose a PDF or DOCX resume to continue." }, { status: 400 });
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "pdf" && extension !== "docx") {
      return Response.json({ error: "Only PDF and DOCX resumes are supported." }, { status: 400 });
    }
    if (file.size === 0 || file.size > maxResumeBytes) {
      return Response.json({ error: "The resume must be larger than 0 bytes and no larger than 10 MB." }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let resumeText = "";

    if (extension === "pdf") {
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
        return Response.json({ error: "This file does not appear to be a valid PDF." }, { status: 400 });
      }

      let loadingTask;
      let pdf;
      try {
        loadingTask = getDocument({ data: bytes, useSystemFonts: true });
        pdf = await loadingTask.promise;
      } catch (error) {
        console.error("PDF resume parsing failed:", error);
        return Response.json({ error: "This PDF could not be opened. Try exporting it again." }, { status: 400 });
      }

      if (pdf.numPages > maxResumePages) {
        await loadingTask.destroy();
        return Response.json({ error: `This resume has more than ${maxResumePages} pages. Upload a shorter PDF.` }, { status: 413 });
      }

      const pageTexts: string[] = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
        }
      } finally {
        await loadingTask.destroy();
      }
      resumeText = pageTexts.join(" ").slice(0, 250_000);
    } else {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        return Response.json({ error: "This file does not appear to be a valid DOCX document." }, { status: 400 });
      }
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      resumeText = result.value.slice(0, 250_000);
    }

    if (resumeText.replace(/\s/g, "").length < 30) {
      return Response.json({ error: "No readable text was found. Use a text-based PDF or DOCX." }, { status: 422 });
    }

    const profile: ResumeProfile = extractResumeProfile(resumeText);
    return Response.json({ profile, extractedTextLength: resumeText.length, analysisMethod: "local-rules" });
  } catch {
    return Response.json({ error: "Local resume analysis failed. You can still enter your profile manually." }, { status: 500 });
  }
}