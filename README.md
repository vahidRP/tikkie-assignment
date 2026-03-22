# Person Service

A serverless microservice that creates and manages persons, built with **AWS CDK**, **TypeScript**, **Lambda**, **DynamoDB**, and **EventBridge**.

---

## Architecture

```
Client
  │
  ▼
WAF (Common exploits, SQLi protection, IP rate limiting)
  │
  ▼
API Gateway (REST) ── API Key + Usage Plan (per-key throttle & daily quota)
  │  POST /person
  ▼
Lambda (create-person) ──── on failure ────▶ SQS Dead Letter Queue
  ├──▶ DynamoDB       (persist person)             │
  └──▶ EventBridge    (publish PersonCreated)      ▼
                                            CloudWatch Alarm
CloudWatch Alarms
  ├── Lambda error rate
  ├── Lambda throttles
  └── DLQ message count
```

### Layered Design

| Layer              | Responsibility                                       | AWS dependency |
| ------------------ | ---------------------------------------------------- | -------------- |
| **Domain**         | Models, event contracts, port interfaces             | None           |
| **Application**    | Use cases (orchestration)                            | None           |
| **Infrastructure** | DynamoDB repository, EventBridge publisher, config   | Yes            |
| **Handlers**       | Thin Lambda entry points — parse, validate, delegate | Yes            |

Domain and application layers have **zero AWS imports**, making them independently testable.

---

## Why These AWS Services?

| Service                  | Reason                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| **API Gateway**          | Managed REST API with throttling, CORS, API key authentication, and Lambda integration |
| **Lambda**               | Pay-per-invocation, zero infrastructure management, auto-scaling, X-Ray tracing        |
| **DynamoDB**             | Serverless NoSQL with PAY_PER_REQUEST — scales to zero, no capacity planning           |
| **EventBridge**          | Decoupled event bus — other microservices subscribe without coupling                   |
| **WAF**                  | Edge-level protection: AWS managed rules (OWASP, SQLi) and per-IP rate limiting        |
| **SQS (DLQ)**            | Captures failed Lambda invocations for later inspection — prevents silent data loss    |
| **CloudWatch**           | Alarms on Lambda errors, throttles, and DLQ depth for operational visibility           |
| **API Key + Usage Plan** | Client identification with per-key throttle rates and daily request quotas             |

---

## Project Structure

```
├── bin/app.ts                         # CDK app entry point
├── lib/person-service-stack.ts        # CDK stack definition
├── src/
│   ├── domain/
│   │   ├── models/person.ts           # Person & Address types
│   │   ├── events/person-created.ts   # Event contract + builder
│   │   └── ports/                     # Repository & EventPublisher interfaces
│   ├── application/
│   │   └── use-cases/create-person.ts # CreatePerson use case
│   ├── infrastructure/
│   │   ├── adapters/                  # DynamoDB repo, EventBridge publisher
│   │   ├── config.ts                  # Runtime environment config
│   │   └── logger.ts                  # Powertools for AWS Lambda logger
│   ├── handlers/create-person.ts      # Lambda handler
│   └── shared/validation.ts           # Zod validation schemas
├── test/
│   ├── unit/                          # Domain, application, infra, handler tests
│   └── cdk/                           # CDK assertion tests
└── .github/workflows/                 # CI + Deploy pipelines
```

---

## Getting Started

### Prerequisites

- Node.js >= 24
- pnpm >= 9
- Docker (for local development with LocalStack)
- AWS CLI configured (for deployment)
- AWS CDK CLI (`pnpm cdk`)

### Install

```bash
pnpm install
```

### Lint & Format

```bash
pnpm lint          # check
pnpm lint:fix      # auto-fix
pnpm format        # format all files
pnpm format:check  # check formatting
```

### Test

```bash
pnpm test                # run all unit tests
pnpm test:coverage       # run with coverage report
pnpm test:integration    # run integration tests (requires LocalStack)
```

### Build (type-check)

```bash
pnpm build
```

---

## Local Development with LocalStack

