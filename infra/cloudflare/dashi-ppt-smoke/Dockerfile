FROM docker.io/cloudflare/sandbox:0.12.3-opencode

USER root

ARG DASHI_PPT_SKILL_REF=fdbb145517ea0e289000aef9b7906bcb3e0cd19a

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-noto-cjk \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN git init /tmp/dashi-ppt-skill \
  && git -C /tmp/dashi-ppt-skill remote add origin https://github.com/chuspeeism/dashi-ppt-skill.git \
  && git -C /tmp/dashi-ppt-skill fetch --depth 1 origin "$DASHI_PPT_SKILL_REF" \
  && git -C /tmp/dashi-ppt-skill checkout --detach FETCH_HEAD \
  && mv /tmp/dashi-ppt-skill/skills/dashi-ppt /opt/dashiai-ppt \
  && rm -rf /tmp/dashi-ppt-skill \
  && npm --prefix /opt/dashiai-ppt/project ci --ignore-scripts --no-audit --no-fund

# Ubuntu's Chromium package is a Snap-only stub. Install Playwright's
# headless-shell instead; Dashi resolves it through PLAYWRIGHT_BROWSERS_PATH.
RUN cd /opt/dashiai-ppt/project \
  && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
    npx --no-install playwright-core install --with-deps chromium-headless-shell

COPY smoke-goal.json /opt/dashiai-ppt/smoke-goal.json
COPY benchmark-10-goal.json /opt/dashiai-ppt/benchmark-10-goal.json

ENV DASHI_PPT_PROJECT_ROOT=/opt/dashiai-ppt/project
ENV DASHI_PPT_PREVIEW_HOST=127.0.0.1
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

WORKDIR /workspace
