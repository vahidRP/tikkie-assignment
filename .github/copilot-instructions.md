# Copilot Instructions — Person Service

## Project Overview

This is a **serverless microservice** called **Person Service** built with AWS CDK and TypeScript. It exposes a REST API (`POST /person`) that persists person data to DynamoDB and publishes a `PersonCreated` event to EventBridge.

**Tech stack:** AWS CDK · TypeScript · API Gateway · Lambda · DynamoDB · EventBridge · Zod · Jest · pnpm

---

## Architecture

The project follows a **Ports & Adapters** (hexagonal) architecture with four layers:

| Layer | Path | Depends on AWS? | Purpose |
|---|---|---|---|
| **Domain** | `src/domain/` | No | Models, event contracts, port interfaces |
| **Application** | `src/application/` | No | Use cases — orchestrate domain + ports |
| **Infrastructure** | `src/infrastructure/` | Yes | Adapter implementations (DynamoDB, EventBridge, config, logger) |
| **Handlers** | `src/handlers/` | Yes | Thin Lambda entry points — parse, validate, delegate |

### Dependency rule

Domain and application layers must **never** import from `infrastructure/` or `handlers/`. AWS SDK imports are only allowed in `src/infrastructure/` and `src/handlers/`.

### Folder structure

```
bin/                          CDK app entry point
lib/                          CDK stack definitions
src/
  domain/
    models/                   Entity types (Person, Address)
    events/                   Event contracts and builders
    ports/                    Repository & EventPublisher interfaces
  application/
    use-cases/                Business logic orchestration
  infrastructure/
    adapters/                 AWS adapter implementations
    config.ts                 Runtime environment config (env vars)
    logger.ts                 Powertools for AWS Lambda structured logger
  handlers/                   Lambda handlers (thin)
  shared/                     Zod validation schemas
test/
  unit/                       Mirrors src/ structure
  cdk/                        CDK assertion tests
```

---

## Code Style & Conventions

### TypeScript

- **Strict mode** enabled (`strict: true` in tsconfig)
- Target **ES2022**, module **commonjs**
- Prefer `interface` over `type` for object shapes that may be extended
- Use `type` for unions, mapped types, or computed types (e.g. `Omit<Person, 'id'>`)
- Use `readonly` on constructor-injected dependencies
- Use `import type` when importing only types
- Prefix unused variables/args with `_` (ESLint rule: `varsIgnorePattern: '^_'`, `argsIgnorePattern: '^_'`)
- No `any` — use `unknown` and narrow. `@typescript-eslint/no-explicit-any` is set to `warn`
- No explicit return types required (`explicit-function-return-type: off`) — let TypeScript infer where obvious

### Formatting (Prettier)

- Single quotes, semicolons, trailing commas (`all`)
- Print width: **100**, tab width: **2**
- Run: `pnpm format` / `pnpm format:check`

### Linting (ESLint)

- Flat config (`eslint.config.mjs`) with `typescript-eslint` + `prettier` integration
- Run: `pnpm lint` / `pnpm lint:fix`

### Naming conventions

- **Files:** kebab-case (`create-person.ts`, `person-repository.ts`)
- **Interfaces:** PascalCase, no `I` prefix (`PersonRepository`, not `IPersonRepository`)
- **Types/Classes:** PascalCase (`CreatePersonUseCase`, `PersonCreatedEvent`)
- **Functions/variables:** camelCase
- **Constants:** camelCase for module-scoped (`eventBusName`), UPPER_SNAKE_CASE only for true compile-time constants or environment variable names
- **Test files:** `<source-filename>.test.ts`, mirroring the src directory structure

---

## Patterns & Design Principles

### Handler factory pattern

Lambda handlers export a `createHandler(useCase)` factory function. This enables unit testing with a mock use case without touching AWS:

```typescript
export function createHandler(useCase: CreatePersonPort) {
  return async (event: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> => {
    if (context) {
      logger.addContext(context);
    }
    logger.setCorrelationId(event.requestContext?.requestId ?? 'unknown');
    logger.logEventIfEnabled(event);
    // ... handler logic ...
  };
}

// Wired for Lambda runtime at module scope:
export const handler = createHandler(new CreatePersonUseCase(repo, publisher));
```

### Port interfaces

Domain defines interfaces (`PersonRepository`, `EventPublisher`). Infrastructure provides implementations. Use constructor injection — no DI framework.

### Validation

Use **Zod** schemas in `src/shared/validation.ts`. Validate in the handler using `safeParse()` and return structured field errors on failure. Never let invalid data reach the use case.

### Event design

Events are **lean** — include identifiers and essential fields, not full entities. Defined as TypeScript interfaces with a pure builder function (`buildPersonCreatedEvent`). Event publishing is abstracted behind `EventPublisher` interface.

### Error handling

- Handler catches all errors and returns proper HTTP status codes (400, 500)
- Never expose internal error details to clients — log them, return generic messages
- Let infrastructure errors propagate up to the handler's catch block

### Logging

Use [Powertools for AWS Lambda Logger](https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/) (`src/infrastructure/logger.ts`). Every log entry includes `level`, `message`, `timestamp`, `service`, `correlation_id`, and `sampling_rate`. In Lambda runtime, `cold_start`, `function_name`, `function_arn`, `function_memory_size`, `function_request_id`, and `xray_trace_id` are also included.

API convention — **message first**, then contextual data:

```typescript
logger.info('Person created', { personId: person.id });
logger.error('Failed to create person', error as Error);
```

