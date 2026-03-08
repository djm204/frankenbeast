# Design: Hello World

## Overview

Create a single file `hello.txt` with the content "Hello World".

## Requirements

- Create file `hello.txt` at the project root
- File content: exactly `Hello World`

## Success Criteria

- `hello.txt` exists
- Running `cat hello.txt` outputs `Hello World`

## Verification Command

```bash
test -f hello.txt && grep -q "Hello World" hello.txt
```
