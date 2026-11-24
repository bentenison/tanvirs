import type { Project, ProjectStatus } from './types'

/**
 * Independent products. Content is limited to what each product's public
 * site states. Adoption figures, customer names and testimonials are
 * intentionally excluded.
 *
 * To add a project: append an entry. `presentation: 'feature'` creates a
 * case-study route at /work/<slug>; `compact` shows it in the editorial spread.
 * A new `surface` id needs a matching component in components/surfaces.
 */
export const projects: Project[] = [
  {
    slug: 'eduflow',
    name: 'EduFlow',
    status: 'released',
    presentation: 'feature',
    category: 'Institute management platform',
    tagline: 'The complete operating system for coaching institutes.',
    summary:
      'Admissions, fees, attendance, batches, online tests and analytics: every part of running a coaching institute in one place, built for entrance-exam and professional training institutes.',
    audience: 'Coaching institutes, their teachers, students and parents',
    url: 'https://eduflow.alwaysdata.net/landing',
    stack: ['Go', 'Vue', 'PostgreSQL'],
    domains: ['backend', 'frontend', 'data', 'performance'],
    surface: 'eduflow',
    highlights: [
      'One record per student, from enquiry to result',
      'Gapless receipts and a live defaulter list',
      'Attendance marked from a phone',
      'Tests marked the moment they are submitted',
    ],
    capabilities: [
      {
        title: 'People',
        items: [
          'Student admission with custom fields, documents and photographs',
          'Teacher records with subjects and batch assignment',
          'Student, teacher and optional read-only parent portals',
          'Role-based access with per-user and per-role permissions',
        ],
      },
      {
        title: 'Operations',
        items: [
          'Enquiry funnel from walk-in to admitted',
          'Fee collection with gapless receipts and defaulter tracking',
          'Attendance registers marked from a phone',
          'Batches, timetables and capacity',
          'Payroll and staff leave',
        ],
      },
      {
        title: 'Learning',
        items: [
          'Online tests marked on submission, with rank lists',
          'Study material, homework and notices',
          'Auditable notices and free push notifications',
          'Batch-level analytics dashboard',
        ],
      },
      {
        title: 'Reach',
        items: [
          'Installs from the browser like an app',
          'Timetable, material and notices available offline',
          'Every screen in English, Hindi and Marathi',
        ],
      },
    ],
    engineering: [
      {
        title: 'Offline where it is safe, live where it matters',
        body: 'Timetables, study material, homework and notices open without a connection, while fees, marks and live exams are always fetched fresh. The offline boundary follows the cost of stale data.',
      },
      {
        title: 'Gapless financial records',
        body: 'Receipts are numbered without gaps so the fee ledger can be audited, and the defaulter list is derived live rather than maintained by hand.',
      },
      {
        title: 'Three languages, per person',
        body: 'Each user picks English, Hindi or Marathi and the choice follows them across devices. Localisation is part of the account, not the browser.',
      },
      {
        title: 'Fine-grained access',
        body: 'Permissions are granted per user and per role so a front-desk account, a teacher and a parent each see exactly their slice of the institute.',
      },
    ],
    hue: 152,
  },
  {
    slug: 'kreovio',
    name: 'Kreovio',
    status: 'released',
    presentation: 'feature',
    category: 'Teaching workspace',
    tagline: 'Create once. Teach anywhere. See every learner.',
    summary:
      'Presentations, whiteboards, interactive lessons and live classes in one workspace, so teachers spend less time switching tools and more time teaching.',
    audience: 'Teachers, schools and trainers, and learners joining from any device',
    url: 'https://kreovio.alwaysdata.net/',
    stack: ['Go', 'Vue', 'PostgreSQL'],
    domains: ['frontend', 'backend', 'distributed', 'data'],
    surface: 'kreovio',
    highlights: [
      'Slides, whiteboards, lessons and live sessions in one workspace',
      'Learners join with a six-character code, no account needed',
      'Real-time co-editing and a shared board everyone can draw on',
      'Works offline as an installed app',
    ],
    capabilities: [
      {
        title: 'Presentations',
        items: [
          'Themes, animations, code, maths and media',
          'Presenter view with speaker notes, ink and a laser pointer',
          'PowerPoint import and export',
        ],
      },
      {
        title: 'Whiteboards',
        items: [
          'Endless canvas with pages and zoom',
          'Pens, shapes and sticky notes',
          'The whole class draws together in real time',
        ],
      },
      {
        title: 'Interactive lessons',
        items: [
          'Many question types and question banks',
          'Branching paths and scenarios that adapt to answers',
          'Share by link or launch from an LMS',
        ],
      },
      {
        title: 'Live classes',
        items: [
          'Turn any deck or lesson into a live session',
          'Polls and quizzes with instant results',
          'Recordings and reports afterwards',
        ],
      },
      {
        title: 'For institutions',
        items: [
          'Shared workspaces, templates, branding and admin controls',
          'LTI 1.3 launch from Moodle or Canvas, SCORM export',
          'Self-hostable with each organisation’s data kept separate',
          'Keyboard friendly, screen-reader labelled, calm motion settings',
        ],
      },
    ],
    engineering: [
      {
        title: 'Real-time by design',
        body: 'Whiteboards, polls and co-editing all share live state between many devices at once: teachers and a full class drawing on the same board.',
      },
      {
        title: 'Offline-capable authoring',
        body: 'Installed as an app, decks stay on the device and changes are saved when the connection returns.',
      },
      {
        title: 'Standards over lock-in',
        body: 'PowerPoint import/export, LTI 1.3 and SCORM let schools bring existing material and launch lessons from the systems they already run.',
      },
      {
        title: 'Accessible by default',
        body: 'Keyboard operation, screen-reader labels, readable type and reduced-motion settings are part of the product rather than an add-on.',
      },
    ],
    hue: 32,
  },
  {
    slug: 'forge',
    name: 'Forge',
    status: 'released',
    presentation: 'compact',
    category: 'Low-code application platform',
    tagline: 'Model your data. Get a working application.',
    summary:
      'A metadata-driven platform that turns entities, fields, forms and workflows into secure multi-tenant business applications on PostgreSQL, with reviewed schema migrations, server-side authorization and an SDK to extend it.',
    audience: 'Teams building internal and SaaS business applications',
    url: 'https://forge.alwaysdata.net/welcome',
    stack: ['Go', 'Vue', 'PostgreSQL'],
    domains: ['backend', 'data', 'tooling', 'infrastructure'],
    surface: 'forge',
    highlights: [
      'One Go binary plus PostgreSQL',
      'Row-level security per organisation',
      'Previewed, transactional schema migrations',
      'Extension SDK that never touches the core',
    ],
    capabilities: [
      {
        title: 'Platform',
        items: [
          'Entities stored as real PostgreSQL tables with foreign keys',
          'Generated lists, forms, detail pages and REST API',
          'Workflows with parallel approvals, timers and escalations',
          'Releases with previewed migrations and one-step rollback',
          'Go SDK packages and UI components to extend it',
        ],
      },
    ],
    hue: 22,
  },
  {
    slug: 'flowq',
    name: 'FlowQ',
    status: 'released',
    presentation: 'compact',
    category: 'Queue management & customer journeys',
    tagline: 'Every customer, in the right place, at the right time.',
    summary:
      'Queues, counters, appointments and multi-step journeys for banks, hospitals and public services, on-premise, in the cloud or both.',
    audience: 'Banks, hospitals, public services and anywhere people wait',
    url: 'https://flowq.alwaysdata.net/',
    stack: ['Go', 'Vue', 'PostgreSQL'],
    domains: ['backend', 'distributed', 'infrastructure', 'frontend'],
    surface: 'flowq',
    highlights: [
      'Counter, kiosk, signage and mobile ticket from one system',
      'Fair, explainable routing: every call records why',
      'On-premise single executable, cloud or hybrid',
      'Tenant isolation, audit log and Argon2id passwords',
    ],
    capabilities: [
      {
        title: 'Platform',
        items: [
          'Live queues, counters and appointments',
          'QR mobile tickets that follow the customer, no app needed',
          'Priority, weighted or first-come routing rules',
          'Runtime tenant theming with automatic contrast checks',
          'Branch servers designed for unreliable links',
        ],
      },
    ],
    hue: 205,
  },
]

export const statusLabels: Record<ProjectStatus, string> = {
  released: 'Released',
  'in-development': 'In development',
  experimental: 'Experimental',
  archived: 'Archived',
}

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug)
}

export const featureProjects = (): Project[] => projects.filter((p) => p.presentation === 'feature')
export const compactProjects = (): Project[] => projects.filter((p) => p.presentation === 'compact')
