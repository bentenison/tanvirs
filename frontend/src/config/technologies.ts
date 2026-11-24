import type { Domain, DomainId, Technology } from './types'

/**
 * Engineering domains, the lobes of the organism. Angles place each lobe
 * around the Go core; related domains sit next to each other so their
 * membranes visibly fuse.
 */
export const domains: Domain[] = [
  {
    id: 'backend',
    name: 'Backend engineering',
    short: 'Backend',
    summary: 'Go services and APIs that hold a product together: routing, validation, auth and business rules.',
    angle: -18,
    weight: 1.15,
  },
  {
    id: 'distributed',
    name: 'Distributed & event-driven',
    short: 'Messaging',
    summary: 'Work that happens off the request path: events, queues, retries and the outbox pattern.',
    angle: 26,
    weight: 0.85,
  },
  {
    id: 'data',
    name: 'Databases',
    short: 'Data',
    summary: 'Schemas, indexes, partitions and migrations, keeping data correct and fast as it grows.',
    angle: 72,
    weight: 1.05,
  },
  {
    id: 'performance',
    name: 'Performance engineering',
    short: 'Performance',
    summary: 'Profiling, concurrency and caching to make slow paths fast and keep resource use low.',
    angle: 118,
    weight: 0.9,
  },
  {
    id: 'frontend',
    name: 'Frontend engineering',
    short: 'Frontend',
    summary: 'Vue interfaces that stay fast and accessible, from dashboards to offline-capable apps.',
    angle: 166,
    weight: 1.05,
  },
  {
    id: 'tooling',
    name: 'Developer tooling',
    short: 'Tooling',
    summary: 'Builders, generators and platforms that make other software faster to create.',
    angle: 210,
    weight: 0.8,
  },
  {
    id: 'ai',
    name: 'AI & intelligent applications',
    short: 'AI',
    summary: 'Retrieval-augmented generation, LLM integration and AI-assisted development workflows.',
    angle: 252,
    weight: 0.95,
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    short: 'Infra',
    summary: 'Containers, Linux and deployment, shipping small, self-contained binaries reliably.',
    angle: 296,
    weight: 0.85,
  },
]

/**
 * Technologies emerge from their domain lobe when it is focused.
 * No years-of-experience figures are recorded anywhere, by design.
 */
