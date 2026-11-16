import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { connectSocket, disconnectSocket } from "../../services/socket";
import { useStudentAuth } from "../../context/AuthContext";
import { useAntiCheat } from "../../hooks/useAntiCheat";
import { useTimer } from "../../hooks/useTimer";
import QuestionPalette from "../../components/QuestionPalette";
import Timer from "../../components/Timer";
import CameraFeed from "../../components/CameraFeed";

export default function QuizEngine() {
  const { student, clearSession } = useStudentAuth();
  const navigate = useNavigate();

  const [palette, setPalette] = useState([]);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState([]);
  const [numerical, setNumerical] = useState("");
  const [markedForReview, setMarkedForReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
const [correctAnswer, setCorrectAnswer] = useState([]);
const [answerFeedback, setAnswerFeedback] = useState(null);
const answerTimerRef = useRef(null);
  const [toast, setToast] = useState(null);
  const questionStartRef = useRef(Date.now());
  const submittedRef = useRef(false);
  const onCameraStatusChange = useCallback(() => {}, []);

  const handleSubmit = useCallback(async (reason = "manual") => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await api.post("/student/submit", { reason });
    } catch (e) {
      console.warn("submit failed", e);
    } finally {
      disconnectSocket();
      clearSession();
      navigate("/thank-you");
    }
  }, [clearSession, navigate]);

  const { warningCount } = useAntiCheat({
    enabled: !submitting,
    onAutoSubmit: (reason) => handleSubmit(reason),
    cameraRequired: student?.camera_required,
    fullscreenRequired: student?.fullscreen_required,
  });

  const { remaining, formatted, syncRemaining } = useTimer(
    Math.round(student?.remaining_seconds ?? student?.duration_seconds ?? 0),
    () => handleSubmit("auto_timeout")
  );
