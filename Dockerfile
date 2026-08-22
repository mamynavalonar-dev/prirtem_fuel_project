# Build client
FROM node:22-alpine AS client
WORKDIR /work/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
RUN npm run build

# Build server
FROM node:22-alpine
WORKDIR /work/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server ./

# Copy built client into server public
COPY --from=client /work/client/dist ./public

ENV NODE_ENV=production
EXPOSE 3001
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
