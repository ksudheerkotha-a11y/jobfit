import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { EducationEntry, ExperienceEntry, FormatPrefs, Profile, ProjectEntry, SkillEntry } from "@/lib/types";

const RIGHT_TAB = 9350; // twips — matches default 1" Letter margins (6.5" usable width)
const HEADING_COLOR = "16150F";
const MUTED_COLOR = "55534A";
const RULE_COLOR = "D8D6CD";

function pt(fontSize: number, scale = 1): number {
  return Math.round(fontSize * scale * 2); // docx sizes are in half-points
}

function sectionHeading(text: string, fontSize: number, template: FormatPrefs["template"]) {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: template === "jake" ? 8 : 4,
        color: template === "jake" ? "16150F" : RULE_COLOR,
      },
    },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: pt(fontSize, 0.95), characterSpacing: 15 }),
    ],
  });
}

function entryTopLine(left: string, right: string, fontSize: number) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    spacing: { after: 40 },
    children: [
      new TextRun({ text: left, bold: true, size: pt(fontSize, 0.95) }),
      new TextRun({ text: `\t${right}`, size: pt(fontSize, 0.95) }),
    ],
  });
}

function bullet(text: string, fontSize: number) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 30 },
    children: [new TextRun({ text, size: pt(fontSize, 0.9) })],
  });
}

export type ResumeDocxInput = {
  profile: Profile | null;
  email: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillEntry[];
  prefs: FormatPrefs;
};

function buildStructuredResumeParagraphs(input: ResumeDocxInput): Paragraph[] {
  const { profile, email, education, experience, projects, skills, prefs } = input;
  const isJake = prefs.template === "jake";
  const fontSize = prefs.fontSize;
  const alignment = isJake ? AlignmentType.LEFT : AlignmentType.CENTER;
  const paragraphAlignment = prefs.align === "justified" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;

  const contactLine = [profile?.location, email, profile?.phone, profile?.linkedin_url].filter(Boolean).join(" · ");

  const skillsByCategory = skills.reduce<Record<string, SkillEntry[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: profile?.full_name || "Your name", bold: true, size: pt(fontSize, isJake ? 1.3 : 1.4) }),
      ],
    }),
    new Paragraph({
      alignment,
      spacing: { after: 200 },
      children: [new TextRun({ text: contactLine, size: pt(fontSize, 0.85), color: MUTED_COLOR })],
    }),
  ];

  for (const key of prefs.sectionOrder) {
    if (key === "summary" && profile?.professional_summary.trim()) {
      paragraphs.push(sectionHeading("Summary", fontSize, prefs.template));
      paragraphs.push(
        new Paragraph({
          alignment: paragraphAlignment,
          spacing: { after: 120 },
          children: [new TextRun({ text: profile.professional_summary, size: pt(fontSize) })],
        })
      );
    } else if (key === "experience" && experience.length > 0) {
      paragraphs.push(sectionHeading("Experience", fontSize, prefs.template));
      for (const e of experience) {
        paragraphs.push(
          entryTopLine(
            `${e.title}${e.company ? `, ${e.company}` : ""}`,
            `${e.start_date}${e.start_date ? "–" : ""}${e.end_date || "Present"}`,
            fontSize
          )
        );
        for (const b of e.bullets) paragraphs.push(bullet(b, fontSize));
      }
    } else if (key === "projects" && projects.length > 0) {
      paragraphs.push(sectionHeading("Projects", fontSize, prefs.template));
      for (const p of projects) {
        paragraphs.push(entryTopLine(p.title, p.link ?? "", fontSize));
        if (p.description) {
          paragraphs.push(
            new Paragraph({
              alignment: paragraphAlignment,
              spacing: { after: 40 },
              children: [new TextRun({ text: p.description, size: pt(fontSize, 0.95) })],
            })
          );
        }
        for (const b of p.bullets) paragraphs.push(bullet(b, fontSize));
      }
    } else if (key === "education" && education.length > 0) {
      paragraphs.push(sectionHeading("Education", fontSize, prefs.template));
      for (const e of education) {
        paragraphs.push(entryTopLine(`${e.degree}${e.field ? `, ${e.field}` : ""}`, e.school, fontSize));
      }
    } else if (key === "skills" && skills.length > 0) {
      paragraphs.push(sectionHeading("Skills", fontSize, prefs.template));
      for (const [category, items] of Object.entries(skillsByCategory)) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `${category}: `, bold: true, size: pt(fontSize, 0.95) }),
              new TextRun({ text: items.map((s) => s.skill).join(", "), size: pt(fontSize, 0.95) }),
            ],
          })
        );
      }
    }
  }

  return paragraphs;
}

function buildPlaintextParagraphs(text: string, fontSize: number): Paragraph[] {
  const lines = (text || "No resume text yet.").split("\n");
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: line || " ", size: pt(fontSize) })],
      })
  );
}

function buildCoverLetterParagraphs(text: string, fontSize: number): Paragraph[] {
  const lines = (text || "").split("\n");
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: line || " ", size: pt(fontSize) })],
      })
  );
}

function fontFamily(prefs: FormatPrefs): string {
  return prefs.font === "Times New Roman" ? "Times New Roman" : prefs.font;
}

async function packAndDownload(paragraphs: Paragraph[], font: string, filename: string) {
  const doc = new Document({
    sections: [{ children: paragraphs }],
    styles: { default: { document: { run: { font } } } },
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadResumeDocx(input: ResumeDocxInput, hasStructuredData: boolean, plainText: string) {
  const paragraphs = hasStructuredData
    ? buildStructuredResumeParagraphs(input)
    : buildPlaintextParagraphs(plainText, input.prefs.fontSize);
  await packAndDownload(paragraphs, fontFamily(input.prefs), "resume.docx");
}

export async function downloadCoverLetterDocx(text: string, prefs: FormatPrefs) {
  const paragraphs = buildCoverLetterParagraphs(text, prefs.fontSize);
  await packAndDownload(paragraphs, fontFamily(prefs), "cover-letter.docx");
}