[LocalStack](https://localstack.cloud/) emulates AWS services locally so you can develop and test without deploying to AWS or incurring any costs.

### Prerequisites

- **Docker** must be running — LocalStack runs as a container
- The Docker socket (`/var/run/docker.sock`) must be accessible — LocalStack needs it to create Lambda functions

### 1. Start LocalStack & deploy the stack

```bash
pnpm localstack:up
```

This does three things:

1. Starts a LocalStack container via Docker Compose
2. Runs `cdklocal bootstrap` to set up the CDK staging resources
3. Runs `cdklocal deploy -c stage=local` to deploy the **exact same CDK stack** to LocalStack

All resources (DynamoDB table, EventBridge bus, Lambda, API Gateway, WAF, alarms, etc.) are created locally — identical to what gets deployed to AWS.

> **Note:** `cdklocal` always deploys to `us-east-1` regardless of region configuration.
> All local resources use this region.

### 2. Test the API locally with curl

After `localstack:up`, the API Gateway URL and API key ID are printed as CloudFormation outputs. Use them to call the API:

```bash
# Create a person via the local API Gateway
curl -X POST http://localhost:4566/restapis/<api-id>/local/_user_request_/person \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <api-key>' \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+31612345678",
    "address": {
      "street": "Keizersgracht 100",
      "city": "Amsterdam",
      "postalCode": "1015AA",
      "country": "Netherlands"
    }
  }'
```

> **Tip:** Retrieve the API key value with:
>
> ```bash
> awslocal apigateway get-api-keys --include-values --region us-east-1
> ```

### 3. Run integration tests

The integration tests exercise the full flow (handler → use case → DynamoDB + EventBridge) against LocalStack:

```bash
# Make sure LocalStack is running first
pnpm localstack:up

# Run integration tests
pnpm test:integration
```

### 4. Stop / reset LocalStack

```bash
pnpm localstack:down    # stop containers
pnpm localstack:reset   # stop, remove volumes, and redeploy fresh
```

### How it works

| Component              | Details                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| **docker-compose.yml** | Runs LocalStack v4 with Docker socket mounted for Lambda support         |
| **cdklocal**           | Deploys the same `PersonServiceStack` (stage=local) to LocalStack        |
| **test/integration/**  | Integration tests using real AWS SDK clients pointed at `localhost:4566` |

Because `cdklocal` deploys the real CDK stack, any new resources you add to `PersonServiceStack` automatically appear in the local environment — no separate scripts to maintain.

The integration tests inject LocalStack-configured AWS SDK clients into the same adapters used in production — no code changes needed.

---

## Deployment

The service supports **multi-environment deployment** via CDK context:

```bash
# Deploy to dev
pnpm deploy:dev

# Deploy to prod (with approval prompt)
pnpm deploy:prod

# Synthesize CloudFormation template
pnpm synth
```

Each stage creates isolated resources:

- `person-dev` / `person-prod` (DynamoDB table)
- `person-events-dev` / `person-events-prod` (EventBridge bus)
- `create-person-dev` / `create-person-prod` (Lambda)
- `person-api-dev` / `person-api-prod` (API Gateway)

Production gets stricter settings: `RETAIN` removal policy, point-in-time recovery, higher throttle limits.

### CI/CD (GitHub Actions)

| Workflow       | Trigger           | What it does                        |
| -------------- | ----------------- | ----------------------------------- |
| **ci.yml**     | Push/PR to `main` | Lint → Format check → Test → Synth  |
| **deploy.yml** | Manual dispatch   | Test → Configure AWS → Deploy stage |

---

## API Reference

### `POST /person`

**Request:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+31612345678",
  "address": {
    "street": "Example Street 1",
    "city": "Amsterdam",
    "postalCode": "1234AB",
    "country": "Netherlands"
  }
}
```

**Success Response (201 Created):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+31612345678",
  "address": {
    "street": "Example Street 1",
    "city": "Amsterdam",
    "postalCode": "1234AB",
    "country": "Netherlands"
  },
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Validation Error (400 Bad Request):**

```json
{
  "message": "Validation failed",
  "errors": {
    "firstName": ["First name is required"],
    "phoneNumber": ["Phone number must be in E.164 format (e.g. +31612345678)"]
  }
}
```

**Server Error (500):**

```json
{
  "message": "Internal server error"
}
```

---

## Event Contract

When a person is created, a **PersonCreated** event is published to EventBridge:

```json
{
  "source": "person-service",
  "detail-type": "PersonCreated",
  "detail": {
    "personId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+31612345678",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

The event is intentionally **lean** — it includes identifiers and essential fields. Consumers that need the full person record can query back via a future `GET /person/{id}` endpoint.

---

## Testing Strategy

| Test type            | What it validates                                    |
| -------------------- | ---------------------------------------------------- |
| Domain unit          | Event builder produces correct contract              |
| Validation unit      | Zod schemas accept/reject inputs correctly           |
| Use case unit        | Orchestration flow, repository and event calls       |
| Repository unit      | DynamoDB PutCommand params (aws-sdk-client-mock)     |
| Event publisher unit | EventBridge PutEvents params (aws-sdk-client-mock)   |
| Handler unit         | HTTP parsing, validation, status codes, delegation   |
| Config unit          | Environment variable loading and error cases         |
| CDK assertions       | Resources, properties, IAM permissions, stage config |

---

## Tradeoffs & Future Improvements

### Current tradeoffs

- **No authentication** — out of scope; add API Gateway authorizers (Cognito/Lambda) for production.
- **No client-driven idempotency key** — UUIDs prevent natural collisions; a client-provided key would enable true idempotent retries.
- **Event published after write** — if EventBridge publish fails, the person is saved but the event is lost. A transactional outbox pattern or DynamoDB Streams → EventBridge Pipes would guarantee delivery.
- **No custom domain** — API Gateway provides a generated URL; a custom domain with Route 53 is a production must.

### Future extensions

- `GET /person/{id}` — DynamoDB table already supports single-item lookup by `id`.
- `GET /person` — add a GSI on `lastName` or use scan with pagination.
- OpenAPI spec generation from Zod schemas.
