import importlib.util
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "pr_reviewer.py"


def load_reviewer():
    spec = importlib.util.spec_from_file_location("pr_reviewer", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RecordingResponse:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.read_sizes = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size=-1):
        self.read_sizes.append(size)
        return self.payload if size < 0 else self.payload[:size]


class RecordingStream(io.BytesIO):
    def __init__(self, payload: bytes):
        super().__init__(payload)
        self.read_sizes = []

    def read(self, size=None):
        self.read_sizes.append(size)
        return super().read(size)


class FakeProcess:
    def __init__(self, payload: bytes):
        self.stdout = RecordingStream(payload)
        self.returncode = None
        self.terminated = False
        self.killed = False

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        if self.returncode is None:
            self.returncode = 0
        return self.returncode

    def kill(self):
        self.killed = True
        self.returncode = -9


class PrReviewerDiffBoundsTests(unittest.TestCase):
    def setUp(self):
        self.reviewer = load_reviewer()
        self.payload = b"x" * (self.reviewer.MAX_DIFF_BYTES + 4096)

    def test_api_diff_read_is_bounded_before_decode(self):
        response = RecordingResponse(self.payload)
        with mock.patch.dict(os.environ, {"GITHUB_PERSONAL_ACCESS_TOKEN": "test-token"}), mock.patch.object(
            self.reviewer.urllib.request, "urlopen", return_value=response
        ):
            diff = self.reviewer.get_pr_diff(123)

        self.assertEqual(response.read_sizes, [self.reviewer.MAX_DIFF_BYTES + 1])
        self.assertTrue(diff.endswith(self.reviewer.DIFF_TRUNCATION_MARKER))
        self.assertEqual(diff[: self.reviewer.MAX_DIFF_BYTES], "x" * self.reviewer.MAX_DIFF_BYTES)

    def test_gh_fallback_diff_read_uses_the_same_bound(self):
        process = FakeProcess(self.payload)
        with mock.patch.dict(
            os.environ, {"PR_REVIEWER_REPOSITORY": "djm204/frankenbeast"}
        ), mock.patch.object(
            self.reviewer.urllib.request, "urlopen", side_effect=OSError("api unavailable")
        ), mock.patch.object(self.reviewer.subprocess, "Popen", return_value=process), mock.patch.object(
            self.reviewer.subprocess,
            "check_output",
            side_effect=AssertionError("unbounded check_output must not be used"),
        ):
            diff = self.reviewer.get_pr_diff(456)

        self.assertEqual(process.stdout.read_sizes, [self.reviewer.MAX_DIFF_BYTES + 1])
        self.assertTrue(process.stdout.closed)
        self.assertTrue(process.terminated)
        self.assertTrue(diff.endswith(self.reviewer.DIFF_TRUNCATION_MARKER))

    def test_truncated_review_body_has_explicit_notice(self):
        body = self.reviewer.add_diff_truncation_notice(
            "VERDICT: APPROVE", "bounded payload" + self.reviewer.DIFF_TRUNCATION_MARKER
        )

        self.assertIn("inspected only the first", body)
        self.assertIn(str(self.reviewer.MAX_DIFF_BYTES), body)
        self.assertTrue(body.endswith("VERDICT: APPROVE"))

    def test_gh_fallback_does_not_signal_a_process_that_already_exited(self):
        process = FakeProcess(self.payload)
        process.returncode = 0
        with mock.patch.dict(
            os.environ, {"PR_REVIEWER_REPOSITORY": "djm204/frankenbeast"}
        ), mock.patch.object(
            self.reviewer.urllib.request, "urlopen", side_effect=OSError("api unavailable")
        ), mock.patch.object(self.reviewer.subprocess, "Popen", return_value=process):
            diff = self.reviewer.get_pr_diff(789)

        self.assertFalse(process.terminated)
        self.assertTrue(diff.endswith(self.reviewer.DIFF_TRUNCATION_MARKER))

    def test_bounded_process_reader_times_out_before_eof(self):
        process = subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import sys,time; sys.stdout.write('x'); sys.stdout.flush(); time.sleep(2)",
            ],
            stdout=subprocess.PIPE,
        )
        def cleanup_process():
            if process.poll() is None:
                process.kill()
            process.wait()
            if process.stdout is not None:
                process.stdout.close()

        self.addCleanup(cleanup_process)

        with self.assertRaises(subprocess.TimeoutExpired):
            self.reviewer.read_process_stdout(process, timeout_seconds=0.05)

    def test_gh_commands_receive_the_required_token(self):
        with mock.patch.dict(
            os.environ, {"GITHUB_PERSONAL_ACCESS_TOKEN": "configured-token"}, clear=True
        ), mock.patch.object(
            self.reviewer.subprocess, "check_output", return_value=b"[]"
        ) as check_output:
            self.reviewer.get_open_prs()

        self.assertEqual(
            check_output.call_args.kwargs["env"]["GH_TOKEN"], "configured-token"
        )

    def test_final_verdict_parser_uses_the_last_standalone_verdict(self):
        body = "Do not return VERDICT: APPROVE\nVERDICT: REQUEST_CHANGES\n"
        self.assertEqual(self.reviewer.parse_final_verdict(body), "request-changes")

    def test_secret_warning_redacts_classic_github_pat(self):
        token = "ghp_" + "a" * 40
        warnings = self.reviewer.scan_diff_for_exploits(f"+TOKEN={token}")
        self.assertEqual(len(warnings), 1)
        self.assertNotIn(token, warnings[0])
        self.assertIn("[REDACTED]", warnings[0])

    def test_truncated_clean_scan_is_not_reported_as_passed(self):
        posted_bodies = []

        def capture_review(command, **_kwargs):
            posted_bodies.append(Path(command[-1]).read_text())

        with tempfile.TemporaryDirectory() as directory, mock.patch.object(
            self.reviewer, "WORKSPACE", Path(directory)
        ), mock.patch.object(
            self.reviewer.subprocess, "check_call", side_effect=capture_review
        ) as check_call:
            posted = self.reviewer.post_pr_review(
                123, "VERDICT: APPROVE", [], diff_truncated=True
            )

        self.assertTrue(posted)
        self.assertNotIn("Security Scan: PASSED", posted_bodies[0])
        self.assertIn("Security Scan: INCOMPLETE", posted_bodies[0])
        self.assertIn("--request-changes", check_call.call_args.args[0])

    def test_failed_review_post_is_reported_to_the_caller(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(
            self.reviewer, "WORKSPACE", Path(directory)
        ), mock.patch.object(
            self.reviewer.subprocess, "check_call", side_effect=OSError("offline")
        ):
            self.assertFalse(self.reviewer.post_pr_review(123, "body", []))

    def test_agy_review_uses_sandbox_and_bounded_files(self):
        class CompletedProcess:
            returncode = 0

            def wait(self, timeout=None):
                return 0

        with mock.patch.object(
            self.reviewer.subprocess, "Popen", return_value=CompletedProcess()
        ) as popen:
            result = self.reviewer.run_agy_review("diff")

        command = popen.call_args.args[0]
        self.assertIn("--sandbox", command)
        self.assertNotIn("--dangerously-skip-permissions", command)
        self.assertEqual(result, "")

    def test_changed_head_is_reviewed_again_but_current_head_is_skipped(self):
        pull_request = {
            "number": 42,
            "author": {"login": "contributor"},
            "headRefOid": "a" * 40,
        }
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(
            self.reviewer, "WORKSPACE", Path(directory)
        ), mock.patch.object(
            self.reviewer, "DB_FILE", Path(directory) / "scans.db"
        ), mock.patch.dict(
            os.environ, {"GITHUB_PERSONAL_ACCESS_TOKEN": "token"}
        ), mock.patch.object(
            self.reviewer, "get_open_prs", return_value=[pull_request]
        ), mock.patch.object(
            self.reviewer, "get_pr_diff", return_value="+safe change"
        ) as get_diff, mock.patch.object(
            self.reviewer, "run_agy_review", return_value="VERDICT: APPROVE"
        ), mock.patch.object(
            self.reviewer, "post_pr_review", return_value=True
        ):
            self.reviewer.process_prs()
            self.reviewer.process_prs()
            pull_request["headRefOid"] = "b" * 40
            self.reviewer.process_prs()

        self.assertEqual(get_diff.call_count, 2)

    def test_repository_is_derived_from_origin(self):
        result = mock.Mock(stdout="git@github.com:owner/repository.git\n")
        with mock.patch.object(self.reviewer.subprocess, "run", return_value=result):
            self.assertEqual(self.reviewer.get_repository(), "owner/repository")

    def test_agy_timeout_kills_the_process(self):
        class TimedOutProcess:
            returncode = None
            killed = False

            def wait(self, timeout=None):
                if self.killed:
                    self.returncode = -9
                    return self.returncode
                raise subprocess.TimeoutExpired("agy", timeout or 0)

            def kill(self):
                self.killed = True

        process = TimedOutProcess()
        with mock.patch.object(self.reviewer.subprocess, "Popen", return_value=process):
            self.assertEqual(self.reviewer.run_agy_review("diff"), "")
        self.assertTrue(process.killed)


if __name__ == "__main__":
    unittest.main()