useEffect(() => {
  return () => {
    if (answerTimerRef.current) {
      clearTimeout(answerTimerRef.current);
    }
  };
}, []);
  // Connect once for quiz-end pushes and the application heartbeat.
  useEffect(() => {
    const token = localStorage.getItem("student_token");
    const socket = connectSocket(token, "student");
    const onQuizEnd = () => handleSubmit("forced_by_admin");
    socket.on("quiz_end", onQuizEnd);
    return () => socket.off("quiz_end", onQuizEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- application-level heartbeat (also the timer-resync channel) ----
  // Distinct from socket.io's own transport ping/pong: this tells the
  // server "the student is actively on the quiz screen," which is what
  // powers the "stale" flag on the admin Monitor page (a backgrounded/
  // throttled tab can keep the transport technically alive far longer than
  // this heartbeat would keep firing). The server's ack carries the true
  // remaining_seconds (see socket_manager.py's heartbeat handler), which we
  // feed straight into the timer -- this replaces what used to be a
  // separate GET /student/palette poll every 20s just for timer resync.
  useEffect(() => {
    const HEARTBEAT_MS = 15000;
    const interval = setInterval(() => {
      const socket = connectSocket(localStorage.getItem("student_token"), "student");
      if (socket.connected) {
        socket.emit("heartbeat", {}, (ack) => {
          if (ack?.remaining_seconds != null) syncRemaining(ack.remaining_seconds);
        });
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncRemaining]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await api.get("/student/palette");
      if (cancelled) return;
      setPalette(data.palette);
      const firstUnanswered = data.palette.find((p) => p.status === "not_visited") || data.palette[0];
      if (firstUnanswered) loadQuestion(firstUnanswered.question_id);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

 const loadQuestion = async (questionId) => {
  try {
    const { data } = await api.get(`/student/question/${questionId}`);

    setShowAnswer(false);
    setCorrectAnswer([]);
    setAnswerFeedback(null);

    setQuestion(data);
    setSelected(data.saved_answer || []);
    setNumerical("");
    setMarkedForReview(data.marked_for_review || false);
    questionStartRef.current = Date.now();
  } catch (e) {
      if (e.response?.status === 400) handleSubmit("auto_timeout");
    }
  };

  const refreshPalette = useCallback(async () => {
    const { data } = await api.get("/student/palette");
    setPalette(data.palette);
  }, []);

  const saveCurrentAnswer = useCallback(async (opts = {}) => {
    if (!question) return;
    const timeSpent = (Date.now() - questionStartRef.current) / 1000;
    try {
      await api.post("/student/answer", {
        question_id: question.question_id,
        selected_options: selected,
        numerical_answer: numerical || null,
        marked_for_review: opts.markReview ?? markedForReview,
        time_spent_seconds: timeSpent,
      });
      refreshPalette();
    } catch (e) {
      console.warn("autosave failed", e);
    }
  }, [question, selected, numerical, markedForReview, refreshPalette]);

  // autosave every 5s
  useEffect(() => {
    const interval = setInterval(() => saveCurrentAnswer(), 5000);
    return () => clearInterval(interval);
  }, [saveCurrentAnswer]);

  const toggleOption = (key) => {
    if (question.question_type === "mcq_multiple") {
      setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    } else {
      setSelected([key]);
    }
  };

  const goTo = async (questionId) => {
    await saveCurrentAnswer();
    loadQuestion(questionId);
  };

 const goNext = async () => {
  if (showAnswer) return;

  await saveCurrentAnswer();

  try {
    const { data } = await api.get(`/student/question/${question.question_id}`);

    const correct = data.correct_answer || data.correct_answers || [];

    const correctArray = Array.isArray(correct) ? correct : [correct];

    setCorrectAnswer(correctArray);

    const selectedArray =
      question.question_type === "numerical"
        ? [String(numerical).trim()]
        : selected;

    const normalizedSelected = selectedArray.map((v) => String(v).trim()).sort();
    const normalizedCorrect = correctArray.map((v) => String(v).trim()).sort();

    const isCorrect =
      normalizedSelected.length === normalizedCorrect.length &&
      normalizedSelected.every((value, index) => value === normalizedCorrect[index]);

    setAnswerFeedback(isCorrect ? "correct" : "incorrect");
    setShowAnswer(true);

    answerTimerRef.current = setTimeout(() => {
      const idx = palette.findIndex(
        (p) => p.question_id === question.question_id
      );

      const next = palette[idx + 1];

      if (next) {
        loadQuestion(next.question_id);
      }
    }, 3000);
  } catch (e) {
    console.warn("Could not evaluate answer", e);
  }
};
  const goPrev = async () => {
    await saveCurrentAnswer();
    const idx = palette.findIndex((p) => p.question_id === question.question_id);
    const prev = palette[idx - 1];
    if (prev) loadQuestion(prev.question_id);
  };

  const markReview = async () => {
    setMarkedForReview(true);
    await saveCurrentAnswer({ markReview: true });
  };

  if (!student || !question) return <div className="min-h-screen flex items-center justify-center">Loading quiz...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {toast && <div className="fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded shadow z-50">{toast}</div>}
      {warningCount > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow z-50 text-sm">
          Warning {warningCount} recorded — please follow the exam rules.
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <p className="font-semibold text-gray-800">{student.name}</p>
              <p className="text-sm text-gray-500">Question {question.index + 1} of {question.total}</p>
            </div>
            <Timer formatted={formatted} remaining={remaining} />
          </div>

          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4">
            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${((question.index + 1) / question.total) * 100}%` }} />
          </div>

          <p className="text-gray-800 font-medium mb-4">{question.question}</p>
          {question.image && <img src={question.image} alt="question" className="mb-4 max-h-64 rounded border" />}

          <div className="space-y-2 mb-6">
            {question.question_type === "numerical" ? (
              <input className="input" value={numerical} onChange={(e) => setNumerical(e.target.value)} placeholder="Enter numerical answer" />
            ) : (
              question.options.map((opt) => (
               <label
  key={opt.key}
  className={`flex items-center gap-3 border rounded px-3 py-2 ${
    showAnswer ? "cursor-not-allowed opacity-70" : "cursor-pointer"
  } ${
    selected.includes(opt.key)
      ? "border-blue-500 bg-blue-50"
      : "border-gray-200"
  }`}
>
                 <input
  type={question.question_type === "mcq_multiple" ? "checkbox" : "radio"}
  name="option"
  checked={selected.includes(opt.key)}
  onChange={() => toggleOption(opt.key)}
  disabled={showAnswer}
/>
                  <span><b>{opt.key}.</b> {opt.text}</span>
                </label>
              ))
            )}
          </div>
{showAnswer && (
  <div
    className={`mb-6 p-4 rounded-lg border ${
      answerFeedback === "correct"
        ? "bg-green-50 border-green-400 text-green-800"
        : "bg-red-50 border-red-400 text-red-800"
    }`}
  >
    <div className="font-bold text-lg mb-2">
      {answerFeedback === "correct"
        ? "✓ Correct Answer"
        : "✗ Incorrect Answer"}
    </div>

    <div>
      <span className="font-semibold">Correct answer: </span>
      {correctAnswer.join(", ")}
    </div>

    <div className="text-sm mt-2">
      Next question will appear in 3 seconds...
    </div>
  </div>
)}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <button
  onClick={goPrev}
  disabled={showAnswer}
  className="bg-gray-200 px-4 py-2 rounded font-medium hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
>
  Previous
</button>
             <button
  onClick={() => saveCurrentAnswer()}
  disabled={showAnswer}
  className="bg-gray-700 text-white px-4 py-2 rounded font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
>
  Save
</button>
<button
  onClick={markReview}
  disabled={showAnswer}
  className="bg-yellow-500 text-white px-4 py-2 rounded font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
>
  Mark for Review
</button>
              <button
  onClick={goNext}
  disabled={showAnswer}
  className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
>
  Next
</button>
            </div>
            <button onClick={() => { if (confirm("Submit the quiz now? This cannot be undone.")) handleSubmit("manual"); }}
                    disabled={submitting}
                    className="bg-red-600 text-white px-5 py-2 rounded font-medium hover:bg-red-700 disabled:opacity-50">
              {submitting ? "Submitting..." : "Submit Quiz"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {student.camera_required && (
            <div className="bg-white rounded-lg shadow p-3">
              <CameraFeed required={student.camera_required} captureSnapshots onStatusChange={onCameraStatusChange} />
            </div>
          )}
          <QuestionPalette palette={palette} currentIndex={question.index} onJump={(qid) => goTo(qid)} />
        </div>
      </div>
    </div>
  );
}
