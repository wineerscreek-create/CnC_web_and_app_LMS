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

function selectRepresentativeSnapshots<T>(snaps: T[], limit = 10): T[] {
  if (!snaps || snaps.length <= limit) return snaps ? [...snaps] : [];
  const n = snaps.length;
  const indices: number[] = [];
  for (let i = 0; i < limit; i++) {
    indices.push(Math.round((i * (n - 1)) / (limit - 1)));
  }
  for (let k = 1; k < indices.length; k++) {
    if (indices[k] <= indices[k - 1]) indices[k] = indices[k - 1] + 1;
  }
  for (let k = 0; k < indices.length; k++) {
    indices[k] = Math.min(indices[k], n - 1);
  }
  for (let k = indices.length - 2; k >= 0; k--) {
    if (indices[k] >= indices[k + 1]) indices[k] = Math.max(0, indices[k + 1] - 1);
  }
  return indices.map((idx) => snaps[idx]);
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

  const defaultAssessmentId = options?.assessmentId || results[0]?.assessmentId || quizName;

  // -------------------------------------------------------------
  // Sheet 1: Results Summary (All Result Columns Preserved)
  // -------------------------------------------------------------
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
    "Assessment ID",
    "Attempt ID",
    "Warning Count",
    "Event Type",
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
    const attId = item.attemptId || item.sessionId || "—";
    const assessmentId = item.assessmentId || defaultAssessmentId;

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
      assessmentId,
      attId,
      warningsCount,
      "None",
    ]);
  });

  resultSheet.columns.forEach((col, idx) => {
    if (idx === 0) col.width = 8;
    else if (idx === 1) col.width = 16;
    else if (idx === 2) col.width = 24;
    else if (idx === 3) col.width = 16;
    else if (idx === 9) col.width = 22;
    else if (idx === 11) col.width = 22;
    else if (idx === 12 || idx === 13) col.width = 36;
    else col.width = 14;
  });

  // -------------------------------------------------------------
  // Sheet 2: Camera Snapshots (Only Student Name, Roll Number & 10 Snapshots)
  // -------------------------------------------------------------
  const cameraSheet = workbook.addWorksheet("Camera Snapshots");
  const camHeaders = [
    "Student Name",
    "Roll Number",
    "Snapshot 1",
    "Snapshot 2",
    "Snapshot 3",
    "Snapshot 4",
    "Snapshot 5",
    "Snapshot 6",
    "Snapshot 7",
    "Snapshot 8",
    "Snapshot 9",
    "Snapshot 10",
  ];
  cameraSheet.addRow(camHeaders);
  cameraSheet.getRow(1).font = { bold: true };
  cameraSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  cameraSheet.views = [{ state: "frozen", ySplit: 1 }];

  cameraSheet.columns = [
    { width: 24 }, // Student Name
    { width: 16 }, // Roll Number
    ...Array(10).fill({ width: 22 }), // Snapshot 1-10
  ];

  const samplesByRoll = new Map(cameraSamples.map((s) => [(s.roll_number || "").toLowerCase(), s]));
  const samplesBySession = new Map(cameraSamples.map((s) => [s.session_id, s]));

  results.forEach((res) => {
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

    // Select up to 10 representative snapshots chronologically distributed
    const repSnapshots = selectRepresentativeSnapshots(rawSnapshots, 10);

    const row = cameraSheet.addRow([res.name || "—", res.rollNumber || "—", ...Array(10).fill("")]);
    row.height = 115;

    // Student Name & Roll Number formatting
    const nameCell = row.getCell(1);
    nameCell.font = { bold: true };
    nameCell.alignment = { horizontal: "left", vertical: "middle" };

    const rollCell = row.getCell(2);
    rollCell.alignment = { horizontal: "center", vertical: "middle" };

    for (let slotIdx = 0; slotIdx < 10; slotIdx++) {
      const colNum = 3 + slotIdx;
      const cell = row.getCell(colNum);

      if (slotIdx < repSnapshots.length) {
        const snap = repSnapshots[slotIdx];
        const tsFormatted = formatSnapshotTimestamp(snap.timestamp);
        cell.value = `\n\n\n\n\n${tsFormatted}`;
        cell.alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
        cell.font = { size: 8, color: { argb: "FF475569" } };

        try {
          const rawImg = snap.image || "";
          const base64Data = rawImg.includes(",") ? rawImg.split(",")[1].trim() : rawImg.trim();
          if (base64Data) {
            const imageId = workbook.addImage({
              base64: base64Data,
              extension: "jpeg",
            });

            cameraSheet.addImage(imageId, {
              tl: { col: 2 + slotIdx, row: row.number - 1 },
              ext: { width: 100, height: 75 },
              editAs: "oneCell",
            });
          }
        } catch (err) {
          console.warn("Failed to embed snapshot image into Excel cell", err);
          cell.value = `Image error\n${tsFormatted}`;
          cell.font = { size: 8, color: { argb: "FFEF4444" } };
        }
      } else {
        // Missing snapshot position marked as unavailable
        cell.value = "Unavailable";
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = { italic: true, size: 9, color: { argb: "FF94A3B8" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
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
