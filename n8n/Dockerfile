# n8n with the expense-analyzer workflows baked in.
# On start, bootstrap/entrypoint.sh imports credentials (from env) and workflows, publishes them, then starts n8n.
ARG N8N_VERSION=2.49.7
FROM n8nio/n8n:${N8N_VERSION}
USER root
COPY --chown=node:node workflows/ /bootstrap/workflows/
COPY --chown=node:node test-workflows/ /bootstrap/test-workflows/
COPY --chown=node:node bootstrap/ /bootstrap/bin/
RUN chmod +x /bootstrap/bin/*.sh
USER node
ENTRYPOINT ["tini", "--", "/bootstrap/bin/entrypoint.sh"]