Key conventions:
- **Instantiate the logger once** at module scope in `src/infrastructure/logger.ts`
- **Inject Lambda context** via `logger.addContext(context)` in the handler for cold start and function metadata
- **Set correlation ID** from `event.requestContext.requestId` for request tracing
- **Log the incoming event** via `logger.logEventIfEnabled(event)` — controlled by `POWERTOOLS_LOGGER_LOG_EVENT` env var (enabled in non-prod only)
- **Pass `Error` objects directly** to `logger.error()` — Powertools serializes `name`, `message`, `stack`, and `location` automatically
- **Reset keys** in a `finally` block via `logger.resetKeys()` to prevent key leaking across Lambda reuse

---

## CDK / Infrastructure

### Stage-based deployment

Stacks are parameterized by `stage` (passed via CDK context: `cdk deploy -c stage=dev`). All resource names include the stage suffix (`person-dev`, `person-events-prod`, etc.).

### Environment-specific behavior

| Setting | dev | prod |
|---|---|---|
| DynamoDB removal policy | DESTROY | RETAIN |
| Point-in-time recovery | Off | On |
| API throttle rate | 100 req/s | 1000 req/s |
| API throttle burst | 50 | 500 |
| POWERTOOLS_LOG_LEVEL | DEBUG | INFO |
| POWERTOOLS_LOGGER_LOG_EVENT | true | false |

### Resource conventions

- DynamoDB: PAY_PER_REQUEST billing, `id` as partition key (STRING)
- Lambda: Node.js 24.x, 256 MB, 10s timeout, source maps enabled, esbuild bundling
- EventBridge: Dedicated event bus per stage (not the default bus)
- API Gateway: REST API with CORS enabled for POST + OPTIONS

### CDK construct IDs

Use PascalCase descriptive names: `PersonTable`, `CreatePersonFn`, `PersonEventBus`, `PersonApi`.

---

## Testing

### Test runner

**Jest** with `ts-jest` transform. Config in `jest.config.ts`. Tests run with `--forceExit` (CDK esbuild bundling can leave handles open).

### Test structure

Tests live in `test/` and mirror the source structure:

- `test/unit/domain/` — pure domain logic tests
- `test/unit/application/` — use case tests with mocked ports
- `test/unit/infrastructure/` — adapter tests with `aws-sdk-client-mock`
- `test/unit/handlers/` — handler tests with mock use cases and crafted API Gateway events
- `test/cdk/` — CDK `Template` assertion tests

### Mocking conventions

- **Port interfaces:** Use `jest.Mocked<InterfaceName>` with `jest.fn()` for each method
- **AWS SDK:** Use `aws-sdk-client-mock` (`mockClient(DynamoDBDocumentClient)`) — never mock the AWS SDK internals manually
- **Handler tests:** Mock infrastructure modules with `jest.mock(...)` at top of file to prevent real AWS client initialization, then test the exported `createHandler` factory
- **CDK tests:** Use `Template.fromStack()` with `hasResourceProperties` / `hasResource` — use CDK's `Match` helpers instead of Jest matchers for template assertions

### Test style

- Each `it()` block tests one behavior — name it as "should [expected behavior]"
- Use `beforeEach` with `jest.clearAllMocks()` for clean state
- Prefer `toEqual` for deep comparison, `toBe` for primitives
- Test both success and failure paths
- No snapshot tests unless explicitly justified

---

## Package Management

- **pnpm** (v9+) — do not use npm or yarn
- Dependencies that run in Lambda are in `dependencies` (aws-cdk-lib, constructs, zod)
- AWS SDK packages are in `devDependencies` (bundled by esbuild at deploy time, not shipped as node_modules)
- Run `pnpm install`, never `npm install`

---

## Scripts

| Command | Purpose |
|---|---|
| `pnpm build` | Type-check (tsc --noEmit) |
| `pnpm test` | Run all tests |
| `pnpm test:coverage` | Tests with coverage report |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm synth` | Synthesize CloudFormation template |
| `pnpm deploy:dev` | Deploy to dev (no approval) |
| `pnpm deploy:prod` | Deploy to prod (with approval) |

---

## Adding a New Feature (Checklist)

When adding a new endpoint or capability:

1. **Domain first** — Define/extend models in `src/domain/models/`, add port interface if needed
2. **Event contract** — If a new event is needed, add to `src/domain/events/`
3. **Validation** — Add Zod schema in `src/shared/validation.ts`
4. **Use case** — Create in `src/application/use-cases/`, inject ports via constructor
5. **Infrastructure** — Implement or extend adapters in `src/infrastructure/adapters/`
6. **Handler** — Create thin handler in `src/handlers/` using factory pattern
7. **CDK** — Add Lambda + API resource in `lib/person-service-stack.ts`, grant permissions
8. **Tests** — Add unit tests for each layer, CDK assertion tests for new resources
9. **Lint & format** — Run `pnpm lint && pnpm format:check` before committing
10. **Documentation** — Update README.md with new endpoint details and examples and update .github/copilot-instructions.md if there are any new patterns or conventions introduced

---

## Things to Avoid

- **No `any`** — use `unknown` and type-narrow
- **No dead code** — remove unused imports, variables, functions
- **No magic strings** — use constants or enums where they improve clarity
- **No copy-paste** — extract shared logic into reusable functions
- **No DI frameworks** — constructor injection is sufficient
- **No unnecessary abstractions** — every interface/class must justify its existence
- **No AWS imports in domain/application layers**
- **No internal error details in API responses** — log them, return generic messages
- **No placeholder tests** — every test must assert meaningful behavior