export const technologies: Technology[] = [
  // Backend
  {
    id: 'go',
    name: 'Go',
    domain: 'backend',
    role: 'The core language for services, workers and command-line tools.',
    capabilities: ['Concurrent services with goroutines and channels', 'Worker pools and pipelines', 'Single static binaries'],
    projects: ['eduflow', 'kreovio', 'forge', 'flowq'],
  },
  {
    id: 'gin',
    name: 'Gin',
    domain: 'backend',
    role: 'HTTP routing and middleware for REST APIs.',
    capabilities: ['Middleware chains for auth, logging and recovery', 'Request validation', 'Embedded static frontends'],
  },
  {
    id: 'rest',
    name: 'REST APIs',
    domain: 'backend',
    role: 'The contract between Vue front ends and Go services.',
    capabilities: ['Resource design and versioning', 'Pagination and filtering', 'Consistent error models'],
    projects: ['forge'],
  },
  {
    id: 'grpc',
    name: 'gRPC',
    domain: 'backend',
    role: 'Typed service-to-service communication.',
    capabilities: ['Protobuf contracts', 'Streaming RPCs'],
  },
  {
    id: 'security',
    name: 'Secure development',
    domain: 'backend',
    role: 'Authentication, authorization, encryption and sandboxing as defaults.',
    capabilities: ['Role-based and row-level access control', 'Password hashing and session revocation', 'Sandboxed extensions'],
    projects: ['forge', 'flowq', 'eduflow'],
  },
  // Distributed
  {
    id: 'nats',
    name: 'NATS',
    domain: 'distributed',
    role: 'Lightweight messaging between services.',
    capabilities: ['Publish/subscribe and queue groups', 'Decoupling slow work from requests'],
  },
  {
    id: 'events',
    name: 'Event-driven design',
    domain: 'distributed',
    role: 'Reliable asynchronous workflows.',
    capabilities: ['Outbox pattern', 'Idempotent consumers and retries', 'Offline-first synchronisation'],
    projects: ['kreovio', 'flowq'],
  },
  {
    id: 'realtime',
    name: 'Real-time sync',
    domain: 'distributed',
    role: 'Shared live state across many devices.',
    capabilities: ['Live sessions and polls', 'Collaborative editing'],
    projects: ['kreovio', 'flowq'],
  },
  // Data
  {
    id: 'postgres',
    name: 'PostgreSQL',
    domain: 'data',
    role: 'The primary system of record.',
    capabilities: ['Indexing and query planning', 'Partitioning large tables', 'Row-level security', 'Transactional migrations'],
    projects: ['eduflow', 'kreovio', 'forge', 'flowq'],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    domain: 'data',
    role: 'Document storage for flexible, nested data.',
    capabilities: ['Document modelling', 'Moving data between document and relational stores'],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    domain: 'data',
    role: 'Relational storage in existing systems.',
    capabilities: ['SQL tuning', 'Schema design'],
  },
  {
    id: 'migrations',
    name: 'Schema migrations',
    domain: 'data',
    role: 'Changing live schemas safely.',
    capabilities: ['Previewed, reviewed migration plans', 'Large dataset moves'],
    projects: ['forge'],
  },
  // Performance
  {
    id: 'concurrency',
    name: 'Concurrency',
    domain: 'performance',
    role: 'Parallelising expensive work without losing correctness.',
    capabilities: ['Bounded worker pools', 'Back-pressure', 'Race-free shared state'],
  },
  {
    id: 'caching',
    name: 'Caching',
    domain: 'performance',
    role: 'Serving repeated reads without repeated work.',
    capabilities: ['TTL and LRU strategies', 'Invalidation', 'HTTP caching and ETags'],
  },
  {
    id: 'profiling',
    name: 'Profiling',
    domain: 'performance',
    role: 'Finding where the time and memory actually go.',
    capabilities: ['pprof CPU and heap profiles', 'Query plan analysis', 'Load testing'],
  },
  // Frontend
  {
    id: 'vue',
    name: 'Vue.js',
    domain: 'frontend',
    role: 'Application interfaces, from dashboards to builders.',
    capabilities: ['Component systems and custom UI libraries', 'Offline-capable PWAs', 'Accessible forms and interactions'],
    projects: ['eduflow', 'kreovio', 'forge', 'flowq'],
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    domain: 'frontend',
    role: 'The browser runtime.',
    capabilities: ['DOM and browser APIs', 'Async data and state', 'Service workers'],
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    domain: 'frontend',
    role: 'Utility-first styling for consistent, responsive interfaces.',
    capabilities: ['Design tokens and theming', 'Responsive layouts', 'Dark mode'],
  },
  {
    id: 'ui-libraries',
    name: 'shadcn-vue & UI libraries',
    domain: 'frontend',
    role: 'Building on accessible component primitives instead of reinventing them.',
    capabilities: ['shadcn-vue and other Vue component libraries', 'Customising components to a brand', 'Accessible dialogs, menus and forms'],
  },
  {
    id: 'uiux',
    name: 'UI/UX design',
    domain: 'frontend',
    role: 'Designing interfaces that are clear to use, not just to look at.',
    capabilities: ['User flows and information hierarchy', 'Empty, loading and error states', 'Accessible, readable layouts'],
    projects: ['eduflow', 'kreovio', 'flowq'],
  },
  {
    id: 'css',
    name: 'HTML & CSS',
    domain: 'frontend',
    role: 'Semantic structure and design systems.',
    capabilities: ['Semantic markup', 'Modern CSS layout'],
  },
  // Tooling
  {
    id: 'lowcode',
    name: 'Low-code platforms',
    domain: 'tooling',
    role: 'Turning data models into working applications.',
    capabilities: ['Metadata-driven generation', 'Form, page and workflow designers'],
    projects: ['forge'],
  },
  // AI
  {
    id: 'rag',
    name: 'RAG',
    domain: 'ai',
    role: 'Grounding model answers in your own documents.',
    capabilities: ['Chunking and retrieval', 'Context assembly', 'Citing sources'],
  },
  {
    id: 'llm',
    name: 'LLM integration',
    domain: 'ai',
    role: 'Adding models to products where they help.',
    capabilities: ['Structured outputs', 'Grounded answers over private documents'],
  },
  {
    id: 'prompting',
    name: 'Prompt engineering',
    domain: 'ai',
    role: 'Designing prompts that are reliable and testable.',
    capabilities: ['Prompt templates', 'Evaluation against examples'],
  },
  {
    id: 'ai-dev',
    name: 'AI-assisted development',
    domain: 'ai',
    role: 'Using models as a fast collaborator, with tests and review as the source of truth.',
    capabilities: ['Generation behind review gates', 'Faster prototyping'],
  },
  // Infrastructure
  {
    id: 'docker',
    name: 'Docker',
    domain: 'infrastructure',
    role: 'Reproducible builds and sandboxes.',
    capabilities: ['Minimal images', 'Resource-limited sandboxes'],
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    domain: 'infrastructure',
    role: 'Orchestrating services.',
    capabilities: ['Deployments and probes', 'Rolling updates'],
  },
  {
    id: 'linux',
    name: 'Linux',
    domain: 'infrastructure',
    role: 'Where everything runs.',
    capabilities: ['Service management', 'Reverse proxies and TLS'],
    projects: ['flowq'],
  },
  {
    id: 'devops',
    name: 'Git & DevOps',
    domain: 'infrastructure',
    role: 'Shipping changes safely.',
    capabilities: ['Code review', 'Production deployments', 'Incident response'],
  },
]

export function domainById(id: DomainId): Domain {
  const d = domains.find((x) => x.id === id)
  if (!d) throw new Error(`unknown domain ${id}`)
  return d
}

export function technologiesFor(domain: DomainId): Technology[] {
  return technologies.filter((t) => t.domain === domain)
}
