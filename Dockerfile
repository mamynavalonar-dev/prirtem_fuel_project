# Build client
FROM node:20-alpine AS client
WORKDIR /work/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client ./
RUN npm run build

# Build server
FROM node:20-alpine
WORKDIR /work/server
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server ./

# Copy built client into server public
COPY --from=client /work/client/dist ./public

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/index.js"]
