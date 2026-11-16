import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import QuizShareModal from "../../components/QuizShareModal";

const DEFAULT_SETTINGS = {
  quiz_name: "",
  quiz_code: "",
  duration_minutes: 30,
  random_questions: true,
  random_options: true,
  negative_marking: true,
  passing_marks: 0,
  maximum_students: null,
  camera_required: true,
  fullscreen_required: true,
  max_warnings: 3,
};

export default function CreateQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [quiz, setQuiz] = useState(null);
  const [csvResult, setCsvResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    if (!quizId) return;
    api.get(`/admin/quizzes/${quizId}`).then(({ data }) => {
      setQuiz(data);
      setSettings(data.settings);
    });
  }, [quizId]);

  const set = (key, value) => setSettings((s) => ({ ...s, [key]: value }));

  const saveSettings = async () => {
    setError("");
    setSaving(true);
    try {
      if (quizId) {
        const { data } = await api.put(`/admin/quizzes/${quizId}`, { settings });
        setQuiz(data);
      } else {
        const { data } = await api.post("/admin/quizzes", { settings });
        setQuiz(data);
        navigate(`/admin/quiz/${data.id}/edit`, { replace: true });
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to save quiz settings");
    } finally {
      setSaving(false);
    }
  };

  const uploadCsv = async (e) => {
    const file = e.target.files[0];
    if (!file || !quiz) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post(`/admin/quizzes/${quiz.id}/upload-csv`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCsvResult(data);
    } catch (e) {
      setError(e.response?.data?.detail || "CSV upload failed");
    }
  };

  const loadPreview = async () => {
    const { data } = await api.get(`/admin/quizzes/${quiz.id}/preview`);
    setPreview(data);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate("/admin/dashboard")} className="text-sm text-blue-600 mb-4">&larr; Back to dashboard</button>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{quizId ? "Edit Quiz" : "Create Quiz"}</h1>
        {quiz && (
          <button onClick={() => setShowShare(true)} className="bg-teal-600 text-white px-4 py-2 rounded font-medium hover:bg-teal-700 text-sm">
            Share QR / Link
          </button>
        )}
      </div>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">Quiz Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quiz Name">
            <input className="input" value={settings.quiz_name} onChange={(e) => set("quiz_name", e.target.value)} />
          </Field>
          <Field label="Quiz Code (leave blank to auto-generate)">
            <input className="input" value={settings.quiz_code} onChange={(e) => set("quiz_code", e.target.value.toUpperCase())} />
          </Field>
          <Field label="Duration (minutes)">
            <input type="number" className="input" value={settings.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} />
          </Field>
          <Field label="Passing Marks">
            <input type="number" className="input" value={settings.passing_marks} onChange={(e) => set("passing_marks", Number(e.target.value))} />
          </Field>
          <Field label="Maximum Students">
            <input type="number" className="input" value={settings.maximum_students || ""} onChange={(e) => set("maximum_students", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Max Warnings Before Auto-Submit">
            <input type="number" className="input" value={settings.max_warnings} onChange={(e) => set("max_warnings", Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          <Toggle label="Random Questions" checked={settings.random_questions} onChange={(v) => set("random_questions", v)} />
          <Toggle label="Random Options" checked={settings.random_options} onChange={(v) => set("random_options", v)} />
          <Toggle label="Negative Marking" checked={settings.negative_marking} onChange={(v) => set("negative_marking", v)} />
          <Toggle label="Camera Required" checked={settings.camera_required} onChange={(v) => set("camera_required", v)} />
          <Toggle label="Fullscreen Required" checked={settings.fullscreen_required} onChange={(v) => set("fullscreen_required", v)} />
        </div>
        <button onClick={saveSettings} disabled={saving} className="mt-6 bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </section>

      {quiz && (
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-2">Upload Questions (CSV)</h2>
          <p className="text-xs text-gray-500 mb-3">
            Columns: Question, Image, OptionA, OptionB, OptionC, OptionD, Correct, Marks, Negative
          </p>
          <input type="file" accept=".csv" onChange={uploadCsv} className="mb-3" />
          {csvResult && (
            <div className={`text-sm rounded p-3 ${csvResult.accepted ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              <p>{csvResult.valid_rows} valid, {csvResult.invalid_rows} invalid rows.</p>
              {!csvResult.accepted && (
                <ul className="list-disc list-inside mt-2 max-h-40 overflow-y-auto">
                  {csvResult.errors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
                </ul>
              )}
              {csvResult.accepted && <p className="font-medium mt-1">Questions saved to this quiz.</p>}
            </div>
          )}
          <button onClick={loadPreview} className="mt-4 text-sm text-blue-600 hover:underline">Preview questions</button>
          {preview && (
            <div className="mt-3 border-t pt-3 space-y-3 max-h-96 overflow-y-auto">
              {preview.questions.map((q, i) => (
                <div key={q.id} className="text-sm">
                  <p className="font-medium">{i + 1}. {q.question} <span className="text-gray-400">({q.marks} marks{q.negative ? `, ${q.negative} negative` : ""})</span></p>
                  <ul className="ml-4 text-gray-600">
                    {Object.entries(q.options).map(([k, v]) => (
                      <li key={k} className={q.correct.includes(k) ? "text-green-600 font-medium" : ""}>{k}. {v}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showShare && <QuizShareModal quiz={quiz} onClose={() => setShowShare(false)} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
