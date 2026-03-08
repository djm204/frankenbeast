# Chunk 01: hello

## Objective

Create a file called `hello.txt` with the content "Hello, Frankenbeast!".

## Success Criteria

- [ ] `hello.txt` exists
- [ ] Contains "Hello, Frankenbeast!"

## Verification Command

```bash
test -f hello.txt && grep -q "Hello, Frankenbeast!" hello.txt
```
