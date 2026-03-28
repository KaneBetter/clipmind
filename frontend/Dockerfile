FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Empty NEXT_PUBLIC_API_URL = relative URLs; Next.js rewrites proxy to backend
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Backend URL for Next.js rewrites (server-side proxy)
ARG API_BACKEND_URL=http://localhost:8000
ENV API_BACKEND_URL=$API_BACKEND_URL

RUN npm run build

# --- Production runner ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static .next/static
COPY --from=builder /app/public public

EXPOSE 3000

CMD ["node", "server.js"]
