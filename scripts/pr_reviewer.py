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
MAX_REVIEW_BODY_CHARS = 60_000
MAX_ERROR_CHARS = 1_000
REVIEW_BODY_TRUNCATION_NOTICE = "\n\n... [REVIEW BODY TRUNCATED BEFORE POSTING] ..."
HTTP_TIMEOUT_SECONDS = 30
GH_LIST_TIMEOUT_SECONDS = 30
GH_DIFF_TIMEOUT_SECONDS = 30
AGY_TIMEOUT_SECONDS = 300
SECRET_PATTERN = re.compile(
    r"(?:github_pat_[a-zA-Z0-9_]{40,}|gh[opusr]_[a-zA-Z0-9]{36,}|"
    r"sk-ant-[a-zA-Z0-9_-]{40,}|sk-(?:proj-)?[a-zA-Z0-9_-]{20,}|"
    r"AIza[a-zA-Z0-9_-]{35})"
)
SENSITIVE_ERROR_VALUE_PATTERN = re.compile(
    r"(?i)(authorization\s*:\s*(?:bearer|token)\s+|"
    r"(?<![a-zA-Z0-9_])[\"']?(?:(?:access|refresh|id)[_-]?token|"
    r"client[_-]?secret|token|password|secret|api[_-]?key)[\"']?\s*[=:]\s*)"
    r"(?:\"[^\"]*\"|'[^']*'|[^\s,;}]+)"
)
LAST_AGY_ERROR = None
LAST_POST_ERROR = None
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
    migrations = {
        "head_sha": "TEXT",
        "attempt_count": "INTEGER NOT NULL DEFAULT 0",
        "last_error": "TEXT",
        "last_attempt_at": "TEXT",
    }
    for column, declaration in migrations.items():
        if column not in columns:
            cursor.execute(
                f"ALTER TABLE pr_reviews ADD COLUMN {column} {declaration}"
            )
    conn.commit()
    conn.close()


def error_diagnostic(stage, error):
    """Return bounded JSON diagnostics with common credential forms redacted."""
    messages = []
    seen = set()
    current = error
    while current is not None and id(current) not in seen and len(messages) < 4:
        seen.add(id(current))
        messages.append(str(current) or "unknown failure")
        if not isinstance(current, BaseException):
            break
        next_error = current.__cause__
        if next_error is None and not current.__suppress_context__:
            next_error = current.__context__
        current = next_error
    message = " <- caused by: ".join(messages)
    message = SECRET_PATTERN.sub("[REDACTED]", message)
    message = SENSITIVE_ERROR_VALUE_PATTERN.sub(r"\1[REDACTED]", message)
    message = " ".join(message.split())
    payload = json.dumps(
        {"stage": stage, "message": message}, separators=(",", ":")
    )
    if len(payload) <= MAX_ERROR_CHARS:
        return payload
    overflow = len(payload) - MAX_ERROR_CHARS
    message = message[: max(0, len(message) - overflow - 3)] + "..."
    return json.dumps(
        {"stage": stage, "message": message}, separators=(",", ":")
    )


