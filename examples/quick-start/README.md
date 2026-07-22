# Frankenbeast Quick Start Example

This is the minimal dependency-free example used by `scripts/create-project.sh quick-start`. It verifies that the example scaffold and its environment-file handling work before you configure an AI provider.

```bash
npm ci
cp .env.example .env
npm start
```

From the Frankenbeast repository root, the supported shortcut performs all three setup steps in a fresh target directory:

```bash
npm run create:project -- quick-start ../my-frankenbeast-app
```

The script prints `FRANKENBEAST_EXAMPLE_MESSAGE` from `.env`, or a built-in greeting when the variable is absent.
