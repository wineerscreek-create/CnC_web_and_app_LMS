/**
 * Client-Side Excel Export with Embedded Camera Photos using ExcelJS.
 * Creates a two-sheet workbook: "Results" and "Camera Snapshots".
 */
import { getCameraSnapshotSamples } from "./cameraSnapshots";

export interface SnapshotItem {
  id?: string;
  timestamp?: string | number;
  eventType?: string;
  imageData?: string;
  frame?: string;
}

export interface StudentResultRow {
  rank: number;
  rollNumber: string;
  name: string;
  correct?: number;
  wrong?: number;
  skipped?: number;
  marks: number;
  maxMarks: number;
  percentage: number;
  passed: boolean;
  warnings?: number;
  warningCount?: number;
  sessionId?: string;
  attemptId?: string;
  assessmentId?: string;
  batchName?: string;
  submissionTimestamp?: string;
  completedAt?: string;
  status?: string;
  submissionReason?: string;
  snapshots?: Array<SnapshotItem | string>;
}

function formatSnapshotTimestamp(ts?: string | number): string {
  if (!ts) return "—";
  try {
    const d = typeof ts === "number" ? new Date(ts) : new Date(String(ts));
    if (isNaN(d.getTime())) return String(ts);
    return d.toISOString().replace("T", " ").substring(0, 19);
  } catch {
    return String(ts);
  }
}

export async function exportAssessmentResultsToExcel(
  quizName: string,
  results: StudentResultRow[],
  cameraSamplesOverride?: Array<{ session_id: string; name: string; roll_number: string; snapshots: string[] }>,
  options?: { assessmentId?: string }
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const cameraSamples = cameraSamplesOverride || getCameraSnapshotSamples();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SkillSharp LMS";
  workbook.created = new Date();

  // Sheet 1: Results Summary
  const resultSheet = workbook.addWorksheet("Results");
  const resultHeaders = [
    "Rank",
    "Roll Number",
    "Student Name",
    "Batch",
    "Marks",
    "Max Marks",
    "Percentage",
    "Result",
    "Warnings",
    "Submission Timestamp",
    "Attempt Status",
    "Submission Reason",
  ];
  resultSheet.addRow(resultHeaders);
  resultSheet.getRow(1).font = { bold: true };
  resultSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  resultSheet.views = [{ state: "frozen", ySplit: 1 }];

  results.forEach((item) => {
    const warningsCount = item.warnings ?? item.warningCount ?? 0;
    const subTime = item.submissionTimestamp || item.completedAt || "—";
    const status = item.status || (item.passed ? "Completed" : "Submitted");
    const reason = item.submissionReason || "—";

    resultSheet.addRow([
      item.rank,
      item.rollNumber || "—",
      item.name || "—",
      item.batchName || "—",
      item.marks,
      item.maxMarks,
      `${item.percentage}%`,
      item.passed ? "Pass" : "Fail",
      warningsCount,
      subTime,
      status,
      reason,
    ]);
  });

  resultSheet.columns.forEach((col, idx) => {
    if (idx === 0) col.width = 8;
    else if (idx === 1) col.width = 16;
    else if (idx === 2) col.width = 24;
    else if (idx === 3) col.width = 16;
    else if (idx === 9) col.width = 22;
    else if (idx === 11) col.width = 22;
    else col.width = 14;
  });

  // Sheet 2: Camera Snapshots
  const cameraSheet = workbook.addWorksheet("Camera Snapshots");
  const snapshotColumns = [
    { header: "Student Name", key: "student", width: 24 },
    { header: "Roll Number", key: "roll", width: 16 },
    { header: "Assessment ID", key: "assessmentId", width: 36 },
    { header: "Attempt ID", key: "attemptId", width: 36 },
    { header: "Snapshot Timestamp", key: "timestamp", width: 22 },
    { header: "Warning/Event Type", key: "eventType", width: 20 },
    { header: "Camera Snapshot", key: "snapshot", width: 24 },
  ];
  cameraSheet.columns = snapshotColumns;
  cameraSheet.getRow(1).font = { bold: true };
  cameraSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  cameraSheet.views = [{ state: "frozen", ySplit: 1 }];

  const samplesByRoll = new Map(cameraSamples.map((s) => [(s.roll_number || "").toLowerCase(), s]));
  const samplesBySession = new Map(cameraSamples.map((s) => [s.session_id, s]));

  const defaultAssessmentId = options?.assessmentId || results[0]?.assessmentId || quizName;

  results.forEach((res) => {
    const studentAssessmentId = res.assessmentId || defaultAssessmentId;
    const studentAttemptId = res.attemptId || res.sessionId || "—";

    // Gather snapshots from either res.snapshots (database) or live cameraSamples
    let rawSnapshots: Array<{ timestamp?: string | number; eventType?: string; image: string }> = [];

    if (res.snapshots && res.snapshots.length > 0) {
      rawSnapshots = res.snapshots.map((s) => {
        if (typeof s === "string") {
          return { image: s, eventType: "PERIODIC" };
        }
        return {
          timestamp: s.timestamp,
          eventType: s.eventType || "PERIODIC",
          image: s.imageData || s.frame || "",
        };
      });
    } else {
      const fallbackSample =
        (res.sessionId ? samplesBySession.get(res.sessionId) : null) ||
        samplesByRoll.get((res.rollNumber || "").toLowerCase());
      if (fallbackSample && fallbackSample.snapshots.length > 0) {
        rawSnapshots = fallbackSample.snapshots.map((img) => ({
          image: img,
          eventType: "PERIODIC",
        }));
      }
    }

    if (rawSnapshots.length > 0) {
      rawSnapshots.forEach((snap) => {
        const row = cameraSheet.addRow({
          student: res.name || "—",
          roll: res.rollNumber || "—",
          assessmentId: studentAssessmentId,
          attemptId: studentAttemptId,
          timestamp: formatSnapshotTimestamp(snap.timestamp),
          eventType: snap.eventType || "PERIODIC",
          snapshot: "",
        });
        row.height = 68;

        try {
          const rawImg = snap.image || "";
          const base64Data = rawImg.includes(",") ? rawImg.split(",")[1].trim() : rawImg.trim();
          if (base64Data) {
            const imageId = workbook.addImage({
              base64: base64Data,
              extension: "jpeg",
            });

            // Column 7 (0-based index 6)
            cameraSheet.addImage(imageId, {
              tl: { col: 6, row: row.number - 1 },
              ext: { width: 96, height: 72 },
              editAs: "oneCell",
            });
          }
        } catch (err) {
          console.warn("Failed to embed snapshot image into Excel cell", err);
        }
      });
    } else {
      const row = cameraSheet.addRow({
        student: res.name || "—",
        roll: res.rollNumber || "—",
        assessmentId: studentAssessmentId,
        attemptId: studentAttemptId,
        timestamp: "—",
        eventType: "—",
        snapshot: "No camera snapshot available.",
      });
      row.height = 24;
      const snapCell = row.getCell(7);
      snapCell.font = { italic: true, color: { argb: "FF64748B" } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const safeName = quizName.replace(/[^a-zA-Z0-9_-]/g, "_");
  anchor.download = `${safeName}_results_with_camera_snapshots.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
