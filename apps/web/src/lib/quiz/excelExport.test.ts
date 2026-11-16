import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAssessmentResultsToExcel, StudentResultRow } from './excelExport';

describe('Excel Export with Embedded Camera Photos', () => {
  beforeEach(() => {
    // Mock URL and document.createElement
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('generates an .xlsx workbook with Results and Camera Snapshots worksheets', async () => {
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
        warnings: 1,
        sessionId: 'session-bob',
      },
    ];

    const mockSamples = [
      {
        session_id: 'session-alice',
        name: 'Alice Johnson',
        roll_number: 'CS-001',
        snapshots: [validBase64Jpeg, validBase64Jpeg],
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
      mockSamples
    );

    expect(clicked).toBe(true);
    expect(downloadedFileName).toBe('Midterm_Exam_results_with_camera_snapshots.xlsx');
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  }, 15000);
});
