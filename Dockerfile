FROM node:18-alpine

LABEL maintainer="XinQing Youth AI Team"
LABEL description="心晴少年AI - 青少年心理健康智能助手"

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p data/{conversations,datasets,vectors,uploads,memory}

EXPOSE 3000

CMD ["node", "src/index.js"]
