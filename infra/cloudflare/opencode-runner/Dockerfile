FROM docker.io/cloudflare/sandbox:0.12.3-opencode

USER root

ARG DASHI_PPT_SKILL_REF=214f94452a908ad77103b181c910dafd494a0aed

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-noto-cjk git ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/chuspeeism/dashi-ppt-skill.git /tmp/dashi-ppt-skill \
  && test "$(git -C /tmp/dashi-ppt-skill rev-parse HEAD)" = "$DASHI_PPT_SKILL_REF" \
  && mv /tmp/dashi-ppt-skill/skills/dashiai-ppt /opt/dashiai-ppt \
  && rm -rf /tmp/dashi-ppt-skill \
  && npm --prefix /opt/dashiai-ppt/project ci --ignore-scripts --no-audit --no-fund

RUN cd /opt/dashiai-ppt/project \
  && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx --no-install playwright-core install --with-deps chromium-headless-shell

ENV DASHI_PPT_PROJECT_ROOT=/opt/dashiai-ppt/project
ENV DASHI_PPT_PREVIEW_HOST=127.0.0.1
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

WORKDIR /workspace

# The image contains the versioned skill and agent bundle used by every
# session. The worker still chooses the selected skills per request.
COPY runtime /workspace/runtime
