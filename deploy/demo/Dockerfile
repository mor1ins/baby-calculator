FROM node:24-alpine AS build
WORKDIR /app/design
COPY design/package*.json ./
RUN npm ci
COPY design/ ./
RUN npm run build
ARG REVISION
RUN node -e 'if (!/^[a-f0-9]{40}$/.test(process.env.REVISION)) throw Error("REVISION must be a commit SHA"); require("fs").writeFileSync("version.json", JSON.stringify({revision:process.env.REVISION}))'

FROM nginx:1.28-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY deploy/demo/nginx.conf /etc/nginx/conf.d/default.conf
# Publish only the runnable prototype, never source files, previews or internal docs.
COPY --from=build /app/design/index.html /app/design/prototype.js /app/design/reporting.js /app/design/insights.js /app/design/version.json /usr/share/nginx/html/
COPY --from=build /app/design/assets/ /usr/share/nginx/html/assets/
COPY --from=build /app/design/fonts/ /usr/share/nginx/html/fonts/
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=12 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
EXPOSE 80
