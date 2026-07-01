FROM node:22-bookworm-slim

ARG SANDBOX_UID=10001
ARG SANDBOX_GID=10001

RUN groupadd --gid "${SANDBOX_GID}" fbeast \
  && useradd --uid "${SANDBOX_UID}" --gid "${SANDBOX_GID}" --create-home --shell /usr/sbin/nologin fbeast \
  && mkdir -p /workspace \
  && chown -R "${SANDBOX_UID}:${SANDBOX_GID}" /workspace /home/fbeast

ENV HOME=/home/fbeast \
  NODE_ENV=production

WORKDIR /workspace
USER 10001:10001

CMD ["node", "--version"]
