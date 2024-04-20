FROM node:20-alpine as build
COPY . /app
WORKDIR /app
RUN npm install

FROM gcr.io/distroless/nodejs20-debian11
COPY --from=build /app /app
WORKDIR /app
EXPOSE 3000
CMD ["index.mjs"]