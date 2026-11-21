// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAssessmentResultsToExcel, StudentResultRow } from './excelExport';
import ExcelJS from 'exceljs';

describe('Excel Export with Embedded Camera Photos', () => {
  let capturedBlob: Blob | null = null;

  beforeEach(() => {
    capturedBlob = null;
    global.URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    });
    global.URL.revokeObjectURL = vi.fn();
  });

  it('generates an .xlsx workbook with Results and Camera Snapshots worksheets and verifies structure and embedded images', async () => {
    const validBase64Jpeg =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const mockResults: StudentResultRow[] = [
      {
        rank: 1,
        rollNumber: 'CS-001',
        name: 'Alice Johnson',
        batchName: 'CSE-3A',
        marks: 95,
        maxMarks: 100,
        percentage: 95,
        passed: true,
        warnings: 0,
        sessionId: 'session-alice',
        attemptId: 'att-alice-001',
        assessmentId: 'quiz-midterm-101',
        submissionTimestamp: '2026-11-21 14:30:00',
        status: 'Completed',
        submissionReason: 'STUDENT_MANUAL_SUBMIT',
        snapshots: [
          {
            timestamp: '2026-11-21T14:05:00Z',
            eventType: 'INITIAL',
            imageData: validBase64Jpeg,
          },
          {
            timestamp: '2026-11-21T14:15:00Z',
            eventType: 'PERIODIC',
            imageData: validBase64Jpeg,
          },
        ],
      },
      {
        rank: 2,
        rollNumber: 'CS-002',
        name: 'Bob Smith',
        batchName: 'CSE-3A',
        marks: 80,
        maxMarks: 100,
        percentage: 80,
        passed: true,
        warnings: 3,
        warningCount: 3,
        sessionId: 'session-bob',
        attemptId: 'att-bob-002',
        assessmentId: 'quiz-midterm-101',
        submissionTimestamp: '2026-11-21 14:40:00',
        status: 'Auto-Submitted',
        submissionReason: 'MAX_WARNINGS_EXCEEDED',
        snapshots: [], // Zero snapshots
      },
    ];

    let clicked = false;
    let downloadedFileName = '';
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = () => {
          clicked = true;
          downloadedFileName = (el as HTMLAnchorElement).download;
        };
      }
      return el;
    });

    await exportAssessmentResultsToExcel(
      'Midterm_Exam',
      mockResults,
      undefined,
      { assessmentId: 'quiz-midterm-101' }
    );

    expect(clicked).toBe(true);
    expect(downloadedFileName).toBe('Midterm_Exam_results_with_camera_snapshots.xlsx');
    expect(capturedBlob).not.toBeNull();

    // Verify generated workbook contents by loading back the blob buffer
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(capturedBlob!);
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);

    expect(wb.worksheets.map(ws => ws.name)).toEqual(['Results', 'Camera Snapshots']);

    // Inspect Sheet 1: Results
    const resSheet = wb.getWorksheet('Results')!;
    expect(resSheet.getRow(1).values).toEqual([
      undefined,
      'Rank', 'Roll Number', 'Student Name', 'Batch',
      'Marks', 'Max Marks', 'Percentage', 'Result', 'Warnings',
      'Submission Timestamp', 'Attempt Status', 'Submission Reason'
    ]);

    // Alice row
    const row2 = resSheet.getRow(2);
    expect(row2.getCell(1).value).toBe(1);
    expect(row2.getCell(2).value).toBe('CS-001');
    expect(row2.getCell(3).value).toBe('Alice Johnson');
    expect(row2.getCell(9).value).toBe(0); // Zero warnings verified

    // Bob row
    const row3 = resSheet.getRow(3);
    expect(row3.getCell(1).value).toBe(2);
    expect(row3.getCell(2).value).toBe('CS-002');
    expect(row3.getCell(3).value).toBe('Bob Smith');
    expect(row3.getCell(9).value).toBe(3); // 3 warnings verified
    expect(row3.getCell(12).value).toBe('MAX_WARNINGS_EXCEEDED');

    // Inspect Sheet 2: Camera Snapshots
    const camSheet = wb.getWorksheet('Camera Snapshots')!;
    expect(camSheet.getRow(1).values).toEqual([
      undefined,
      'Student Name', 'Roll Number', 'Assessment ID', 'Attempt ID',
      'Snapshot Timestamp', 'Warning/Event Type', 'Camera Snapshot'
    ]);

    // Alice has 2 snapshots -> rows 2 & 3
    const camRow2 = camSheet.getRow(2);
    expect(camRow2.getCell(1).value).toBe('Alice Johnson');
    expect(camRow2.getCell(2).value).toBe('CS-001');
    expect(camRow2.getCell(3).value).toBe('quiz-midterm-101');
    expect(camRow2.getCell(4).value).toBe('att-alice-001');
    expect(camRow2.getCell(6).value).toBe('INITIAL');

    const camRow3 = camSheet.getRow(3);
    expect(camRow3.getCell(1).value).toBe('Alice Johnson');
    expect(camRow3.getCell(6).value).toBe('PERIODIC');

    // Bob has 0 snapshots -> row 4
    const camRow4 = camSheet.getRow(4);
    expect(camRow4.getCell(1).value).toBe('Bob Smith');
    expect(camRow4.getCell(2).value).toBe('CS-002');
    expect(camRow4.getCell(7).value).toBe('No camera snapshot available.');

    // Verify embedded images in media
    const media = wb.model.media || [];
    expect(media.length).toBeGreaterThanOrEqual(1);
  }, 15000);
});
