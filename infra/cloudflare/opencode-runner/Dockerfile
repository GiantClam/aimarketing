FROM docker.io/cloudflare/sandbox:0.12.3-opencode

USER root

ARG DASHI_PPT_SKILL_REF=fdbb145517ea0e289000aef9b7906bcb3e0cd19a
ARG DASHI_PPT_EXPECTED_VERSION=0.4.4

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-noto-cjk git ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN git init /tmp/dashi-ppt-skill \
  && git -C /tmp/dashi-ppt-skill remote add origin https://github.com/chuspeeism/dashi-ppt-skill.git \
  && git -C /tmp/dashi-ppt-skill fetch --depth 1 origin "$DASHI_PPT_SKILL_REF" \
  && git -C /tmp/dashi-ppt-skill checkout --detach FETCH_HEAD \
  && mv /tmp/dashi-ppt-skill/skills/dashi-ppt /opt/dashiai-ppt \
  && rm -rf /tmp/dashi-ppt-skill \
  && npm --prefix /opt/dashiai-ppt/project ci --ignore-scripts --no-audit --no-fund \
  && node --input-type=module -e "import fs from 'node:fs'; const expected = process.env.DASHI_PPT_EXPECTED_VERSION; const pkg = JSON.parse(fs.readFileSync('/opt/dashiai-ppt/project/package.json', 'utf8')); if (pkg.version !== expected) throw new Error('Dashi runtime version mismatch: ' + pkg.version + ' != ' + expected); const skill = fs.readFileSync('/opt/dashiai-ppt/SKILL.md', 'utf8'); if (!skill.includes('当前版本: `' + expected + '`')) throw new Error('Dashi SKILL.md version mismatch: ' + expected);"

RUN cd /opt/dashiai-ppt/project \
  && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx --no-install playwright-core install --with-deps chromium-headless-shell

ENV DASHI_PPT_PROJECT_ROOT=/opt/dashiai-ppt/project
ENV DASHI_PPT_PREVIEW_HOST=127.0.0.1
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

WORKDIR /workspace

# The image contains the versioned skill and agent bundle used by every
# session. The worker still chooses the selected skills per request.
COPY runtime /workspace/runtime
