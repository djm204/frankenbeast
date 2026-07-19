#!/usr/bin/env python3
"""Automated PR reviewer with bounded diff ingestion."""

import json
import os
import re
import resource
import select
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(
    os.environ.get("PR_REVIEWER_WORKSPACE", str(Path(__file__).resolve().parents[1]))
).resolve()
DB_FILE = WORKSPACE / ".fbeast/scans.db"
AGY_PATH = os.environ.get("PR_REVIEWER_AGY_PATH", "agy")

# Read one sentinel byte past the payload boundary so truncation is detectable
# without buffering the complete PR diff. Both fetch paths share this byte cap.
MAX_DIFF_BYTES = 60_000
MAX_REVIEW_BYTES = 120_000
HTTP_TIMEOUT_SECONDS = 30
GH_DIFF_TIMEOUT_SECONDS = 30
AGY_TIMEOUT_SECONDS = 300
SECRET_PATTERN = re.compile(
    r"(?:github_pat_[a-zA-Z0-9_]{40,}|gh[opusr]_[a-zA-Z0-9]{36,}|"
    r"sk-ant-[a-zA-Z0-9_-]{40,}|AIzaSy[a-zA-Z0-9_-]{35})"
)
DIFF_TRUNCATION_MARKER = (
    f"\n... [DIFF TRUNCATED AFTER {MAX_DIFF_BYTES} BYTES] ..."
)
DIFF_TRUNCATION_NOTICE = (
    f"> ⚠️ Automated review inspected only the first {MAX_DIFF_BYTES} bytes "
    "of this PR diff; findings may not cover later changes.\n\n"
)


