FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  python3 \
  python3-pip \
  python3-venv \
  fontconfig \
  fonts-dejavu-core \
  fonts-dejavu-extra \
  fonts-liberation \
  fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY tsconfig.json ./tsconfig.json

RUN npm ci --legacy-peer-deps

COPY lib ./lib
COPY infra/railway/ppt-master-worker ./infra/railway/ppt-master-worker

# The hosted worker must accept the public auto-4 contract; fail the image build
# if an older template-selection guard is accidentally copied into the image.
RUN ! grep -q "ppt_master_template_selection_required" lib/lead-tools/generation-ppt-fixed.ts

ARG PPT_MASTER_REF=68bd7a24e2bbab87bbaa600a367b60b56eb3e0ae
RUN git init /opt/ppt-master \
  && git -C /opt/ppt-master remote add origin https://github.com/hugohe3/ppt-master.git \
  && git -C /opt/ppt-master fetch --depth 1 origin "$PPT_MASTER_REF" \
  && git -C /opt/ppt-master checkout --detach FETCH_HEAD \
  && test "$(git -C /opt/ppt-master rev-parse HEAD)" = "$PPT_MASTER_REF" \
  && test -f /opt/ppt-master/skills/ppt-master/templates/brands/google/templates/design_spec.md \
  && test -d /opt/ppt-master/skills/ppt-master/templates/layouts/presentation_core/templates

RUN python3 -m venv /opt/ppt-master-venv \
  && for attempt in 1 2 3; do \
    /opt/ppt-master-venv/bin/pip install --no-cache-dir --retries 10 --timeout 120 -r /opt/ppt-master/requirements.txt && exit 0; \
    if [ "$attempt" = "3" ]; then exit 1; fi; \
    echo "pip install attempt $attempt failed, retrying..."; \
    sleep 5; \
  done

ENV PATH=/opt/ppt-master-venv/bin:${PATH}
ENV PPT_MASTER_REPO_DIR=/opt/ppt-master
ENV PPT_MASTER_PYTHON_BIN=/opt/ppt-master-venv/bin/python
ENV PPT_WORKER_RUNTIME_PROFILE=railway-linux

RUN npx tsc -p infra/railway/ppt-master-worker/tsconfig.json --noEmit

CMD ["npx", "tsx", "infra/railway/ppt-master-worker/src/server.ts"]
