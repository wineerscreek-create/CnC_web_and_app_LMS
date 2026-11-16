import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * What "/" resolves to depends on how it was opened:
 *   - Admin opens the bare tunnel/site URL themselves right after starting
 *     it -> straight to the admin login screen. There's nothing useful for
 *     an admin to do at a bare "/" otherwise.
 *   - A student opens a QR code / share link, which always carries
 *     ?code=<QUIZ_CODE> (see components/QuizShareModal.jsx) -> straight to
 *     the join form with that code, at /join?code=... .
 *
 * This mirrors how the two roles actually arrive at the site: admins type
 * or bookmark the base URL, students only ever get here via a per-quiz
 * link/QR that already has a code attached. Manually entering a quiz code
 * with no link is still possible at /join directly (e.g. linked from the
 * admin login page, or bookmarked) -- this redirect only decides what the
 * bare "/" (no query string) should do.
 */
export default function RootGate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");

  useEffect(() => {
    if (code) {
      navigate(`/join?code=${encodeURIComponent(code)}`, { replace: true });
    } else {
      navigate("/admin/login", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