def init_db():
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS pr_reviews (
            pr_number INTEGER PRIMARY KEY,
            author TEXT,
            status TEXT,
            created_at TEXT,
            reviewed_at TEXT
        )
        """
    )
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(pr_reviews)")}
    if "head_sha" not in columns:
        cursor.execute("ALTER TABLE pr_reviews ADD COLUMN head_sha TEXT")
    conn.commit()
    conn.close()


def gh_environment():
    environment = os.environ.copy()
    token = environment.get("GITHUB_PERSONAL_ACCESS_TOKEN")
    if token and not environment.get("GH_TOKEN"):
        environment["GH_TOKEN"] = token
    return environment


def agy_environment():
    environment = os.environ.copy()
    for name in ("GITHUB_PERSONAL_ACCESS_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"):
        environment.pop(name, None)
    return environment


def limit_review_output_files():
    resource.setrlimit(
        resource.RLIMIT_FSIZE, (MAX_REVIEW_BYTES + 1, MAX_REVIEW_BYTES + 1)
    )


def get_open_prs():
    try:
        output = subprocess.check_output(
            [
                "gh",
                "pr",
                "list",
                "--state",
                "open",
                "--json",
                "number,author,headRefOid",
                "--limit",
                "10000",
            ],
            cwd=WORKSPACE,
            stderr=subprocess.DEVNULL,
            env=gh_environment(),
        ).decode("utf-8")
        return json.loads(output)
    except Exception as error:
        print(f"Error fetching open PRs: {error}", file=sys.stderr)
        raise


def decode_bounded_diff(payload):
    """Decode at most MAX_DIFF_BYTES and mark payloads that exceed the cap."""
    truncated = len(payload) > MAX_DIFF_BYTES
    diff = payload[:MAX_DIFF_BYTES].decode("utf-8", errors="replace")
    if truncated:
        diff += DIFF_TRUNCATION_MARKER
    return diff


def read_bounded_diff(stream):
    """Read one sentinel byte beyond the cap without buffering the full stream."""
    return decode_bounded_diff(stream.read(MAX_DIFF_BYTES + 1))


def read_process_stdout(process, timeout_seconds=GH_DIFF_TIMEOUT_SECONDS):
    """Read a process pipe with both byte and wall-clock bounds."""
    if process.stdout is None:
        return ""
    try:
        file_descriptor = process.stdout.fileno()
    except (AttributeError, OSError):
        return read_bounded_diff(process.stdout)

    deadline = time.monotonic() + timeout_seconds
    payload = bytearray()
    while len(payload) <= MAX_DIFF_BYTES:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(process.args, timeout_seconds)
        ready, _, _ = select.select([file_descriptor], [], [], remaining)
        if not ready:
            raise subprocess.TimeoutExpired(process.args, timeout_seconds)
        chunk = os.read(
            file_descriptor, min(8192, MAX_DIFF_BYTES + 1 - len(payload))
        )
        if not chunk:
            break
        payload.extend(chunk)
        if len(payload) > MAX_DIFF_BYTES:
            break
    return decode_bounded_diff(bytes(payload))


def read_gh_diff(pr_number):
    """Fetch a bounded diff from gh and terminate it once the cap is exceeded."""
    process = subprocess.Popen(
        ["gh", "pr", "diff", str(pr_number)],
        cwd=WORKSPACE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=gh_environment(),
    )
    if process.stdout is None:
        process.kill()
        process.wait()
        raise RuntimeError(f"gh pr diff for PR #{pr_number} did not provide stdout")

    try:
        diff = read_process_stdout(process)
        truncated = diff.endswith(DIFF_TRUNCATION_MARKER)
        process.stdout.close()
        if truncated and process.poll() is None:
            process.terminate()
        try:
            return_code = process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            return_code = process.wait()
        if not truncated and return_code != 0:
            raise RuntimeError(
                f"gh pr diff failed for PR #{pr_number} with exit code {return_code}"
            )
        return diff
    except Exception:
        process.stdout.close()
        process.kill()
        process.wait()
        raise


def get_repository():
    configured = os.environ.get("PR_REVIEWER_REPOSITORY")
    if configured:
        return configured
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=WORKSPACE,
        check=True,
        capture_output=True,
        text=True,
    )
    remote = result.stdout.strip()
    match = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$", remote)
    if not match:
        raise RuntimeError(f"Unable to derive GitHub repository from origin: {remote}")
    return match.group(1)


def get_pr_diff(pr_number):
    pat = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", "")
    repository = get_repository()
    url = f"https://api.github.com/repos/{repository}/pulls/{pr_number}"
    request = urllib.request.Request(url)
    if pat:
        request.add_header("Authorization", f"token {pat}")
    request.add_header("Accept", "application/vnd.github.v3.diff")
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return read_bounded_diff(response)
    except Exception as error:
        print(
            f"Error fetching diff via API for PR #{pr_number}: {error}",
            file=sys.stderr,
        )
        try:
            return read_gh_diff(pr_number)
        except Exception as fallback_error:
            print(
                f"Error fetching diff via gh for PR #{pr_number}: {fallback_error}",
                file=sys.stderr,
            )
            raise RuntimeError(
                f"Unable to fetch diff for PR #{pr_number} through API or gh"
            ) from fallback_error


def add_diff_truncation_notice(review_body, diff_content):
    if diff_content.endswith(DIFF_TRUNCATION_MARKER):
        return DIFF_TRUNCATION_NOTICE + review_body
    return review_body


def scan_diff_for_exploits(diff_content):
    warnings = []
    patterns = {
        "Obfuscated Code / Dynamic Execution": re.compile(
            r"eval\s*\(\s*(?:Buffer|atob|btoa|String\.fromCharCode|String\.raw|unescape|decodeURIComponent)|\bFunction\s*\("
        ),
        "Command Injection / Unsanitized Shell execution": re.compile(
            r"(?:child_process|exec|execSync|spawnSync)\s*\([^)]*shell\s*:\s*true"
        ),
        "Suspicious Remote Executable download": re.compile(
            r"https?://[^\s'\"]+\.(?:sh|py|pl|exe|bin|bat)"
        ),
        "Hardcoded Secret / API Key leak": SECRET_PATTERN,
        "Suspicious absolute system path writing": re.compile(
            r"write_to_file\s*\(\s*['\"]/(?:etc|usr|bin|var|opt)"
        ),
    }

    lines = diff_content.splitlines()
    for line_num, line in enumerate(lines, 1):
        if line.startswith("+") and not line.startswith("+++"):
            stripped = line[1:].strip()
            for label, regex in patterns.items():
                match = regex.search(stripped)
                if match:
                    safe_line = SECRET_PATTERN.sub("[REDACTED]", stripped)
                    warnings.append(
                        f"* **Line {line_num}** (`{label}`): `{safe_line}`"
                    )
    return warnings


def decode_agy_result(return_code, stdout, stderr):
    output_was_capped = len(stdout) > MAX_REVIEW_BYTES or (
        return_code != 0 and len(stdout) >= MAX_REVIEW_BYTES
    )
    if output_was_capped:
        return (
            stdout[:MAX_REVIEW_BYTES]
            + b"\n... [REVIEW OUTPUT TRUNCATED] ..."
        ).decode("utf-8", errors="replace")
    if return_code == 0:
        return stdout.decode("utf-8", errors="replace")
    print(
        f"Agy review failed: {stderr.decode('utf-8', errors='replace')}",
        file=sys.stderr,
    )
    return ""


def run_agy_review(diff_content):
    prompt = (
        "CRITICAL: Do NOT run any tools, read any files, or search the directory. "
        "Perform your review based SOLELY on the diff text provided below.\n\n"
        "You are an expert principal code reviewer. Analyze the following Git diff "
        "for a Pull Request. Identify critical bugs, security vulnerabilities (like "
        "input validation, command injections, authentication bypasses), performance "
        "bottlenecks, resource leaks, or structural issues. Write a constructive, "
        "professional code review report in markdown format. If there are major issues, "
        "provide specific, actionable code recommendations to fix them. If your "
        "suggestions/recommendations are optional (e.g. style, code cleanup, minor "
        "refactoring) and not critical blockers for merging, output 'VERDICT: APPROVE' "
        "as the final verdict. If there are critical issues, output "
        "'VERDICT: REQUEST_CHANGES'. Otherwise, output 'VERDICT: COMMENT'. "
        "Here is the diff:\n\n" + diff_content
    )

    try:
        with (
            tempfile.TemporaryFile() as stdin_file,
            tempfile.TemporaryFile() as stdout_file,
            tempfile.TemporaryFile() as stderr_file,
        ):
            stdin_file.write(prompt.encode("utf-8"))
            stdin_file.seek(0)
            process = subprocess.Popen(
                [AGY_PATH, "--sandbox", "--print"],
                cwd=WORKSPACE,
                stdin=stdin_file,
                stdout=stdout_file,
                stderr=stderr_file,
                env=agy_environment(),
                preexec_fn=limit_review_output_files,
            )
            try:
                return_code = process.wait(timeout=AGY_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                print("Agy review timed out.", file=sys.stderr)
                return ""
            stdout_file.seek(0)
            stdout = stdout_file.read(MAX_REVIEW_BYTES + 1)
            stderr_file.seek(0)
            stderr = stderr_file.read(MAX_REVIEW_BYTES + 1)
        return decode_agy_result(return_code, stdout, stderr)
    except Exception as error:
        print(f"Agy execution exception: {error}", file=sys.stderr)
        return ""


def parse_final_verdict(review_body):
    matches = re.findall(
        r"(?m)^VERDICT:\s*(APPROVE|REQUEST_CHANGES|COMMENT)\s*$", review_body
    )
    if not matches:
        return "comment"
    return {
        "APPROVE": "approve",
        "REQUEST_CHANGES": "request-changes",
        "COMMENT": "comment",
    }[matches[-1]]


def post_pr_review(pr_number, review_body, security_warnings, diff_truncated=False):
    verdict = "comment"
    if security_warnings:
        warning_header = (
            "### 🚨 Deterministic Security Scan: FAILED\n\n"
            "This PR contains code additions matching deterministic security filters "
            "for potential malicious activity. Inspect the flagged lines below very "
            "closely before merging:\n\n"
            + "\n".join(security_warnings)
            + "\n\n---\n\n"
        )
        review_body = warning_header + review_body
        verdict = "request-changes"
    elif diff_truncated:
        incomplete_header = (
            "### ⚠️ Deterministic Security Scan: INCOMPLETE\n\n"
            "The diff exceeded the ingestion limit, so no whole-PR security pass is "
            "claimed. Inspect the omitted changes before merging.\n\n---\n\n"
        )
        review_body = incomplete_header + review_body
        verdict = "request-changes"
    else:
        success_header = (
            "### 🛡️ Deterministic Security Scan: PASSED\n"
            "No malicious code, trojans, backdoors, dynamic obfuscation, or hardcoded "
            "secrets were detected in the PR additions.\n\n---\n\n"
        )
        review_body = success_header + review_body
        verdict = parse_final_verdict(review_body)

    temp_file = WORKSPACE / f".fbeast/pr_review_{pr_number}.md"
    try:
        temp_file.parent.mkdir(parents=True, exist_ok=True)
        temp_file.write_text(review_body)
        subprocess.check_call(
            ["gh", "pr", "review", str(pr_number), f"--{verdict}", "-F", str(temp_file)],
            cwd=WORKSPACE,
            env=gh_environment(),
        )
        print(f"Successfully posted {verdict} review on PR #{pr_number}")
        return True
    except Exception as error:
        print(f"Error posting review on PR #{pr_number}: {error}", file=sys.stderr)
        return False
    finally:
        if temp_file.exists():
            temp_file.unlink()


def process_prs():
    init_db()
    if not os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN"):
        print(
            "Error: GITHUB_PERSONAL_ACCESS_TOKEN must be set.",
            file=sys.stderr,
        )
        sys.exit(1)

    open_prs = get_open_prs()
    if not open_prs:
        print("No open PRs found.")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    for pull_request in open_prs:
        pr_number = pull_request["number"]
        author = pull_request["author"]["login"]
        head_sha = pull_request["headRefOid"]
        if author == "djm204":
            continue

        cursor.execute(
            "SELECT status, head_sha FROM pr_reviews WHERE pr_number = ?", (pr_number,)
        )
        row = cursor.fetchone()
        if row and row[0] == "completed" and row[1] == head_sha:
            print(
                f"PR #{pr_number} by {author} at {head_sha[:12]} has already been "
                "reviewed. Skipping."
            )
            continue

        print(f"Processing PR #{pr_number} by {author} at {head_sha[:12]}...")
        cursor.execute(
            "INSERT OR REPLACE INTO pr_reviews "
            "(pr_number, author, status, created_at, head_sha) VALUES (?, ?, ?, ?, ?)",
            (
                pr_number,
                author,
                "working",
                datetime.now(timezone.utc).isoformat(),
                head_sha,
            ),
        )
        conn.commit()

        diff_content = get_pr_diff(pr_number)
        if not diff_content.strip():
            print(f"Empty diff for PR #{pr_number}. Skipping.")
            cursor.execute(
                "UPDATE pr_reviews SET status = ? WHERE pr_number = ?",
                ("skipped", pr_number),
            )
            conn.commit()
            continue

        security_warnings = scan_diff_for_exploits(diff_content)
        diff_truncated = diff_content.endswith(DIFF_TRUNCATION_MARKER)
        review_body = run_agy_review(diff_content)
        if not review_body.strip():
            if security_warnings or diff_truncated:
                review_body = (
                    "### Automated model review unavailable\n\n"
                    "The model-backed review failed, but deterministic guardrails found "
                    "a blocking condition. Retry the full review after addressing it.\n\n"
                    "VERDICT: REQUEST_CHANGES"
                )
            else:
                print(
                    f"Could not generate review for PR #{pr_number}. Setting status as failed."
                )
                cursor.execute(
                    "UPDATE pr_reviews SET status = ? WHERE pr_number = ?",
                    ("failed", pr_number),
                )
                conn.commit()
                continue

        review_body = add_diff_truncation_notice(review_body, diff_content)
        posted = post_pr_review(
            pr_number,
            review_body,
            security_warnings,
            diff_truncated=diff_truncated,
        )
        status = "completed" if posted else "failed"
        cursor.execute(
            "UPDATE pr_reviews SET status = ?, reviewed_at = ? WHERE pr_number = ?",
            (status, datetime.now(timezone.utc).isoformat(), pr_number),
        )
        conn.commit()
    conn.close()


if __name__ == "__main__":
    process_prs()
