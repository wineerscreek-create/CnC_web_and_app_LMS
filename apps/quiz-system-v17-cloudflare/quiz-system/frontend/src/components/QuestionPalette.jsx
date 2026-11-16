const COLORS = {
  answered: "bg-green-600 text-white",
  not_answered: "bg-red-600 text-white",
  review: "bg-yellow-500 text-white",
  not_visited: "bg-gray-300 text-gray-700",
};

export default function QuestionPalette({ palette, currentIndex, onJump }) {
  return (
    <div className="bg-white rounded-lg shadow p-3 w-full">
      <h3 className="text-sm font-semibold mb-2 text-gray-700">Question Palette</h3>
      <div className="grid grid-cols-5 gap-2">
        {palette.map((p) => (
          <button
            key={p.question_id}
            onClick={() => onJump(p.question_id, p.index)}
            className={`h-9 w-9 rounded text-xs font-medium flex items-center justify-center transition
              ${COLORS[p.status]} ${p.index === currentIndex ? "ring-2 ring-blue-500" : ""}`}
            title={`Question ${p.index + 1}: ${p.status.replace("_", " ")}`}
          >
            {p.index + 1}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-1 text-xs text-gray-600">
        <Legend color="bg-green-600" label="Answered" />
        <Legend color="bg-red-600" label="Not Answered" />
        <Legend color="bg-yellow-500" label="Marked for Review" />
        <Legend color="bg-gray-300" label="Not Visited" />
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm inline-block ${color}`} />
      <span>{label}</span>
    </div>
  );
}
