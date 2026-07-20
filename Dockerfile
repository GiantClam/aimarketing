FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  git \
  python3 \
  python3-venv \
  fontconfig \
  fonts-dejavu-core \
  fonts-dejavu-extra \
  fonts-liberation \
  fonts-noto-cjk \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global opencode-ai@1.17.13

WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY tsconfig.json ./tsconfig.json

RUN npm ci --legacy-peer-deps

COPY lib/ai-runtime ./lib/ai-runtime
COPY infra/railway/opencode-runtime ./infra/railway/opencode-runtime
COPY infra/cloudflare/opencode-runner/runtime ./runtime

# Editable PPT uses OpenCode as the conversational runtime and the upstream
# native ppt-master skill for SVG/PPTX generation and quality checks.
ARG PPT_MASTER_REF=465e3b4149b852d33ddd1cb94ac059401fe4e823
RUN git init /opt/ppt-master \
  && git -C /opt/ppt-master remote add origin https://github.com/hugohe3/ppt-master.git \
  && git -C /opt/ppt-master fetch --depth 1 origin "$PPT_MASTER_REF" \
  && git -C /opt/ppt-master checkout --detach "$PPT_MASTER_REF" \
  && test "$(git -C /opt/ppt-master rev-parse HEAD)" = "$PPT_MASTER_REF" \
  && python3 -m venv /opt/ppt-master-venv \
  && /opt/ppt-master-venv/bin/pip install --no-cache-dir --retries 10 --timeout 120 -r /opt/ppt-master/requirements.txt \
  && mkdir -p /app/runtime/skills \
  && cp -R /opt/ppt-master/skills/ppt-master /app/runtime/skills/ppt-master \
  && test -f /app/runtime/skills/ppt-master/SKILL.md

ARG DASHI_PPT_SKILL_REF=fdbb145517ea0e289000aef9b7906bcb3e0cd19a
RUN git init /tmp/dashi-ppt-skill \
  && git -C /tmp/dashi-ppt-skill remote add origin https://github.com/chuspeeism/dashi-ppt-skill.git \
  && git -C /tmp/dashi-ppt-skill fetch --depth 1 origin "$DASHI_PPT_SKILL_REF" \
  && git -C /tmp/dashi-ppt-skill checkout --detach FETCH_HEAD \
  && test "$(git -C /tmp/dashi-ppt-skill rev-parse HEAD)" = "$DASHI_PPT_SKILL_REF" \
  && mv /tmp/dashi-ppt-skill/skills/dashi-ppt /opt/dashiai-ppt \
  && rm -rf /tmp/dashi-ppt-skill \
  && npm --prefix /opt/dashiai-ppt/project ci --ignore-scripts --no-audit --no-fund \
  && cd /opt/dashiai-ppt/project \
  && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx --no-install playwright-core install --with-deps chromium-headless-shell

RUN npx tsc -p infra/railway/opencode-runtime/tsconfig.json --noEmit

ENV OPENCODE_RUNTIME_DIR=/data/sessions
ENV OPENCODE_RUNTIME_BUNDLE_DIR=/app/runtime
ENV OPENCODE_RUNTIME_BUNDLE_VERSION=runtime-bundle-v2
ENV OPENCODE_RUN_TIMEOUT_MS=3600000
ENV OPENCODE_MAX_OUTPUT_BYTES=8388608
ENV DASHI_PPT_PROJECT_ROOT=/opt/dashiai-ppt/project
ENV DASHI_PPT_PREVIEW_HOST=127.0.0.1
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
ENV PPT_MASTER_REPO_DIR=/opt/ppt-master
ENV PPT_MASTER_PYTHON_BIN=/opt/ppt-master-venv/bin/python

CMD ["npx", "tsx", "infra/railway/opencode-runtime/src/server.ts"]
