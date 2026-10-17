# Enerlectra canonical runtime image.
# Install the root workspace and local enerlectra-core package together so
# npm resolves the file: dependency from the same source tree.
FROM node:24-alpine

WORKDIR /app
COPY . .

RUN npm ci --include=dev \
  && npm run build:client \
  && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=4000

USER node
EXPOSE 4000

# The server entrypoint enforces the V2 Supabase URL, anon key and service-role
# key at startup. Configure those secrets in the deployment environment.
CMD ["npm", "start"]
