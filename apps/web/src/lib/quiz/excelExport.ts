/**
 * Client-Side Excel Export with Embedded Camera Photos using ExcelJS.
 * Creates a two-sheet workbook: "Results" and "Camera Snapshots".
 */
import { getCameraSnapshotSamples } from "./cameraSnapshots";

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
  sessionId?: string;
  batchName?: string;
}

export async function exportAssessmentResultsToExcel(
  quizName: string,
  results: StudentResultRow[],
  cameraSamplesOverride?: Array<{ session_id: string; name: string; roll_number: string; snapshots: string[] }>
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
    resultSheet.addRow([
      item.rank,
      item.rollNumber,
      item.name,
      item.batchName || "—",
      item.marks,
      item.maxMarks,
      `${item.percentage}%`,
      item.passed ? "Pass" : "Fail",
      item.warnings || 0,
    ]);
  });

  resultSheet.columns.forEach((col) => {
    col.width = 16;
  });
  if (resultSheet.columns[2]) resultSheet.columns[2].width = 24;

  // Sheet 2: Camera Snapshots
  const cameraSheet = workbook.addWorksheet("Camera Snapshots");
  const snapshotColumns = [
    { header: "Student Name", key: "student", width: 22 },
    { header: "Roll Number", key: "roll", width: 16 },
    ...Array.from({ length: 10 }, (_, index) => ({
      header: `Snapshot ${index + 1}`,
      key: `snapshot${index + 1}`,
      width: 14,
    })),
  ];
  cameraSheet.columns = snapshotColumns;
  cameraSheet.getRow(1).font = { bold: true };
  cameraSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  cameraSheet.views = [{ state: "frozen", ySplit: 1 }];

  const samplesByRoll = new Map(cameraSamples.map((s) => [s.roll_number.toLowerCase(), s]));
  const samplesBySession = new Map(cameraSamples.map((s) => [s.session_id, s]));

  results.forEach((res) => {
    const studentSample =
      (res.sessionId ? samplesBySession.get(res.sessionId) : null) ||
      samplesByRoll.get((res.rollNumber || "").toLowerCase()) || {
        name: res.name,
        roll_number: res.rollNumber,
        snapshots: [],
      };

    const row = cameraSheet.addRow({
      student: studentSample.name,
      roll: studentSample.roll_number,
    });
    row.height = 92;

    studentSample.snapshots.slice(0, 10).forEach((image, index) => {
      try {
        const base64Data = image.includes(",") ? image.split(",")[1] : image;
        if (!base64Data) return;

        const imageId = workbook.addImage({
          base64: base64Data,
          extension: "jpeg",
        });

        cameraSheet.addImage(imageId, {
          tl: { col: index + 2, row: row.number - 1 },
          ext: { width: 68, height: 88 },
        });
      } catch (err) {
        console.warn("Failed to embed snapshot into Excel row", err);
      }
    });
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
