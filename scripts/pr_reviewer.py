#!/usr/bin/env python3
"""Automated PR reviewer with bounded diff ingestion."""

import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

WORKSPACE = Path(
    os.environ.get("PR_REVIEWER_WORKSPACE", str(Path(__file__).resolve().parents[1]))
)
DB_FILE = WORKSPACE / ".fbeast/scans.db"
AGY_PATH = os.environ.get("PR_REVIEWER_AGY_PATH", "agy")

# Read one sentinel byte past the payload boundary so truncation is detectable
# without buffering the complete PR diff. Both fetch paths share this byte cap.
MAX_DIFF_BYTES = 60_000
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
    conn.commit()
    conn.close()


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
                "number,author",
                "--limit",
                "50",
            ],
            cwd=WORKSPACE,
            stderr=subprocess.DEVNULL,
        ).decode("utf-8")
        return json.loads(output)
    except Exception as error:
        print(f"Error fetching open PRs: {error}", file=sys.stderr)
        return []


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


def read_gh_diff(pr_number):
    """Fetch a bounded diff from gh and terminate it once the cap is exceeded."""
    process = subprocess.Popen(
        ["gh", "pr", "diff", str(pr_number)],
        cwd=WORKSPACE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    if process.stdout is None:
        process.kill()
        process.wait()
        return ""

    try:
        diff = read_bounded_diff(process.stdout)
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
            return ""
        return diff
    except Exception:
        process.stdout.close()
        process.kill()
        process.wait()
        raise


def get_pr_diff(pr_number):
    pat = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", "")
    url = f"https://api.github.com/repos/djm204/frankenbeast/pulls/{pr_number}"
    request = urllib.request.Request(url)
    if pat:
        request.add_header("Authorization", f"token {pat}")
    request.add_header("Accept", "application/vnd.github.v3.diff")
    try:
        with urllib.request.urlopen(request) as response:
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
            return ""


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
        "Hardcoded Secret / API Key leak": re.compile(
            r"(?:github_pat_[a-zA-Z0-9_]{40,}|sk-ant-[a-zA-Z0-9_-]{40,}|AIzaSy[a-zA-Z0-9_-]{35})"
        ),
        "Suspicious absolute system path writing": re.compile(
            r"write_to_file\s*\(\s*['\"]/(?:etc|usr|bin|var|opt)"
        ),
    }

    lines = diff_content.splitlines()
    for line_num, line in enumerate(lines, 1):
        if line.startswith("+") and not line.startswith("+++"):
            stripped = line[1:].strip()
            for label, regex in patterns.items():
                if regex.search(stripped):
                    warnings.append(
                        f"* **Line {line_num}** (`{label}`): `{stripped}`"
                    )
    return warnings


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
        process = subprocess.Popen(
            [AGY_PATH, "--dangerously-skip-permissions", "--print", prompt],
            cwd=WORKSPACE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        stdout, stderr = process.communicate()
        if process.returncode == 0:
            return stdout.decode("utf-8")
        print(f"Agy review failed: {stderr.decode('utf-8')}", file=sys.stderr)
        return ""
    except Exception as error:
        print(f"Agy execution exception: {error}", file=sys.stderr)
        return ""


def post_pr_review(pr_number, review_body, security_warnings):
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
    else:
        success_header = (
            "### 🛡️ Deterministic Security Scan: PASSED\n"
            "No malicious code, trojans, backdoors, dynamic obfuscation, or hardcoded "
            "secrets were detected in the PR additions.\n\n---\n\n"
        )
        review_body = success_header + review_body
        if "VERDICT: APPROVE" in review_body:
            verdict = "approve"
        elif "VERDICT: REQUEST_CHANGES" in review_body:
            verdict = "request-changes"

    temp_file = WORKSPACE / f".fbeast/pr_review_{pr_number}.md"
    try:
        temp_file.write_text(review_body)
        subprocess.check_call(
            ["gh", "pr", "review", str(pr_number), f"--{verdict}", "-F", str(temp_file)],
            cwd=WORKSPACE,
        )
        print(f"Successfully posted {verdict} review on PR #{pr_number}")
    except Exception as error:
        print(f"Error posting review on PR #{pr_number}: {error}", file=sys.stderr)
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
        if author == "djm204":
            continue

        cursor.execute(
            "SELECT status FROM pr_reviews WHERE pr_number = ?", (pr_number,)
        )
        row = cursor.fetchone()
        if row and row[0] == "completed":
            print(f"PR #{pr_number} by {author} has already been reviewed. Skipping.")
            continue

        print(f"Processing new PR #{pr_number} by {author}...")
        cursor.execute(
            "INSERT OR REPLACE INTO pr_reviews "
            "(pr_number, author, status, created_at) VALUES (?, ?, ?, ?)",
            (pr_number, author, "working", datetime.utcnow().isoformat()),
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
        review_body = run_agy_review(diff_content)
        if not review_body.strip():
            print(f"Could not generate review for PR #{pr_number}. Setting status as failed.")
            cursor.execute(
                "UPDATE pr_reviews SET status = ? WHERE pr_number = ?",
                ("failed", pr_number),
            )
            conn.commit()
            continue

        review_body = add_diff_truncation_notice(review_body, diff_content)
        post_pr_review(pr_number, review_body, security_warnings)
        cursor.execute(
            "UPDATE pr_reviews SET status = ?, reviewed_at = ? WHERE pr_number = ?",
            ("completed", datetime.utcnow().isoformat(), pr_number),
        )
        conn.commit()
    conn.close()


if __name__ == "__main__":
    process_prs()
