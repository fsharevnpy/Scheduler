FROM golang:1.22-alpine AS build
WORKDIR /app

COPY go.mod ./
COPY . .
RUN go mod tidy
RUN go build -o scheduler-backend-go ./cmd/api

FROM alpine:3.20
WORKDIR /app

COPY --from=build /app/scheduler-backend-go /app/scheduler-backend-go

ENV PORT=8000
EXPOSE 8000

CMD ["/app/scheduler-backend-go"]
