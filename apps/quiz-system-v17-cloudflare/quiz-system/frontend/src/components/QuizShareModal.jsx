import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { getPublicBaseUrl, setPublicBaseUrl } from "../utils/publicUrl";

/**
 * Per-quiz "Share" popup: a QR code + a plain copyable link, both pointing
 * at `${publicBaseUrl}/join?code=<QUIZ_CODE>`. A student who opens either
 * one lands directly on JoinQuiz.jsx with the quiz code already filled in
 * and locked -- they only type their name and roll number (see
 * JoinQuiz.jsx's `useSearchParams` handling for the other half of this
 * feature). The bare base URL (no /join, no code) instead goes to the admin
 * login screen -- see pages/RootGate.jsx -- so this link has to point at
 * /join explicitly rather than "/".
 *
 * `publicBaseUrl` is NOT just `window.location.origin` -- if you're running
 * this behind a Cloudflare Tunnel / ngrok while the admin still works from
 * localhost, the two are different. The "Public Base URL" field below lets
 * the admin pin the tunnel's public URL once; it's saved to localStorage and
 * reused for every quiz until changed. See utils/publicUrl.js.
 */
export default function QuizShareModal({ quiz, onClose }) {
  const [copied, setCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState(getPublicBaseUrl());
  const [editingBase, setEditingBase] = useState(false);
  const canvasWrapRef = useRef(null);

  if (!quiz) return null;

  const joinUrl = `${baseUrl}/join?code=${encodeURIComponent(quiz.code)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail on non-HTTPS/non-localhost origins; the
      // input field below is still selectable/copyable by hand as a fallback.
    }
  };

  const saveBaseUrl = () => {
    const clean = setPublicBaseUrl(baseUrl);
    setBaseUrl(clean || window.location.origin);
    setEditingBase(false);
  };

  const downloadQr = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${quiz.code}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-bold text-gray-800">Share Quiz</h2>
            <p className="text-sm text-gray-500">{quiz.name} &middot; <span className="font-mono">{quiz.code}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="bg-gray-50 border rounded p-2 mb-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Public Base URL</span>
            {!editingBase && (
              <button onClick={() => setEditingBase(true)} className="text-xs text-blue-600 hover:underline">Edit</button>
            )}
          </div>
          {editingBase ? (
            <div className="flex gap-2 mt-1">
              <input
                className="input text-xs font-mono"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-tunnel.trycloudflare.com"
                autoFocus
              />
              <button onClick={saveBaseUrl} className="bg-teal-600 text-white px-3 rounded text-xs font-medium hover:bg-teal-700 whitespace-nowrap">
                Save
              </button>
            </div>
          ) : (
            <p className="text-xs font-mono text-gray-700 mt-1 break-all">{baseUrl}</p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            Paste your Cloudflare Tunnel (or ngrok) URL here once — every quiz's link/QR will use it until you change it.
          </p>
        </div>

        <div ref={canvasWrapRef} className="flex justify-center bg-gray-50 rounded p-4 mb-4">
          <QRCodeCanvas value={joinUrl} size={200} includeMargin level="M" />
        </div>

        <p className="text-xs text-gray-500 mb-1">Scan or share this link — quiz code is pre-filled, students only enter name + roll number.</p>
        <div className="flex gap-2 mb-4">
          <input readOnly value={joinUrl} onFocus={(e) => e.target.select()} className="input text-xs font-mono" />
          <button onClick={copyLink} className="bg-blue-600 text-white px-3 rounded text-sm font-medium hover:bg-blue-700 whitespace-nowrap">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={downloadQr} className="flex-1 bg-gray-700 text-white rounded py-2 text-sm font-medium hover:bg-gray-800">
            Download QR
          </button>
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-700 rounded py-2 text-sm font-medium hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
