import importlib.util
import io
import os
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
        with mock.patch.object(
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
        with mock.patch.object(
            self.reviewer.urllib.request, "urlopen", side_effect=OSError("api unavailable")
        ), mock.patch.object(self.reviewer.subprocess, "Popen", return_value=process):
            diff = self.reviewer.get_pr_diff(789)

        self.assertFalse(process.terminated)
        self.assertTrue(diff.endswith(self.reviewer.DIFF_TRUNCATION_MARKER))


if __name__ == "__main__":
    unittest.main()