def begin_review_attempt(cursor, pr_number, author, head_sha):
    attempted_at = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        INSERT INTO pr_reviews (
            pr_number, author, status, created_at, head_sha,
            attempt_count, last_attempt_at, last_error
        ) VALUES (?, ?, 'working', ?, ?, 1, ?, NULL)
        ON CONFLICT(pr_number) DO UPDATE SET
            author = excluded.author,
            status = 'working',
            created_at = excluded.created_at,
            reviewed_at = NULL,
            head_sha = excluded.head_sha,
            attempt_count = COALESCE(pr_reviews.attempt_count, 0) + 1,
            last_attempt_at = excluded.last_attempt_at
        """,
        (pr_number, author, attempted_at, head_sha, attempted_at),
    )


def update_review_state(
    cursor, pr_number, status, stage=None, error=None, reviewed=False
):
    diagnostic = error_diagnostic(stage, error) if stage else None
    reviewed_at = datetime.now(timezone.utc).isoformat() if reviewed else None
    cursor.execute(
        "UPDATE pr_reviews SET status = ?, reviewed_at = ?, last_error = ? "
        "WHERE pr_number = ?",
        (status, reviewed_at, diagnostic, pr_number),
    )


def github_token():
    return (
        os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
        or os.environ.get("GH_TOKEN")
        or os.environ.get("GITHUB_TOKEN")
        or ""
    )


def gh_environment():
    environment = os.environ.copy()
    token = github_token()
    if token:
        environment["GH_TOKEN"] = token
    return environment


def agy_environment():
    # The reviewer consumes attacker-controlled PR content. Give the model runner
    # only process essentials and explicitly supported provider credentials.
    allowed_names = {
        "PATH",
        "HOME",
        "USER",
        "LOGNAME",
        "SHELL",
        "TMPDIR",
        "TEMP",
        "TMP",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "XDG_CONFIG_HOME",
        "XDG_CACHE_HOME",
        "XDG_DATA_HOME",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "OPENROUTER_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "GROQ_API_KEY",
        "MISTRAL_API_KEY",
        "XAI_API_KEY",
        "CEREBRAS_API_KEY",
        "TOGETHER_API_KEY",
        "FIREWORKS_API_KEY",
        "COHERE_API_KEY",
        "DEEPSEEK_API_KEY",
        "OLLAMA_API_KEY",
    }
    return {name: value for name, value in os.environ.items() if name in allowed_names}


def limit_review_output_files():
    resource.setrlimit(
        resource.RLIMIT_FSIZE, (MAX_REVIEW_BYTES + 1, MAX_REVIEW_BYTES + 1)
    )


def get_open_prs(repository=None):
    repository = repository or get_repository()
    try:
        output = subprocess.check_output(
            [
                "gh",
                "pr",
                "list",
                "--repo",
                repository,
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
            timeout=GH_LIST_TIMEOUT_SECONDS,
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


def read_gh_diff(pr_number, repository):
    """Fetch a bounded diff from gh and terminate it once the cap is exceeded."""
    process = subprocess.Popen(
        ["gh", "pr", "diff", str(pr_number), "--repo", repository],
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
    pat = github_token()
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
            return read_gh_diff(pr_number, repository)
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
    in_hunk = False
    for line_num, line in enumerate(lines, 1):
        if line.startswith("diff --git "):
            in_hunk = False
            continue
        if line.startswith("@@"):
            in_hunk = True
            continue
        is_file_header = not in_hunk and (
            line.startswith("+++ b/") or line.startswith("+++ /dev/null")
        )
        if line.startswith("+") and not is_file_header:
            stripped = line[1:].strip()
            for label, regex in patterns.items():
                match = regex.search(stripped)
                if match:
                    safe_line = SECRET_PATTERN.sub("[REDACTED]", stripped)
                    warnings.append(
                        f"* **Line {line_num}** (`{label}`): `{safe_line}`"
                    )
    return warnings


def diff_contains_secret(diff_content):
    """Return whether any diff line contains secret-shaped content."""
    return SECRET_PATTERN.search(diff_content) is not None


def decode_agy_result(return_code, stdout, stderr):
    global LAST_AGY_ERROR
    output_was_capped = len(stdout) > MAX_REVIEW_BYTES or (
        return_code != 0 and len(stdout) >= MAX_REVIEW_BYTES
    )
    if output_was_capped:
        return (
            stdout[:MAX_REVIEW_BYTES]
            + b"\n... [REVIEW OUTPUT TRUNCATED] ..."
            + b"\n\nVERDICT: REQUEST_CHANGES"
        ).decode("utf-8", errors="replace")
    decoded_stdout = stdout.decode("utf-8", errors="replace")
    if return_code == 0:
        return decoded_stdout
    decoded_stderr = stderr.decode("utf-8", errors="replace")
    LAST_AGY_ERROR = (
        decoded_stderr
        or decoded_stdout
        or f"reviewer exited with code {return_code}"
    )
    print(
        f"Agy review failed: {decoded_stderr}",
        file=sys.stderr,
    )
    return ""


def run_agy_review(diff_content):
    global LAST_AGY_ERROR
    LAST_AGY_ERROR = None
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
                LAST_AGY_ERROR = f"reviewer timed out after {AGY_TIMEOUT_SECONDS} seconds"
                print("Agy review timed out.", file=sys.stderr)
                return ""
            stdout_file.seek(0)
            stdout = stdout_file.read(MAX_REVIEW_BYTES + 1)
            stderr_file.seek(0)
            stderr = stderr_file.read(MAX_REVIEW_BYTES + 1)
        return decode_agy_result(return_code, stdout, stderr)
    except Exception as error:
        LAST_AGY_ERROR = str(error)
        print(f"Agy execution exception: {error}", file=sys.stderr)
        return ""


def parse_final_verdict(review_body):
    outside_code = []
    fence = None
    for line in review_body.splitlines():
        stripped = line.lstrip()
        fence_match = re.match(r"(`{3,}|~{3,})", stripped)
        if fence_match:
            marker = fence_match.group(1)[0]
            if fence is None:
                fence = marker
            elif fence == marker:
                fence = None
            continue
        if fence is not None or line.startswith(("    ", "\t")):
            continue
        outside_code.append(line)
    matches = re.findall(
        r"(?im)^\s*(?:(?:-|#{1,6})\s+)?[*_`~]*\s*VERDICT:\s*"
        r"(APPROVE|REQUEST[_ -]CHANGES|COMMENT)\s*[.!]?\s*[*_`~]*\s*$",
        "\n".join(outside_code),
    )
    if not matches:
        return "comment"
    normalized = re.sub(r"[ -]", "_", matches[-1].upper())
    return {
        "APPROVE": "approve",
        "REQUEST_CHANGES": "request-changes",
        "COMMENT": "comment",
    }[normalized]


def bound_review_body(review_body):
    if len(review_body) <= MAX_REVIEW_BODY_CHARS:
        return review_body
    available = MAX_REVIEW_BODY_CHARS - len(REVIEW_BODY_TRUNCATION_NOTICE)
    return review_body[:available] + REVIEW_BODY_TRUNCATION_NOTICE


def post_pr_review(
    pr_number,
    review_body,
    security_warnings,
    head_sha,
    diff_truncated=False,
    repository=None,
):
    global LAST_POST_ERROR
    LAST_POST_ERROR = None
    repository = repository or get_repository()
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

    review_body = bound_review_body(review_body)
    temp_file = WORKSPACE / f".fbeast/pr_review_{pr_number}.json"
    try:
        temp_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "body": review_body,
            "commit_id": head_sha,
            "event": {
                "approve": "APPROVE",
                "request-changes": "REQUEST_CHANGES",
                "comment": "COMMENT",
            }[verdict],
        }
        temp_file.write_text(json.dumps(payload), encoding="utf-8")
        subprocess.run(
            [
                "gh",
                "api",
                "--method",
                "POST",
                f"repos/{repository}/pulls/{pr_number}/reviews",
                "--input",
                str(temp_file),
            ],
            cwd=WORKSPACE,
            env=gh_environment(),
            check=True,
            capture_output=True,
            text=True,
        )
        print(f"Successfully posted {verdict} review on PR #{pr_number}")
        return True
    except Exception as error:
        details = getattr(error, "stderr", None) or getattr(error, "stdout", None)
        if isinstance(details, bytes):
            details = details.decode("utf-8", errors="replace")
        LAST_POST_ERROR = details or str(error)
        print(f"Error posting review on PR #{pr_number}: {error}", file=sys.stderr)
        return False
    finally:
        if temp_file.exists():
            temp_file.unlink()


def process_prs():
    global LAST_AGY_ERROR, LAST_POST_ERROR
    init_db()
    if not github_token():
        print(
            "Error: GITHUB_PERSONAL_ACCESS_TOKEN, GH_TOKEN, or GITHUB_TOKEN must be set.",
            file=sys.stderr,
        )
        sys.exit(1)

    repository = get_repository()
    open_prs = get_open_prs(repository)
    if not open_prs:
        print("No open PRs found.")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    fatal_failures = []
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
        begin_review_attempt(cursor, pr_number, author, head_sha)
        conn.commit()

        try:
            diff_content = get_pr_diff(pr_number)
        except Exception as error:
            print(
                f"Could not fetch diff for PR #{pr_number}: {error}",
                file=sys.stderr,
            )
            update_review_state(cursor, pr_number, "failed", "fetch", error)
            conn.commit()
            fatal_failures.append(f"PR #{pr_number}: diff could not be fetched")
            continue
        if not diff_content.strip():
            print(f"Empty diff for PR #{pr_number}. Skipping.")
            update_review_state(cursor, pr_number, "skipped")
            conn.commit()
            continue

        security_warnings = scan_diff_for_exploits(diff_content)
        diff_truncated = diff_content.endswith(DIFF_TRUNCATION_MARKER)
        secret_bearing_diff = diff_contains_secret(diff_content)
        model_review_unavailable = False
        if secret_bearing_diff:
            review_body = (
                "### Automated model review skipped\n\n"
                "The diff contains a value matching a secret pattern, so raw PR content "
                "was not sent to the model-backed reviewer. Remove or rotate the exposed "
                "credential, then rerun the full review.\n\n"
                "VERDICT: REQUEST_CHANGES"
            )
        else:
            LAST_AGY_ERROR = None
            review_body = run_agy_review(diff_content)
            model_review_unavailable = not review_body.strip()
            if model_review_unavailable and LAST_AGY_ERROR is None:
                LAST_AGY_ERROR = "model reviewer produced no result"
        if not review_body.strip():
            if security_warnings or diff_truncated:
                review_body = (
                    "### Automated model review unavailable\n\n"
                    "The model-backed review failed, but deterministic guardrails found "
                    "a blocking condition. Retry the full review after addressing it.\n\n"
                    "VERDICT: REQUEST_CHANGES"
                )
            else:
                review_body = (
                    "### Automated model review unavailable\n\n"
                    "The model-backed reviewer did not produce a result, so this review "
                    "fails closed. Restore the reviewer and rerun the full review before "
                    "merging.\n\n"
                    "VERDICT: REQUEST_CHANGES"
                )

        review_body = add_diff_truncation_notice(review_body, diff_content)
        try:
            current_prs = get_open_prs(repository)
        except Exception as error:
            update_review_state(cursor, pr_number, "failed", "fetch", error)
            conn.commit()
            fatal_failures.append(f"PR #{pr_number}: current head could not be fetched")
            continue
        current_head_sha = next(
            (
                item["headRefOid"]
                for item in current_prs
                if item["number"] == pr_number
            ),
            None,
        )
        if current_head_sha != head_sha:
            print(
                f"PR #{pr_number} head changed before posting; skipping stale review."
            )
            update_review_state(cursor, pr_number, "superseded")
            conn.commit()
            continue
        LAST_POST_ERROR = None
        posted = post_pr_review(
            pr_number,
            review_body,
            security_warnings,
            head_sha,
            diff_truncated=diff_truncated,
            repository=repository,
        )
        if posted:
            status = "incomplete" if model_review_unavailable else "completed"
            if model_review_unavailable:
                update_review_state(
                    cursor,
                    pr_number,
                    status,
                    "agent",
                    LAST_AGY_ERROR or "model reviewer produced no result",
                    reviewed=True,
                )
            else:
                update_review_state(cursor, pr_number, status, reviewed=True)
        else:
            status = "failed"
            update_review_state(
                cursor,
                pr_number,
                status,
                "post",
                LAST_POST_ERROR or "review could not be posted",
            )
            fatal_failures.append(f"PR #{pr_number}: review could not be posted")
        conn.commit()
    conn.close()
    if fatal_failures:
        raise RuntimeError("Automated PR reviewer failed: " + "; ".join(fatal_failures))


if __name__ == "__main__":
    process_prs()
