FROM node:18-slim@sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --production
RUN npm cache clean --force
ENV NODE_ENV="production"
COPY . .
CMD [ "npm", "start" ]
