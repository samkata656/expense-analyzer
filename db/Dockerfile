# Postgres 18 + pgvector, with an init script that creates the app/n8n databases and roles.
FROM pgvector/pgvector:pg18
COPY init/ /docker-entrypoint-initdb.d/
RUN chmod +x /docker-entrypoint-initdb.d/*.sh
